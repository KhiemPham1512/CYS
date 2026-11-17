-- Đưa hàm kiểm thành viên ra khỏi schema public để không bị gọi qua /rest/v1/rpc.
-- Policy giữ tham chiếu theo OID nên vẫn chạy sau khi đổi schema.
create schema if not exists private;
grant usage on schema private to authenticated;
alter function public.is_active_member(uuid) set schema private;
