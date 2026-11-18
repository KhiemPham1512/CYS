# Đặc tả: module lõi Kho + Tồn kho + Kiểm kho (issue #4) — TypeScript strict, Expo SDK 58

Thuật ngữ (GLOSSARY, dùng đúng chữ trên UI): Tồn kho thực tế, Lô, Ngày sản xuất, Quy cách thùng, Đơn vị tính, Kiểm kho, Điều chỉnh tồn kho, Ghi theo %, Chi nhánh. Tránh: "tồn", "stock", "batch" trên UI. Phong cách code/UI như `src/catalog/*` và `App.tsx` (StyleSheet, Pressable, `#0f766e`, lỗi `#b91c1c`, nút ≥ 44px). Prettier: double quotes, trailing comma es5. Không thêm thư viện.

## Đã có (KHÔNG sửa SQL, `src/lib/*`, `src/catalog/*` trừ khi nói rõ)

Bảng `stock_movements` (chỉ select + insert): `seq` (thứ tự), `item_id`, `kind` (`count`|`adjust`|`assign_mfg`), `qty`, `mfg_date` (yyyy-mm-dd, chỉ với assign_mfg), `expected_qty`, `batch_id`, `note`, `created_by`, `created_at`. Kiểu: `Tables<"stock_movements">`, `TablesInsert<"stock_movements">` trong `src/lib/database.types.ts`. Số lượng luôn tính theo **Đơn vị tính** của món (số thực, ví dụ 0.5; món Ghi theo % lưu 0.95 = 95%).

- `count` / `adjust`: **mốc chốt** — đặt Tồn kho thực tế của món = `qty` nhưng **giữ Ngày sản xuất**: tăng thì phần thêm vào Lô "chưa có Ngày sản xuất"; giảm thì trừ Lô có ngày sớm nhất trước, Lô chưa có ngày sau cùng (sửa sau góp ý người dùng 18/11: bản đầu xóa hết Ngày sản xuất). `expected_qty` = số app tính được ngay trước đó (để biết lệch).
- `assign_mfg`: chuyển `qty` từ Lô "chưa có Ngày sản xuất" sang Lô có `mfg_date`.

## Phần A — module lõi thuần `src/stock/` (KHÔNG import react-native/supabase; Vitest chạy trong node)

1. `src/stock/qty.ts`
   - `parseQty(input: string, opts: { caseSize: number | null; byPercent: boolean }): { ok: true; value: number } | { ok: false; error: string }`.
     Cú pháp: các số hạng cách nhau bởi `+` (bỏ khoảng trắng). Số hạng: `<số>` = số Đơn vị tính (dấu thập phân `,` hoặc `.`); `<số>T`/`<số>t` = số thùng × caseSize (caseSize null → lỗi "Món này chưa có Quy cách thùng"); `<số>%` = số/100 và chỉ khi byPercent (không → "Chỉ món Ghi theo % mới gõ được %"). Rỗng → "Chưa nhập". Sai cú pháp/âm → "Số lượng không hợp lệ". Kết quả làm tròn 4 chữ số thập phân (tránh sai số float). "0" hợp lệ (đếm được 0).
     Ví dụ: ("1T+3", caseSize 12) → 15; ("0,5") → 0.5; ("95%", byPercent) → 0.95; ("2+95%", byPercent) → 2.95; ("1T", null) → lỗi; ("95%", không byPercent) → lỗi; ("1+") và ("abc") → lỗi.
   - `formatQty(qty: number, opts: { caseSize: number | null; unit: string; byPercent: boolean }): string`.
     Có caseSize và qty ≥ caseSize: `cases = floor(qty/caseSize)`, `rest = round4(qty − cases×caseSize)`: "1 thùng 3 hộp"; rest = 0 → "2 thùng". Đơn vị viết thường (`"Hộp"` → "hộp"). Phần lẻ định dạng: số thường dùng dấu phẩy, tối đa 4 chữ số thập phân bỏ số 0 thừa ("0,5 hộp", "3 hộp"); byPercent và có phần thập phân: nguyên>0 → "2 hộp 95%", nguyên=0 → "95%"; qty 0 → "0 hộp". Không có caseSize → chỉ phần lẻ/đơn vị ("15 hộp").
   - Test phủ: các ví dụ trên, khứ hồi `parseQty(formatQty(x))` với món có caseSize cho các giá trị nguyên.

