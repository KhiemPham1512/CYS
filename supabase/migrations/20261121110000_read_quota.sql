-- Giới hạn lượt đọc ảnh đơn (#11): mỗi Người dùng tối đa 60 lượt/ngày (một lượt = một ảnh) (giờ VN) trong mỗi Chi nhánh.
-- Edge Function read-supplier-order gọi take_read_quota trước khi gọi Gemini; hết lượt thì không gọi.
-- shortcut: mỗi lần gọi tính một lượt kể cả khi Gemini lỗi; chưa dọn dòng cũ (mỗi người một dòng/ngày, rất nhỏ).
create table public.read_usage (
  branch_id uuid not null references public.branches (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  n int not null,
  primary key (branch_id, user_id, day)
);
alter table public.read_usage enable row level security;
revoke all on public.read_usage from anon, authenticated; -- client không đọc/ghi trực tiếp

create function public.take_read_quota(p_branch_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  if not private.is_active_member(p_branch_id) then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  insert into public.read_usage as u (branch_id, user_id, day, n)
  values (p_branch_id, auth.uid(), (now() at time zone 'Asia/Ho_Chi_Minh')::date, 1)
  on conflict (branch_id, user_id, day) do update set n = u.n + 1 where u.n < 60
  returning n into v_n;
  return v_n is not null; -- null: đã đủ 60 lượt hôm nay
end $$;

revoke execute on function public.take_read_quota(uuid) from public, anon;
grant execute on function public.take_read_quota(uuid) to authenticated;
