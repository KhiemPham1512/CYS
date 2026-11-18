-- Mỗi Chi nhánh luôn còn ít nhất một Quản trị đang hoạt động (không bị khóa).
-- Thay đổi thành viên chỉ đi qua Edge Function admin-users (client không có policy ghi members).
create function private.keep_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_admin and not old.is_locked
     and (tg_op = 'DELETE' or not new.is_admin or new.is_locked)
     and not exists (
       select 1 from public.members m
       where m.branch_id = old.branch_id
         and m.user_id <> old.user_id
         and m.is_admin and not m.is_locked
     ) then
    raise exception 'Không thể bỏ hoặc khóa Quản trị cuối cùng của Chi nhánh'
      using errcode = 'P0001', hint = 'last_admin';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger members_keep_last_admin
  before update or delete on public.members
  for each row execute function private.keep_last_admin();
