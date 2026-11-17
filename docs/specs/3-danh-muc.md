# Đặc tả: màn Danh mục (issue #3) — app Expo SDK 58, React Native 0.88, TypeScript strict

Ngôn ngữ giao diện: tiếng Việt. Thuật ngữ (dùng đúng chữ): Danh mục, Nhóm, Nguyên vật liệu (gọi tắt "món" trên UI được), Đơn vị tính, Quy cách thùng, Ngày sản xuất, Thời hạn sử dụng, Ghi theo %, Chi nhánh.
Phong cách code: như `App.tsx` hiện có (StyleSheet, Pressable, màu chính `#0f766e`, lỗi `#b91c1c`, nút cao ≥ 44–48px, `accessibilityRole`). Prettier: double quotes, trailing comma es5. Không thêm thư viện mới. Không dùng expo-router (chưa cài) — dùng `Modal` của react-native cho form.

## Database (đã có, KHÔNG sửa SQL) — xem `src/lib/database.types.ts`

- `item_groups`: id, branch_id, name, name_zh, sort_order.
- `items`: id, branch_id, group_id, name, name_zh, unit, unit_zh, case_size (int>0|null), track_mfg_date (bool), shelf_life_days (từ Ngày sản xuất), shelf_life_from_receipt_days (từ ngày nhập), shelf_life_after_open_days (sau khui/rã đông) — các hạn là int>0|null, record_by_percent (bool), is_hidden (bool), created_at, updated_at. unique(branch_id, name). Không có quyền DELETE: "ẩn" = `is_hidden=true`.
- Client: `import { supabase } from "../lib/supabase"` (đã typed `createClient<Database>`). Kiểu hàng: `Tables<"items">` từ `src/lib/database.types.ts`.

## Module thuần (KHÔNG import react-native/supabase; có test Vitest cùng thư mục, tên `*.test.ts`)

1. `src/catalog/search.ts`
   - `normalizeVi(s: string): string`: chữ thường, bỏ dấu tiếng Việt (NFD + xóa U+0300–U+036F), `đ/Đ` → `d`, gộp khoảng trắng, trim.
   - `matchesQuery(item: { name: string; name_zh: string | null }, query: string): boolean`: query rỗng → true; mọi từ (tách theo khoảng trắng) của `normalizeVi(query)` phải nằm trong `normalizeVi(name)` hoặc trong `name_zh` (so nguyên văn).
   - Test: "tra sua" khớp "Trà sữa"; "DUONG den" khớp "Trân châu đường đen"; "đào" khớp "Dao ngam"; "ngam dao" khớp "Đào ngâm" (thứ tự từ tự do); "xyz" không khớp; tên Trung "紅茶" khớp item có name_zh "紅茶".

2. `src/catalog/sections.ts`
   - `buildSections(groups, items, opts: { query: string; showHidden: boolean }): { group: Group; items: Item[] }[]` (Group/Item = `Tables<"item_groups">`/`Tables<"items">`, có thể dùng `Pick` để test dễ).
   - Nhóm sắp theo `sort_order` rồi `name` (`localeCompare(…, "vi")`); món trong nhóm sắp theo `name` (`"vi"`). Ẩn món `is_hidden` khi `showHidden=false`. Lọc theo `matchesQuery`. Bỏ nhóm không còn món khi `query` khác rỗng; khi query rỗng vẫn giữ nhóm trống (để thấy nhóm mới tạo).
   - Test: sắp đúng; ẩn/hiện món ẩn; lọc không dấu; nhóm trống bị bỏ khi tìm.

