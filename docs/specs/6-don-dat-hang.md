# Đặc tả: Đơn đặt hàng + Hàng đang về (issue #6)

Thuật ngữ (GLOSSARY): Đơn đặt hàng, Hàng đang về, Tồn kho dự tính, Tồn kho thực tế, Nhóm, Quy cách thùng, Người đặt hàng.

## Quyết định thiết kế (chờ người dùng duyệt)

- Mỗi Đơn đặt hàng thuộc **một Nhóm**; mỗi dòng = món (cùng Nhóm) + số lượng > 0 (đơn vị tính của món; gõ được `1T+3` như Ghi dùng).
- Mỗi Nhóm có **tối đa một Đơn đặt hàng nháp** cùng lúc. Nháp sửa/xóa thoải mái.
- Nút **"Đã đặt đúng như đơn"**: đánh dấu đơn `placed_at = now()`. Từ lúc đó đơn **khóa** (không sửa dòng, không xóa) và các dòng của nó là **Hàng đang về**.
- **Hàng đang về** của món = tổng số lượng các dòng thuộc đơn đã đặt. Gỡ Hàng đang về khi nhận là việc của #8 (Nhận hàng), chưa làm ở đây.
- **Tồn kho dự tính** = Tồn kho thực tế + Hàng đang về; tính ở module lõi `src/orders/`, không lưu.
- Màn Tồn kho hiện thêm Hàng đang về và Tồn kho dự tính cho món có Hàng đang về.
- Khi lập đơn, mỗi món hiện Tồn kho thực tế, Hàng đang về và Tồn kho dự tính bên cạnh.

## Dữ liệu (migration `20261118100000_orders.sql`)

- `purchase_orders(id, branch_id, group_id, created_by, created_at, placed_at null)`; unique một đơn nháp mỗi Nhóm (`unique (branch_id, group_id) where placed_at is null`).
- `purchase_order_lines(id, order_id, branch_id, item_id, qty > 0)`; unique `(order_id, item_id)`; món phải cùng Chi nhánh.
- RLS: thành viên đang hoạt động đọc/ghi trong Chi nhánh của mình; sửa/xóa đơn và dòng **chỉ khi đơn chưa `placed_at`** (policy); chỉ đặt được `placed_at` một lần (cột được cấp quyền update: `placed_at`; policy using `placed_at is null`).
- Realtime bật cho cả hai bảng.

## Module lõi `src/orders/` (thuần, có test)

- `incomingByItem(orders, lines)`: Map `item_id → Hàng đang về` (chỉ đơn có `placed_at`).
- `projectedQty(actual, incoming)`: Tồn kho dự tính (làm tròn 4 số lẻ).
- `isEditable(order)`: nháp (chưa `placed_at`).

## Giao diện (sau khi duyệt mô hình)

Tab "Đặt hàng": chọn Nhóm → danh sách món kèm tồn → nhập số lượng → Lưu nháp → "Đã đặt đúng như đơn". Đơn đã đặt chỉ xem.

## Ngoài phạm vi

Xuất ảnh (#7), Nhận hàng/Hàng thiếu (#8), đọc ảnh đơn (#11).
