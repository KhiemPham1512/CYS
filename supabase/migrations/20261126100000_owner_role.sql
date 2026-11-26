-- Quản trị cấp cao (ADR 0002): bảng riêng private.owners; hai hàm kiểm quyền chung trả đúng thêm cho người trong bảng,
-- nên mọi policy/RPC đi qua is_active_member / is_branch_admin tự mở cho cấp cao. Mỗi Người dùng thuộc đúng một Chi nhánh.

create table private.owners (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table private.owners enable row level security;
revoke all on private.owners from public, anon, authenticated;

-- Chỉ cho biết chính mình có là cấp cao không (web admin và Edge Function admin-users dùng).
create function public.is_owner()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.owners o where o.user_id = (select auth.uid()));
$$;
revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

create or replace function private.is_active_member(p_branch_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.branch_id = p_branch_id
      and m.user_id = (select auth.uid())
      and not m.is_locked
  ) or public.is_owner();
$$;

create or replace function private.is_branch_admin(p_branch uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.branch_id = p_branch and m.user_id = (select auth.uid()) and m.is_admin and not m.is_locked
  ) or public.is_owner();
$$;

-- Hồ sơ cá nhân: cấp cao thấy tên của mọi người (web admin nhiều Chi nhánh).
create or replace function private.shares_branch(p_user uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.members me
    join public.members other on other.branch_id = me.branch_id
    where me.user_id = (select auth.uid()) and not me.is_locked and other.user_id = p_user
  ) or public.is_owner();
$$;

-- Một người một Chi nhánh (đã kiểm: không ai ở hai Chi nhánh).
create unique index members_one_branch_idx on public.members (user_id);