3. `src/catalog/itemForm.ts`
   - `type ItemFormValues` = mọi trường dạng chuỗi/boolean cho form: name, name_zh, group_id, unit, unit_zh, case_size, shelf_life_days, shelf_life_from_receipt_days, shelf_life_after_open_days (chuỗi), track_mfg_date, record_by_percent (boolean).
   - `emptyForm(groupId?: string): ItemFormValues`, `toFormValues(item: Item): ItemFormValues`.
   - `parseItemForm(v): { ok: true; value: Omit<TablesInsert<"items">, "branch_id"> } | { ok: false; errors: Partial<Record<keyof ItemFormValues, string>> }`.
     Quy tắc: trim mọi chuỗi; name, unit, group_id bắt buộc ("Bắt buộc"); chuỗi rỗng ở name_zh/unit_zh → null; các số: rỗng → null, phải là số nguyên > 0 (chỉ chữ số) nếu có, sai → "Số nguyên lớn hơn 0".
     Không tự đổi track_mfg_date khi có shelf_life_days (giữ đúng người dùng chọn).
   - Test: hợp lệ đầy đủ; thiếu tên/đơn vị/nhóm; số "0", "-1", "1.5", "abc" lỗi; rỗng → null; trim.

4. `src/catalog/csv.ts`
   - `parseCsv(text: string): string[][]` — CSV chuẩn RFC 4180 tối thiểu: dấu phẩy, ô trong ngoặc kép (có `""` thoát, có xuống dòng bên trong), bỏ BOM đầu file, chấp nhận `\r\n`/`\n`, bỏ dòng trống hoàn toàn.
   - `parseCatalogCsv(text): { rows: CatalogRow[]; errors: string[] }`. Dòng đầu là tiêu đề, cột theo TÊN (thứ tự tự do):
     `nhom, nhom_zh, thu_tu_nhom, ten, ten_zh, don_vi, don_vi_zh, quy_cach_thung, theo_doi_nsx, han_tu_nsx_ngay, han_tu_ngay_nhap_ngay, han_sau_khui_ngay, ghi_theo_phan_tram`.
     Bắt buộc có cột và giá trị: nhom, ten, don_vi. Boolean: `1/0`, `x`/rỗng, `true/false`, `có/không` (không phân biệt hoa thường). Số rỗng → null; số sai → lỗi "Dòng N: <cột> …" (N tính theo dòng file, tiêu đề là dòng 1) và bỏ dòng đó. Tên món trùng trong file → lỗi.
     `CatalogRow = { group: { name; name_zh: string|null; sort_order: number }, item: Omit<TablesInsert<"items">, "branch_id" | "group_id"> }` (thu_tu_nhom rỗng → 0).
   - Test: ngoặc kép có dấu phẩy; BOM; boolean các dạng; số sai báo đúng số dòng; thiếu cột bắt buộc → lỗi; trùng tên.

## Script nạp Danh mục — `scripts/import-catalog.ts`

- Chạy: `node --env-file=.env scripts/import-catalog.ts <đường-dẫn.csv>` (Node 25 tự bỏ kiểu TS; import tương đối PHẢI ghi đuôi `.ts`, ví dụ `../src/catalog/csv.ts`; chỉ dùng cú pháp TS "erasable": không enum, không namespace, không parameter properties).
- Đọc env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `CYS_EMAIL`, `CYS_PASSWORD` (thiếu → thông báo rõ, exit 1). Đăng nhập bằng email/mật khẩu (RLS áp dụng — KHÔNG dùng service role).
- Lấy branch_id: `members` của chính user (`user_id = session.user.id`, chưa bị khóa); không có → lỗi.
- Có lỗi parse → in hết lỗi, exit 1, không ghi gì.
- Upsert Nhóm theo `(branch_id,name)` (`onConflict: "branch_id,name"`), lấy id; upsert món theo `(branch_id,name)`. KHÔNG đổi `is_hidden` của món đã có. In tóm tắt: số Nhóm, số món.
- Thêm vào `package.json` scripts: `"import-catalog": "node --env-file=.env scripts/import-catalog.ts"`.
- Thêm vào `.env.example` (cuối file) 2 dòng có chú thích: `CYS_EMAIL=` và `CYS_PASSWORD=` (chỉ dùng cho script nạp chạy trên máy, không đóng gói vào app).
- `tsconfig.json`: thêm `"allowImportingTsExtensions": true` trong compilerOptions nếu cần để `tsc --noEmit` qua (đang noEmit nên được phép).

## Dữ liệu mẫu — `supabase/sample/danh-muc.mau.csv`

