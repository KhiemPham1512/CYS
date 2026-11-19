-- Kiểm Nhật ký thay đổi (migration 20261118160000). Chạy cả file; rollback ở cuối. Lỗi = assert sai.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.test'),
  ('00000000-0000-0000-0000-00000000000e', 'e@example.test');
insert into public.branches (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');
insert into public.members (branch_id, user_id, is_admin, is_locked) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', true, false),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000d', false, false),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000e', true, false);
insert into public.item_groups (id, branch_id, name) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Nhóm A');
insert into public.items (id, branch_id, group_id, name, unit) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món A', 'Hộp');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);

-- Quản trị A sửa món và ghi một Ghi dùng.
update public.items set unit = 'Gói', case_size = 12 where id = '00000000-0000-0000-0000-0000000000a3';
update public.items set name = name where id = '00000000-0000-0000-0000-0000000000a3'; -- không đổi gì: không ghi
insert into public.stock_movements (branch_id, item_id, kind, qty)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'use', 2);

do $$
declare r record;
begin
  -- Client không đọc thẳng bảng audit_log.
  begin
    perform 1 from public.audit_log;
    assert false, 'không đọc thẳng audit_log';
  exception when insufficient_privilege then null;
  end;

  select * into r from public.audit_feed('00000000-0000-0000-0000-0000000000a1')
    where table_name = 'items';
  assert r.actor = '00000000-0000-0000-0000-00000000000a', 'ghi đúng người sửa';
  assert r.actor_email = 'a@example.test', 'có email';
  assert r.item_name = 'Món A', 'có tên món';
  assert r.old_data ->> 'unit' = 'Hộp' and r.new_data ->> 'unit' = 'Gói', 'cũ → mới';
  assert (select count(*) from public.audit_feed('00000000-0000-0000-0000-0000000000a1') where table_name = 'items') = 1, 'sửa không đổi gì thì không ghi';
  assert (select count(*) from public.audit_feed('00000000-0000-0000-0000-0000000000a1') where table_name = 'stock_movements' and action = 'use') = 1, 'gộp biến động kho';

  -- Lọc theo món, người, ngày.
  assert (select count(*) from public.audit_feed('00000000-0000-0000-0000-0000000000a1', null, null, null, '00000000-0000-0000-0000-0000000000a3')) = 2, 'lọc theo món';
  assert (select count(*) from public.audit_feed('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000d')) = 0, 'lọc theo người khác';
  assert (select count(*) from public.audit_feed('00000000-0000-0000-0000-0000000000a1', null, current_date + 2, null)) = 0, 'lọc từ ngày tương lai';
end $$;

-- Thành viên thường (không phải Quản trị) không xem được.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);
do $$ begin
  begin
    perform * from public.audit_feed('00000000-0000-0000-0000-0000000000a1');
    assert false, 'người thường không xem được Nhật ký';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Quản trị Chi nhánh khác không xem được Chi nhánh A.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);
do $$ begin
  begin
    perform * from public.audit_feed('00000000-0000-0000-0000-0000000000a1');
    assert false, 'Quản trị Chi nhánh B không xem được Chi nhánh A';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
