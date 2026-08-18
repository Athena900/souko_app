-- 試用版の複数利用者同期では、必要な業務表だけをRealtime publicationへ追加する。
-- realtimeスキーマ自体を変更せず、各表のRLSを受信可否の正本にする。
do $realtime$
declare
  v_table_name text;
begin
  foreach v_table_name in array array[
    'shipments',
    'field_work_records',
    'billing_candidates',
    'billing_candidate_reviews'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table_name);
    end if;
  end loop;
end;
$realtime$;

-- 既存の請求候補計算APIにも、競合検知に必要な更新日時を返す。
create or replace function public.persist_billing_candidate(
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
  with persisted as (
    select private.persist_billing_candidate($1, $2, $3, $4) as payload
  )
  select persisted.payload || jsonb_build_object('updatedAt', candidate.updated_at)
  from persisted
  join public.billing_candidates candidate
    on candidate.id = (persisted.payload ->> 'id')::uuid;
$function$;

-- 旧5引数版は、この時点では期待更新日時なしの確認を受け付けない。
-- 続く互換性マイグレーションで、旧5引数版も安全な6引数版へ接続する。
create or replace function private.review_billing_candidate(
  p_client_id text,
  p_site_id text,
  p_candidate_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
begin
  raise exception using
    errcode = 'P0005',
    message = '画面を更新して、最新の請求候補を確認してから保存してください';
end;
$function$;

-- expected_updated_at を楽観ロックとして使い、二人目の確認で上書きしない。
create function private.review_billing_candidate(
  p_client_id text,
  p_site_id text,
  p_candidate_id uuid,
  p_status text,
  p_note text,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_candidate public.billing_candidates%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_lines jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'ログインが必要です';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = '確認状態が不正です';
  end if;

  if p_expected_updated_at is null then
    raise exception using errcode = 'P0005', message = '最新の請求候補を読み込んでから保存してください';
  end if;

  if not exists (
    select 1
    from public.user_memberships m
    where m.user_id = v_user_id
      and m.active
      and m.client_id = p_client_id
      and m.site_id = p_site_id
      and m.role in ('office', 'manager', 'admin')
  ) then
    raise exception using errcode = '42501', message = '請求候補を確認する権限がありません';
  end if;

  select * into v_candidate
  from public.billing_candidates c
  where c.id = p_candidate_id
    and c.client_id = p_client_id
    and c.site_id = p_site_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = '請求候補が見つかりません';
  end if;

  if v_candidate.updated_at <> p_expected_updated_at then
    raise exception using
      errcode = 'P0005',
      message = '他の利用者が先に確認しました。最新の状態を表示します';
  end if;

  if v_candidate.status in ('approved', 'rejected') then
    raise exception using errcode = 'P0004', message = '確認済み・差し戻し済みの候補は再確認できません';
  end if;

  if p_status = 'rejected' and v_note is null then
    raise exception using errcode = 'P0004', message = '差し戻しには確認メモが必要です';
  end if;

  if v_note is not null and length(v_note) > 2000 then
    raise exception using errcode = '22023', message = '確認メモが長すぎます';
  end if;

  if p_status = 'approved' and jsonb_array_length(v_candidate.warnings) > 0 and v_note is null then
    raise exception using errcode = 'P0004', message = '警告がある候補には確認メモが必要です';
  end if;

  update public.billing_candidates
  set status = p_status,
      reviewed_by = v_user_id,
      reviewed_at = now(),
      review_note = v_note,
      updated_at = now()
  where id = v_candidate.id
    and updated_at = p_expected_updated_at
  returning * into v_candidate;

  if not found then
    raise exception using
      errcode = 'P0005',
      message = '他の利用者が先に確認しました。最新の状態を表示します';
  end if;

  insert into public.billing_candidate_reviews (
    candidate_id, client_id, site_id, status, note, reviewed_by
  ) values (
    v_candidate.id, p_client_id, p_site_id, p_status, v_note, v_user_id
  );

  insert into public.audit_events (
    client_id, site_id, actor_id, action, target_type, target_id, reason, metadata
  ) values (
    p_client_id, p_site_id, v_user_id, 'billing_candidate.reviewed', 'billing_candidate',
    v_candidate.id::text, null,
    jsonb_build_object('status', p_status, 'calculation_run_id', v_candidate.calculation_run_id)
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'sourceType', l.source_type,
      'sourceId', l.source_id::text,
      'workCode', l.work_code,
      'description', l.description,
      'quantity', l.quantity,
      'unitPriceYen', l.unit_price_yen,
      'subtotalYen', l.subtotal_yen,
      'taxYen', l.tax_yen,
      'totalYen', l.total_yen,
      'priceRuleId', l.price_rule_id::text,
      'priceRuleVersion', l.price_rule_version,
      'calculationRunId', l.calculation_run_id::text
    ) order by l.created_at, l.id
  ), '[]'::jsonb)
  into v_lines
  from public.billing_candidate_lines l
  where l.calculation_run_id = v_candidate.calculation_run_id;

  return jsonb_build_object(
    'id', v_candidate.id,
    'fieldWorkRecordId', v_candidate.field_work_record_id,
    'clientId', p_client_id,
    'siteId', p_site_id,
    'shipmentNo', v_candidate.shipment_no,
    'workDate', v_candidate.work_date,
    'calculation', jsonb_build_object(
      'calculationRunId', v_candidate.calculation_run_id,
      'lines', v_lines,
      'subtotalYen', v_candidate.subtotal_yen,
      'taxYen', v_candidate.tax_yen,
      'totalYen', v_candidate.total_yen,
      'warnings', v_candidate.warnings
    ),
    'status', p_status,
    'reviewNote', v_note,
    'reviewedAt', v_candidate.reviewed_at,
    'updatedAt', v_candidate.updated_at,
    'demo', false,
    'persisted', true
  );
end;
$function$;

create function public.review_billing_candidate(
  p_client_id text,
  p_site_id text,
  p_candidate_id uuid,
  p_status text,
  p_note text,
  p_expected_updated_at timestamptz
)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select private.review_billing_candidate($1, $2, $3, $4, $5, $6);
$function$;

revoke all on function private.review_billing_candidate(text, text, uuid, text, text, timestamptz) from public;
grant execute on function private.review_billing_candidate(text, text, uuid, text, text, timestamptz) to authenticated;
revoke all on function public.review_billing_candidate(text, text, uuid, text, text, timestamptz) from public, anon;
grant execute on function public.review_billing_candidate(text, text, uuid, text, text, timestamptz) to authenticated;