Đúng cột ở trên, TÊN CHUNG CHUNG (không tên thương hiệu): 4 Nhóm theo thứ tự: "Đóng gói" (包材), "Thạch & Topping" (配料), "Trà & Nước pha chế" (茶類), "NVL pha chế" (原物料); khoảng 12 món như "Ly nhựa 700ml" (Thùng, 500/thùng), "Ống hút" , "Trân châu đen" (Bao, theo dõi NSX, hạn 365, sau khui 1), "Thạch dừa" (Bao, 20/thùng, hạn 365, sau khui 7), "Hồng trà" (Bao), "Trà xanh" (Bao), "Nước cốt chanh" (Bao, hạn 720, từ ngày nhập 7, sau khui 3), "Sữa tươi" (Bình, Ghi theo % = 1), "Nước đường" (Bình, 4/thùng)… Có tên tiếng Trung cho món và đơn vị (ví dụ 箱, 包, 瓶, 盒).
Có test Vitest đọc file mẫu này qua `parseCatalogCsv` → 0 lỗi, ≥ 10 món, 4 Nhóm.

## Giao diện

- `src/catalog/api.ts`: `loadCatalog(branchId)` → `{ groups, items }` (2 truy vấn, lọc `branch_id`); `saveItem(branchId, id | null, value)` (insert hoặc update theo id, trả `{ error: string | null }`, lỗi unique (code `23505`) → "Tên món đã có trong Danh mục"); `setHidden(id, hidden)`; `subscribeCatalog(branchId, onChange): () => void` dùng `supabase.channel(...).on("postgres_changes", { event: "*", schema: "public", table: "items", filter: \`branch_id=eq.${branchId}\` }, …)`và tương tự cho`item_groups`; trả hàm hủy (`supabase.removeChannel`).
- `src/catalog/CatalogScreen.tsx` (props `{ branchId: string }`): tải Danh mục; nghe realtime → tải lại; ô tìm (placeholder "Tìm món (gõ không dấu được)"); công tắc `Switch` "Hiện món đã ẩn"; `SectionList` theo `buildSections` (tiêu đề Nhóm + tên Trung nếu có; mỗi dòng: tên, đơn vị, "· 12/thùng" nếu có, nhãn "Đã ẩn" nếu ẩn); bấm dòng → mở form sửa; nút "+ Thêm món" → form trống. Trạng thái tải/lỗi ("Không tải được Danh mục. Kiểm tra mạng." + nút "Thử lại"). Danh mục trống → hướng dẫn "Chưa có món nào. Bấm + Thêm món, hoặc nạp bằng script (npm run import-catalog)."
- `src/catalog/ItemForm.tsx` (Modal; props: `visible, groups, initial: Item | null, branchId, onClose, onSaved`): các ô theo `ItemFormValues` với nhãn tiếng Việt: Tên, Tên tiếng Trung, Nhóm (chọn bằng các nút/chip của danh sách Nhóm), Đơn vị tính, Đơn vị tính (tiếng Trung), Quy cách thùng (số Đơn vị tính / thùng), Theo dõi Ngày sản xuất (Switch), Thời hạn sử dụng từ Ngày sản xuất (ngày), Hạn kể từ ngày nhập (ngày), Hạn sau khui/rã đông (ngày), Ghi theo % (Switch). Ô số dùng `keyboardType="number-pad"`. Hiện lỗi dưới từng ô từ `parseItemForm`. Nút "Lưu" và (khi sửa) "Ẩn món"/"Hiện lại món" — **khóa khi mất mạng** dùng `useOnline()` từ `src/lib/useOnline.ts`, kèm dòng "Mất mạng — không lưu được". Nút "Hủy". Cuộn được (`ScrollView`).
- `App.tsx`: `HomeScreen` đổi truy vấn thành `select("branch_id, branch_name")` (giữ `.order("branch_id").limit(1).maybeSingle()`), hiện thanh trên cùng gồm tên Chi nhánh + nút "Đăng xuất", phần thân là `<CatalogScreen branchId=… />`. Giữ nguyên LoginScreen, băng mất mạng và các thông báo lỗi/không thuộc Chi nhánh hiện có.

