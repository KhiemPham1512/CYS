-- Kiểm nhớ tên nhà cung cấp (migration 20261118170000). Chạy cả file; rollback ở cuối. Lỗi = assert sai.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000e', 'e@example.test');
insert into public.branches (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');
insert into public.members (branch_id, user_id, is_locked) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', false),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000e', false);
insert into public.item_groups (id, branch_id, name) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Nhóm A'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'Nhóm B');
insert into public.items (id, branch_id, group_id, name, unit) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món A1', 'Hộp'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món A2', 'Hộp'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', 'Món B', 'Hộp');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);

insert into public.supplier_aliases (branch_id, alias_key, item_id)
  values ('00000000-0000-0000-0000-0000000000a1', 'sua tuoi', '00000000-0000-0000-0000-0000000000a3');

do $$ begin
  assert (select count(*) from public.supplier_aliases) = 1, 'nhớ được tên lạ';

  -- Cùng khóa trong Chi nhánh chỉ một món; sửa lại sang món khác được.
  begin
    insert into public.supplier_aliases (branch_id, alias_key, item_id)
      values ('00000000-0000-0000-0000-0000000000a1', 'sua tuoi', '00000000-0000-0000-0000-0000000000a4');
    assert false, 'khóa trùng phải bị chặn';
  exception when unique_violation then null;
  end;
  update public.supplier_aliases set item_id = '00000000-0000-0000-0000-0000000000a4' where alias_key = 'sua tuoi';
  assert (select item_id from public.supplier_aliases where alias_key = 'sua tuoi') = '00000000-0000-0000-0000-0000000000a4', 'sửa món đã nhớ';

  -- Không nhớ sang món của Chi nhánh khác (khóa ngoại cùng Chi nhánh).
  begin
    insert into public.supplier_aliases (branch_id, alias_key, item_id)
      values ('00000000-0000-0000-0000-0000000000a1', 'khac', '00000000-0000-0000-0000-0000000000b3');
    assert false, 'không trỏ sang món Chi nhánh khác';
  exception when foreign_key_violation then null;
  end;

  -- Không xóa trực tiếp.
  begin
    delete from public.supplier_aliases;
    assert false, 'không xóa';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Chi nhánh khác không thấy, không thêm vào Chi nhánh A.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);
do $$ begin
  assert (select count(*) from public.supplier_aliases) = 0, 'Chi nhánh B không thấy';
  begin
    insert into public.supplier_aliases (branch_id, alias_key, item_id)
      values ('00000000-0000-0000-0000-0000000000a1', 'x', '00000000-0000-0000-0000-0000000000a3');
    assert false, 'Chi nhánh B không thêm vào A';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Thành viên bị khóa (cùng Chi nhánh A) không thấy, không thêm, không sửa.
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000f', 'f@example.test');
insert into public.members (branch_id, user_id, is_locked)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000f', true);
insert into public.supplier_aliases (branch_id, alias_key, item_id)
  values ('00000000-0000-0000-0000-0000000000a1', 'co san', '00000000-0000-0000-0000-0000000000a3');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000f"}', true);
do $$
declare n int;
begin
  assert (select count(*) from public.supplier_aliases) = 0, 'thành viên bị khóa không thấy';
  begin
    insert into public.supplier_aliases (branch_id, alias_key, item_id)
      values ('00000000-0000-0000-0000-0000000000a1', 'moi', '00000000-0000-0000-0000-0000000000a3');
    assert false, 'thành viên bị khóa không thêm';
  exception when insufficient_privilege then null;
  end;
  update public.supplier_aliases set item_id = '00000000-0000-0000-0000-0000000000a4' where alias_key = 'co san';
  get diagnostics n = row_count;
  assert n = 0, 'thành viên bị khóa không sửa';
end $$;

rollback;
