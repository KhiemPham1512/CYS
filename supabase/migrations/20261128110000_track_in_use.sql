-- Theo dõi Đang dùng theo từng món: null = tự động (hạn sau khui > 7 ngày hoặc tính theo tháng, như trước),
-- true/false = Quản trị bật/tắt riêng (vd. món hạn 7 ngày nhưng xài ít; món hạn dài không cần nhắc).
-- App đọc qua tracksInUse (src/stock/expiry.ts); món không có hạn sau khui thì không bao giờ theo dõi.
alter table public.items add column track_in_use boolean;

-- Tạo Chi nhánh: chép thêm cột mới (giữ nguyên phần còn lại của 20261126100000_owner_role).
create or replace function public.create_branch(p_name text, p_template uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(p_name);
  v_branch uuid;
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

  insert into public.branches default values returning id into v_branch;
  insert into public.branch_settings (branch_id, branch_name, sheet)
    select v_branch, v_name, s.sheet from public.branch_settings s where s.branch_id = p_template;

  for g in select * from public.item_groups where branch_id = p_template loop
    insert into public.item_groups (branch_id, name, name_zh, sort_order, sheet)
      values (v_branch, g.name, g.name_zh, g.sort_order, g.sheet)
      returning id into v_group;
    for i in select * from public.items where group_id = g.id loop
      insert into public.items (
        branch_id, group_id, name, name_zh, unit, unit_zh, case_size, track_mfg_date, shelf_life,
        shelf_life_from_receipt_days, shelf_life_after_open, record_by_percent, is_hidden,
        shelf_life_unit, shelf_life_after_open_unit, sort_order, sheet, skip_count, track_in_use
      ) values (
        v_branch, v_group, i.name, i.name_zh, i.unit, i.unit_zh, i.case_size, i.track_mfg_date, i.shelf_life,
        i.shelf_life_from_receipt_days, i.shelf_life_after_open, i.record_by_percent, i.is_hidden,
        i.shelf_life_unit, i.shelf_life_after_open_unit, i.sort_order, i.sheet, i.skip_count, i.track_in_use
      ) returning id into v_item;
      v_items := v_items || jsonb_build_object(i.id::text, v_item);
    end loop;
  end loop;

  insert into public.supplier_aliases (branch_id, alias_key, item_id, created_by)
    select v_branch, a.alias_key, (v_items ->> a.item_id::text)::uuid, (select auth.uid())
    from public.supplier_aliases a
    where a.branch_id = p_template and v_items ? a.item_id::text;

  -- Trigger Nhật ký vừa ghi từng dòng chép: thay bằng một dòng "tạo Chi nhánh".
  delete from public.audit_log where branch_id = v_branch;
  insert into public.audit_log (branch_id, actor, table_name, action, new_data)
    values (v_branch, (select auth.uid()), 'branches', 'insert',
            jsonb_build_object('branch_name', v_name, 'template', p_template));
  return v_branch;
end $$;
