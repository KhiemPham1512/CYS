-- Nhật ký thay đổi (#13): trigger ghi ai/lúc nào/cũ → mới khi sửa món, Nhóm, Cài đặt, thành viên.
-- Biến động kho đã nằm trong sổ stock_movements nên không sao chép; audit_feed gộp cả hai cho Quản trị.
-- Bảng audit_log client không đọc/ghi trực tiếp; chỉ qua audit_feed (security definer, kiểm Quản trị).
create table public.audit_log (
  id bigint generated always as identity primary key,
  branch_id uuid not null,
  at timestamptz not null default now(),
  actor uuid, -- auth.uid(); null khi thay đổi do hàm server dùng quyền admin (ví dụ tạo tài khoản)
  table_name text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  item_id uuid,
  old_data jsonb,
  new_data jsonb
);
create index audit_log_branch_at on public.audit_log (branch_id, at desc);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;

create function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'updated_at' - 'created_at' end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'updated_at' - 'created_at' end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  if tg_op = 'UPDATE' and v_old = v_new then return new; end if; -- chỉ đổi updated_at: không ghi
  insert into public.audit_log (branch_id, actor, table_name, action, item_id, old_data, new_data)
    values (
      (v_row ->> 'branch_id')::uuid,
      auth.uid(),
      tg_table_name,
      lower(tg_op),
      case when tg_table_name = 'items' then (v_row ->> 'id')::uuid end,
      v_old,
      v_new
    );
  return coalesce(new, old);
end $$;

create trigger audit_items after insert or update or delete on public.items
  for each row execute function private.audit_row();
create trigger audit_item_groups after insert or update or delete on public.item_groups
  for each row execute function private.audit_row();
create trigger audit_branch_settings after insert or update or delete on public.branch_settings
  for each row execute function private.audit_row();
create trigger audit_members after insert or update or delete on public.members
  for each row execute function private.audit_row();

-- Nhật ký gộp (mới nhất trước). Chỉ Quản trị đang hoạt động của Chi nhánh gọi được.
-- shortcut: tối đa 500 dòng mỗi lần, chưa phân trang; lọc theo ngày tính giờ Việt Nam.
create function public.audit_feed(
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
begin
  if not exists (
    select 1 from public.members m
    where m.branch_id = p_branch and m.user_id = auth.uid() and m.is_admin and not m.is_locked
  ) then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  return query
  select f.logged_at, f.actor, f.actor_email, f.table_name, f.action, f.item_id, f.item_name, f.old_data, f.new_data
  from (
    select a.at as logged_at, a.actor as actor, u.email::text as actor_email, a.table_name as table_name,
           a.action as action, a.item_id as item_id, i.name as item_name, a.old_data as old_data, a.new_data as new_data
    from public.audit_log a
    left join auth.users u on u.id = a.actor
    left join public.items i on i.id = a.item_id
    where a.branch_id = p_branch
    union all
    select s.created_at, s.created_by, u2.email::text, 'stock_movements'::text, s.kind, s.item_id, i2.name,
           null::jsonb,
           jsonb_build_object('qty', s.qty, 'expected_qty', s.expected_qty, 'mfg_date', s.mfg_date, 'note', s.note)
    from public.stock_movements s
    left join auth.users u2 on u2.id = s.created_by
    left join public.items i2 on i2.id = s.item_id
    where s.branch_id = p_branch
  ) f
  where (p_actor is null or f.actor = p_actor)
    and (p_from is null or (f.logged_at at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
    and (p_to is null or (f.logged_at at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
    and (p_item is null or f.item_id = p_item)
  order by f.logged_at desc
  limit least(coalesce(p_limit, 200), 500);
end $$;
revoke execute on function public.audit_feed(uuid, uuid, date, date, uuid, int) from public, anon;
grant execute on function public.audit_feed(uuid, uuid, date, date, uuid, int) to authenticated;
