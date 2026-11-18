-- Kiểm Trả hàng hư (migration 20261118140000). Chạy cả file; rollback ở cuối. Lỗi = assert sai.
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
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món A', 'Hộp');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);

do $$ begin
  -- Số không hợp lệ; chọn sai Lô (cả hai hoặc không có).
  begin
    perform public.return_damaged('00000000-0000-0000-0000-0000000000a3', 0, '2026-11-10', null);
    assert false, 'số 0 phải bị chặn';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.return_damaged('00000000-0000-0000-0000-0000000000a3', 1, null, null);
    assert false, 'thiếu Lô phải bị chặn';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.return_damaged('00000000-0000-0000-0000-0000000000a3', 1, '2026-11-10', '2026-11-10');
    assert false, 'hai Lô cùng lúc phải bị chặn';
  exception when sqlstate '22023' then null;
  end;

  -- Lô có Ngày sản xuất và Lô chưa có ngày đều trả được.
  perform public.return_damaged('00000000-0000-0000-0000-0000000000a3', 2, '2026-11-10', null);
  perform public.return_damaged('00000000-0000-0000-0000-0000000000a3', 1, null, '2026-11-12');
  assert (select count(*) from public.stock_movements where kind = 'return_damaged') = 2, 'hai dòng sổ';
  assert (select sum(qty) from public.supplier_owed where kind = 'damaged') = 3, 'Chờ nhà cung cấp loại hư = 3';

  -- Client không ghi thẳng return_damaged vào sổ.
  begin
    insert into public.stock_movements (branch_id, item_id, kind, qty, mfg_date)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'return_damaged', 1, '2026-11-10');
    assert false, 'không insert thẳng return_damaged';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Người Chi nhánh khác không trả hàng được.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);
do $$ begin
  begin
    perform public.return_damaged('00000000-0000-0000-0000-0000000000a3', 1, '2026-11-10', null);
    assert false, 'Chi nhánh B không trả được';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
