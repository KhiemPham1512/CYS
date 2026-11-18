-- Kiểm Ghi dùng / hủy (migration 20261118090000). Chạy cả file; rollback ở cuối. Lỗi = assert sai.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.test'),
  ('00000000-0000-0000-0000-00000000000e', 'e@example.test');
insert into public.branches (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');
insert into public.members (branch_id, user_id, is_locked) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', false),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000d', false),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000e', false);
insert into public.item_groups (id, branch_id, name) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Nhóm A'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'Nhóm B');
insert into public.items (id, branch_id, group_id, name, unit) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món A', 'Hộp'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', 'Món B', 'Hộp');
-- Ghi dùng của "hôm qua" (dựng bằng quyền chủ DB vì client không tự đặt created_at).
insert into public.stock_movements (id, branch_id, item_id, kind, qty, created_by, created_at) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'use', 1, '00000000-0000-0000-0000-00000000000a', now() - interval '2 days');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);

insert into public.stock_movements (branch_id, item_id, kind, qty)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'use', 2);

do $$ begin
  begin
    insert into public.stock_movements (branch_id, item_id, kind, qty)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'use', 0);
    assert false, 'Ghi dùng phải > 0';
  exception when check_violation then null;
  end;
  begin
    insert into public.stock_movements (branch_id, item_id, kind, qty)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'void', 0);
    assert false, 'void phải có voids_id';
  exception when insufficient_privilege then null; -- RLS chặn trước check
  end;
  begin
    insert into public.stock_movements (branch_id, item_id, kind, qty, voids_id)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'void', 0, '00000000-0000-0000-0000-0000000000c1');
    assert false, 'không hủy được Ghi dùng của ngày trước';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Hủy Ghi dùng hôm nay được (cả của người khác trong Chi nhánh); chỉ hủy một lần.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);
insert into public.stock_movements (branch_id, item_id, kind, qty, voids_id)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'void', 0, (select id from public.stock_movements where kind = 'use' and qty = 2));
do $$ begin
  assert (select created_by from public.stock_movements where voids_id is not null) = '00000000-0000-0000-0000-00000000000d', 'ghi người hủy';
  begin
    insert into public.stock_movements (branch_id, item_id, kind, qty, voids_id)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'void', 0, (select id from public.stock_movements where kind = 'use' and qty = 2));
    assert false, 'mỗi Ghi dùng chỉ hủy một lần';
  exception when unique_violation then null;
  end;
end $$;

-- Danh sách email chỉ cho thành viên cùng Chi nhánh.
do $$ begin
  assert (select count(*) from public.branch_member_emails('00000000-0000-0000-0000-0000000000a1')) = 2, 'thấy 2 thành viên';
  assert (select count(*) from public.branch_member_emails('00000000-0000-0000-0000-0000000000b1')) = 0, 'không thấy Chi nhánh khác';
end $$;

rollback;
