-- Danh mục: Nhóm và Nguyên vật liệu của một Chi nhánh. Không xóa, chỉ ẩn (giữ lịch sử).

create table public.item_groups (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  name_zh text,
  sort_order int not null default 0,
  unique (branch_id, name),
  unique (branch_id, id)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  group_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  name_zh text,
  unit text not null check (length(trim(unit)) > 0),          -- Đơn vị tính
  unit_zh text,
  case_size int check (case_size > 0),                          -- Quy cách thùng: số Đơn vị tính / thùng
  track_mfg_date boolean not null default false,                -- cần theo dõi Ngày sản xuất
  shelf_life_days int check (shelf_life_days > 0),              -- Thời hạn sử dụng (từ Ngày sản xuất)
  shelf_life_from_receipt_days int check (shelf_life_from_receipt_days > 0), -- hạn kể từ ngày nhập
  shelf_life_after_open_days int check (shelf_life_after_open_days > 0),     -- hạn sau khui/rã đông
  record_by_percent boolean not null default false,             -- Ghi theo %
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, name),
  -- Nhóm phải cùng Chi nhánh với món.
  foreign key (branch_id, group_id) references public.item_groups (branch_id, id)
);
create index items_group_id_idx on public.items (branch_id, group_id);

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger items_touch_updated_at before update on public.items
  for each row execute function private.touch_updated_at();

alter table public.item_groups enable row level security;
alter table public.items enable row level security;

-- Mọi Người dùng đang hoạt động có cùng quyền với Danh mục; không có policy delete.
create policy "active members read groups" on public.item_groups
  for select to authenticated using (private.is_active_member(branch_id));
create policy "active members add groups" on public.item_groups
  for insert to authenticated with check (private.is_active_member(branch_id));
create policy "active members edit groups" on public.item_groups
  for update to authenticated
  using (private.is_active_member(branch_id))
  with check (private.is_active_member(branch_id));

create policy "active members read items" on public.items
  for select to authenticated using (private.is_active_member(branch_id));
create policy "active members add items" on public.items
  for insert to authenticated with check (private.is_active_member(branch_id));
create policy "active members edit items" on public.items
  for update to authenticated
  using (private.is_active_member(branch_id))
  with check (private.is_active_member(branch_id));

-- Realtime: client nghe thay đổi Danh mục (RLS vẫn áp dụng cho postgres_changes).
alter publication supabase_realtime add table public.item_groups, public.items;
