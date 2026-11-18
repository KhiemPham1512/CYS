-- Sổ Biến động kho: chỉ ghi thêm (không có policy update/delete). Tồn kho thực tế tính từ sổ này
-- ở module lõi (src/stock), tính từ mốc chốt gần nhất của từng món.
--   count / adjust : đặt Tồn kho thực tế của món = qty (mốc chốt); expected_qty = số app tính được lúc đó
--   assign_mfg     : chuyển qty từ phần "chưa có Ngày sản xuất" sang Lô có mfg_date
-- Các loại khác (Ghi dùng, Nhận hàng...) thêm ở ticket sau bằng cách mở rộng check của kind.

alter table public.items add unique (branch_id, id);

create table public.stock_movements (
  seq bigint generated always as identity primary key,
  id uuid not null unique default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  item_id uuid not null,
  kind text not null check (kind in ('count', 'adjust', 'assign_mfg')),
  qty numeric not null check (qty >= 0 and (kind <> 'assign_mfg' or qty > 0)),
  mfg_date date,
  expected_qty numeric check (expected_qty >= 0),
  batch_id uuid,
  note text,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  check ((kind = 'assign_mfg') = (mfg_date is not null)),
  foreign key (branch_id, item_id) references public.items (branch_id, id)
);
create index stock_movements_item_idx on public.stock_movements (branch_id, item_id, seq);
create index stock_movements_batch_idx on public.stock_movements (batch_id) where batch_id is not null;

alter table public.stock_movements enable row level security;

create policy "active members read movements" on public.stock_movements
  for select to authenticated using (private.is_active_member(branch_id));
create policy "active members add movements" on public.stock_movements
  for insert to authenticated
  with check (private.is_active_member(branch_id) and created_by = (select auth.uid()));

alter publication supabase_realtime add table public.stock_movements;
