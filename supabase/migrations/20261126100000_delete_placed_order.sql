-- Xóa cả một đơn ĐÃ ĐẶT khi chưa nhận món nào (mọi thành viên Chi nhánh): dùng khi bấm Đặt hàng nhiều lần nên đơn bị trùng/cộng dồn.
-- Ghi Nhật ký từng dòng (cùng dạng với xóa một món); chạm đơn trước khi xóa để máy khác tải lại
-- (sự kiện xóa của Realtime không lọc được theo Chi nhánh).
create function public.delete_placed_order(p_order uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.purchase_orders;
begin
  select * into v_order from public.purchase_orders where id = p_order for update;
  if not found then
    raise exception 'Không tìm thấy đơn' using errcode = 'P0002';
  end if;
  if not private.is_active_member(v_order.branch_id) then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  if v_order.placed_at is null then
    raise exception 'Đơn nháp: dùng xóa đơn nháp' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.purchase_receipts r
    join public.purchase_order_lines l on l.id = r.order_line_id
    where l.order_id = p_order
  ) then
    raise exception 'Đơn đã nhận hàng, không xóa được' using errcode = '22023';
  end if;

  insert into public.audit_log (branch_id, actor, table_name, action, item_id, old_data)
    select l.branch_id, auth.uid(), 'purchase_order_lines', 'delete', l.item_id,
           jsonb_build_object('qty', l.qty, 'placed_at', v_order.placed_at)
    from public.purchase_order_lines l where l.order_id = p_order;
  update public.purchase_orders set placed_at = placed_at where id = p_order;
  delete from public.purchase_orders where id = p_order; -- dòng đơn xóa theo (on delete cascade)
end $$;

revoke execute on function public.delete_placed_order(uuid) from public, anon;
grant execute on function public.delete_placed_order(uuid) to authenticated;
