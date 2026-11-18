-- Đơn đặt hàng (một Nhóm một đơn nháp) và Hàng đang về (= dòng của đơn đã đặt).
-- Đơn nháp sửa/xóa được; "Đã đặt đúng như đơn" đặt placed_at một lần, sau đó khóa.
-- Hàng đang về và Tồn kho dự tính tính ở module lõi (src/orders), không lưu.
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  group_id uuid not null,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  placed_at timestamptz,
  unique (branch_id, id),
  foreign key (branch_id, group_id) references public.item_groups (branch_id, id)
);
-- Mỗi Nhóm tối đa một đơn nháp.
create unique index purchase_orders_one_draft on public.purchase_orders (branch_id, group_id) where placed_at is null;

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  branch_id uuid not null,
  item_id uuid not null,
  qty numeric not null check (qty > 0),
  unique (order_id, item_id),
  foreign key (branch_id, order_id) references public.purchase_orders (branch_id, id) on delete cascade,
  foreign key (branch_id, item_id) references public.items (branch_id, id)
);

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;

revoke all on public.purchase_orders, public.purchase_order_lines from anon, authenticated;
grant select, delete on public.purchase_orders, public.purchase_order_lines to authenticated;
grant insert (branch_id, group_id) on public.purchase_orders to authenticated;
grant update (placed_at) on public.purchase_orders to authenticated;
grant insert (order_id, branch_id, item_id, qty), update (qty) on public.purchase_order_lines to authenticated;

create policy "members read orders" on public.purchase_orders
  for select to authenticated using (private.is_active_member(branch_id));
create policy "members add orders" on public.purchase_orders
  for insert to authenticated
  with check (private.is_active_member(branch_id) and created_by = (select auth.uid()) and placed_at is null);
-- Chỉ đơn nháp mới sửa (đặt placed_at) hoặc xóa được.
create policy "members place draft orders" on public.purchase_orders
  for update to authenticated
  using (private.is_active_member(branch_id) and placed_at is null)
  with check (private.is_active_member(branch_id));
create policy "members delete draft orders" on public.purchase_orders
  for delete to authenticated
  using (private.is_active_member(branch_id) and placed_at is null);

create policy "members read order lines" on public.purchase_order_lines
  for select to authenticated using (private.is_active_member(branch_id));
create policy "members add lines to draft" on public.purchase_order_lines
  for insert to authenticated
  with check (
    private.is_active_member(branch_id)
    and exists (select 1 from public.purchase_orders o
                where o.id = purchase_order_lines.order_id and o.placed_at is null)
  );
create policy "members edit draft lines" on public.purchase_order_lines
  for update to authenticated
  using (
    private.is_active_member(branch_id)
    and exists (select 1 from public.purchase_orders o
                where o.id = purchase_order_lines.order_id and o.placed_at is null)
  )
  with check (private.is_active_member(branch_id));
create policy "members delete draft lines" on public.purchase_order_lines
  for delete to authenticated
  using (
    private.is_active_member(branch_id)
    and exists (select 1 from public.purchase_orders o
                where o.id = purchase_order_lines.order_id and o.placed_at is null)
  );

-- placed_at luôn là giờ máy chủ, client không tự đặt giờ.
create function public.stamp_placed_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.placed_at is null and new.placed_at is not null then
    new.placed_at := now();
  end if;
  return new;
end $$;
create trigger purchase_orders_stamp before update on public.purchase_orders
  for each row execute function public.stamp_placed_at();

alter publication supabase_realtime add table public.purchase_orders, public.purchase_order_lines;
