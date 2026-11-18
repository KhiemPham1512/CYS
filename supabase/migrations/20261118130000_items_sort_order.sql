-- Thứ tự món như trên tờ tồn kho giấy. Món mới mặc định 1000 nên nằm cuối Nhóm cho tới khi được xếp.
alter table public.items add column sort_order integer not null default 1000;
