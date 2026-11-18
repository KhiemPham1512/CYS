-- Ép "chỉ ghi thêm" bằng quyền, không chỉ nhờ thiếu policy: client không sửa/xóa được dòng nào và
-- không tự đặt created_at/seq/id/created_by (created_at là căn cứ "ngày vào kho"; created_by lấy từ auth.uid()).
revoke update, delete, truncate on public.stock_movements from anon, authenticated;
revoke insert on public.stock_movements from anon, authenticated;
grant insert (branch_id, item_id, kind, qty, mfg_date, expected_qty, batch_id, note, entered_on)
  on public.stock_movements to authenticated;
