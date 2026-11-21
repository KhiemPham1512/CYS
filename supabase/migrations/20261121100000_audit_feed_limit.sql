-- Nhật ký (#13) nhanh hơn: bản cũ gộp TOÀN BỘ sổ kho của Chi nhánh rồi mới lọc + cắt, nên chậm dần khi sổ kho lớn lên.
-- Bản này lọc và cắt "limit" ngay trong từng nguồn (audit_log, stock_movements) trước khi gộp. Kết quả và chữ ký hàm giữ nguyên.
-- Chỉ mục (branch_id, created_at desc) cho sổ kho để lấy các dòng mới nhất không phải quét hết.
create index stock_movements_branch_at_idx on public.stock_movements (branch_id, created_at desc);

create or replace function public.audit_feed(
  p_branch uuid,
  p_actor uuid default null,
  p_from date default null,
  p_to date default null,
  p_item uuid default null,
  p_limit int default 200
) returns table (
  logged_at timestamptz,
  actor uuid,
  actor_email text,
  table_name text,
  action text,
  item_id uuid,
  item_name text,
  old_data jsonb,
  new_data jsonb
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit int := least(coalesce(p_limit, 200), 500);
  -- Ngày lọc tính giờ Việt Nam: đổi thành mốc thời gian một lần để dùng được chỉ mục.
  v_from timestamptz := (p_from::timestamp at time zone 'Asia/Ho_Chi_Minh');
  v_to timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh');
begin
  if not exists (
    select 1 from public.members m
    where m.branch_id = p_branch and m.user_id = auth.uid() and m.is_admin and not m.is_locked
  ) then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  return query
  select f.logged_at, f.actor, u.email::text, f.table_name, f.action, f.item_id, i.name, f.old_data, f.new_data
  from (
    (select a.at as logged_at, a.actor as actor, a.table_name as table_name, a.action as action,
            a.item_id as item_id, a.old_data as old_data, a.new_data as new_data
     from public.audit_log a
     where a.branch_id = p_branch
       and (p_actor is null or a.actor = p_actor)
       and (v_from is null or a.at >= v_from)
       and (v_to is null or a.at < v_to)
       and (p_item is null or a.item_id = p_item)
     order by a.at desc
     limit v_limit)
    union all
    (select s.created_at, s.created_by, 'stock_movements'::text, s.kind, s.item_id,
            null::jsonb,
            jsonb_build_object('qty', s.qty, 'expected_qty', s.expected_qty, 'mfg_date', s.mfg_date, 'note', s.note)
     from public.stock_movements s
     where s.branch_id = p_branch
       and (p_actor is null or s.created_by = p_actor)
       and (v_from is null or s.created_at >= v_from)
       and (v_to is null or s.created_at < v_to)
       and (p_item is null or s.item_id = p_item)
     order by s.created_at desc
     limit v_limit)
  ) f
  left join auth.users u on u.id = f.actor
  left join public.items i on i.id = f.item_id
  order by f.logged_at desc
  limit v_limit;
end $$;

-- loadMovements lọc theo Chi nhánh và xếp theo seq: chỉ mục cũ (branch_id, item_id, seq) không phục vụ được việc đó.
create index stock_movements_branch_seq_idx on public.stock_movements (branch_id, seq);
