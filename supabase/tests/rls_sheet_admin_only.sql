-- Kiểm: chỉ Quản trị sửa được cột sheet (migration 20261120110000). Chạy cả file; rollback ở cuối. Lỗi = assert sai.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.test');
insert into public.branches (id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.members (branch_id, user_id, is_admin, is_locked) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', true, false),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000d', false, false);
insert into public.item_groups (id, branch_id, name) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Nhóm A');
insert into public.items (id, branch_id, group_id, name, unit) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món A', 'Hộp');

set local role authenticated;

-- Quản trị sửa được.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
update public.items set sheet = '{"zh":"中"}' where id = '00000000-0000-0000-0000-0000000000a3';
update public.item_groups set sheet = '{"label":"X"}' where id = '00000000-0000-0000-0000-0000000000a2';

-- Thành viên thường: không đổi được sheet, vẫn đổi được cột khác.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d"}', true);
update public.items set unit = 'Gói' where id = '00000000-0000-0000-0000-0000000000a3';
do $$ begin
  begin
    update public.items set sheet = '{"zh":"乙"}' where id = '00000000-0000-0000-0000-0000000000a3';
    assert false, 'người thường không sửa được sheet của món';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.item_groups set sheet = '{"label":"Y"}' where id = '00000000-0000-0000-0000-0000000000a2';
    assert false, 'người thường không sửa được sheet của Nhóm';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.items (branch_id, group_id, name, unit, sheet)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món B', 'Hộp', '{"zh":"丙"}');
    assert false, 'người thường không thêm món kèm sheet';
  exception when insufficient_privilege then null;
  end;
  assert (select sheet ->> 'zh' from public.items where id = '00000000-0000-0000-0000-0000000000a3') = '中', 'sheet giữ nguyên';
  assert (select unit from public.items where id = '00000000-0000-0000-0000-0000000000a3') = 'Gói', 'cột khác vẫn sửa được';
end $$;

rollback;
