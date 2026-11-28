-- Kiểm Danh mục gốc (migration 20261128130000, ADR 0003). Chạy cả file; rollback ở cuối. Lỗi = assert sai. Dữ liệu giả.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f0', 'owner@example.test'),
  ('00000000-0000-0000-0000-0000000000f1', 'admin-a@example.test'),
  ('00000000-0000-0000-0000-0000000000f3', 'admin-b@example.test');
insert into public.branches (id) values
  ('00000000-0000-0000-0000-0000000000fa'),
  ('00000000-0000-0000-0000-0000000000fb'),
  ('00000000-0000-0000-0000-0000000000fc');
insert into public.branch_settings (branch_id, branch_name) values
  ('00000000-0000-0000-0000-0000000000fa', 'Quán A'),
  ('00000000-0000-0000-0000-0000000000fb', 'Quán B'),
  ('00000000-0000-0000-0000-0000000000fc', 'Quán C');
insert into public.members (branch_id, user_id, is_admin) values
  ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000f1', true),
  ('00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000f3', true);
insert into private.owners (user_id) values ('00000000-0000-0000-0000-0000000000f0');

-- Quán A (gốc) và quán B giống hệt; quán C thiếu một món.
insert into public.item_groups (id, branch_id, name) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000fa', 'Nhóm 1'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000fb', 'Nhóm 1'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000fc', 'Nhóm 1');
insert into public.items (id, branch_id, group_id, name, unit, case_size) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000a1', 'Món 1', 'Hộp', 12),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000a1', 'Món 2', 'Bịch', null),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000b1', 'Món 1', 'Hộp', 12),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000b1', 'Món 2', 'Bịch', null),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000fc', '00000000-0000-0000-0000-0000000000c1', 'Món 1', 'Hộp', 12);
insert into public.supplier_aliases (branch_id, alias_key, item_id, created_by) values
  ('00000000-0000-0000-0000-0000000000fa', 'mon 1 ncc', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000fb', 'ten cu', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000f3');
delete from public.audit_log where branch_id in ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000fb');

-- Nối theo tên: lệch thì dừng; khớp thì nối, thay Tên nhà cung cấp, không để lại Nhật ký.
do $$ begin
  begin
    perform private.link_catalog('00000000-0000-0000-0000-0000000000fc', '00000000-0000-0000-0000-0000000000fa');
    assert false, 'lệch món phải dừng';
  exception when raise_exception then
    assert sqlerrm like 'Món lệch: Món 2%', sqlerrm;
  end;
  perform private.link_catalog('00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000fa');
  assert (select catalog_source from public.branches where id = '00000000-0000-0000-0000-0000000000fb')
    = '00000000-0000-0000-0000-0000000000fa', 'B theo A';
  assert (select source_id from public.items where id = '00000000-0000-0000-0000-0000000000b2')
    = '00000000-0000-0000-0000-0000000000a2', 'món nối đúng';
  assert (select source_id from public.item_groups where id = '00000000-0000-0000-0000-0000000000b1')
    = '00000000-0000-0000-0000-0000000000a1', 'Nhóm nối đúng';
  assert (select jsonb_object_agg(alias_key, item_id) from public.supplier_aliases
          where branch_id = '00000000-0000-0000-0000-0000000000fb')
    = jsonb_build_object('mon 1 ncc', '00000000-0000-0000-0000-0000000000b2'), 'Tên NCC thay bằng của A';
  assert not exists (select 1 from public.audit_log where branch_id = '00000000-0000-0000-0000-0000000000fb'),
    'nối không ghi Nhật ký';
  -- Chỉ một tầng: không nối gốc A theo quán khác, không nối B lần nữa.
  begin
    perform private.link_catalog('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000fc');
    assert false, 'gốc đang có quán theo không được nối theo quán khác';
  exception when raise_exception then
    assert sqlerrm = 'Quán gốc không hợp lệ', sqlerrm;
  end;
  begin
    perform private.link_catalog('00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000fc');
    assert false, 'quán đã theo không được nối lần nữa';
  exception when raise_exception then
    assert sqlerrm = 'Quán gốc không hợp lệ', sqlerrm;
  end;
end $$;

set local role authenticated;

-- Quản trị quán A sửa/ẩn/thêm món, sửa dữ liệu in, học Tên NCC.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1"}', true);
update public.items set name = 'Món 1 mới', case_size = 24, is_hidden = true, sheet = '{"row":9}', sort_order = 5,
  track_in_use = false
  where id = '00000000-0000-0000-0000-0000000000a2';
