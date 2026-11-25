-- Kiểm undo_receipts (migration 20261125100000): gỡ Nhận hàng, chỉ Quản trị.
-- Chạy cả file; rollback ở cuối. Lỗi = assert sai. Dữ liệu giả hoàn toàn.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'staff@example.test'),
  ('00000000-0000-0000-0000-00000000000e', 'other@example.test');
insert into public.branches (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');
insert into public.members (branch_id, user_id, is_admin, is_locked) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', true, false),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b', false, false),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000e', true, false);
insert into public.item_groups (id, branch_id, name) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Nhóm A');
insert into public.items (id, branch_id, group_id, name, unit) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món A', 'Hộp'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món B', 'Hộp'),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món C', 'Hộp'),
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món D', 'Hộp');
insert into public.purchase_orders (id, branch_id, group_id, created_by, placed_at) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000b', now());
insert into public.purchase_order_lines (id, order_id, branch_id, item_id, qty) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 4),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4', 2),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a5', 1),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a6', 1);
-- Dòng e1 nhận đủ (4); e2 nhận thiếu 1 (có Hàng thiếu); e3 nhận cách đây 5 ngày; e4 nhận 1 giờ trước rồi có Kiểm kho sau đó.
insert into public.purchase_receipts (id, branch_id, order_line_id, good_qty, short_qty, damaged_qty, created_by) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 4, 0, 0, '00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e2', 1, 1, 0, '00000000-0000-0000-0000-00000000000b');
insert into public.purchase_receipts (id, branch_id, order_line_id, good_qty, short_qty, damaged_qty, created_by, created_at) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e3', 1, 0, 0, '00000000-0000-0000-0000-00000000000b', now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e4', 1, 0, 0, '00000000-0000-0000-0000-00000000000b', now() - interval '1 hour');
insert into public.stock_movements (branch_id, item_id, kind, qty, order_line_id, created_by) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'receive', 4, '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4', 'receive', 1, '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000000b');
insert into public.stock_movements (branch_id, item_id, kind, qty, order_line_id, created_by, created_at) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a5', 'receive', 1, '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-00000000000b', now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a6', 'receive', 1, '00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-00000000000b', now() - interval '1 hour');
insert into public.stock_movements (branch_id, item_id, kind, qty, created_by, created_at) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a6', 'count', 7, '00000000-0000-0000-0000-00000000000b', now() - interval '10 minutes');

set local role authenticated;

-- Nhân viên (không Quản trị) bị chặn.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
do $$ begin
  begin
    perform public.undo_receipts(array['00000000-0000-0000-0000-0000000000f1']::uuid[]);
    assert false, 'nhân viên không được gỡ nhận';
  exception when insufficient_privilege then null; end;
end $$;

-- Quản trị Chi nhánh khác bị chặn.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);
do $$ begin
  begin
    perform public.undo_receipts(array['00000000-0000-0000-0000-0000000000f1']::uuid[]);
    assert false, 'Chi nhánh khác không được gỡ nhận';
  exception when insufficient_privilege then null; end;
end $$;

-- Quản trị Chi nhánh A: lần nhận có hàng thiếu không gỡ được (và không đổi gì).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
do $$ begin
  begin
    perform public.undo_receipts(array['00000000-0000-0000-0000-0000000000f2']::uuid[]);
    assert false, 'lần nhận có Hàng thiếu không được gỡ';
  exception when invalid_parameter_value then null; end;
end $$;

-- Gỡ lần nhận đủ: dòng sổ và bản ghi nhận biến mất, dòng đơn còn nguyên.
select public.undo_receipts(array['00000000-0000-0000-0000-0000000000f1']::uuid[]);
do $$ begin
  assert not exists (select 1 from public.purchase_receipts where id = '00000000-0000-0000-0000-0000000000f1'), 'bản ghi nhận phải mất';
  assert not exists (select 1 from public.stock_movements where order_line_id = '00000000-0000-0000-0000-0000000000e1'), 'dòng sổ nhận phải mất';
  assert exists (select 1 from public.purchase_order_lines where id = '00000000-0000-0000-0000-0000000000e1'), 'dòng đơn phải còn';
  assert exists (select 1 from public.purchase_receipts where id = '00000000-0000-0000-0000-0000000000f2'), 'lần nhận khác không bị đụng';
  assert exists (select 1 from public.stock_movements where order_line_id = '00000000-0000-0000-0000-0000000000e2'), 'sổ của lần nhận khác còn';
end $$;

-- Gỡ lần nữa báo lỗi rõ.
do $$ begin
  begin
    perform public.undo_receipts(array['00000000-0000-0000-0000-0000000000f1']::uuid[]);
    assert false, 'gỡ hai lần phải báo lỗi';
  exception when no_data_found then null; end;
end $$;

-- Lần nhận quá 3 ngày không gỡ được.
do $$ begin
  begin
    perform public.undo_receipts(array['00000000-0000-0000-0000-0000000000f3']::uuid[]);
    assert false, 'lần nhận quá 3 ngày không được gỡ';
  exception when invalid_parameter_value then null; end;
end $$;

-- Đã Kiểm kho món đó sau lần nhận thì không gỡ được (và không đổi gì).
do $$ begin
  begin
    perform public.undo_receipts(array['00000000-0000-0000-0000-0000000000f4']::uuid[]);
    assert false, 'đã Kiểm kho sau lần nhận thì không được gỡ';
  exception when invalid_parameter_value then null; end;
  assert exists (select 1 from public.purchase_receipts where id = '00000000-0000-0000-0000-0000000000f4'), 'lần nhận bị chặn phải còn nguyên';
  assert exists (select 1 from public.stock_movements where order_line_id = '00000000-0000-0000-0000-0000000000e4'), 'sổ của lần nhận bị chặn phải còn';
end $$;

reset role;
do $$ begin
  assert (select count(*) from public.audit_log
          where table_name = 'purchase_receipts' and action = 'delete'
            and item_id = '00000000-0000-0000-0000-0000000000a3'
            and (old_data ->> 'good_qty')::numeric = 4) = 1, 'Nhật ký phải có đúng một dòng gỡ nhận';
end $$;

rollback;
