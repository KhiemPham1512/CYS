-- delete_order_line: báo cho các máy khác tải lại. Sự kiện xóa của Realtime không lọc được theo Chi nhánh nên máy khác không biết;
-- chạm vào dòng đơn (UPDATE không đổi giá trị) để có sự kiện cập nhật mang branch_id.
create or replace function public.delete_order_line(p_line uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_line public.purchase_order_lines;
  v_placed timestamptz;
begin
  select * into v_line from public.purchase_order_lines where id = p_line;
  if not found then
    raise exception 'Không tìm thấy món trong đơn' using errcode = 'P0002';
  end if;
  if not private.is_active_member(v_line.branch_id) then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  select placed_at into v_placed from public.purchase_orders where id = v_line.order_id;
  if v_placed is null then
    raise exception 'Đơn nháp: dùng xóa đơn nháp' using errcode = '22023';
  end if;
  if exists (select 1 from public.purchase_receipts where order_line_id = p_line) then
    raise exception 'Món này đã nhận hàng, không xóa được' using errcode = '22023';
  end if;

  delete from public.purchase_order_lines where id = p_line;
  update public.purchase_orders set placed_at = placed_at where id = v_line.order_id;
  insert into public.audit_log (branch_id, actor, table_name, action, item_id, old_data)
    values (
      v_line.branch_id, auth.uid(), 'purchase_order_lines', 'delete', v_line.item_id,
      jsonb_build_object('qty', v_line.qty, 'placed_at', v_placed)
    );
end $$;