2. `src/stock/date.ts`
   - `parseShortDate(input: string, today: Date): { ok: true; value: string } | { ok: false; error: string }` (value dạng `yyyy-mm-dd`; dùng các thành phần ngày theo giờ địa phương của `today`). Dạng: `d` (chỉ ngày → ngày gần nhất **không sau hôm nay** có ngày-trong-tháng đó, lùi qua các tháng, bỏ tháng không có ngày đó), `d/m` (ngày/tháng gần nhất không sau hôm nay: năm nay hoặc năm trước), `d/m/yyyy`, `d/m/yy` (yy → 20yy). Ngày không tồn tại (31/2) → "Ngày không hợp lệ"; rỗng → "Chưa nhập ngày"; ngày tương lai tường minh (d/m/yyyy sau hôm nay) → "Ngày sản xuất không thể ở tương lai".
     Test với today = 2026-11-18: "28" → 2026-10-28; "18" → 2026-11-18; "5" → 2026-11-05; "28/10" → 2026-10-28; "28/12" → 2025-12-28; "31" → 2026-10-31; today = 2026-03-02, "30" → 2026-01-30; "31/2" lỗi; "28/10/26" → 2026-10-28; "1/1/2027" lỗi.
   - `formatDate(iso: string): string` → "28/10/2026".

3. `src/stock/ledger.ts`
   - Kiểu `Movement = Pick<Tables<"stock_movements">, "seq" | "item_id" | "kind" | "qty" | "mfg_date" | "expected_qty" | "batch_id">`, `Lot = { mfgDate: string | null; qty: number }`.
   - `stockLots(movements: Movement[]): Lot[]` — cho **một món** (các dòng của món đó, thứ tự bất kỳ; sắp theo `seq`). Bắt đầu rỗng. `count`/`adjust`: đặt tổng = qty theo quy tắc giữ Ngày sản xuất ở trên. `assign_mfg`: lấy `min(qty, phần chưa có NSX hiện còn)` khỏi Lô null, cộng vào Lô cùng `mfg_date` (gộp nếu đã có). Kết quả: bỏ Lô qty ≤ 0, sắp Lô có ngày theo ngày tăng dần, Lô null cuối cùng; làm tròn 4 chữ số.
   - `totalQty(lots: Lot[]): number`.
   - `stockByItem(movements: Movement[]): Map<string, Lot[]>` — nhóm theo `item_id` rồi `stockLots`.
   - `countDiffs(movements: Movement[], batchId: string): { item_id: string; expected: number; actual: number; diff: number }[]` — các dòng `kind="count"` có `batch_id` đó và `expected_qty` khác null và khác `qty`; `diff = round4(actual − expected)`; giữ thứ tự `seq`.
   - Test qua API công khai: reset bằng count; adjust ghi đè các Lô; assign_mfg chuyển đúng, gộp cùng ngày, chuyển quá số lượng chỉ lấy phần còn; hai Lô sắp đúng, Lô null cuối; sau một count mới thì assign_mfg cũ không còn tác dụng; countDiffs bỏ món không lệch.

## Phần B — dữ liệu và giao diện (làm SAU khi Phần A xanh)

4. `src/stock/api.ts`
   - `loadMovements(branchId): Promise<Tables<"stock_movements">[]>` (select `*` theo branch_id, sắp `seq`; lỗi → throw). `shortcut:` tải toàn bộ sổ, đủ cho quy mô nhỏ; đổi sang chỉ tải từ mốc chốt khi sổ lớn.
   - `newBatchId(): string` — UUID v4 bằng `Math.random` (không cần mật mã).
   - `saveCount(branchId, rows: { item_id: string; qty: number; expected_qty: number }[]): Promise<{ batchId: string; error: string | null }>` — một lần insert nhiều dòng, `kind: "count"`, chung `batch_id`. `saveAdjust(branchId, itemId, qty, expectedQty, note: string | null)` (`kind: "adjust"`). `assignMfg(branchId, itemId, qty, mfgDate)` (`kind: "assign_mfg"`). Lỗi → "Không lưu được. Kiểm tra mạng.".
   - `subscribeMovements(branchId, onChange): () => void` — giống `subscribeCatalog` (kênh tên riêng có hậu tố ngẫu nhiên, filter `branch_id=eq.<id>`, hủy bằng `supabase.removeChannel`).
