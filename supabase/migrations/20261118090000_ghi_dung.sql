-- Ghi dùng: kind 'use' (qty = số đã dùng, trừ Lô ở module lõi). Sửa/xóa trong ngày = dòng 'void'
-- hủy dòng 'use' (voids_id), người hủy là created_by; sửa = void + use mới. Sổ vẫn chỉ ghi thêm.
alter table public.stock_movements drop constraint stock_movements_kind_check;
alter table public.stock_movements
  add constraint stock_movements_kind_check
    check (kind in ('count', 'adjust', 'assign_mfg', 'use', 'void')),
  add column voids_id uuid references public.stock_movements (id),
  add constraint stock_movements_use_positive check (kind <> 'use' or qty > 0),
  add constraint stock_movements_void_ref check ((kind = 'void') = (voids_id is not null));

-- Mỗi Ghi dùng chỉ bị hủy một lần.
create unique index stock_movements_voids_once on public.stock_movements (voids_id) where voids_id is not null;

grant insert (voids_id) on public.stock_movements to authenticated;

-- Chỉ hủy được Ghi dùng cùng Chi nhánh, tạo trong hôm nay (giờ Việt Nam).
create policy "void only today's use" on public.stock_movements
  as restrictive for insert to authenticated
  with check (
    kind <> 'void' or exists (
      select 1 from public.stock_movements u
      where u.id = stock_movements.voids_id
        and u.kind = 'use'
        and u.branch_id = stock_movements.branch_id
        and u.item_id = stock_movements.item_id
        and (u.created_at at time zone 'Asia/Ho_Chi_Minh')::date
            = (now() at time zone 'Asia/Ho_Chi_Minh')::date
    )
  );

-- Email của thành viên cùng Chi nhánh, để hiện "ai đã Ghi dùng". Chỉ thành viên đang hoạt động gọi được.
create function public.branch_member_emails(p_branch_id uuid)
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text
  from public.members m
  join auth.users u on u.id = m.user_id
  where m.branch_id = p_branch_id
    and private.is_active_member(p_branch_id);
$$;
revoke execute on function public.branch_member_emails(uuid) from public, anon;
grant execute on function public.branch_member_emails(uuid) to authenticated;
