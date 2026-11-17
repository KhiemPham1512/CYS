-- Thời hạn giữ đơn vị gốc (ngày hoặc tháng), không quy đổi. Tháng tính theo lịch.
alter table public.items rename column shelf_life_days to shelf_life;
alter table public.items
  add column shelf_life_unit text not null default 'month'
    check (shelf_life_unit in ('day', 'month'));

alter table public.items rename column shelf_life_after_open_days to shelf_life_after_open;
alter table public.items
  add column shelf_life_after_open_unit text not null default 'day'
    check (shelf_life_after_open_unit in ('day', 'month'));
