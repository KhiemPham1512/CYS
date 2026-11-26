-- Kiểm Quản trị cấp cao + một người một Chi nhánh (migration 20261126100000, ADR 0002).
-- Chạy cả file; rollback ở cuối. Lỗi = assert sai. Dữ liệu giả hoàn toàn.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f0', 'owner@example.test'),
  ('00000000-0000-0000-0000-0000000000f1', 'admin-a@example.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'staff-a@example.test'),
  ('00000000-0000-0000-0000-0000000000f3', 'admin-b@example.test'),
  ('00000000-0000-0000-0000-0000000000f4', 'staff-b@example.test');
insert into public.branches (id) values
  ('00000000-0000-0000-0000-0000000000fa'),
  ('00000000-0000-0000-0000-0000000000fb');
insert into public.branch_settings (branch_id, branch_name, sheet) values
  ('00000000-0000-0000-0000-0000000000fa', 'Quán A', '{"title":"A"}'),
  ('00000000-0000-0000-0000-0000000000fb', 'Quán B', '{}');
-- Cấp cao giữ dòng members ở quán A (để dùng app điện thoại), không phải Quản trị quán.
insert into public.members (branch_id, user_id, is_admin) values
  ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000f0', false),
  ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000f1', true),
  ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000f2', false),
  ('00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000f3', true),
  ('00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000f4', false);
insert into private.owners (user_id) values ('00000000-0000-0000-0000-0000000000f0');
insert into public.item_groups (id, branch_id, name, sort_order, sheet) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000fa', 'Nhóm A', 2, '{"col":1}');
insert into public.items (id, branch_id, group_id, name, unit, case_size, sheet) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000a2', 'Món A', 'Hộp', 12, '{"row":3}'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000a2', 'Món A2', 'Bịch', null, '{}');
-- Quán B có món thật để kiểm "không đọc quán khác" trực tiếp.
insert into public.item_groups (id, branch_id, name) values
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000fb', 'Nhóm quán B');
insert into public.items (id, branch_id, group_id, name, unit) values
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000b2', 'Món B', 'Hộp');
insert into public.stock_movements (branch_id, item_id, kind, qty, created_by) values
  ('00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000b3', 'count', 3, '00000000-0000-0000-0000-0000000000f3');
