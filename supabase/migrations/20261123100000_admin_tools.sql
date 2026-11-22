-- Chế độ phát triển của Quản trị (chỉ Quản trị, kiểm ở server; lối vào ẩn trên app chỉ là giao diện).
-- 1) Quay lại sổ kho theo mốc giờ: sổ vẫn chỉ ghi thêm. Thêm dòng 'void' (note 'rollback', cùng batch_id)
--    cho mọi Kiểm kho / Điều chỉnh / Thêm Ngày sản xuất / Ghi dùng ghi từ mốc đó, chưa bị hủy.
--    Nhận hàng và Trả hàng hư KHÔNG bị quay lại: chúng gắn với phiếu nhận và Chờ nhà cung cấp, hủy riêng sẽ lệch.
-- 2) Khôi phục: xóa các dòng void của một lần quay lại (dòng gốc tính lại như cũ).
-- 3) Xóa dữ liệu phát sinh: xóa sổ kho, đơn, nhận hàng, Chờ nhà cung cấp, Đang dùng, lượt đọc ảnh, nhật ký;
--    giữ Danh mục, Nhóm, thành viên, dữ liệu in, tên nhà cung cấp đã nhớ. Phải gõ đúng tên Chi nhánh.
-- Mỗi thao tác ghi một dòng audit_log để Nhật ký thấy ai làm, lúc nào.

create function private.is_branch_admin(p_branch uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members m
    where m.branch_id = p_branch and m.user_id = (select auth.uid()) and m.is_admin and not m.is_locked
  );
$$;

create function public.rollback_stock(p_branch uuid, p_since timestamptz, p_actor uuid default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_batch uuid := gen_random_uuid();
  v_n integer;
begin
  if not private.is_branch_admin(p_branch) then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  if p_since is null then
    raise exception 'Thiếu mốc giờ' using errcode = '22023';
  end if;
  insert into public.stock_movements (branch_id, item_id, kind, qty, voids_id, batch_id, note, created_by)
  select s.branch_id, s.item_id, 'void', 0, s.id, v_batch, 'rollback', auth.uid()
  from public.stock_movements s
  where s.branch_id = p_branch
    and s.created_at >= p_since
    and s.kind in ('count', 'adjust', 'assign_mfg', 'use')
    and (p_actor is null or s.created_by = p_actor)
    and not exists (select 1 from public.stock_movements v where v.voids_id = s.id)
  order by s.seq;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.audit_log (branch_id, actor, table_name, action, new_data)
    values (p_branch, auth.uid(), 'stock_rollback', 'insert',
      jsonb_build_object('batch_id', v_batch, 'since', p_since, 'only_actor', p_actor, 'count', v_n));
  end if;
  return v_n;
end $$;

create function public.restore_rollback(p_branch uuid, p_batch uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  if not private.is_branch_admin(p_branch) then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  delete from public.stock_movements
  where branch_id = p_branch and batch_id = p_batch and kind = 'void' and note = 'rollback';
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.audit_log (branch_id, actor, table_name, action, old_data)
    values (p_branch, auth.uid(), 'stock_rollback', 'delete',
      jsonb_build_object('batch_id', p_batch, 'count', v_n));
  end if;
  return v_n;
end $$;

create function public.reset_branch_activity(p_branch uuid, p_confirm text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_branch_admin(p_branch) then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  if p_confirm is null or p_confirm is distinct from
     (select s.branch_name from public.branch_settings s where s.branch_id = p_branch) then
    raise exception 'Tên Chi nhánh không khớp' using errcode = '22023';
  end if;
  -- Thứ tự theo khóa ngoại: hàng thiếu → phiếu nhận → sổ kho (trỏ dòng đơn) → dòng đơn → đơn.
  delete from public.supplier_owed where branch_id = p_branch;
  delete from public.purchase_receipts where branch_id = p_branch;
  delete from public.stock_movements where branch_id = p_branch;
  delete from public.purchase_order_lines where branch_id = p_branch;
  delete from public.purchase_orders where branch_id = p_branch;
  delete from public.in_use where branch_id = p_branch;
  delete from public.read_usage where branch_id = p_branch;
  delete from public.audit_log where branch_id = p_branch;
  insert into public.audit_log (branch_id, actor, table_name, action)
  values (p_branch, auth.uid(), 'branch_reset', 'delete');
end $$;

revoke execute on function private.is_branch_admin(uuid) from public, anon, authenticated;
revoke execute on function public.rollback_stock(uuid, timestamptz, uuid) from public, anon;
revoke execute on function public.restore_rollback(uuid, uuid) from public, anon;
revoke execute on function public.reset_branch_activity(uuid, text) from public, anon;
grant execute on function public.rollback_stock(uuid, timestamptz, uuid) to authenticated;
grant execute on function public.restore_rollback(uuid, uuid) to authenticated;
grant execute on function public.reset_branch_activity(uuid, text) to authenticated;
