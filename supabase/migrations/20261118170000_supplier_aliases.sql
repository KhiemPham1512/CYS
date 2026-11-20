-- Nhớ tên nhà cung cấp lạ đã khớp với món nào (#11): hỏi một lần, lần sau tự khớp.
-- alias_key = tên NCC đã chuẩn hóa (không dấu, bỏ ngoặc/khối lượng) do app tính; mỗi khóa một món trong Chi nhánh.
create table public.supplier_aliases (
  branch_id uuid not null references public.branches (id) on delete cascade,
  alias_key text not null check (length(trim(alias_key)) > 0),
  item_id uuid not null,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (branch_id, alias_key),
  foreign key (branch_id, item_id) references public.items (branch_id, id) on delete cascade
);

alter table public.supplier_aliases enable row level security;
revoke all on public.supplier_aliases from anon, authenticated;
grant select on public.supplier_aliases to authenticated;
grant insert (branch_id, alias_key, item_id) on public.supplier_aliases to authenticated;
-- Sửa lại món đã nhớ (khớp nhầm): đổi item_id.
grant update (item_id) on public.supplier_aliases to authenticated;

create policy "members read aliases" on public.supplier_aliases
  for select to authenticated using (private.is_active_member(branch_id));
create policy "members add aliases" on public.supplier_aliases
  for insert to authenticated with check (private.is_active_member(branch_id));
create policy "members fix aliases" on public.supplier_aliases
  for update to authenticated
  using (private.is_active_member(branch_id))
  with check (private.is_active_member(branch_id));
