-- Chống race: hai Quản trị cùng lúc bỏ quyền/khóa nhau có thể làm Chi nhánh mất hết Quản trị.
-- Khóa tư vấn theo Chi nhánh buộc các thay đổi chạy lần lượt; truy vấn sau khóa thấy dữ liệu mới nhất.
create or replace function private.keep_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_admin and not old.is_locked
     and (tg_op = 'DELETE' or not new.is_admin or new.is_locked) then
    perform pg_advisory_xact_lock(hashtext('members:' || old.branch_id::text));
    if not exists (
      select 1 from public.members m
      where m.branch_id = old.branch_id
        and m.user_id <> old.user_id
        and m.is_admin and not m.is_locked
    ) then
      raise exception 'Không thể bỏ hoặc khóa Quản trị cuối cùng của Chi nhánh'
        using errcode = 'P0001', hint = 'last_admin';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
