-- Danh mục gốc (ADR 0003): một Chi nhánh gốc giữ Danh mục; Chi nhánh theo (branches.catalog_source) tự nhận mọi
-- thêm/sửa/ẩn/sắp xếp Nhóm, món (kèm dữ liệu in) và Tên nhà cung cấp, và chỉ đọc Danh mục của mình.
-- Không đồng bộ tồn kho, đơn, nhận hàng, Nhật ký, Cài đặt. Món không bao giờ bị xóa (chỉ ẩn) nên không có nhánh xóa.

alter table public.branches add column catalog_source uuid references public.branches (id);
alter table public.branches add constraint branches_catalog_source_not_self check (catalog_source <> id);
alter table public.item_groups add column source_id uuid;
alter table public.items add column source_id uuid;
create unique index item_groups_branch_source_idx on public.item_groups (branch_id, source_id);
create unique index items_branch_source_idx on public.items (branch_id, source_id);

-- Chặn Người dùng sửa thẳng Danh mục quán theo. Ghi từ trigger đồng bộ (độ sâu > 1) hoặc SQL Editor (không có auth.uid) thì cho.
create function private.catalog_follower_readonly()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and pg_trigger_depth() = 1
     and exists (
       select 1 from public.branches b
       where b.catalog_source is not null
         and (b.id = new.branch_id or tg_op = 'UPDATE' and b.id = old.branch_id)
     ) then
    raise exception 'Danh mục quán này theo quán gốc, chỉ sửa ở quán gốc' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger catalog_follower_readonly before insert or update on public.item_groups
  for each row execute function private.catalog_follower_readonly();
create trigger catalog_follower_readonly before insert or update on public.items
  for each row execute function private.catalog_follower_readonly();
create trigger catalog_follower_readonly before insert or update on public.supplier_aliases
  for each row execute function private.catalog_follower_readonly();

-- Dữ liệu in chép từ quán gốc qua trigger: người sửa là Quản trị quán gốc, không phải của quán theo.
create or replace function private.sheet_admin_only()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and pg_trigger_depth() = 1
     and (tg_op = 'INSERT' and new.sheet <> '{}'::jsonb
          or tg_op = 'UPDATE' and new.sheet is distinct from old.sheet)
     and not private.is_branch_admin(new.branch_id) then
    raise exception 'Chỉ Quản trị được sửa dữ liệu in trên tờ'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create function private.sync_group()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.item_groups (branch_id, source_id, name, name_zh, sort_order, sheet)
    select b.id, new.id, new.name, new.name_zh, new.sort_order, new.sheet
    from public.branches b where b.catalog_source = new.branch_id
  on conflict (branch_id, source_id) do update
    set name = excluded.name, name_zh = excluded.name_zh, sort_order = excluded.sort_order, sheet = excluded.sheet;
  return null;
end $$;

-- Thêm cột Danh mục mới cho items thì thêm vào đây và vào create_branch.
create function private.sync_item()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.items (
    branch_id, source_id, group_id, name, name_zh, unit, unit_zh, case_size, track_mfg_date, shelf_life,
    shelf_life_from_receipt_days, shelf_life_after_open, record_by_percent, is_hidden,
    shelf_life_unit, shelf_life_after_open_unit, sort_order, sheet, skip_count, track_in_use
  )
    select b.id, new.id, g.id, new.name, new.name_zh, new.unit, new.unit_zh, new.case_size, new.track_mfg_date,
      new.shelf_life, new.shelf_life_from_receipt_days, new.shelf_life_after_open, new.record_by_percent,
      new.is_hidden, new.shelf_life_unit, new.shelf_life_after_open_unit, new.sort_order, new.sheet, new.skip_count,
      new.track_in_use
    from public.branches b
    join public.item_groups g on g.branch_id = b.id and g.source_id = new.group_id
    where b.catalog_source = new.branch_id
  on conflict (branch_id, source_id) do update set
    group_id = excluded.group_id, name = excluded.name, name_zh = excluded.name_zh, unit = excluded.unit,
    unit_zh = excluded.unit_zh, case_size = excluded.case_size, track_mfg_date = excluded.track_mfg_date,
    shelf_life = excluded.shelf_life, shelf_life_from_receipt_days = excluded.shelf_life_from_receipt_days,
    shelf_life_after_open = excluded.shelf_life_after_open, record_by_percent = excluded.record_by_percent,
    is_hidden = excluded.is_hidden, shelf_life_unit = excluded.shelf_life_unit,
    shelf_life_after_open_unit = excluded.shelf_life_after_open_unit, sort_order = excluded.sort_order,
    sheet = excluded.sheet, skip_count = excluded.skip_count, track_in_use = excluded.track_in_use;
  return null;
