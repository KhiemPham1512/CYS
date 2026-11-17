-- Chi nhánh, thành viên và Cài đặt. Mọi dữ liệu kho sau này gắn branch_id.

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.members (
  branch_id uuid not null references public.branches (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  is_admin boolean not null default false,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (branch_id, user_id)
);
create index members_user_id_idx on public.members (user_id);

-- Cài đặt của Chi nhánh; tên Chi nhánh nằm ở đây, không ghi cứng trong mã.
create table public.branch_settings (
  branch_id uuid primary key references public.branches (id) on delete cascade,
  branch_name text not null check (length(trim(branch_name)) > 0)
);

-- security definer: policy của members gọi hàm này mà không đệ quy RLS.
create function public.is_active_member(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.branch_id = p_branch_id
      and m.user_id = (select auth.uid())
      and not m.is_locked
  );
$$;
revoke execute on function public.is_active_member(uuid) from public, anon;
grant execute on function public.is_active_member(uuid) to authenticated;

alter table public.branches enable row level security;
alter table public.members enable row level security;
alter table public.branch_settings enable row level security;

-- Chỉ đọc; chưa có policy ghi nên mọi ghi từ client bị chặn (ticket sau mở dần).
create policy "active members read branch" on public.branches
  for select to authenticated using (public.is_active_member(id));
create policy "active members read members" on public.members
  for select to authenticated using (public.is_active_member(branch_id));
create policy "active members read settings" on public.branch_settings
  for select to authenticated using (public.is_active_member(branch_id));