insert into public.items (id, branch_id, group_id, name, unit) values
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000a1', 'Món 3', 'Lon');
insert into public.supplier_aliases (branch_id, alias_key, item_id) values
  ('00000000-0000-0000-0000-0000000000fa', 'mon 3 ncc', '00000000-0000-0000-0000-0000000000a4');
update public.supplier_aliases set item_id = '00000000-0000-0000-0000-0000000000a3'
  where branch_id = '00000000-0000-0000-0000-0000000000fa' and alias_key = 'mon 1 ncc';

-- Quản trị quán B thấy mọi thay đổi, nhưng không sửa được Danh mục của mình.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f3"}', true);
do $$
declare v_new uuid;
begin
  assert (select name = 'Món 1 mới' and case_size = 24 and is_hidden and sheet = '{"row":9}' and sort_order = 5
          and track_in_use = false
          from public.items where id = '00000000-0000-0000-0000-0000000000b2'), 'B nhận sửa của A';
  select id into v_new from public.items
    where branch_id = '00000000-0000-0000-0000-0000000000fb' and source_id = '00000000-0000-0000-0000-0000000000a4';
  assert (select name = 'Món 3' and group_id = '00000000-0000-0000-0000-0000000000b1' from public.items where id = v_new),
    'B nhận món mới, đúng Nhóm của B';
  assert (select jsonb_object_agg(alias_key, item_id) from public.supplier_aliases
          where branch_id = '00000000-0000-0000-0000-0000000000fb')
    = jsonb_build_object('mon 1 ncc', '00000000-0000-0000-0000-0000000000b3', 'mon 3 ncc', v_new),
    'B nhận Tên NCC mới và sửa';

  begin
    update public.items set case_size = 1 where id = '00000000-0000-0000-0000-0000000000b2';
    assert false, 'B không sửa được món';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.items (branch_id, group_id, name, unit) values
      ('00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000b1', 'Món riêng', 'Hộp');
    assert false, 'B không thêm được món';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.supplier_aliases (branch_id, alias_key, item_id) values
      ('00000000-0000-0000-0000-0000000000fb', 'ten la', '00000000-0000-0000-0000-0000000000b2');
    assert false, 'B không học được Tên NCC';
  exception when insufficient_privilege then null; end;
  begin
    update public.item_groups set name = 'Nhóm B' where id = '00000000-0000-0000-0000-0000000000b1';
    assert false, 'B không sửa được Nhóm';
  exception when insufficient_privilege then null; end;
end $$;

-- Cấp cao: sửa quán B cũng bị chặn; Nhóm mới ở A sang B; tạo quán từ B thì theo thẳng A.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f0"}', true);
do $$
declare v_new uuid;
begin
  begin
    update public.items set unit = 'Thùng' where id = '00000000-0000-0000-0000-0000000000b2';
    assert false, 'cấp cao không sửa thẳng quán theo';
  exception when insufficient_privilege then null; end;

  insert into public.item_groups (id, branch_id, name, sheet) values
    ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000fa', 'Nhóm 2', '{"col":2}');
  assert (select name = 'Nhóm 2' and sheet = '{"col":2}' from public.item_groups
          where branch_id = '00000000-0000-0000-0000-0000000000fb'
            and source_id = '00000000-0000-0000-0000-0000000000a5'), 'B nhận Nhóm mới';
  update public.items set group_id = '00000000-0000-0000-0000-0000000000a5'
    where id = '00000000-0000-0000-0000-0000000000a3';
  assert (select g.source_id from public.items i join public.item_groups g on g.id = i.group_id
          where i.id = '00000000-0000-0000-0000-0000000000b3') = '00000000-0000-0000-0000-0000000000a5',
    'đổi Nhóm của món cũng sang B';

  v_new := public.create_branch('Quán D', '00000000-0000-0000-0000-0000000000fb');
  assert (select catalog_source from public.branches where id = v_new) = '00000000-0000-0000-0000-0000000000fa',
    'quán mới theo quán gốc, không theo quán mẫu';
  assert (select count(*) from public.items where branch_id = v_new and source_id is not null) = 3, 'chép kèm nối';
  assert (select count(*) from public.supplier_aliases where branch_id = v_new) = 2, 'chép Tên NCC';
  update public.items set unit = 'Thùng' where id = '00000000-0000-0000-0000-0000000000a2';
  assert (select unit from public.items where branch_id = v_new and source_id = '00000000-0000-0000-0000-0000000000a2')
    = 'Thùng', 'quán mới nhận sửa của gốc';
end $$;

select 'ALL PASS' as result;
rollback;
