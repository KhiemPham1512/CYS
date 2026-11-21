-- Kiểm giới hạn lượt đọc ảnh đơn (migration 20261121110000). Chạy cả file; rollback ở cuối. Lỗi = assert sai.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.test'),
  ('00000000-0000-0000-0000-00000000000e', 'e@example.test');
insert into public.branches (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');
insert into public.members (branch_id, user_id, is_locked) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', false),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b', false),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000c', true),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000e', false);

set local role authenticated;

-- Người dùng A: 60 lượt đầu được, lượt 61 bị từ chối.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
do $$
declare i int;
begin
  for i in 1..60 loop
    assert public.take_read_quota('00000000-0000-0000-0000-0000000000a1'), 'lượt ' || i || ' phải được';
  end loop;
  assert not public.take_read_quota('00000000-0000-0000-0000-0000000000a1'), 'lượt 61 phải bị từ chối';
  assert not public.take_read_quota('00000000-0000-0000-0000-0000000000a1'), 'vẫn từ chối sau đó';
end $$;

-- Người dùng B cùng Chi nhánh có bộ đếm riêng.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
do $$ begin
  assert public.take_read_quota('00000000-0000-0000-0000-0000000000a1'), 'B có bộ đếm riêng';
end $$;

-- Thành viên bị khóa và người ngoài Chi nhánh không dùng được (và không tạo dòng đếm).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);
do $$ begin
  begin
    perform public.take_read_quota('00000000-0000-0000-0000-0000000000a1');
    assert false, 'thành viên bị khóa phải bị chặn';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);
do $$ begin
  begin
    perform public.take_read_quota('00000000-0000-0000-0000-0000000000a1');
    assert false, 'người ngoài Chi nhánh phải bị chặn';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Bảng đếm không đọc/ghi trực tiếp từ client.
do $$ begin
  begin
    perform 1 from public.read_usage;
    assert false, 'client không được đọc read_usage';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
