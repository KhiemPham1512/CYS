-- Kiểm RLS Đơn đặt hàng (migration 20261118100000). Chạy cả file; rollback ở cuối. Lỗi = assert sai.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000e', 'e@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'locked@example.test');
insert into public.branches (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');
insert into public.members (branch_id, user_id, is_locked) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', false),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000c', true),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000e', false);
insert into public.item_groups (id, branch_id, name) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Nhóm A'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'Nhóm B');
insert into public.items (id, branch_id, group_id, name, unit) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món A', 'Hộp'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', 'Món B', 'Hộp');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);

-- Lập đơn nháp + dòng.
insert into public.purchase_orders (branch_id, group_id)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2');
insert into public.purchase_order_lines (order_id, branch_id, item_id, qty)
  select id, branch_id, '00000000-0000-0000-0000-0000000000a3', 5 from public.purchase_orders;

do $$ begin
  assert (select created_by from public.purchase_orders) = auth.uid(), 'người tạo là chính A';
  begin
    insert into public.purchase_orders (branch_id, group_id)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2');
    assert false, 'mỗi Nhóm chỉ một đơn nháp';
  exception when unique_violation then null;
  end;
  begin
    insert into public.purchase_order_lines (order_id, branch_id, item_id, qty)
      select id, branch_id, '00000000-0000-0000-0000-0000000000a3', 1 from public.purchase_orders;
    assert false, 'một món một dòng trong đơn';
  exception when unique_violation then null;
  end;
  begin
    insert into public.purchase_orders (branch_id, group_id)
      values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2');
    assert false, 'không lập đơn ở Chi nhánh khác';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Sửa dòng nháp được; đặt đơn (giờ máy chủ); sau đó khóa.
update public.purchase_order_lines set qty = 6;
do $$ begin assert (select qty from public.purchase_order_lines) = 6, 'sửa dòng nháp'; end $$;

update public.purchase_orders set placed_at = '2000-01-01';
do $$ begin
  assert (select placed_at from public.purchase_orders) > now() - interval '1 minute', 'placed_at do máy chủ đặt';
end $$;

update public.purchase_order_lines set qty = 99;
delete from public.purchase_order_lines;
delete from public.purchase_orders;
do $$ begin
  assert (select qty from public.purchase_order_lines) = 6, 'đơn đã đặt: không sửa/xóa dòng';
  assert (select count(*) from public.purchase_orders) = 1, 'đơn đã đặt: không xóa';
  begin
    insert into public.purchase_order_lines (order_id, branch_id, item_id, qty)
      select id, branch_id, '00000000-0000-0000-0000-0000000000a3', 2 from public.purchase_orders;
    assert false, 'đơn đã đặt: không thêm dòng';
  exception when insufficient_privilege or unique_violation then null;
  end;
end $$;

-- Chi nhánh khác và người bị khóa không thấy.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);
do $$ begin assert (select count(*) from public.purchase_orders) = 0, 'Chi nhánh B không thấy đơn của A'; end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', true);
do $$ begin assert (select count(*) from public.purchase_orders) = 0, 'người bị khóa không thấy'; end $$;

rollback;
