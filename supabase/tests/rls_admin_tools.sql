-- Kiểm công cụ Quản trị (migration 20261123100000): quay lại sổ kho, khôi phục, xóa dữ liệu phát sinh.
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
insert into public.branch_settings (branch_id, branch_name) values ('00000000-0000-0000-0000-0000000000a1', 'Chi nhánh thử')
  on conflict (branch_id) do update set branch_name = excluded.branch_name;
insert into public.item_groups (id, branch_id, name) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Nhóm A'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', 'Nhóm B');
insert into public.items (id, branch_id, group_id, name, unit) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'Món A', 'Hộp'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', 'Món B', 'Hộp');

-- Sổ gốc (quyền dịch vụ): một Kiểm kho cũ và hai dòng sau mốc, một của nhân viên, một của Quản trị.
insert into public.stock_movements (id, branch_id, item_id, kind, qty, created_by, created_at) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'count', 10, '00000000-0000-0000-0000-00000000000a', '2026-11-01 08:00+07'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'count', 99, '00000000-0000-0000-0000-00000000000b', '2026-11-10 08:00+07'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', 'use', 2, '00000000-0000-0000-0000-00000000000a', '2026-11-11 08:00+07'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b3', 'count', 5, '00000000-0000-0000-0000-00000000000e', '2026-11-10 08:00+07');
insert into public.in_use (branch_id, item_id, opened_on, created_by) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3', '2026-11-10', '00000000-0000-0000-0000-00000000000a');

set local role authenticated;

-- Nhân viên (không phải Quản trị) bị chặn cả ba hàm.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
do $$ begin
  begin
    perform public.rollback_stock('00000000-0000-0000-0000-0000000000a1', '2026-11-05'::timestamptz);
    assert false, 'nhân viên không được quay lại sổ';
  exception when insufficient_privilege then null; end;
  begin
    perform public.restore_rollback('00000000-0000-0000-0000-0000000000a1', gen_random_uuid());
    assert false, 'nhân viên không được khôi phục';
  exception when insufficient_privilege then null; end;
  begin
    perform public.reset_branch_activity('00000000-0000-0000-0000-0000000000a1', 'Chi nhánh thử');
    assert false, 'nhân viên không được xóa dữ liệu';
  exception when insufficient_privilege then null; end;
end $$;

-- Quản trị Chi nhánh khác không đụng được Chi nhánh A.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e"}', true);
do $$ begin
  begin
    perform public.rollback_stock('00000000-0000-0000-0000-0000000000a1', '2026-11-05'::timestamptz);
    assert false, 'Quản trị Chi nhánh khác bị chặn';
  exception when insufficient_privilege then null; end;
end $$;

-- Quản trị Chi nhánh A: quay lại từ 5/11 → hủy 2 dòng (count của nhân viên + use), giữ Kiểm kho cũ ngày 1/11.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);
do $$
declare v_n integer; v_batch uuid;
begin
  v_n := public.rollback_stock('00000000-0000-0000-0000-0000000000a1', '2026-11-05'::timestamptz);
  assert v_n = 2, 'quay lại hủy đúng 2 dòng, được ' || v_n;
  select batch_id into v_batch from public.stock_movements where note = 'rollback' limit 1;
  assert (select count(*) from public.stock_movements where kind = 'void' and note = 'rollback' and batch_id = v_batch) = 2, 'cùng một batch';
  assert (select count(*) from public.stock_movements where id = '00000000-0000-0000-0000-0000000000c1') = 1, 'sổ gốc còn nguyên (chỉ ghi thêm)';
  -- Quay lại lần nữa cùng mốc: không còn gì để hủy.
  assert public.rollback_stock('00000000-0000-0000-0000-0000000000a1', '2026-11-05'::timestamptz) = 0, 'không hủy hai lần';
  -- Chỉ nhân viên b, từ mốc cũ hơn: dòng của b đã bị hủy nên 0.
  assert public.rollback_stock('00000000-0000-0000-0000-0000000000a1', '2026-10-01'::timestamptz, '00000000-0000-0000-0000-00000000000b') = 0, 'lọc theo người';
  -- Khôi phục đúng lần quay lại đó.
  assert public.restore_rollback('00000000-0000-0000-0000-0000000000a1', v_batch) = 2, 'khôi phục 2 dòng';
  assert (select count(*) from public.stock_movements where kind = 'void') = 0, 'hết dòng hủy';
  -- Chi nhánh B không bị ảnh hưởng.
end $$;

-- Quay lại chỉ theo một người (nhân viên b): hủy đúng dòng của b.
do $$ begin
  assert public.rollback_stock('00000000-0000-0000-0000-0000000000a1', '2026-11-05'::timestamptz, '00000000-0000-0000-0000-00000000000b') = 1, 'chỉ dòng của nhân viên b';
end $$;

-- Xóa dữ liệu phát sinh: sai tên Chi nhánh bị chặn; đúng tên thì xóa, giữ Danh mục và thành viên, không đụng Chi nhánh B.
do $$ begin
  begin
    perform public.reset_branch_activity('00000000-0000-0000-0000-0000000000a1', 'sai tên');
    assert false, 'sai tên Chi nhánh phải bị chặn';
  exception when sqlstate '22023' then null; end;
  perform public.reset_branch_activity('00000000-0000-0000-0000-0000000000a1', 'Chi nhánh thử');
  assert (select count(*) from public.stock_movements where branch_id = '00000000-0000-0000-0000-0000000000a1') = 0, 'sổ A sạch';
  assert (select count(*) from public.in_use where branch_id = '00000000-0000-0000-0000-0000000000a1') = 0, 'Đang dùng A sạch';
  assert (select count(*) from public.items where branch_id = '00000000-0000-0000-0000-0000000000a1') = 1, 'Danh mục A còn';
  assert (select count(*) from public.members where branch_id = '00000000-0000-0000-0000-0000000000a1') = 2, 'thành viên A còn';
end $$;
reset role;
do $$ begin
  -- Bảng nhật ký client không đọc được; kiểm bằng quyền dịch vụ: sau xóa chỉ còn đúng một dòng 'branch_reset' do Quản trị a ghi.
  assert (select count(*) from public.audit_log where branch_id = '00000000-0000-0000-0000-0000000000a1' and table_name = 'branch_reset' and actor = '00000000-0000-0000-0000-00000000000a') = 1, 'nhật ký xóa';
  assert (select count(*) from public.stock_movements where branch_id = '00000000-0000-0000-0000-0000000000b1') = 1, 'Chi nhánh B không bị đụng';
end $$;

rollback;
