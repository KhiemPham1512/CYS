-- Kiểm delete_order_line (migration 20261124200000): xóa một món khỏi đơn đã đặt, chưa nhận.
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
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món B', 'Hộp'),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món C', 'Hộp');
-- Một đơn đã đặt (ba dòng, dòng c đã nhận) và một đơn nháp (một dòng).
insert into public.purchase_orders (id, branch_id, group_id, placed_at) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', now());
insert into public.purchase_order_lines (id, order_id, branch_id, item_id, qty) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 4),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4', 2),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a5', 1);
insert into public.purchase_receipts (branch_id, order_line_id, good_qty, short_qty, damaged_qty, created_by) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e3', 1, 0, 0, '00000000-0000-0000-0000-00000000000b');

set local role authenticated;

-- Thành viên Chi nhánh khác bị chặn.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);
do $$ begin
  begin
    perform public.delete_order_line('00000000-0000-0000-0000-0000000000e1');
    assert false, 'Chi nhánh khác không được xóa';
  exception when insufficient_privilege then null; end;
end $$;

-- Nhân viên (không Quản trị) xóa được dòng chưa nhận, có ghi Nhật ký.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
select public.delete_order_line('00000000-0000-0000-0000-0000000000e1');
do $$ begin
  assert not exists (select 1 from public.purchase_order_lines where id = '00000000-0000-0000-0000-0000000000e1'), 'dòng phải bị xóa';
  assert (select count(*) from public.purchase_order_lines where order_id = '00000000-0000-0000-0000-0000000000d1') = 2, 'các dòng khác còn nguyên';
end $$;

-- Dòng đã nhận không xóa được.
do $$ begin
  begin
    perform public.delete_order_line('00000000-0000-0000-0000-0000000000e3');
    assert false, 'dòng đã nhận không được xóa';
  exception when invalid_parameter_value then null; end;
end $$;

-- Dòng không tồn tại báo lỗi rõ.
do $$ begin
  begin
    perform public.delete_order_line(gen_random_uuid());
    assert false, 'dòng không có phải báo lỗi';
  exception when no_data_found then null; end;
end $$;

-- Xóa trực tiếp bảng vẫn bị chặn với đơn đã đặt (chỉ qua hàm).
do $$ declare n int; begin
  delete from public.purchase_order_lines where id = '00000000-0000-0000-0000-0000000000e2';
  get diagnostics n = row_count;
  assert n = 0, 'xóa trực tiếp đơn đã đặt vẫn phải bị chặn';
end $$;

reset role;
do $$ begin
  assert (select count(*) from public.audit_log
          where table_name = 'purchase_order_lines' and action = 'delete'
            and item_id = '00000000-0000-0000-0000-0000000000a3'
            and (old_data ->> 'qty')::numeric = 4) = 1, 'Nhật ký phải có đúng một dòng xóa';
end $$;

rollback;
