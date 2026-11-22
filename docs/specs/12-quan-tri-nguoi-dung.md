# Đặc tả: Quản trị Người dùng (issue #12) — Expo SDK 58, TypeScript strict, Supabase

Thuật ngữ UI (GLOSSARY): **Người dùng** (tránh chữ "tài khoản" trên UI), **Quản trị**, **Chi nhánh**, "khóa/mở khóa". Phong cách như `App.tsx`/`src/catalog/*` (StyleSheet, Pressable, màu `#0f766e`, lỗi `#b91c1c`, nút ≥ 44px, `accessibilityRole`). Prettier: double quotes, trailing comma es5. Không thêm thư viện npm.

## Đã có (KHÔNG sửa)

- Bảng `members(branch_id, user_id, is_admin, is_locked, created_at)`; client chỉ được SELECT dòng thuộc Chi nhánh mình (RLS), KHÔNG có policy ghi → mọi thay đổi đi qua Edge Function bằng khóa secret.
- Trigger `members_keep_last_admin`: update làm Chi nhánh mất Quản trị đang hoạt động cuối cùng → lỗi Postgres `P0001`, `hint = 'last_admin'`, message "Không thể bỏ hoặc khóa Quản trị cuối cùng của Chi nhánh". Qua PostgREST lỗi trả về dạng `{ code: "P0001", hint: "last_admin", message }`.
- `src/lib/supabase.ts` (client typed), `src/lib/database.types.ts`, `src/lib/useOnline.ts`.

## 1. Logic thuần dùng chung — `supabase/functions/admin-users/logic.ts`

Không import gì ngoài TS thuần (chạy được cả trong Deno lẫn Vitest/Metro). Xuất:

- `type AdminRequest = { action: "list" } | { action: "create"; email: string; password: string; is_admin: boolean } | { action: "set_locked"; user_id: string; locked: boolean } | { action: "set_admin"; user_id: string; is_admin: boolean }`.
- `parseAdminRequest(body: unknown): { ok: true; value: AdminRequest } | { ok: false; error: string }` — kiểm kiểu từng trường; `user_id` phải là UUID; email trim + chữ thường; lỗi → "Yêu cầu không hợp lệ".
- `validateNewUser(email: string, password: string): { email?: string; password?: string }` — email dạng `x@y.z` ("Email không hợp lệ"); mật khẩu ≥ 8 ký tự ("Mật khẩu ít nhất 8 ký tự"). `parseAdminRequest` cho action create gọi hàm này; có lỗi → `{ ok:false, error: <thông báo đầu tiên> }`.
- `canActOn(callerId: string, req: AdminRequest): string | null` — trả thông báo lỗi nếu Quản trị tự khóa chính mình ("Không thể tự khóa chính mình") hoặc tự bỏ quyền Quản trị của mình ("Không thể tự bỏ quyền Quản trị của mình"); ngược lại null.
- `messageForDbError(err: { code?: string; hint?: string; message?: string } | null): string` — `hint === "last_admin"` → "Không thể bỏ hoặc khóa Quản trị cuối cùng"; `code === "23505"` → "Người dùng đã thuộc Chi nhánh"; khác → "Không thực hiện được. Thử lại sau."
- `BAN_FOREVER = "876000h"`, `UNBAN = "none"`.
  Test Vitest: `src/users/adminLogic.test.ts` import từ `../../supabase/functions/admin-users/logic.ts` (có đuôi `.ts`), phủ đủ các nhánh trên.

## 2. Edge Function — `supabase/functions/admin-users/index.ts` (Deno)

- `import { createClient } from "npm:@supabase/supabase-js@2";` và `import { ... } from "./logic.ts";`. Dùng `Deno.serve`.
- CORS cho web: mọi response có `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`, `Access-Control-Allow-Methods: POST, OPTIONS`; `OPTIONS` → 200 "ok". Response JSON `{ data } ` hoặc `{ error: string }` kèm status.
- Khóa: `const url = Deno.env.get("SUPABASE_URL")!`; `JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!)["default"]`, `JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!)["default"]`.
- Xác thực người gọi: lấy header `Authorization` (thiếu → 401 "Chưa đăng nhập"). `userClient = createClient(url, publishable, { global: { headers: { Authorization } }, auth: { persistSession: false } })`; `const { data: { user } } = await userClient.auth.getUser()` (không có → 401). `admin = createClient(url, secret, { auth: { persistSession: false } })`.
- Quyền: `admin.from("members").select("branch_id").eq("user_id", user.id).eq("is_admin", true).eq("is_locked", false).order("branch_id").limit(1).maybeSingle()` → không có → 403 "Chỉ Quản trị làm được việc này". `branchId` = kết quả.
- Body: `parseAdminRequest(await req.json().catch(() => null))` → lỗi → 400. `canActOn(user.id, req)` → lỗi → 400.
- Với `set_locked`/`set_admin`: kiểm người đích là thành viên của `branchId` (`members` theo `branch_id` + `user_id`), không có → 404 "Không tìm thấy Người dùng trong Chi nhánh".
- `list`: lấy members của `branchId`; email lấy bằng `admin.auth.admin.getUserById(user_id)` cho từng người (ít người, chạy `Promise.all`). Trả `[{ user_id, email, is_admin, is_locked, created_at }]` sắp theo email.
- `create`: `admin.auth.admin.createUser({ email, password, email_confirm: true })`. Lỗi đã tồn tại (status 422 hoặc message chứa "already") → 409 "Email đã được dùng". Sau đó insert `members { branch_id, user_id, is_admin }`; insert lỗi → `admin.auth.admin.deleteUser(newId)` để hoàn tác rồi trả lỗi `messageForDbError`. Thành công → 200 `{ data: { user_id } }`.
- `set_locked`: update `members.is_locked` trước (lỗi trigger → 409 `messageForDbError`); rồi `admin.auth.admin.updateUserById(user_id, { ban_duration: locked ? BAN_FOREVER : UNBAN })`; nếu bước ban lỗi → đặt lại `is_locked` như cũ và trả 500.
- `set_admin`: update `members.is_admin` (lỗi trigger → 409).
- `tsconfig.json`: thêm `"exclude": ["node_modules", "android", "ios", "supabase/functions/**/index.ts"]` (file Deno, không typecheck bằng tsc của app; logic.ts vẫn được kiểm qua test import).

