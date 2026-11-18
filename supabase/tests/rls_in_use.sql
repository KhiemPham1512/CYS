-- Kiểm Đang dùng (migration 20261118150000). Chạy cả file; rollback ở cuối. Lỗi = assert sai.
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
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Nhóm A');
insert into public.items (id, branch_id, group_id, name, unit) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món A', 'Chai');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);

insert into public.in_use (branch_id, item_id)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3'),
         ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3');

do $$ begin
  assert (select count(*) from public.in_use where ended_at is null) = 2, 'khui 2 chai trước được';
  assert (select opened_on from public.in_use limit 1) = (now() at time zone 'Asia/Ho_Chi_Minh')::date, 'ngày khui do máy chủ đặt';

  -- Không tự đặt ngày khui.
  begin
    insert into public.in_use (branch_id, item_id, opened_on)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', '2020-01-01');
    assert false, 'không đặt opened_on';
  exception when insufficient_privilege then null;
  end;

  -- "Hết" một dòng; không bỏ "Hết", không xóa.
  update public.in_use set ended_at = now()
    where id = (select id from public.in_use order by created_at limit 1);
  assert (select count(*) from public.in_use where ended_at is null) = 1, 'còn 1 chai đang dùng';
  begin
    update public.in_use set ended_at = null where ended_at is not null;
    assert (select count(*) from public.in_use where ended_at is null) = 1, 'không mở lại dòng đã hết';
  end;
  begin
    delete from public.in_use;
    assert false, 'không xóa';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Chi nhánh khác không thấy, không khui, không Hết.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);
do $$ begin
  assert (select count(*) from public.in_use) = 0, 'Chi nhánh B không thấy';
  begin
    insert into public.in_use (branch_id, item_id)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3');
    assert false, 'Chi nhánh B không khui được';
  exception when insufficient_privilege then null;
  end;
  update public.in_use set ended_at = now();
  assert (select count(*) from public.in_use) = 0, 'Chi nhánh B không Hết được';
end $$;

rollback;
