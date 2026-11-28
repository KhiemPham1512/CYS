-- Nhận hàng theo thứ tự ngày (chung mọi Nhóm): chỉ nhận đơn của Ngày cũ nhất còn chờ, và chỉ khi đã đặt đơn cho
-- ngày sau (hàng đơn ngày D về sau khi đặt đơn D+1); chưa có đơn ngày sau thì chỉ Quản trị nhận. App kiểm cùng luật
-- (src/orders/orders.ts receiveLock); máy chủ kiểm để app bản cũ cũng bị chặn.

-- Ngày của đơn, giống businessDay ở app: đặt sau khi đã Kiểm kho (chưa hủy) trong ngày (giờ VN) thì là đơn ngày mai.
create function private.order_day(p_branch uuid, p_placed timestamptz)
returns date
language sql stable security definer set search_path = '' as $$
  select (p_placed at time zone 'Asia/Ho_Chi_Minh')::date
    + case when exists (
        select 1 from public.stock_movements s
        where s.branch_id = p_branch and s.kind = 'count' and s.created_at < p_placed
          and (s.created_at at time zone 'Asia/Ho_Chi_Minh')::date = (p_placed at time zone 'Asia/Ho_Chi_Minh')::date
          and not exists (select 1 from public.stock_movements v where v.voids_id = s.id)
      ) then 1 else 0 end;
$$;
revoke execute on function private.order_day(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.receive_order_line(p_line_id uuid, p_received numeric, p_damaged numeric, p_mfg date)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_line public.purchase_order_lines;
  v_placed timestamptz;
  v_day date;
  v_tracks boolean;
  v_good numeric;
  v_short numeric;
  v_receipt uuid;
begin
  select * into v_line from public.purchase_order_lines l where l.id = p_line_id;
  if not found then raise exception 'Không có dòng đơn' using errcode = 'P0002'; end if;
  if not private.is_active_member(v_line.branch_id) then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  select o.placed_at into v_placed from public.purchase_orders o where o.id = v_line.order_id;
  if v_placed is null then raise exception 'Đơn chưa đặt' using errcode = '22023'; end if;

  -- Ngày của đơn tăng theo placed_at, nên lọc trước bằng placed_at rồi mới so ngày.
  v_day := private.order_day(v_line.branch_id, v_placed);
  if exists (
    select 1 from public.purchase_order_lines l
    join public.purchase_orders o on o.id = l.order_id
    where l.branch_id = v_line.branch_id and o.placed_at is not null and o.placed_at < v_placed
      and not exists (select 1 from public.purchase_receipts r where r.order_line_id = l.id)
      and private.order_day(o.branch_id, o.placed_at) < v_day
  ) then
    raise exception 'Còn đơn ngày trước chưa nhận: nhận đơn đó trước' using errcode = '22023';
  end if;
  if not private.is_branch_admin(v_line.branch_id) and not exists (
    select 1 from public.purchase_orders o
    where o.branch_id = v_line.branch_id and o.placed_at is not null and o.placed_at > v_placed
      and private.order_day(o.branch_id, o.placed_at) > v_day
  ) then
    raise exception 'Chưa nhận được: đơn này nhận sau khi đã đặt đơn ngày kế tiếp (hoặc nhờ Quản trị)' using errcode = '22023';
  end if;

  select i.track_mfg_date into v_tracks from public.items i where i.id = v_line.item_id;

  if p_received < 0 or p_damaged < 0 or p_received > v_line.qty or p_damaged > p_received then
    raise exception 'Số lượng không hợp lệ' using errcode = '22023';
  end if;
  if p_mfg is not null and p_mfg > (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Ngày sản xuất không được ở tương lai' using errcode = '22023';
  end if;
  v_good := p_received - p_damaged;
  v_short := v_line.qty - p_received;
  if v_tracks and v_good > 0 and p_mfg is null then
    raise exception 'Cần nhập Ngày sản xuất' using errcode = '22023';
  end if;

  insert into public.purchase_receipts (branch_id, order_line_id, good_qty, short_qty, damaged_qty)
    values (v_line.branch_id, v_line.id, v_good, v_short, p_damaged)
    returning id into v_receipt; -- trùng order_line_id = đã nhận rồi (unique_violation)
  if v_good > 0 then
    insert into public.stock_movements (branch_id, item_id, kind, qty, mfg_date, order_line_id)
      values (v_line.branch_id, v_line.item_id, 'receive', v_good, p_mfg, v_line.id);
  end if;
  if v_short > 0 then
    insert into public.supplier_owed (branch_id, item_id, kind, qty, receipt_id)
      values (v_line.branch_id, v_line.item_id, 'short', v_short, v_receipt);
  end if;
  if p_damaged > 0 then
    insert into public.supplier_owed (branch_id, item_id, kind, qty, receipt_id)
      values (v_line.branch_id, v_line.item_id, 'damaged', p_damaged, v_receipt);
  end if;
end $$;
