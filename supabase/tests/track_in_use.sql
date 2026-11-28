-- Kiểm cột Theo dõi Đang dùng (migration 20261128110000). Chạy cả file; rollback ở cuối. Lỗi = assert sai. Dữ liệu giả.
begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f0', 'owner@example.test');
insert into private.owners (user_id) values ('00000000-0000-0000-0000-0000000000f0');
insert into public.branches (id) values ('00000000-0000-0000-0000-0000000000fa');
insert into public.branch_settings (branch_id, branch_name) values ('00000000-0000-0000-0000-0000000000fa', 'Quán A');
insert into public.item_groups (id, branch_id, name) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000fa', 'Nhóm 1');
insert into public.items (branch_id, group_id, name, unit, shelf_life_after_open, track_in_use) values
  ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000a1', 'Món tắt', 'Gói', 30, false),
  ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000a1', 'Món bật', 'Hộp', 7, true);
insert into public.items (branch_id, group_id, name, unit) values
  ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000a1', 'Món tự động', 'Lon');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f0"}', true);
do $$
declare v_new uuid;
begin
  assert (select track_in_use is null from public.items where name = 'Món tự động'
          and branch_id = '00000000-0000-0000-0000-0000000000fa'), 'mặc định null (tự động)';
  update public.items set track_in_use = true where name = 'Món tự động';
  assert (select track_in_use from public.items where name = 'Món tự động'
          and branch_id = '00000000-0000-0000-0000-0000000000fa'), 'client sửa được cột';
  v_new := public.create_branch('Quán B', '00000000-0000-0000-0000-0000000000fa');
  assert (select jsonb_object_agg(name, track_in_use) from public.items where branch_id = v_new)
    = '{"Món tắt": false, "Món bật": true, "Món tự động": true}'::jsonb, 'tạo Chi nhánh chép Theo dõi Đang dùng';
end $$;

select 'ALL PASS' as result;
rollback;
