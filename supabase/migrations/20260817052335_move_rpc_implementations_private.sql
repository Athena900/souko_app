-- 実処理をAPI公開対象外の private スキーマへ移し、public 側には
-- SECURITY INVOKER の薄い入口だけを残す。これにより、認証済み利用者が
-- 必要なRPCを呼べる一方、公開スキーマに SECURITY DEFINER を置かない。

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to authenticated;

alter function public.register_warehouse_import(
  uuid, text, text, text, text, text, text, text, jsonb
) set schema private;

alter function public.persist_billing_candidate(
  text, text, uuid, boolean
) set schema private;

alter function public.review_billing_candidate(
  text, text, uuid, text, text
) set schema private;

revoke all on function private.register_warehouse_import(
  uuid, text, text, text, text, text, text, text, jsonb
) from public, anon;
grant execute on function private.register_warehouse_import(
  uuid, text, text, text, text, text, text, text, jsonb
) to authenticated;

revoke all on function private.persist_billing_candidate(
  text, text, uuid, boolean
) from public, anon;
grant execute on function private.persist_billing_candidate(
  text, text, uuid, boolean
) to authenticated;

revoke all on function private.review_billing_candidate(
  text, text, uuid, text, text
) from public, anon;
grant execute on function private.review_billing_candidate(
  text, text, uuid, text, text
) to authenticated;

create function public.register_warehouse_import(
  p_source_file_version_id uuid,
  p_client_id text,
  p_site_id text,
  p_data_type text,
  p_original_name text,
  p_storage_path text,
  p_sha256 text,
  p_mapping_version text,
  p_rows jsonb
)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select private.register_warehouse_import($1, $2, $3, $4, $5, $6, $7, $8, $9);
$function$;

create function public.persist_billing_candidate(
  p_client_id text,
  p_site_id text,
  p_field_work_record_id uuid,
  p_force_recalculate boolean default false
)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select private.persist_billing_candidate($1, $2, $3, $4);
$function$;

create function public.review_billing_candidate(
  p_client_id text,
  p_site_id text,
  p_candidate_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select private.review_billing_candidate($1, $2, $3, $4, $5);
$function$;

revoke all on function public.register_warehouse_import(
  uuid, text, text, text, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.register_warehouse_import(
  uuid, text, text, text, text, text, text, text, jsonb
) to authenticated;

revoke all on function public.persist_billing_candidate(
  text, text, uuid, boolean
) from public, anon;
grant execute on function public.persist_billing_candidate(
  text, text, uuid, boolean
) to authenticated;

revoke all on function public.review_billing_candidate(
  text, text, uuid, text, text
) from public, anon;
grant execute on function public.review_billing_candidate(
  text, text, uuid, text, text
) to authenticated;
