-- Kiểm Nhận hàng (migration 20261118110000). Chạy cả file; rollback ở cuối. Lỗi = assert sai.
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
insert into public.items (id, branch_id, group_id, name, unit, track_mfg_date) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món theo dõi', 'Hộp', true),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món thường', 'Hộp', false);
-- Đơn đã đặt + hai dòng (dựng bằng quyền chủ DB).
insert into public.purchase_orders (id, branch_id, group_id, created_by, placed_at) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', now());
insert into public.purchase_order_lines (id, order_id, branch_id, item_id, qty) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 10),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4', 5);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);

do $$ begin
  -- Món theo dõi thiếu ngày; số không hợp lệ; chưa đặt đơn.
  begin
    perform public.receive_order_line('00000000-0000-0000-0000-0000000000e1', 10, 0, null);
    assert false, 'thiếu Ngày sản xuất phải bị chặn';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.receive_order_line('00000000-0000-0000-0000-0000000000e1', 11, 0, '2026-11-10');
    assert false, 'nhận quá số đặt phải bị chặn';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.receive_order_line('00000000-0000-0000-0000-0000000000e1', 5, 6, '2026-11-10');
    assert false, 'hư quá số nhận phải bị chặn';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.receive_order_line('00000000-0000-0000-0000-0000000000e1', 10, 0, '2999-01-01');
    assert false, 'Ngày sản xuất tương lai phải bị chặn';
  exception when sqlstate '22023' then null;
  end;

  -- Nhận 7/10, hư 2: vào kho 5, Thiếu 3, Hư 2.
  perform public.receive_order_line('00000000-0000-0000-0000-0000000000e1', 7, 2, '2026-11-10');
  assert (select qty from public.stock_movements where kind = 'receive' and order_line_id = '00000000-0000-0000-0000-0000000000e1') = 5, 'vào kho phần tốt';
  assert (select mfg_date from public.stock_movements where kind = 'receive') = '2026-11-10', 'đúng Ngày sản xuất';
  assert (select qty from public.supplier_owed where kind = 'short') = 3, 'Thiếu 3';
  assert (select qty from public.supplier_owed where kind = 'damaged') = 2, 'Hư 2';

  -- Mỗi dòng nhận một lần.
  begin
    perform public.receive_order_line('00000000-0000-0000-0000-0000000000e1', 10, 0, '2026-11-10');
    assert false, 'nhận lần hai phải bị chặn';
  exception when unique_violation then null;
  end;

  -- Món thường nhận không cần ngày.
  perform public.receive_order_line('00000000-0000-0000-0000-0000000000e2', 5, 0, null);
  assert (select count(*) from public.stock_movements where kind = 'receive') = 2, 'nhận món thường';

  -- Nhận bù: quá số chờ bị chặn; một phần được; thiếu ngày (món theo dõi) bị chặn.
  begin
    perform public.settle_owed('00000000-0000-0000-0000-0000000000a3', 6, '2026-11-12');
    assert false, 'nhận bù quá số chờ phải bị chặn';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.settle_owed('00000000-0000-0000-0000-0000000000a3', 2, null);
    assert false, 'nhận bù thiếu ngày phải bị chặn';
  exception when sqlstate '22023' then null;
  end;
  perform public.settle_owed('00000000-0000-0000-0000-0000000000a3', 2, '2026-11-12');
  assert (select sum(case when kind = 'settled' then -qty else qty end) from public.supplier_owed) = 3, 'còn chờ 3 (5 - 2)';
  assert (select qty from public.stock_movements where mfg_date = '2026-11-12') = 2, 'phần bù vào kho';
end $$;

-- Client không ghi thẳng vào receipts/owed.
do $$ begin
  begin
    insert into public.supplier_owed (branch_id, item_id, kind, qty)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'settled', 1);
    assert false, 'không insert trực tiếp';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Người Chi nhánh khác không nhận được, không thấy.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);
do $$ begin
  assert (select count(*) from public.supplier_owed) = 0, 'Chi nhánh B không thấy';
  begin
    perform public.settle_owed('00000000-0000-0000-0000-0000000000a3', 1, '2026-11-12');
    assert false, 'Chi nhánh B không nhận bù được';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
