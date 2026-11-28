-- Bản APK mới cho app Android tự báo cập nhật: bucket app-releases đọc công khai (ai có link mới tải được, không liệt kê),
-- giữ đúng hai file ghi đè mỗi lần phát hành: cys.apk và latest.json { versionCode, versionName, notes }.
-- Chỉ Quản trị cấp cao tải lên/ghi đè (scripts/publish-apk.mjs đăng nhập bằng tài khoản cấp cao), không cần khóa service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app-releases', 'app-releases', true, 50 * 1024 * 1024, -- gói Free: tối đa 50 MB/file; APK ~25 MB
        array['application/vnd.android.package-archive', 'application/json'])
on conflict (id) do nothing;

create policy "owner uploads app releases" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'app-releases' and public.is_owner());
create policy "owner replaces app releases" on storage.objects
  for update to authenticated
  using (bucket_id = 'app-releases' and public.is_owner())
  with check (bucket_id = 'app-releases' and public.is_owner());
-- Ghi đè (upsert) cần đọc được dòng cũ qua API; người khác tải qua đường public, không cần policy select.
create policy "owner reads app releases" on storage.objects
  for select to authenticated
  using (bucket_id = 'app-releases' and public.is_owner());
