-- Kiểm update_branch (migration 20261128140000). Chạy cả file; rollback ở cuối. Lỗi = assert sai. Dữ liệu giả.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e0', 'owner@example.test'),
  ('00000000-0000-0000-0000-0000000000e1', 'admin@example.test');
insert into public.branches (id) values ('00000000-0000-0000-0000-0000000000ea');
insert into public.branch_settings (branch_id, branch_name, sheet) values
  ('00000000-0000-0000-0000-0000000000ea', 'Quán cũ', '{"title":"QUÁN MẪU","order_zh":"（舊）","other":1}');
insert into public.members (branch_id, user_id, is_admin) values
  ('00000000-0000-0000-0000-0000000000ea', '00000000-0000-0000-0000-0000000000e1', true);
insert into private.owners (user_id) values ('00000000-0000-0000-0000-0000000000e0');

-- Quản trị quán (không phải cấp cao) không sửa được.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1"}', true);
do $$ begin
  begin
    perform public.update_branch('00000000-0000-0000-0000-0000000000ea', 'Quán mới', 'X', '', '');
    assert false, 'Quản trị quán không được sửa';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e0"}', true);
do $$ begin
  -- Tên trống thì báo lỗi.
  begin
    perform public.update_branch('00000000-0000-0000-0000-0000000000ea', '   ', 'X', '', '');
    assert false, 'tên trống phải lỗi';
  exception when sqlstate '22023' then null;
  end;

  -- Sửa tên + tiêu đề; chữ Trung để trống thì bỏ khóa (tờ dùng mặc định); khóa khác giữ nguyên.
  perform public.update_branch('00000000-0000-0000-0000-0000000000ea', '  Quán mới ', ' QUÁN MỚI ', '', '（新庫存）');
  assert (select branch_name = 'Quán mới' and sheet = '{"title":"QUÁN MỚI","stock_zh":"（新庫存）","other":1}'::jsonb
          from public.branch_settings where branch_id = '00000000-0000-0000-0000-0000000000ea'),
    (select sheet::text from public.branch_settings where branch_id = '00000000-0000-0000-0000-0000000000ea');

  -- Quán không tồn tại.
  begin
    perform public.update_branch('00000000-0000-0000-0000-0000000000ef', 'A', '', '', '');
    assert false, 'quán không có phải lỗi';
  exception when sqlstate 'P0002' then null;
  end;
end $$;

select 'ALL PASS' as result;
rollback;
