-- Dữ liệu "in trên tờ" (cột sheet của items, item_groups) chỉ Quản trị được đổi.
-- Thành viên thường vẫn sửa các cột khác của món/Nhóm như cũ. Chạy từ SQL Editor/hàm server (không có auth.uid()) thì không chặn.
create function private.sheet_admin_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and (tg_op = 'INSERT' and new.sheet <> '{}'::jsonb
          or tg_op = 'UPDATE' and new.sheet is distinct from old.sheet)
     and not exists (
       select 1 from public.members m
       where m.branch_id = new.branch_id
         and m.user_id = (select auth.uid())
         and m.is_admin and not m.is_locked
     ) then
    raise exception 'Chỉ Quản trị được sửa dữ liệu in trên tờ'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger items_sheet_admin_only
  before insert or update on public.items
  for each row execute function private.sheet_admin_only();
create trigger item_groups_sheet_admin_only
  before insert or update on public.item_groups
  for each row execute function private.sheet_admin_only();
