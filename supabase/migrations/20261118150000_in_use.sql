-- Đang dùng (#10): mỗi lần Ghi dùng món có hạn sau khui dài (> 7 ngày) app thêm một dòng; ngày khui do máy chủ
-- đặt (hôm nay, giờ Việt Nam). "Hết" chỉ đặt ended_at. Không xóa, không sửa cột khác.
create table public.in_use (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  item_id uuid not null,
  opened_on date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  ended_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (branch_id, item_id) references public.items (branch_id, id)
);
create index in_use_open on public.in_use (branch_id, item_id) where ended_at is null;

alter table public.in_use enable row level security;
revoke all on public.in_use from anon, authenticated;
grant select on public.in_use to authenticated;
grant insert (branch_id, item_id) on public.in_use to authenticated;
grant update (ended_at) on public.in_use to authenticated;

create policy "members read in_use" on public.in_use
  for select to authenticated using (private.is_active_member(branch_id));
create policy "members open in_use" on public.in_use
  for insert to authenticated with check (private.is_active_member(branch_id));
-- Chỉ đặt "Hết" cho dòng còn đang dùng của Chi nhánh mình.
create policy "members end in_use" on public.in_use
  for update to authenticated
  using (private.is_active_member(branch_id) and ended_at is null)
  with check (private.is_active_member(branch_id) and ended_at is not null);

alter publication supabase_realtime add table public.in_use;
