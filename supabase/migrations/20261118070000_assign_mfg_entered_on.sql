-- Thêm Ngày sản xuất cho đúng phần "chưa có Ngày sản xuất" vào kho ngày nào (phần đó tách theo ngày vào kho).
-- null (dòng cũ) = lấy phần vào kho sớm nhất trước.
alter table public.stock_movements
  add column entered_on date,
  add constraint stock_movements_entered_on_assign_only
    check (entered_on is null or kind = 'assign_mfg');