## Tiêu chí xong

- `npm test` (Vitest) xanh, có test cho search, sections, itemForm, csv, file mẫu.
- `npx tsc --noEmit` sạch.
- Không thay đổi `src/lib/supabase.ts`, `src/lib/database.types.ts`, SQL, `.husky`.

## Thay đổi 2 — thời hạn giữ đơn vị gốc (ghi đè các mục trên)

Database đã đổi (xem `src/lib/database.types.ts`, có `export type ShelfLifeUnit = "day" | "month"`):

- `shelf_life_days` → `shelf_life` (int>0|null) + `shelf_life_unit` (`"day"|"month"`, mặc định `"month"`) — Thời hạn sử dụng từ Ngày sản xuất.
- `shelf_life_after_open_days` → `shelf_life_after_open` (int>0|null) + `shelf_life_after_open_unit` (`"day"|"month"`, mặc định `"day"`) — hạn sau khui/rã đông.
- `shelf_life_from_receipt_days` giữ nguyên (chỉ ngày).
- Không quy đổi tháng ↔ ngày ở bất kỳ đâu.

Việc cần làm:

1. `src/catalog/duration.ts` (thuần, có test `duration.test.ts`): `parseDuration(raw: string, defaultUnit: ShelfLifeUnit): { ok: true; value: { amount: number; unit: ShelfLifeUnit } | null } | { ok: false }`.
   - Rỗng → `{ ok: true, value: null }`. "12" → amount 12, unit = defaultUnit. Có hậu tố (không phân biệt hoa thường, có/không dấu, có/không khoảng trắng): "12 tháng", "12 thang", "12th", "12m" → month; "15 ngày", "15 ngay", "15d" → day; "3 năm"/"3 nam"/"3y" → `{ amount: 36, unit: "month" }` (năm = 12 tháng, đây là đơn vị tháng nên không phải quy đổi ra ngày). Số phải là nguyên > 0, sai → `{ ok: false }`.
   - `formatDuration(amount, unit)` → "12 tháng" / "15 ngày".
2. `src/catalog/itemFormModel.ts` + test: form có thêm `shelf_life_unit` và `shelf_life_after_open_unit` (kiểu `ShelfLifeUnit`); ô số `shelf_life` và `shelf_life_after_open` vẫn là chuỗi số nguyên > 0 (lỗi "Số nguyên lớn hơn 0"). `emptyForm`: shelf_life_unit "month", after_open_unit "day". `toFormValues`/`parseItemForm` theo tên cột mới.
3. `src/catalog/ItemForm.tsx`: cạnh ô "Thời hạn sử dụng (từ Ngày sản xuất)" và ô "Hạn sau khui/rã đông" có công tắc 2 nút "Ngày" | "Tháng" (Pressable, nút đang chọn tô màu `#0f766e` chữ trắng, `accessibilityState={{ selected }}`). "Hạn kể từ ngày nhập (ngày)" giữ như cũ.
4. `src/catalog/csv.ts` + test: cột `han_tu_nsx` (mặc định tháng) và `han_sau_khui` (mặc định ngày) đọc bằng `parseDuration` — ô có thể ghi "12 tháng", "15 ngày", "3 năm" hoặc chỉ số. Cột `han_tu_ngay_nhap_ngay` giữ là số ngày. Bỏ hẳn tên cột cũ `han_tu_nsx_ngay`, `han_sau_khui_ngay`. Lỗi định dạng → "Dòng N: <cột> không hợp lệ".
5. `supabase/sample/danh-muc.mau.csv`: đổi tiêu đề sang `han_tu_nsx`, `han_sau_khui`, ghi giá trị dạng "12 tháng", "24 tháng", "15 ngày", "1 ngày", "7 ngày" (test file mẫu vẫn 0 lỗi).
6. Sửa mọi test cũ dùng tên cột/trường cũ. `npm test` xanh và `npx tsc --noEmit` sạch.
