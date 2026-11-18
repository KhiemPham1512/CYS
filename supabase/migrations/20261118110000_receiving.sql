-- Nhận hàng (#8): dòng đơn đã đặt được nhận một lần (receipt); phần tốt vào sổ kho (kind 'receive'),
-- phần Thiếu/Hư vào Chờ nhà cung cấp (supplier_owed); "Đã nhận bù" ghi dòng 'settled' + 'receive'.
-- Ghi qua hai hàm (một giao dịch); client không insert trực tiếp vào receipts/owed.

-- 1. sổ kho: loại 'receive' + dòng đơn nguồn; mfg_date được phép với receive.
alter table public.stock_movements drop constraint stock_movements_kind_check;
alter table public.stock_movements
  add constraint stock_movements_kind_check
    check (kind in ('count', 'adjust', 'assign_mfg', 'use', 'void', 'receive')),
  add column order_line_id uuid references public.purchase_order_lines (id),
  add constraint stock_movements_receive_positive check (kind <> 'receive' or qty > 0);

do $$
declare c text;
begin
  -- Ràng buộc cũ "(kind = 'assign_mfg') = (mfg_date is not null)" (tên tự sinh) cấm receive có ngày.
  select conname into c from pg_constraint
   where conrelid = 'public.stock_movements'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%assign_mfg%mfg_date IS NOT NULL%'
     and pg_get_constraintdef(oid) not like '%void%';
  if c is not null then execute format('alter table public.stock_movements drop constraint %I', c); end if;
end $$;
alter table public.stock_movements
  add constraint stock_movements_mfg_date_kind
    check ((kind = 'assign_mfg') = (mfg_date is not null) or kind = 'receive');

-- 2. một lần nhận cho mỗi dòng đơn
create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  order_line_id uuid not null unique references public.purchase_order_lines (id),
  good_qty numeric not null check (good_qty >= 0),
  short_qty numeric not null check (short_qty >= 0),
  damaged_qty numeric not null check (damaged_qty >= 0),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

-- 3. Chờ nhà cung cấp: short/damaged cộng, settled trừ (theo món)
create table public.supplier_owed (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  item_id uuid not null,
  kind text not null check (kind in ('short', 'damaged', 'settled')),
  qty numeric not null check (qty > 0),
  receipt_id uuid references public.purchase_receipts (id),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (branch_id, item_id) references public.items (branch_id, id)
);

alter table public.purchase_receipts enable row level security;
alter table public.supplier_owed enable row level security;
revoke all on public.purchase_receipts, public.supplier_owed from anon, authenticated;
grant select on public.purchase_receipts, public.supplier_owed to authenticated;
create policy "members read receipts" on public.purchase_receipts
  for select to authenticated using (private.is_active_member(branch_id));
create policy "members read owed" on public.supplier_owed
  for select to authenticated using (private.is_active_member(branch_id));

-- 4. Nhận một dòng đơn đã đặt. Kiểm lại ở máy chủ (số hợp lệ, món theo dõi cần ngày) vì app là ranh giới không tin cậy.
create function public.receive_order_line(
  p_line_id uuid, p_received numeric, p_damaged numeric, p_mfg date
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_line public.purchase_order_lines;
  v_placed timestamptz;
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
  select i.track_mfg_date into v_tracks from public.items i where i.id = v_line.item_id;

  if p_received < 0 or p_damaged < 0 or p_received > v_line.qty or p_damaged > p_received then
    raise exception 'Số lượng không hợp lệ' using errcode = '22023';
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

-- 5. Đã nhận bù (một phần cũng được): trừ Chờ nhà cung cấp, phần nhận vào kho.
create function public.settle_owed(p_item_id uuid, p_qty numeric, p_mfg date)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_branch uuid;
  v_tracks boolean;
  v_waiting numeric;
begin
  select i.branch_id, i.track_mfg_date into v_branch, v_tracks
    from public.items i where i.id = p_item_id;
  if v_branch is null then raise exception 'Không có món' using errcode = 'P0002'; end if;
  if not private.is_active_member(v_branch) then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  select coalesce(sum(case when w.kind = 'settled' then -w.qty else w.qty end), 0) into v_waiting
    from public.supplier_owed w where w.item_id = p_item_id;
  if p_qty <= 0 or p_qty > v_waiting then
    raise exception 'Số lượng nhận bù không hợp lệ' using errcode = '22023';
  end if;
  if v_tracks and p_mfg is null then
    raise exception 'Cần nhập Ngày sản xuất' using errcode = '22023';
  end if;
  insert into public.supplier_owed (branch_id, item_id, kind, qty) values (v_branch, p_item_id, 'settled', p_qty);
  insert into public.stock_movements (branch_id, item_id, kind, qty, mfg_date)
    values (v_branch, p_item_id, 'receive', p_qty, p_mfg);
end $$;

revoke execute on function public.receive_order_line(uuid, numeric, numeric, date) from public, anon;
revoke execute on function public.settle_owed(uuid, numeric, date) from public, anon;
grant execute on function public.receive_order_line(uuid, numeric, numeric, date) to authenticated;
grant execute on function public.settle_owed(uuid, numeric, date) to authenticated;

alter publication supabase_realtime add table public.purchase_receipts, public.supplier_owed;
