-- Kiểm RLS sổ Biến động kho. Chạy cả file (SQL editor hoặc MCP execute_sql); rollback ở cuối. Lỗi = assert sai.
-- Sổ chỉ ghi thêm: không có policy update/delete (xóa không test ở đây vì không có policy nào mở).
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'locked@example.test');
insert into public.branches (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');
insert into public.members (branch_id, user_id, is_locked) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', false),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000c', true);
insert into public.item_groups (id, branch_id, name) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Nhóm A'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'Nhóm B');
insert into public.items (id, branch_id, group_id, name, unit) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món A', 'Hộp'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', 'Món B', 'Hộp');
insert into public.stock_movements (branch_id, item_id, kind, qty, created_by) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b3', 'count', 5, '00000000-0000-0000-0000-00000000000a');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);

-- A ghi Kiểm kho, Điều chỉnh, Thêm Ngày sản xuất cho món của Chi nhánh mình; người tạo tự điền.
insert into public.stock_movements (branch_id, item_id, kind, qty, expected_qty, batch_id)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'count', 10, 0, gen_random_uuid());
insert into public.stock_movements (branch_id, item_id, kind, qty, mfg_date)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'assign_mfg', 4, '2026-10-28');
do $$ begin
  assert (select count(*) from public.stock_movements) = 2, 'A chỉ thấy sổ của Chi nhánh A';
  assert (select bool_and(created_by = auth.uid()) from public.stock_movements), 'người tạo là chính A';
end $$;

-- Không giả danh người tạo; không ghi sang Chi nhánh khác; không ghi món của Chi nhánh khác.
do $$ begin
  begin
    insert into public.stock_movements (branch_id, item_id, kind, qty, created_by)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'adjust', 1, '00000000-0000-0000-0000-00000000000c');
    assert false, 'không được ghi thay người khác';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.stock_movements (branch_id, item_id, kind, qty)
      values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b3', 'adjust', 1);
    assert false, 'không được ghi vào Chi nhánh B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.stock_movements (branch_id, item_id, kind, qty)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b3', 'adjust', 1);
    assert false, 'món phải cùng Chi nhánh';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Chỉ ghi thêm: update không có tác dụng.
update public.stock_movements set qty = 999 where kind = 'count';
do $$ begin
  assert (select qty from public.stock_movements where kind = 'count') = 10, 'không sửa được dòng đã ghi';
end $$;

-- Người dùng bị khóa không đọc/ghi được.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);
do $$ begin
  assert (select count(*) from public.stock_movements) = 0, 'người dùng bị khóa không đọc được sổ';
  begin
    insert into public.stock_movements (branch_id, item_id, kind, qty)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'adjust', 1);
    assert false, 'người dùng bị khóa không được ghi';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