5. `src/stock/StockScreen.tsx` (props `{ branchId: string }`): tải Danh mục (`loadCatalog`, `subscribeCatalog` từ `../catalog/api`) và sổ (`loadMovements`, `subscribeMovements`); khi có sự kiện realtime gộp 300ms rồi tải lại, bỏ kết quả tải cũ (xem mẫu trong `src/catalog/CatalogScreen.tsx`). Hiển thị theo Nhóm (dùng `buildSections` từ `../catalog/sections`, ẩn món ẩn): mỗi món một dòng "Tên — <formatQty tổng>", bên dưới từng Lô: "Ngày sản xuất 28/10/2026: …" hoặc "Chưa có Ngày sản xuất: …". Món chưa có dòng nào: "Chưa kiểm". Ô tìm không dấu (`matchesQuery`). Bấm món → khung (Modal) hiện Tồn kho thực tế theo Lô và 2 mục bấm qua lại "Điều chỉnh tồn kho" | "Thêm Ngày sản xuất" (mỗi mục một nút Lưu; mục Thêm Ngày sản xuất báo "đã có đủ" khi không còn phần chưa có ngày): (a) **Điều chỉnh tồn kho**: ô số lượng (parseQty, đúng caseSize/byPercent của món), ô lý do (không bắt buộc), nút Lưu → `saveAdjust` với `expected_qty` = tổng hiện tại; (b) nếu có Lô chưa có Ngày sản xuất: **Thêm Ngày sản xuất** — ô số lượng (mặc định = toàn bộ phần chưa có, hiển thị bằng formatQty), ô ngày (gõ "28" hoặc "28/10", `parseShortDate`, hiện ngày đầy đủ đã hiểu bên dưới ô), nút Lưu → `assignMfg`. Mọi nút ghi khóa khi mất mạng (`useOnline`) kèm dòng "Mất mạng — không lưu được". Lỗi từng ô hiện dưới ô.
6. `src/stock/CountScreen.tsx` (props `{ branchId: string; onDone: () => void }`) — **Kiểm kho**: danh sách món (theo Nhóm, ẩn món ẩn) mỗi món có ô nhập (placeholder: "bỏ trống nếu không đếm"; hiện Quy cách thùng và gợi ý "1T+3" nếu có); hiện lỗi `parseQty` dưới ô; nút "Lưu Kiểm kho" (khóa khi mất mạng hoặc không có ô nào nhập hoặc còn ô lỗi) gọi `saveCount` với `expected_qty` = tổng hiện tại của món (từ `stockByItem`; món chưa có dòng = 0). Sau khi lưu: màn "Món lệch sau Kiểm kho" từ `countDiffs(movements đã tải lại, batchId)`: mỗi dòng "Tên: sổ ghi X → đếm Y (lệch +Z)", `formatQty` cho cả ba số (lệch dương "+", âm "−"); không lệch → "Không có món nào lệch". Nút "Xong" gọi `onDone`.
7. `App.tsx` — `HomeScreen`: thanh chuyển mục gồm "Tồn kho", "Kiểm kho", "Danh mục" và (chỉ Quản trị) "Người dùng"; mặc định "Tồn kho". Thay state `view` hiện tại (`"catalog" | "users"`) bằng `"stock" | "count" | "catalog" | "users"`; giữ nguyên thanh trên (tên Chi nhánh, Đăng xuất) và `useLockWatch`. Nút chuyển mục: Pressable cao ≥ 44px, mục đang chọn tô `#0f766e` chữ trắng, `accessibilityState={{ selected }}`.

## Tiêu chí xong

- `npm test` xanh (có test cho qty, date, ledger), `npx tsc --noEmit` sạch (chạy cả hai).
- Không sửa SQL, `src/lib/*`, `src/catalog/*`, `.husky`, `.env*`.