end $$;

create function private.sync_alias()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.supplier_aliases (branch_id, alias_key, item_id, created_by)
    select f.branch_id, new.alias_key, f.id, new.created_by
    from public.items f
    join public.branches b on b.id = f.branch_id
    where b.catalog_source = new.branch_id and f.source_id = new.item_id
  on conflict (branch_id, alias_key) do update set item_id = excluded.item_id;
  return null;
end $$;

create trigger item_groups_sync after insert or update on public.item_groups
  for each row execute function private.sync_group();
create trigger items_sync after insert or update on public.items
  for each row execute function private.sync_item();
create trigger supplier_aliases_sync after insert or update on public.supplier_aliases
  for each row execute function private.sync_alias();

-- Nối một Chi nhánh có sẵn vào quán gốc theo tên (chạy ở SQL Editor). Lệch tên hoặc lệch giá trị thì dừng, báo tên.
create function private.link_catalog(p_follower uuid, p_source uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_bad text;
begin
  -- Chỉ một tầng: gốc không theo ai, quán được nối chưa theo ai và không làm gốc của quán nào.
  if p_follower = p_source
     or exists (select 1 from public.branches where id = p_source and catalog_source is not null)
     or exists (select 1 from public.branches where id = p_follower and catalog_source is not null)
     or exists (select 1 from public.branches where catalog_source = p_follower) then
    raise exception 'Quán gốc không hợp lệ';
  end if;

  select string_agg(coalesce(f.name, s.name), ', ') into v_bad
  from (select * from public.item_groups where branch_id = p_follower) f
  full join (select * from public.item_groups where branch_id = p_source) s on s.name = f.name
  where f.id is null or s.id is null
     or (f.name_zh, f.sort_order, f.sheet) is distinct from (s.name_zh, s.sort_order, s.sheet);
  if v_bad is not null then raise exception 'Nhóm lệch: %', v_bad; end if;

  select string_agg(coalesce(f.name, s.name), ', ') into v_bad
  from (select i.*, g.name as gname from public.items i join public.item_groups g on g.id = i.group_id
        where i.branch_id = p_follower) f
  full join (select i.*, g.name as gname from public.items i join public.item_groups g on g.id = i.group_id
             where i.branch_id = p_source) s on s.name = f.name
  where f.id is null or s.id is null
     or to_jsonb(f) - '{id,branch_id,group_id,source_id,created_at,updated_at}'::text[]
        <> to_jsonb(s) - '{id,branch_id,group_id,source_id,created_at,updated_at}'::text[];
  if v_bad is not null then raise exception 'Món lệch: %', v_bad; end if;

  update public.item_groups f set source_id = s.id
    from public.item_groups s where f.branch_id = p_follower and s.branch_id = p_source and s.name = f.name;
  update public.items f set source_id = s.id
    from public.items s where f.branch_id = p_follower and s.branch_id = p_source and s.name = f.name;

  delete from public.supplier_aliases where branch_id = p_follower;
  insert into public.supplier_aliases (branch_id, alias_key, item_id, created_by)
    select p_follower, a.alias_key, f.id, a.created_by
    from public.supplier_aliases a join public.items f on f.branch_id = p_follower and f.source_id = a.item_id
    where a.branch_id = p_source;

  update public.branches set catalog_source = p_source where id = p_follower;
  -- Nhật ký vừa ghi từng dòng đổi source_id (actor null, cùng giao dịch): không phải thay đổi của ai.
  delete from public.audit_log where branch_id = p_follower and at = now() and actor is null;
end $$;
revoke execute on function private.link_catalog(uuid, uuid) from public, anon, authenticated;

-- Tạo Chi nhánh: chép như cũ, kèm nối từng Nhóm/món về quán gốc, rồi đặt quán mới theo quán gốc.
create or replace function public.create_branch(p_name text, p_template uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(p_name);
  v_branch uuid;
  v_root uuid;
  v_group uuid;
  v_item uuid;
  v_items jsonb := '{}'::jsonb; -- id món mẫu -> id món mới (cho Tên nhà cung cấp)
  g record;
  i record;
begin
  if not public.is_owner() then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  if coalesce(v_name, '') = '' or length(v_name) > 100 then
    raise exception 'Tên Chi nhánh không hợp lệ' using errcode = '22023';
  end if;
  if not exists (select 1 from public.branch_settings s where s.branch_id = p_template) then
    raise exception 'Không tìm thấy Chi nhánh mẫu' using errcode = 'P0002';
  end if;
  select coalesce(b.catalog_source, b.id) into v_root from public.branches b where b.id = p_template;

  insert into public.branches default values returning id into v_branch;
  insert into public.branch_settings (branch_id, branch_name, sheet)
    select v_branch, v_name, s.sheet from public.branch_settings s where s.branch_id = p_template;

  for g in select * from public.item_groups where branch_id = p_template loop
    insert into public.item_groups (branch_id, source_id, name, name_zh, sort_order, sheet)
      values (v_branch, coalesce(g.source_id, g.id), g.name, g.name_zh, g.sort_order, g.sheet)
      returning id into v_group;
    for i in select * from public.items where group_id = g.id loop
      insert into public.items (
        branch_id, source_id, group_id, name, name_zh, unit, unit_zh, case_size, track_mfg_date, shelf_life,
        shelf_life_from_receipt_days, shelf_life_after_open, record_by_percent, is_hidden,
        shelf_life_unit, shelf_life_after_open_unit, sort_order, sheet, skip_count, track_in_use
      ) values (
        v_branch, coalesce(i.source_id, i.id), v_group, i.name, i.name_zh, i.unit, i.unit_zh, i.case_size,
        i.track_mfg_date, i.shelf_life, i.shelf_life_from_receipt_days, i.shelf_life_after_open,
        i.record_by_percent, i.is_hidden, i.shelf_life_unit, i.shelf_life_after_open_unit, i.sort_order,
        i.sheet, i.skip_count, i.track_in_use
      ) returning id into v_item;
      v_items := v_items || jsonb_build_object(i.id::text, v_item);
    end loop;
  end loop;

  insert into public.supplier_aliases (branch_id, alias_key, item_id, created_by)
    select v_branch, a.alias_key, (v_items ->> a.item_id::text)::uuid, (select auth.uid())
    from public.supplier_aliases a
    where a.branch_id = p_template and v_items ? a.item_id::text;

  -- Đặt sau khi chép: trước đó quán mới chưa bị chặn ghi Danh mục.
  update public.branches set catalog_source = v_root where id = v_branch;

  -- Trigger Nhật ký vừa ghi từng dòng chép: thay bằng một dòng "tạo Chi nhánh".
  delete from public.audit_log where branch_id = v_branch;
  insert into public.audit_log (branch_id, actor, table_name, action, new_data)
    values (v_branch, (select auth.uid()), 'branches', 'insert',
            jsonb_build_object('branch_name', v_name, 'template', p_template));
  return v_branch;
end $$;
