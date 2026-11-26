-- Kiểm delete_placed_order (migration 20261126100000): xóa cả đơn đã đặt, chưa nhận món nào.
-- Chạy cả file; rollback ở cuối. Lỗi = assert sai. Dữ liệu giả hoàn toàn.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000b', 'staff@example.test'),
  ('00000000-0000-0000-0000-00000000000e', 'other@example.test');
insert into public.branches (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');
insert into public.members (branch_id, user_id, is_admin, is_locked) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b', false, false),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000e', true, false);
insert into public.item_groups (id, branch_id, name) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Nhóm A');
insert into public.items (id, branch_id, group_id, name, unit) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món A', 'Hộp'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món B', 'Hộp');
-- d1: đơn trùng chưa nhận (2 dòng); d2: đã nhận một dòng; d3: đơn nháp.
insert into public.purchase_orders (id, branch_id, group_id, created_by, placed_at) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000b', now()),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000b', now()),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000b', null);
insert into public.purchase_order_lines (id, order_id, branch_id, item_id, qty) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 4),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4', 2),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 1);
insert into public.purchase_receipts (branch_id, order_line_id, good_qty, short_qty, damaged_qty, created_by) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e3', 1, 0, 0, '00000000-0000-0000-0000-00000000000b');

set local role authenticated;

-- Thành viên Chi nhánh khác bị chặn.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);
do $$ begin
  begin
    perform public.delete_placed_order('00000000-0000-0000-0000-0000000000d1');
    assert false, 'Chi nhánh khác không được xóa';
  exception when insufficient_privilege then null; end;
end $$;

-- Nhân viên xóa được đơn chưa nhận; dòng đơn mất theo.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
select public.delete_placed_order('00000000-0000-0000-0000-0000000000d1');
do $$ begin
  assert not exists (select 1 from public.purchase_orders where id = '00000000-0000-0000-0000-0000000000d1'), 'đơn phải bị xóa';
  assert not exists (select 1 from public.purchase_order_lines where order_id = '00000000-0000-0000-0000-0000000000d1'), 'dòng đơn phải bị xóa theo';
  assert exists (select 1 from public.purchase_orders where id = '00000000-0000-0000-0000-0000000000d2'), 'đơn khác còn nguyên';
end $$;

-- Đơn đã có món nhận không xóa được.
do $$ begin
  begin
    perform public.delete_placed_order('00000000-0000-0000-0000-0000000000d2');
    assert false, 'đơn đã nhận không được xóa';
  exception when invalid_parameter_value then null; end;
end $$;

-- Đơn nháp không xóa bằng hàm này.
do $$ begin
  begin
    perform public.delete_placed_order('00000000-0000-0000-0000-0000000000d3');
    assert false, 'đơn nháp không đi đường này';
  exception when invalid_parameter_value then null; end;
end $$;

-- Xóa lần nữa báo lỗi rõ.
do $$ begin
  begin
    perform public.delete_placed_order('00000000-0000-0000-0000-0000000000d1');
    assert false, 'xóa hai lần phải báo lỗi';
  exception when no_data_found then null; end;
end $$;

reset role;
do $$ begin
  assert (select count(*) from public.audit_log
          where table_name = 'purchase_order_lines' and action = 'delete'
            and branch_id = '00000000-0000-0000-0000-0000000000a1') = 2, 'Nhật ký phải có đúng 2 dòng xóa';
end $$;

rollback;
