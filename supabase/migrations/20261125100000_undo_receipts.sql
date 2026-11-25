-- Gỡ Nhận hàng (chỉ Quản trị): hoàn tác các lần nhận nhầm. Xóa dòng 'receive' khỏi sổ kho và bản ghi nhận,
-- dòng đơn quay lại "chưa nhận". Lần nhận có Hàng thiếu/hư đã vào Chờ nhà cung cấp nên không gỡ ở đây (tránh lệch số chờ).
-- Ghi Nhật ký; chạm đơn (UPDATE không đổi giá trị) để các máy khác tải lại vì sự kiện xóa của Realtime không lọc được theo Chi nhánh.
create function public.undo_receipts(p_receipts uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_rec public.purchase_receipts;
  v_item uuid;
  v_order uuid;
  v_id uuid;
begin
  if coalesce(array_length(p_receipts, 1), 0) = 0 then
    return;
  end if;
  foreach v_id in array p_receipts loop
    select * into v_rec from public.purchase_receipts where id = v_id;
    if not found then
      raise exception 'Không tìm thấy lần nhận (đã gỡ rồi?)' using errcode = 'P0002';
    end if;
    if not exists (
      select 1 from public.members m
      where m.branch_id = v_rec.branch_id and m.user_id = (select auth.uid()) and m.is_admin and not m.is_locked
    ) then
      raise exception 'Không có quyền' using errcode = '42501';
    end if;
    if v_rec.short_qty > 0 or v_rec.damaged_qty > 0 then
      raise exception 'Lần nhận có Hàng thiếu/hư, không gỡ được ở đây' using errcode = '22023';
    end if;

    select l.item_id, l.order_id into v_item, v_order
    from public.purchase_order_lines l where l.id = v_rec.order_line_id;

    delete from public.stock_movements where kind = 'receive' and order_line_id = v_rec.order_line_id;
    delete from public.purchase_receipts where id = v_id;
    update public.purchase_orders set placed_at = placed_at where id = v_order;
    insert into public.audit_log (branch_id, actor, table_name, action, item_id, old_data)
      values (
        v_rec.branch_id, (select auth.uid()), 'purchase_receipts', 'delete', v_item,
        jsonb_build_object('good_qty', v_rec.good_qty, 'received_at', v_rec.created_at)
      );
  end loop;
end $$;

revoke execute on function public.undo_receipts(uuid[]) from public, anon;
grant execute on function public.undo_receipts(uuid[]) to authenticated;
