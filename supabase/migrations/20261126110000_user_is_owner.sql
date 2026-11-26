-- Edge Function admin-users (service role) cần biết người đích có là Quản trị cấp cao không:
-- cấp cao có thể mang is_admin=false (tự Chuyển quán, bị bỏ cờ), nên không dựa vào is_admin để
-- chặn Quản trị quán khóa/đổi mật khẩu cấp cao. Không cấp cho client (lộ danh sách cấp cao).
create function public.user_is_owner(p_user uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.owners o where o.user_id = p_user);
$$;
revoke execute on function public.user_is_owner(uuid) from public, anon, authenticated;
grant execute on function public.user_is_owner(uuid) to service_role;
