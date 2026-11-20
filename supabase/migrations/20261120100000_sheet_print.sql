-- Dữ liệu "in trên tờ" cho Xuất ảnh (tờ giấy Đặt hàng / Tồn kho). Mỗi cột là JSON, rỗng = dùng giá trị mặc định của app.
-- items.sheet: { name, zh, unit, unit_zh, note, category, category_zh }
--   name        tên in trên tờ (mặc định: tên món)
--   zh          chữ Trung in sau tên, đúng như trên tờ (vd "（中）")
--   unit/unit_zh  đơn vị và chữ Trung của đơn vị in trên tờ
--   note        ghi chú in sau chữ Trung (vd "1 thùng / 10")
--   blank_zero  "1": tờ Tồn kho để trống ô khi hết hàng (mặc định ghi 0)
--   category / category_zh  chữ trong cột LOẠI, các món liền nhau cùng loại gộp một ô (mặc định: tên Nhóm)
-- item_groups.sheet: { qty_label, label, label_zh }   nhãn cột số lượng (mặc định "SỐ LƯỢNG"); nhãn LOẠI cho món không có loại riêng (mặc định tên Nhóm viết hoa + chữ Trung của Nhóm)
-- branch_settings.sheet: { title, order_zh, stock_zh }   tên in ở tiêu đề tờ và phần chữ Trung của hai loại tờ
alter table public.items add column sheet jsonb not null default '{}'::jsonb;
alter table public.item_groups add column sheet jsonb not null default '{}'::jsonb;
alter table public.branch_settings add column sheet jsonb not null default '{}'::jsonb;
