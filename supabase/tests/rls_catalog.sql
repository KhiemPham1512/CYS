-- Kiểm RLS Danh mục. Chạy cả file (SQL editor hoặc MCP execute_sql); rollback ở cuối. Lỗi = assert sai.
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
insert into public.items (branch_id, group_id, name, unit) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', 'Món B', 'Hộp');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);

-- A thêm/sửa/ẩn món trong Chi nhánh của mình.
insert into public.items (branch_id, group_id, name, unit)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món A', 'Bao');
update public.items set is_hidden = true, case_size = 12 where name = 'Món A';
do $$ begin
  assert (select count(*) from public.items) = 1, 'A chỉ thấy món của Chi nhánh A';
  assert (select is_hidden and case_size = 12 from public.items where name = 'Món A'), 'A sửa/ẩn được món';
  assert (select count(*) from public.item_groups) = 1, 'A chỉ thấy Nhóm của Chi nhánh A';
end $$;

-- Không xóa được (chỉ ẩn).
delete from public.items where name = 'Món A';
do $$ begin
  assert (select count(*) from public.items where name = 'Món A') = 1, 'không có quyền xóa món';
end $$;

-- Không ghi vào Chi nhánh khác.
do $$ begin
  begin
    insert into public.items (branch_id, group_id, name, unit)
      values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', 'Lén', 'Hộp');
    assert false, 'A không được thêm món vào Chi nhánh B';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.items set branch_id = '00000000-0000-0000-0000-0000000000b1',
      group_id = '00000000-0000-0000-0000-0000000000b2' where name = 'Món A';
    assert false, 'A không được chuyển món sang Chi nhánh B';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Người dùng bị khóa không thêm được.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);
do $$ begin
  assert (select count(*) from public.items) = 0, 'người dùng bị khóa không đọc được Danh mục';
  begin
    insert into public.items (branch_id, group_id, name, unit)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Khóa', 'Hộp');
    assert false, 'người dùng bị khóa không được thêm món';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
