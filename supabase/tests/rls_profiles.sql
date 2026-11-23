-- Kiểm bảng profiles (migration 20261123200000). Chạy cả file; rollback ở cuối. Dữ liệu giả.
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test'),
  ('00000000-0000-0000-0000-00000000000e', 'e@example.test');
insert into public.branches (id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b1');
insert into public.members (branch_id, user_id, is_admin, is_locked) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', true, false),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b', false, false),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000e', true, false);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
do $$ begin
  insert into public.profiles (user_id, display_name) values ('00000000-0000-0000-0000-00000000000a', 'Cô A');
  -- Không ghi hộ người khác.
  begin
    insert into public.profiles (user_id, display_name) values ('00000000-0000-0000-0000-00000000000b', 'Giả mạo');
    assert false, 'không được ghi hồ sơ người khác';
  exception when insufficient_privilege then null; end;
  -- Ảnh sai định dạng hoặc tên quá dài bị chặn.
  begin
    update public.profiles set avatar = 'http://x' where user_id = '00000000-0000-0000-0000-00000000000a';
    assert false, 'ảnh phải là data URL jpeg';
  exception when check_violation then null; end;
  begin
    update public.profiles set display_name = repeat('x', 41) where user_id = '00000000-0000-0000-0000-00000000000a';
    assert false, 'tên tối đa 40 ký tự';
  exception when check_violation then null; end;
  update public.profiles set avatar = 'data:image/jpeg;base64,AAAA', display_name = 'Cô A2' where user_id = '00000000-0000-0000-0000-00000000000a';
end $$;

-- Người cùng Chi nhánh (b) đọc được; người Chi nhánh khác (e) không; b không sửa được của a.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
do $$ begin
  assert (select count(*) from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a') = 1, 'cùng Chi nhánh đọc được';
  update public.profiles set display_name = 'Bị sửa' where user_id = '00000000-0000-0000-0000-00000000000a';
  assert (select display_name from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a') = 'Cô A2', 'không sửa được hồ sơ người khác';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);
do $$ begin
  assert (select count(*) from public.profiles) = 0, 'Chi nhánh khác không đọc được';
end $$;
rollback;
