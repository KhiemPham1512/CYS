-- Kiểm quản trị Người dùng: client không tự thêm/sửa thành viên; luôn còn một Quản trị.
-- Chạy cả file (SQL editor hoặc MCP execute_sql); rollback ở cuối. Lỗi = assert sai.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'staff@example.test'),
  ('00000000-0000-0000-0000-00000000000d', 'new@example.test');
insert into public.branches (id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.members (branch_id, user_id, is_admin) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', true),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b', false);

-- Quyền admin (service role trong Edge Function chạy như chủ bảng): bỏ Quản trị cuối cùng bị chặn.
do $$ begin
  begin
    update public.members set is_admin = false where user_id = '00000000-0000-0000-0000-00000000000a';
    assert false, 'không được bỏ Quản trị cuối cùng';
  exception when raise_exception then null;
  end;
  begin
    update public.members set is_locked = true where user_id = '00000000-0000-0000-0000-00000000000a';
    assert false, 'không được khóa Quản trị cuối cùng';
  exception when raise_exception then null;
  end;
end $$;

-- Có Quản trị thứ hai thì bỏ được Quản trị kia.
update public.members set is_admin = true where user_id = '00000000-0000-0000-0000-00000000000b';
update public.members set is_admin = false where user_id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select count(*) from public.members
          where is_admin and branch_id = '00000000-0000-0000-0000-0000000000a1') = 1,
    'còn đúng một Quản trị';
end $$;
update public.members set is_admin = true where user_id = '00000000-0000-0000-0000-00000000000a';
update public.members set is_admin = false where user_id = '00000000-0000-0000-0000-00000000000b';

-- Người không phải Quản trị (b) dùng client: không thêm được thành viên, không tự cấp quyền.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
do $$ begin
  begin
    insert into public.members (branch_id, user_id)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000d');
    assert false, 'người không phải Quản trị không tạo được Người dùng';
  exception when insufficient_privilege then null;
  end;
  update public.members set is_admin = true where user_id = '00000000-0000-0000-0000-00000000000b';
  update public.members set is_locked = true where user_id = '00000000-0000-0000-0000-00000000000a';
end $$;

-- Ngay cả Quản trị (a) cũng không ghi members trực tiếp từ client (chỉ qua Edge Function).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
do $$ begin
  begin
    insert into public.members (branch_id, user_id)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000d');
    assert false, 'client không thêm thành viên trực tiếp';
  exception when insufficient_privilege then null;
  end;
  assert (select is_admin from public.members where user_id = '00000000-0000-0000-0000-00000000000b') = false,
    'b không tự cấp được quyền Quản trị';
  assert (select not is_locked from public.members where user_id = '00000000-0000-0000-0000-00000000000a'),
    'b không khóa được a';
end $$;

rollback;
