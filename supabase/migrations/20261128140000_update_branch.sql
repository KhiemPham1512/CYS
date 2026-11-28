-- Quản trị cấp cao sửa tên Chi nhánh và chữ trên tờ xuất ảnh (Cài đặt riêng từng quán, không theo Danh mục gốc).
-- Chữ để trống thì bỏ khóa đó khỏi sheet: tờ dùng mặc định (tên quán viết hoa, không chữ Trung).
-- Nhật ký tự ghi qua trigger audit_branch_settings.
create function public.update_branch(
  p_branch uuid, p_name text, p_title text, p_order_zh text, p_stock_zh text
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(p_name);
  v_set jsonb := '{}'::jsonb;
  v_drop text[] := '{}';
  k text;
  v text;
begin
  if not public.is_owner() then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  if coalesce(v_name, '') = '' or length(v_name) > 100 then
    raise exception 'Tên Chi nhánh không hợp lệ' using errcode = '22023';
  end if;
  for k, v in select * from (values ('title', p_title), ('order_zh', p_order_zh), ('stock_zh', p_stock_zh)) t loop
    v := btrim(coalesce(v, ''));
    if length(v) > 100 then
      raise exception 'Chữ trên tờ quá dài (tối đa 100 ký tự)' using errcode = '22023';
    end if;
    if v = '' then v_drop := v_drop || k; else v_set := v_set || jsonb_build_object(k, v); end if;
  end loop;

  update public.branch_settings
    set branch_name = v_name, sheet = (sheet - v_drop) || v_set
    where branch_id = p_branch;
  if not found then
    raise exception 'Không tìm thấy Chi nhánh' using errcode = 'P0002';
  end if;
end $$;
revoke execute on function public.update_branch(uuid, text, text, text, text) from public, anon;
grant execute on function public.update_branch(uuid, text, text, text, text) to authenticated;
