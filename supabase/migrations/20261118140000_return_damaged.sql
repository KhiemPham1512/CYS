-- Trả hàng hư (#9): hàng đã vào kho mới thấy hư. Sổ kho thêm loại 'return_damaged' trừ đúng một Lô
-- (mfg_date = Lô có Ngày sản xuất; entered_on = Lô chưa có ngày, theo ngày vào kho) và dòng 'damaged'
-- vào Chờ nhà cung cấp, cùng một giao dịch. Chỉ ghi qua hàm; client không insert trực tiếp.

alter table public.stock_movements drop constraint stock_movements_kind_check;
alter table public.stock_movements drop constraint stock_movements_mfg_date_kind;
alter table public.stock_movements drop constraint stock_movements_entered_on_assign_only;
alter table public.stock_movements
  add constraint stock_movements_kind_check
    check (kind in ('count', 'adjust', 'assign_mfg', 'use', 'void', 'receive', 'return_damaged')),
  add constraint stock_movements_mfg_date_kind
    check ((kind = 'assign_mfg') = (mfg_date is not null) or kind in ('receive', 'return_damaged')),
  add constraint stock_movements_entered_on_kind
    check (entered_on is null or kind in ('assign_mfg', 'return_damaged')),
  add constraint stock_movements_return_positive check (kind <> 'return_damaged' or qty > 0),
  add constraint stock_movements_return_one_lot
    check (kind <> 'return_damaged' or (mfg_date is null) <> (entered_on is null));

-- Client không tự ghi return_damaged (sẽ trừ kho mà không có dòng Chờ nhà cung cấp).
create policy "return_damaged only via function" on public.stock_movements
  as restrictive for insert to authenticated
  with check (kind <> 'return_damaged');

-- shortcut: máy chủ không kiểm Lô có đủ số (Lô tính lúc đọc sổ ở app); gọi sai Lô thì Chờ nhà cung cấp tăng mà kho không giảm. Nâng lên kiểm máy chủ khi có nhiều người dùng/ứng dụng khác gọi.
create function public.return_damaged(
  p_item_id uuid, p_qty numeric, p_mfg date, p_entered_on date
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_branch uuid;
begin
  select i.branch_id into v_branch from public.items i where i.id = p_item_id;
  if v_branch is null then raise exception 'Không có món' using errcode = 'P0002'; end if;
  if not private.is_active_member(v_branch) then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Số lượng không hợp lệ' using errcode = '22023';
  end if;
  if (p_mfg is null) = (p_entered_on is null) then
    raise exception 'Chọn đúng một Lô' using errcode = '22023';
  end if;
  insert into public.stock_movements (branch_id, item_id, kind, qty, mfg_date, entered_on)
    values (v_branch, p_item_id, 'return_damaged', p_qty, p_mfg, p_entered_on);
  insert into public.supplier_owed (branch_id, item_id, kind, qty)
    values (v_branch, p_item_id, 'damaged', p_qty);
end $$;

revoke execute on function public.return_damaged(uuid, numeric, date, date) from public, anon;
grant execute on function public.return_damaged(uuid, numeric, date, date) to authenticated;