-- Các kiểm Quản trị viết thẳng: gom về private.is_branch_admin (không thì bỏ sót cấp cao).
create or replace function private.sheet_admin_only()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null
     and (tg_op = 'INSERT' and new.sheet <> '{}'::jsonb
          or tg_op = 'UPDATE' and new.sheet is distinct from old.sheet)
     and not private.is_branch_admin(new.branch_id) then
    raise exception 'Chỉ Quản trị được sửa dữ liệu in trên tờ'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.audit_feed(
  p_branch uuid,
  p_actor uuid default null,
  p_from date default null,
  p_to date default null,
  p_item uuid default null,
  p_limit int default 200
) returns table (
  logged_at timestamptz,
  actor uuid,
  actor_email text,
  table_name text,
  action text,
  item_id uuid,
  item_name text,
  old_data jsonb,
  new_data jsonb
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit int := least(coalesce(p_limit, 200), 500);
  -- Ngày lọc tính giờ Việt Nam: đổi thành mốc thời gian một lần để dùng được chỉ mục.
  v_from timestamptz := (p_from::timestamp at time zone 'Asia/Ho_Chi_Minh');
  v_to timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh');
begin
  if not private.is_branch_admin(p_branch) then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  return query
  select f.logged_at, f.actor, u.email::text, f.table_name, f.action, f.item_id, i.name, f.old_data, f.new_data
  from (
    (select a.at as logged_at, a.actor as actor, a.table_name as table_name, a.action as action,
            a.item_id as item_id, a.old_data as old_data, a.new_data as new_data
     from public.audit_log a
     where a.branch_id = p_branch
       and (p_actor is null or a.actor = p_actor)
       and (v_from is null or a.at >= v_from)
       and (v_to is null or a.at < v_to)
       and (p_item is null or a.item_id = p_item)
     order by a.at desc
     limit v_limit)
    union all
    (select s.created_at, s.created_by, 'stock_movements'::text, s.kind, s.item_id,
            null::jsonb,
            jsonb_build_object('qty', s.qty, 'expected_qty', s.expected_qty, 'mfg_date', s.mfg_date, 'note', s.note)
     from public.stock_movements s
     where s.branch_id = p_branch
       and (p_actor is null or s.created_by = p_actor)
       and (v_from is null or s.created_at >= v_from)
       and (v_to is null or s.created_at < v_to)
       and (p_item is null or s.item_id = p_item)
     order by s.created_at desc
     limit v_limit)
  ) f
  left join auth.users u on u.id = f.actor
  left join public.items i on i.id = f.item_id
  order by f.logged_at desc
  limit v_limit;
end $$;

create or replace function public.undo_receipts(p_receipts uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_rec public.purchase_receipts;
  v_item uuid;
  v_order uuid;
  v_id uuid;
begin
  if coalesce(array_length(p_receipts, 1), 0) = 0 then
    return;
  end if;
  foreach v_id in array p_receipts loop
    select * into v_rec from public.purchase_receipts where id = v_id for update;
    if not found then
      raise exception 'Không tìm thấy lần nhận (đã gỡ rồi?)' using errcode = 'P0002';
    end if;
    if not private.is_branch_admin(v_rec.branch_id) then
      raise exception 'Không có quyền' using errcode = '42501';
    end if;
    if v_rec.short_qty > 0 or v_rec.damaged_qty > 0 then
      raise exception 'Lần nhận có Hàng thiếu/hư, không gỡ được ở đây' using errcode = '22023';
    end if;
    if v_rec.created_at < now() - interval '3 days' then
      raise exception 'Lần nhận quá 3 ngày, không gỡ được' using errcode = '22023';
    end if;

    select l.item_id, l.order_id into v_item, v_order
    from public.purchase_order_lines l where l.id = v_rec.order_line_id;

    if exists (
      select 1 from public.stock_movements s
      where s.branch_id = v_rec.branch_id and s.item_id = v_item
        and s.kind in ('count', 'adjust') and s.created_at > v_rec.created_at
        and not exists (select 1 from public.stock_movements v where v.voids_id = s.id)
    ) then
      raise exception 'Đã Kiểm kho/Điều chỉnh món này sau lần nhận, không gỡ được' using errcode = '22023';
    end if;

    delete from public.stock_movements where kind = 'receive' and order_line_id = v_rec.order_line_id;
    delete from public.purchase_receipts where id = v_id;
    update public.purchase_orders set placed_at = placed_at where id = v_order;
    insert into public.audit_log (branch_id, actor, table_name, action, item_id, old_data)
      values (
        v_rec.branch_id, (select auth.uid()), 'purchase_receipts', 'delete', v_item,
        jsonb_build_object('good_qty', v_rec.good_qty, 'received_at', v_rec.created_at)
      );
  end loop;
end $$;

-- Tạo Chi nhánh mới chép từ Chi nhánh mẫu: Nhóm, Danh mục (kèm dữ liệu in), dữ liệu in của Cài đặt, Tên nhà cung cấp.
-- Không chép tồn kho, đơn, nhận hàng, nhật ký, thành viên.
create function public.create_branch(p_name text, p_template uuid)
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
        shelf_life_unit, shelf_life_after_open_unit, sort_order, sheet, skip_count
      ) values (
        v_branch, v_group, i.name, i.name_zh, i.unit, i.unit_zh, i.case_size, i.track_mfg_date, i.shelf_life,
        i.shelf_life_from_receipt_days, i.shelf_life_after_open, i.record_by_percent, i.is_hidden,
        i.shelf_life_unit, i.shelf_life_after_open_unit, i.sort_order, i.sheet, i.skip_count
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
revoke execute on function public.create_branch(text, uuid) from public, anon;
grant execute on function public.create_branch(text, uuid) to authenticated;

-- Chuyển quán: thành Nhân viên ở Chi nhánh mới, lịch sử ở lại Chi nhánh cũ, phiên đang mở nhận tín hiệu để đăng xuất.
-- Quản trị quán cuối cùng bị chặn bởi trigger keep_last_admin (bỏ is_admin ở Chi nhánh cũ).
create function public.move_member(p_user uuid, p_to uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.members;
begin
  if not public.is_owner() then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  select * into v_old from public.members where user_id = p_user for update;
  if not found then
    raise exception 'Không tìm thấy Người dùng' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_to) then
    raise exception 'Không tìm thấy Chi nhánh' using errcode = 'P0002';
  end if;
  if v_old.branch_id = p_to then
    raise exception 'Người dùng đã ở Chi nhánh này' using errcode = '22023';
  end if;

  update public.members set branch_id = p_to, is_admin = false where user_id = p_user;
  -- Trigger Nhật ký ghi vào Chi nhánh mới; Chi nhánh cũ cũng cần thấy người này rời đi.
  insert into public.audit_log (branch_id, actor, table_name, action, old_data)
    values (v_old.branch_id, (select auth.uid()), 'members', 'delete',
            to_jsonb(v_old) - 'created_at' || jsonb_build_object('moved_to', p_to));
  perform realtime.send('{}'::jsonb, 'locked', 'user-lock:' || p_user::text, false);
end $$;
revoke execute on function public.move_member(uuid, uuid) from public, anon;
grant execute on function public.move_member(uuid, uuid) to authenticated;
