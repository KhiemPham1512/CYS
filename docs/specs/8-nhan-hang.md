# Đặc tả: Nhận hàng + Chờ nhà cung cấp (issue #8)

Thuật ngữ (GLOSSARY): Hàng đang về, Hàng thiếu, Trả hàng hư, Chờ nhà cung cấp, Ngày sản xuất, Lô, Tồn kho thực tế, Tồn kho dự tính.

## Quyết định (đã duyệt)

- Nhận theo **từng dòng** của đơn đã đặt, **một lần** mỗi dòng. Người dùng nhập: số thực nhận (mặc định = số đặt), số hư trong đó, Ngày sản xuất (gõ tắt "28", dùng `parseShortDate`).
- Phần tốt = nhận − hư → sổ kho (`kind = receive`, `mfg_date`). Phần thiếu = đặt − nhận → Chờ nhà cung cấp loại **Thiếu**; phần hư → loại **Trả hư**.
- Sau khi nhận, dòng **hết Hàng đang về** hẳn (kể cả nhận thiếu). Chờ nhà cung cấp **không** tính vào Tồn kho thực tế hay dự tính.
- Món theo dõi Ngày sản xuất: bắt buộc có ngày khi có phần tốt (không bắt nếu toàn hư).
- "Đã nhận bù": nhập số (một phần được, tối đa số còn chờ của món) + Ngày sản xuất nếu cần → `receive` vào kho, ghi `settled` trừ Chờ nhà cung cấp.

## Seam kiểm thử

1. `parseShortDate` (đã có). 2. `stockLots` + `receive`. 3. `planReceipt`. 4. `incomingByItem` (tham số dòng đã nhận), `waitingByItem`. 5. SQL `supabase/tests/rls_receiving.sql`.

## Dữ liệu (migration `20261118110000_receiving.sql`)

- `stock_movements`: thêm kind `receive`, cột `order_line_id`; `mfg_date` được phép với `receive`.
- `purchase_receipts` (một dòng đơn một lần nhận), `supplier_owed` (`short`/`damaged` cộng, `settled` trừ).
- Ghi qua hai hàm `receive_order_line` và `settle_owed` (security definer, kiểm quyền Chi nhánh và dữ liệu ở máy chủ); client chỉ đọc hai bảng.

## Giao diện (sau khi áp migration)

Màn "Nhận hàng": danh sách Hàng đang về theo đơn → nhập số/ngày từng dòng → "Đã đủ hàng" hoặc ghi Thiếu/Hư; mục Chờ nhà cung cấp kèm "Đã nhận bù".

## Ngoài phạm vi

Trả hàng hư sau khi đã vào kho (làm ở #9, trừ đúng Lô); kg/bao của trà (chưa có chỗ lưu).
