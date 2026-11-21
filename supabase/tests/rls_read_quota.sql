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
    assert public.take_read_quota('00000000-0000-0000-0000-0000000000a1', 1), 'lượt ' || i || ' phải được';
  end loop;
  assert not public.take_read_quota('00000000-0000-0000-0000-0000000000a1', 1), 'lượt 61 phải bị từ chối';
  assert not public.take_read_quota('00000000-0000-0000-0000-0000000000a1', 1), 'vẫn từ chối sau đó';
end $$;

-- Trừ theo số ảnh: A đã hết lượt nên 6 ảnh cũng bị từ chối; số ảnh sai bị chặn.
do $$ begin
  assert not public.take_read_quota('00000000-0000-0000-0000-0000000000a1', 6), '6 ảnh khi đã hết lượt bị từ chối';
  begin
    perform public.take_read_quota('00000000-0000-0000-0000-0000000000a1', 7);
    assert false, '7 ảnh phải bị chặn';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- Người dùng B cùng Chi nhánh có bộ đếm riêng.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
do $$ begin
  assert public.take_read_quota('00000000-0000-0000-0000-0000000000a1', 6), 'B có bộ đếm riêng, lấy 6 lượt một lần';
  assert (select n from public.read_usage where user_id = '00000000-0000-0000-0000-00000000000b') = 6, 'B bị trừ 6';
end $$;

-- Thành viên bị khóa và người ngoài Chi nhánh không dùng được (và không tạo dòng đếm).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);
do $$ begin
  begin
    perform public.take_read_quota('00000000-0000-0000-0000-0000000000a1', 1);
    assert false, 'thành viên bị khóa phải bị chặn';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);
do $$ begin
  begin
    perform public.take_read_quota('00000000-0000-0000-0000-0000000000a1', 1);
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
