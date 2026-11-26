-- user_is_owner: chỉ service role gọi được (lộ danh sách cấp cao nếu cấp cho client); đúng với private.owners.
select case when
  not has_function_privilege('authenticated', 'public.user_is_owner(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.user_is_owner(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.user_is_owner(uuid)', 'execute')
  and (select bool_and(public.user_is_owner(o.user_id)) from private.owners o)
  and not public.user_is_owner('00000000-0000-4000-8000-000000000000')
then 'ALL PASS' else 'FAIL' end as result;
