-- Tài khoản cá nhân: tên hiển thị và ảnh đại diện (ảnh nhỏ 128px lưu thẳng dạng data URL, không cần Storage).
-- Mỗi người chỉ ghi dòng của mình; đọc được dòng của người cùng Chi nhánh (để hiện tên thay email).

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  avatar text check (avatar is null or (char_length(avatar) <= 60000 and avatar like 'data:image/jpeg;base64,%')),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create function private.shares_branch(p_user uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.members me
    join public.members other on other.branch_id = me.branch_id
    where me.user_id = (select auth.uid()) and not me.is_locked and other.user_id = p_user
  );
$$;

create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or private.shares_branch(user_id));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

revoke all on public.profiles from anon;
