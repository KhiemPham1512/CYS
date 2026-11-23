-- Lưu chuỗi số lượng người dùng vừa gõ và cờ bỏ qua kiểm kho cho món ngừng bán.
alter table public.stock_movements
  add column qty_text text
  check (qty_text is null or char_length(qty_text) between 1 and 40);

grant insert (qty_text) on public.stock_movements to authenticated;

alter table public.items
  add column skip_count boolean not null default false;