## 3. Client — `src/users/api.ts`

- `type ManagedUser = { user_id: string; email: string; is_admin: boolean; is_locked: boolean; created_at: string }`.
- Hàm nội bộ `call<T>(body: AdminRequest): Promise<{ data: T | null; error: string | null }>` dùng `supabase.functions.invoke("admin-users", { body })`. Khi `error`: dùng `functionErrorMessage` (`src/lib/functionError.ts`): có `error.context` là phản hồi máy chủ thì lấy `.error` trong thân JSON, thân không đọc được thì "Máy chủ báo lỗi (<mã>). Thử lại sau."; không có phản hồi (mất mạng) → "Không kết nối được. Kiểm tra mạng.".
- Xuất `listUsers()`, `createUser(email, password, isAdmin)`, `setLocked(userId, locked)`, `setAdmin(userId, isAdmin)`.

## 4. Màn — `src/users/UsersScreen.tsx` (props `{ currentUserId: string }`)

- Tải `listUsers()` khi mở; trạng thái tải/lỗi + "Thử lại".
- Danh sách: email; nhãn "Quản trị", "Đã khóa", "(bạn)" cho chính mình. Nút cho người khác (ẩn với chính mình): "Khóa"/"Mở khóa", "Cấp Quản trị"/"Bỏ Quản trị". Xong → tải lại danh sách; lỗi hiện dưới dòng đó.
- Khối "Thêm Người dùng": Email (`keyboardType="email-address"`, `autoCapitalize="none"`), "Mật khẩu ban đầu" (`secureTextEntry`), Switch "Là Quản trị", nút "Tạo". Kiểm trước bằng `validateNewUser` (hiện lỗi dưới ô). Thành công → xóa form, thông báo "Đã tạo. Gửi email và mật khẩu ban đầu cho người đó.", tải lại.
- Mọi nút ghi khóa khi mất mạng (`useOnline`) + dòng "Mất mạng — không thay đổi được". Nút đang chạy thì khóa (chống bấm 2 lần). Dùng `ScrollView`.

## 5. `App.tsx`

- `HomeScreen` nhận prop `userId` (từ `session.user.id`). Ngoài truy vấn Chi nhánh hiện có, đọc `members.is_admin` của chính mình (`.eq("user_id", userId).eq("branch_id", branch_id).maybeSingle()`).
- Thanh trên: tên Chi nhánh; nếu là Quản trị có nút "Người dùng" ⇄ "Danh mục" để chuyển giữa `<UsersScreen currentUserId=… />` và `<CatalogScreen … />` (state đơn giản, không router); "Đăng xuất" giữ nguyên.
- `LoginScreen`: nếu lỗi đăng nhập có `error.code === "user_banned"` → "Người dùng này đã bị khóa. Liên hệ Quản trị."; còn lại giữ thông báo cũ.

## Tiêu chí xong

- `npm test` xanh (có `src/users/adminLogic.test.ts`), `npx tsc --noEmit` sạch.
- Không sửa `src/lib/*`, `src/catalog/*`, SQL, `.husky`, `.env*`.

## Thay đổi 2 — đăng xuất ngay khi bị khóa (yêu cầu thêm của người dùng)

- Trigger `members_notify_locked` (migration `20261118040000`) gửi broadcast `locked` vào topic `user-lock:<user_id>` khi `is_locked` chuyển sang true.
- `src/lib/useLockWatch.ts`: nghe topic đó, kiểm lại khi app mở lên lại và mỗi 2 phút. Không đọc được dòng `members` của mình (RLS giấu) và vẫn còn phiên → đăng xuất trên máy, báo "không còn quyền vào Chi nhánh". Lỗi mạng hoặc phiên trống không bị coi là bị khóa.
- Trigger giữ Quản trị cuối (`members_keep_last_admin`) được thêm trong ticket này (mục "Đã có" ở trên viết trước khi tách việc) và có khóa tư vấn theo Chi nhánh chống race (migration `20261118050000`).
