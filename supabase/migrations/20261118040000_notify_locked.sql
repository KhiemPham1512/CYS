-- Báo ngay cho Người dùng đang đăng nhập khi bị khóa (app nhận broadcast rồi tự kiểm lại và đăng xuất).
-- Topic công khai chỉ mang tín hiệu, không mang dữ liệu; app luôn xác nhận bằng RLS.
create function private.notify_locked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_locked and not old.is_locked then
    perform realtime.send('{}'::jsonb, 'locked', 'user-lock:' || new.user_id::text, false);
  end if;
  return new;
end;
$$;

create trigger members_notify_locked
  after update of is_locked on public.members
  for each row execute function private.notify_locked();