insert into public.supplier_aliases (branch_id, alias_key, item_id, created_by) values
  ('00000000-0000-0000-0000-0000000000fa', 'mon a ncc', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000f1');
insert into public.stock_movements (branch_id, item_id, kind, qty, created_by) values
  ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000a3', 'count', 7, '00000000-0000-0000-0000-0000000000f1');

-- Một người một Chi nhánh.
do $$ begin
  begin
    insert into public.members (branch_id, user_id) values
      ('00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000f2');
    assert false, 'một người không được ở hai Chi nhánh';
  exception when unique_violation then null; end;
end $$;

set local role authenticated;

-- Client không đọc được bảng cấp cao.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f0"}', true);
do $$ begin
  begin
    perform 1 from private.owners;
    assert false, 'client không được đọc private.owners';
  exception when insufficient_privilege then null; end;
end $$;

-- Cấp cao: thấy mọi Chi nhánh, xem Nhật ký quán B, sửa dữ liệu in quán B.
do $$
declare v_new uuid;
begin
  assert public.is_owner(), 'is_owner đúng với cấp cao';
  assert (select count(*) from public.branch_settings
          where branch_id in ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000fb')) = 2,
    'cấp cao thấy cả hai Chi nhánh';
  assert (select count(*) from public.members where branch_id = '00000000-0000-0000-0000-0000000000fb') = 2,
    'cấp cao thấy thành viên quán B';
  assert private.shares_branch('00000000-0000-0000-0000-0000000000f4'), 'cấp cao thấy hồ sơ người quán B';
  perform public.audit_feed('00000000-0000-0000-0000-0000000000fb');
  insert into public.item_groups (branch_id, name, sheet) values
    ('00000000-0000-0000-0000-0000000000fb', 'Nhóm B', '{"col":2}');

  -- Tạo Chi nhánh từ quán A: chép Nhóm, món, dữ liệu in, Tên nhà cung cấp; không chép tồn, thành viên.
  v_new := public.create_branch('  Quán C  ', '00000000-0000-0000-0000-0000000000fa');
  assert (select branch_name from public.branch_settings where branch_id = v_new) = 'Quán C', 'tên đã bỏ khoảng trắng';
  assert (select sheet from public.branch_settings where branch_id = v_new) = '{"title":"A"}', 'chép dữ liệu in Cài đặt';
  assert (select count(*) from public.item_groups where branch_id = v_new and name = 'Nhóm A' and sort_order = 2 and sheet = '{"col":1}') = 1, 'chép Nhóm';
  assert (select count(*) from public.items i join public.item_groups g on g.id = i.group_id
          where i.branch_id = v_new and g.branch_id = v_new) = 2, 'chép món vào đúng Nhóm mới';
  assert (select case_size from public.items where branch_id = v_new and name = 'Món A') = 12, 'chép quy cách';
  assert (select count(*) from public.supplier_aliases a join public.items i on i.id = a.item_id
          where a.branch_id = v_new and i.branch_id = v_new and i.name = 'Món A') = 1, 'Tên nhà cung cấp trỏ món mới';
  assert (select count(*) from public.stock_movements where branch_id = v_new) = 0, 'không chép tồn kho';
  assert (select count(*) from public.members where branch_id = v_new) = 0, 'không chép thành viên';
  assert (select count(*) from public.audit_feed(v_new) f where f.table_name = 'branches') = 1
     and (select count(*) from public.audit_feed(v_new) f where f.table_name <> 'branches') = 0,
    'Nhật ký quán mới chỉ một dòng tạo Chi nhánh';

  begin
    perform public.create_branch('   ', '00000000-0000-0000-0000-0000000000fa');
    assert false, 'tên trống bị chặn';
  exception when invalid_parameter_value then null; end;

  -- Chuyển Nhân viên quán A sang quán B: thành Nhân viên, Nhật ký cả hai quán.
  perform public.move_member('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000fb');
  assert (select branch_id from public.members where user_id = '00000000-0000-0000-0000-0000000000f2')
    = '00000000-0000-0000-0000-0000000000fb', 'đã chuyển quán';
  assert (select count(*) from public.audit_feed('00000000-0000-0000-0000-0000000000fa') f
          where f.table_name = 'members' and f.action = 'delete') = 1, 'Nhật ký quán cũ ghi người rời đi';

  -- Chuyển Quản trị quán: thành Nhân viên ở quán mới.
  update public.members set is_admin = true where user_id = '00000000-0000-0000-0000-0000000000f4'; -- quán B có 2 Quản trị
  perform public.move_member('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000fa');
  assert not (select is_admin from public.members where user_id = '00000000-0000-0000-0000-0000000000f4'), 'thành Nhân viên ở quán mới';

  -- Không chuyển Quản trị quán cuối cùng.
  begin
    perform public.move_member('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000fa');
    assert false, 'không chuyển Quản trị cuối cùng';
  exception when raise_exception then null; end;

  begin
    perform public.move_member('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000fb');
    assert false, 'chuyển vào chính quán đang ở bị chặn';
  exception when invalid_parameter_value then null; end;
end $$;

-- Nhân viên quán A (người vừa chuyển từ B sang): không đọc món, sổ kho, thành viên quán B.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f4"}', true);
do $$ begin
  assert (select count(*) from public.items where branch_id = '00000000-0000-0000-0000-0000000000fb') = 0, 'NV A không đọc món B';
  assert (select count(*) from public.stock_movements where branch_id = '00000000-0000-0000-0000-0000000000fb') = 0, 'NV A không đọc sổ B';
  assert (select count(*) from public.members where branch_id = '00000000-0000-0000-0000-0000000000fb') = 0, 'NV A không đọc thành viên B';
  assert (select count(*) from public.items where branch_id = '00000000-0000-0000-0000-0000000000fa') = 2, 'NV A đọc món quán mình';
end $$;

-- Quản trị quán A: chỉ quán mình, không tạo Chi nhánh, không chuyển quán.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', true);
do $$ begin
  assert not public.is_owner(), 'Quản trị quán không phải cấp cao';
  assert (select count(*) from public.branch_settings where branch_id = '00000000-0000-0000-0000-0000000000fb') = 0,
    'Quản trị quán A không thấy quán B';
  perform public.audit_feed('00000000-0000-0000-0000-0000000000fa');
  begin
    perform public.audit_feed('00000000-0000-0000-0000-0000000000fb');
    assert false, 'Quản trị quán A không xem Nhật ký quán B';
  exception when insufficient_privilege then null; end;
  begin
    perform public.create_branch('Quán D', '00000000-0000-0000-0000-0000000000fa');
    assert false, 'Quản trị quán không tạo Chi nhánh';
  exception when insufficient_privilege then null; end;
  begin
    perform public.move_member('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000fb');
    assert false, 'Quản trị quán không chuyển quán';
  exception when insufficient_privilege then null; end;
end $$;

-- Nhân viên quán B (vừa chuyển sang): không thấy quán A nữa, không sửa dữ liệu in.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2"}', true);
do $$ begin
  assert (select count(*) from public.items where branch_id = '00000000-0000-0000-0000-0000000000fa') = 0,
    'người đã chuyển không đọc quán cũ';
  assert (select count(*) from public.items where branch_id = '00000000-0000-0000-0000-0000000000fb') = 1, 'đọc được quán mới';
  begin
    insert into public.item_groups (branch_id, name, sheet) values
      ('00000000-0000-0000-0000-0000000000fb', 'Nhóm lạ', '{"x":1}');
    assert false, 'Nhân viên không sửa dữ liệu in';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
