-- Kiểm RLS Chi nhánh/thành viên. Chạy cả file trong SQL editor (hoặc MCP execute_sql);
-- mọi thứ nằm trong transaction và rollback ở cuối. Lỗi = assert sai.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'locked@example.test');
insert into public.branches (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');
insert into public.branch_settings values
  ('00000000-0000-0000-0000-0000000000a1', 'Chi nhánh A'),
  ('00000000-0000-0000-0000-0000000000b1', 'Chi nhánh B');
insert into public.members (branch_id, user_id, is_locked) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', false),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', false),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000c', true);

set local role authenticated;

-- Thành viên A chỉ thấy Chi nhánh A.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
do $$ begin
  assert (select array_agg(branch_name) from public.branch_settings) = array['Chi nhánh A'],
    'A phải chỉ thấy Chi nhánh A';
  assert (select count(*) from public.members) = 2, 'A thấy 2 thành viên của A (kể cả người bị khóa)';
end $$;

-- Ghi từ client bị chặn (chưa có policy ghi).
do $$ begin
  update public.branch_settings set branch_name = 'x';
  assert not exists (select 1 from public.branch_settings where branch_name = 'x'), 'A không được sửa Cài đặt';
end $$;

-- Người dùng bị khóa không thấy gì.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);
do $$ begin
  assert (select count(*) from public.branch_settings) = 0, 'người dùng bị khóa không đọc được Cài đặt';
  assert (select count(*) from public.members) = 0, 'người dùng bị khóa không đọc được thành viên';
end $$;

-- Người lạ (không phải thành viên) không thấy gì.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff"}', true);
do $$ begin
  assert (select count(*) from public.branches) = 0, 'người lạ không đọc được Chi nhánh';
end $$;

-- Khách chưa đăng nhập.
set local role anon;
do $$ begin
  assert (select count(*) from public.branch_settings) = 0, 'anon không đọc được Cài đặt';
end $$;

rollback;
