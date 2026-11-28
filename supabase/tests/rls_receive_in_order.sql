-- Kiểm Nhận hàng theo thứ tự ngày (migration 20261128100000). Chạy cả file; rollback ở cuối. Lỗi = assert sai. Dữ liệu giả.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'staff@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'admin@example.test');
insert into public.branches (id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.members (branch_id, user_id, is_admin) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', false),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b', true);
insert into public.item_groups (id, branch_id, name) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Nhóm A'),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a1', 'Nhóm B');
insert into public.items (id, branch_id, group_id, name, unit) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món A', 'Hộp'),
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a5', 'Món B', 'Hộp');
-- Đơn hôm kia (Nhóm A), hôm qua (Nhóm B): khác Nhóm vẫn theo thứ tự ngày chung.
insert into public.purchase_orders (id, branch_id, group_id, created_by, placed_at) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-00000000000a', now() - interval '1 day');
insert into public.purchase_order_lines (id, order_id, branch_id, item_id, qty) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 2),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a6', 3);

-- Ngày của đơn: đặt sau Kiểm kho trong ngày thì là đơn ngày mai.
do $$ begin
  assert private.order_day('00000000-0000-0000-0000-0000000000a1', '2026-11-27 01:00:00+00') = '2026-11-27', 'chưa Kiểm kho: cùng ngày';
  insert into public.stock_movements (branch_id, item_id, kind, qty, created_by, created_at) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'count', 1,
     '00000000-0000-0000-0000-00000000000a', '2026-11-27 13:00:00+00');
  assert private.order_day('00000000-0000-0000-0000-0000000000a1', '2026-11-27 14:00:00+00') = '2026-11-28', 'đặt sau Kiểm kho: ngày mai';
  assert private.order_day('00000000-0000-0000-0000-0000000000a1', '2026-11-27 12:00:00+00') = '2026-11-27', 'đặt trước Kiểm kho: hôm nay';
  delete from public.stock_movements where created_at = '2026-11-27 13:00:00+00';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
do $$ begin
  -- Còn đơn hôm kia chưa nhận: đơn hôm qua (Nhóm khác) bị chặn.
  begin
    perform public.receive_order_line('00000000-0000-0000-0000-0000000000e2', 3, 0, null);
    assert false, 'đơn ngày sau phải chờ đơn ngày trước';
  exception when sqlstate '22023' then
    assert sqlerrm like 'Còn đơn ngày trước%', sqlerrm;
  end;
  -- Đơn hôm kia nhận được (đã có đơn ngày sau).
  perform public.receive_order_line('00000000-0000-0000-0000-0000000000e1', 2, 0, null);
  -- Đơn hôm qua là mới nhất, chưa có đơn ngày sau: Nhân viên bị chặn.
  begin
    perform public.receive_order_line('00000000-0000-0000-0000-0000000000e2', 3, 0, null);
    assert false, 'chưa có đơn ngày sau thì Nhân viên không nhận được';
  exception when sqlstate '22023' then
    assert sqlerrm like 'Chưa nhận được%', sqlerrm;
  end;
end $$;

-- Quản trị nhận được đơn mới nhất.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
do $$ begin
  perform public.receive_order_line('00000000-0000-0000-0000-0000000000e2', 3, 0, null);
  assert (select count(*) from public.purchase_receipts) = 2, 'Quản trị nhận đơn mới nhất';
end $$;

select 'ALL PASS' as result;
rollback;
