-- 請求候補の本番永続化と確認履歴。
-- 金額はRoute Handlerから渡さず、このRPCが現場記録と承認済み単価から再計算する。

alter table public.calculation_runs
  drop constraint if exists calculation_runs_state_check;

alter table public.calculation_runs
  add constraint calculation_runs_state_check
  check (state in ('queued', 'processing', 'processed', 'current', 'superseded', 'failed'));

alter table public.billing_candidate_lines
  alter column unit_price_yen type bigint using unit_price_yen::bigint,
  alter column subtotal_yen type bigint using subtotal_yen::bigint,
  alter column tax_yen type bigint using tax_yen::bigint,
  alter column total_yen type bigint using total_yen::bigint;

create table if not exists public.billing_candidates (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  site_id text not null,
  field_work_record_id uuid not null references public.field_work_records(id) on delete restrict,
  calculation_run_id uuid not null references public.calculation_runs(id) on delete restrict,
  shipment_no text not null,
  work_date date not null,
  status text not null default 'ready'
    check (status in ('ready', 'review_required', 'approved', 'rejected')),
  subtotal_yen bigint not null check (subtotal_yen >= 0),
  tax_yen bigint not null check (tax_yen >= 0),
  total_yen bigint not null check (total_yen >= 0),
  check (total_yen = subtotal_yen + tax_yen),
  warnings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(warnings) = 'array'),
  calculation_fingerprint text not null
    check (calculation_fingerprint ~ '^[0-9a-f]{32}$'),
  created_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calculation_run_id)
);

create unique index if not exists billing_candidates_open_fingerprint_idx
  on public.billing_candidates (client_id, site_id, field_work_record_id, calculation_fingerprint)
  where status in ('ready', 'review_required');

create index if not exists billing_candidates_scope_created_idx
  on public.billing_candidates (client_id, site_id, created_at desc);

create index if not exists billing_candidates_field_work_idx
  on public.billing_candidates (field_work_record_id, created_at desc);

create index if not exists billing_candidates_created_by_idx
  on public.billing_candidates (created_by);

create index if not exists billing_candidates_reviewed_by_idx
  on public.billing_candidates (reviewed_by);

create table if not exists public.billing_candidate_reviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.billing_candidates(id) on delete restrict,
  client_id text not null,
  site_id text not null,
  status text not null check (status in ('approved', 'rejected')),
  note text,
  reviewed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists billing_candidate_reviews_candidate_idx
  on public.billing_candidate_reviews (candidate_id, created_at desc);

create index if not exists billing_candidate_reviews_reviewed_by_idx
  on public.billing_candidate_reviews (reviewed_by);

alter table public.billing_candidates enable row level security;
alter table public.billing_candidate_reviews enable row level security;

create policy "office users can read billing candidates"
  on public.billing_candidates for select
  to authenticated
  using (exists (
    select 1
    from public.user_memberships m
    where m.user_id = (select auth.uid())
      and m.active
      and m.client_id = billing_candidates.client_id
      and m.site_id = billing_candidates.site_id
      and m.role in ('office', 'manager', 'admin')
  ));

create policy "office users can read billing candidate reviews"
  on public.billing_candidate_reviews for select
  to authenticated
  using (exists (
    select 1
    from public.user_memberships m
    where m.user_id = (select auth.uid())
      and m.active
      and m.client_id = billing_candidate_reviews.client_id
      and m.site_id = billing_candidate_reviews.site_id
      and m.role in ('office', 'manager', 'admin')
  ));

-- 候補・明細・確認履歴は直接INSERTさせず、下記RPCで現場記録/単価/所属を再確認する。
revoke all on public.billing_candidates from anon, authenticated;
revoke all on public.billing_candidate_reviews from anon, authenticated;
revoke all on public.billing_candidate_lines from anon, authenticated;
revoke all on public.calculation_runs from anon, authenticated;
grant select on public.calculation_runs, public.billing_candidate_lines to authenticated;
grant select on public.billing_candidates, public.billing_candidate_reviews to authenticated;

create or replace function public.persist_billing_candidate(
  p_client_id text,
  p_site_id text,
  p_field_work_record_id uuid,
  p_force_recalculate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_field public.field_work_records%rowtype;
  v_rule public.price_rules%rowtype;
  v_material jsonb;
  v_work jsonb;
  v_rules_snapshot jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_candidate_id uuid;
  v_run_id uuid;
  v_fingerprint text;
  v_status text;
  v_subtotal bigint := 0;
  v_tax bigint := 0;
  v_quantity integer;
  v_quantity_text text;
  v_line_subtotal bigint;
  v_line_tax bigint;
  v_line_total bigint;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'ログインが必要です';
  end if;

  if nullif(trim(p_client_id), '') is null or nullif(trim(p_site_id), '') is null then
    raise exception using errcode = '22023', message = '荷主・拠点が必要です';
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

  select * into v_field
  from public.field_work_records f
  where f.id = p_field_work_record_id
    and f.client_id = p_client_id
    and f.site_id = p_site_id
    and f.status in ('submitted', 'review_required', 'accepted');

  if not found then
    raise exception using errcode = 'P0002', message = '対象の現場記録が見つかりません';
  end if;

  if v_field.pack_count > 1000000
     or jsonb_typeof(v_field.material_lines) is distinct from 'array'
     or jsonb_typeof(v_field.additional_work_lines) is distinct from 'array'
     or (case when jsonb_typeof(v_field.material_lines) = 'array' then jsonb_array_length(v_field.material_lines) else 0 end) > 100
     or (case when jsonb_typeof(v_field.additional_work_lines) = 'array' then jsonb_array_length(v_field.additional_work_lines) else 0 end) > 100 then
    raise exception using errcode = '22023', message = '現場記録の明細数または数量が上限を超えています';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id::text,
      'version', r.version,
      'workCode', r.work_code,
      'kind', r.kind,
      'materialCode', r.material_code,
      'unitPriceYen', r.unit_price_yen,
      'taxRateBps', r.tax_rate_bps,
      'effectiveFrom', r.effective_from,
      'effectiveTo', r.effective_to,
      'priority', r.priority
    ) order by r.priority desc, r.id::text
  ), '[]'::jsonb)
  into v_rules_snapshot
  from public.price_rules r
  where r.client_id = p_client_id
    and r.site_id = p_site_id
    and r.approved_by is not null
    and r.effective_from <= v_field.work_date
    and (r.effective_to is null or r.effective_to >= v_field.work_date);

  if jsonb_array_length(v_rules_snapshot) = 0 then
    raise exception using errcode = 'P0003', message = '承認済み単価がありません';
  end if;

  select md5(
    v_field.id::text || ':' || v_field.revision::text || ':' || v_field.work_date::text || ':' || v_rules_snapshot::text
  ) into v_fingerprint;

  -- 同じ現場記録への二重送信を直列化し、部分ユニーク索引の競合をアプリの503にしない。
  perform pg_advisory_xact_lock(hashtextextended(p_client_id || ':' || p_site_id || ':' || v_field.id::text, 0));

  select c.id, c.calculation_run_id, c.status
  into v_candidate_id, v_run_id, v_status
  from public.billing_candidates c
  where c.client_id = p_client_id
    and c.site_id = p_site_id
    and c.field_work_record_id = v_field.id
    and c.calculation_fingerprint = v_fingerprint
  order by c.created_at desc
  limit 1;

  if found and (not p_force_recalculate or v_status in ('ready', 'review_required')) then
    -- 同じ入力の再送は同じ候補を返す。確定後だけ再計算で新しい世代を作る。
  else
    v_candidate_id := gen_random_uuid();
    v_run_id := gen_random_uuid();

    insert into public.calculation_runs (
      id, client_id, site_id, period_start, period_end, state, input_snapshot, created_by, finished_at
    ) values (
      v_run_id,
      p_client_id,
      p_site_id,
      v_field.work_date,
      v_field.work_date,
      'processed',
      jsonb_build_object(
        'field_work_record_id', v_field.id,
        'field_work_revision', v_field.revision,
        'price_rules', v_rules_snapshot,
        'calculation_fingerprint', v_fingerprint
      ),
      v_user_id,
      now()
    );

    select * into v_rule
    from public.price_rules r
    where r.client_id = p_client_id
      and r.site_id = p_site_id
      and r.approved_by is not null
      and r.kind = 'shipment'
      and r.work_code = 'shipment_handling'
      and r.effective_from <= v_field.work_date
      and (r.effective_to is null or r.effective_to >= v_field.work_date)
    order by r.priority desc, r.id::text
    limit 1;

    if found then
      v_quantity := 1;
      v_line_subtotal := v_rule.unit_price_yen::bigint * v_quantity;
      v_line_tax := floor((v_line_subtotal::numeric * v_rule.tax_rate_bps + 5000) / 10000)::bigint;
      v_line_total := v_line_subtotal + v_line_tax;
      insert into public.billing_candidate_lines (
        calculation_run_id, source_type, source_id, work_code, description, quantity,
        unit_price_yen, subtotal_yen, tax_yen, total_yen, price_rule_id, price_rule_version
      ) values (
        v_run_id, 'field_work', v_field.id, v_rule.work_code, '出荷基本作業', v_quantity,
        v_rule.unit_price_yen, v_line_subtotal, v_line_tax, v_line_total, v_rule.id, v_rule.version
      );
      v_subtotal := v_subtotal + v_line_subtotal;
      v_tax := v_tax + v_line_tax;
    else
      v_warnings := v_warnings || jsonb_build_array('出荷基本作業の有効な単価がありません');
    end if;

    if v_field.pack_count > 0 then
      select * into v_rule
      from public.price_rules r
      where r.client_id = p_client_id
        and r.site_id = p_site_id
        and r.approved_by is not null
        and r.kind = 'pack'
        and r.work_code = 'pack_count'
        and r.effective_from <= v_field.work_date
        and (r.effective_to is null or r.effective_to >= v_field.work_date)
      order by r.priority desc, r.id::text
      limit 1;

      if found then
        v_quantity := v_field.pack_count;
        v_line_subtotal := v_rule.unit_price_yen::bigint * v_quantity;
        v_line_tax := floor((v_line_subtotal::numeric * v_rule.tax_rate_bps + 5000) / 10000)::bigint;
        v_line_total := v_line_subtotal + v_line_tax;
        insert into public.billing_candidate_lines (
          calculation_run_id, source_type, source_id, work_code, description, quantity,
          unit_price_yen, subtotal_yen, tax_yen, total_yen, price_rule_id, price_rule_version
        ) values (
          v_run_id, 'field_work', v_field.id, v_rule.work_code, '梱包箱数', v_quantity,
          v_rule.unit_price_yen, v_line_subtotal, v_line_tax, v_line_total, v_rule.id, v_rule.version
        );
        v_subtotal := v_subtotal + v_line_subtotal;
        v_tax := v_tax + v_line_tax;
      else
        v_warnings := v_warnings || jsonb_build_array('梱包数の有効な単価がありません');
      end if;
    end if;

    for v_material in select value from jsonb_array_elements(coalesce(v_field.material_lines, '[]'::jsonb)) loop
      v_quantity_text := v_material->>'quantity';
      if jsonb_typeof(v_material) is distinct from 'object'
         or nullif(trim(v_material->>'code'), '') is null
         or nullif(trim(v_material->>'name'), '') is null
         or nullif(v_quantity_text, '') is null
         or v_quantity_text !~ '^[0-9]+$'
         or (case when v_quantity_text ~ '^[0-9]+$' then v_quantity_text::bigint else 0 end) > 1000000 then
        raise exception using errcode = '22023', message = '資材明細の値が不正です';
      end if;
      v_quantity := v_quantity_text::integer;
      if v_quantity = 0 then
        continue;
      end if;

      select * into v_rule
      from public.price_rules r
      where r.client_id = p_client_id
        and r.site_id = p_site_id
        and r.approved_by is not null
        and r.kind = 'material'
        and r.material_code = v_material->>'code'
        and r.effective_from <= v_field.work_date
        and (r.effective_to is null or r.effective_to >= v_field.work_date)
      order by r.priority desc, r.id::text
      limit 1;

      if found then
        v_line_subtotal := v_rule.unit_price_yen::bigint * v_quantity;
        v_line_tax := floor((v_line_subtotal::numeric * v_rule.tax_rate_bps + 5000) / 10000)::bigint;
        v_line_total := v_line_subtotal + v_line_tax;
        insert into public.billing_candidate_lines (
          calculation_run_id, source_type, source_id, work_code, description, quantity,
          unit_price_yen, subtotal_yen, tax_yen, total_yen, price_rule_id, price_rule_version
        ) values (
          v_run_id, 'field_work', v_field.id, v_rule.work_code, v_material->>'name', v_quantity,
          v_rule.unit_price_yen, v_line_subtotal, v_line_tax, v_line_total, v_rule.id, v_rule.version
        );
        v_subtotal := v_subtotal + v_line_subtotal;
        v_tax := v_tax + v_line_tax;
      else
        v_warnings := v_warnings || jsonb_build_array(format('資材「%s」の有効な単価がありません', v_material->>'code'));
      end if;
    end loop;

    for v_work in select value from jsonb_array_elements(coalesce(v_field.additional_work_lines, '[]'::jsonb)) loop
      v_quantity_text := v_work->>'quantity';
      if jsonb_typeof(v_work) is distinct from 'object'
         or nullif(trim(v_work->>'code'), '') is null
         or nullif(trim(v_work->>'name'), '') is null
         or nullif(v_quantity_text, '') is null
         or v_quantity_text !~ '^[0-9]+$'
         or (case when v_quantity_text ~ '^[0-9]+$' then v_quantity_text::bigint else 0 end) > 1000000 then
        raise exception using errcode = '22023', message = '追加作業明細の値が不正です';
      end if;
      v_quantity := v_quantity_text::integer;
      if v_quantity = 0 then
        continue;
      end if;

      select * into v_rule
      from public.price_rules r
      where r.client_id = p_client_id
        and r.site_id = p_site_id
        and r.approved_by is not null
        and r.kind = 'additional_work'
        and r.work_code = v_work->>'code'
        and r.effective_from <= v_field.work_date
        and (r.effective_to is null or r.effective_to >= v_field.work_date)
      order by r.priority desc, r.id::text
      limit 1;

      if found then
        v_line_subtotal := v_rule.unit_price_yen::bigint * v_quantity;
        v_line_tax := floor((v_line_subtotal::numeric * v_rule.tax_rate_bps + 5000) / 10000)::bigint;
        v_line_total := v_line_subtotal + v_line_tax;
        insert into public.billing_candidate_lines (
          calculation_run_id, source_type, source_id, work_code, description, quantity,
          unit_price_yen, subtotal_yen, tax_yen, total_yen, price_rule_id, price_rule_version
        ) values (
          v_run_id, 'field_work', v_field.id, v_rule.work_code, v_work->>'name', v_quantity,
          v_rule.unit_price_yen, v_line_subtotal, v_line_tax, v_line_total, v_rule.id, v_rule.version
        );
        v_subtotal := v_subtotal + v_line_subtotal;
        v_tax := v_tax + v_line_tax;
      else
        v_warnings := v_warnings || jsonb_build_array(format('追加作業「%s」の有効な単価がありません', v_work->>'code'));
      end if;
    end loop;

    v_status := case when jsonb_array_length(v_warnings) = 0 then 'ready' else 'review_required' end;

    insert into public.billing_candidates (
      id, client_id, site_id, field_work_record_id, calculation_run_id,
      shipment_no, work_date, status, subtotal_yen, tax_yen, total_yen,
      warnings, calculation_fingerprint, created_by
    ) values (
      v_candidate_id, p_client_id, p_site_id, v_field.id, v_run_id,
      v_field.shipment_no, v_field.work_date, v_status, v_subtotal, v_tax,
      v_subtotal + v_tax, v_warnings, v_fingerprint, v_user_id
    );

    insert into public.audit_events (
      client_id, site_id, actor_id, action, target_type, target_id, metadata
    ) values (
      p_client_id, p_site_id, v_user_id, 'billing_candidate.created', 'billing_candidate',
      v_candidate_id::text,
      jsonb_build_object('field_work_record_id', v_field.id, 'calculation_run_id', v_run_id, 'status', v_status)
    );
  end if;

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
  where l.calculation_run_id = v_run_id;

  select c.status, c.subtotal_yen, c.tax_yen, c.total_yen, c.warnings
  into v_status, v_subtotal, v_tax, v_line_total, v_warnings
  from public.billing_candidates c
  where c.id = v_candidate_id
    and c.client_id = p_client_id
    and c.site_id = p_site_id;

  return jsonb_build_object(
    'id', v_candidate_id,
    'fieldWorkRecordId', v_field.id,
    'clientId', p_client_id,
    'siteId', p_site_id,
    'shipmentNo', v_field.shipment_no,
    'workDate', v_field.work_date,
    'calculation', jsonb_build_object(
      'calculationRunId', v_run_id,
      'lines', v_lines,
      'subtotalYen', v_subtotal,
      'taxYen', v_tax,
      'totalYen', v_line_total,
      'warnings', v_warnings
    ),
    'status', v_status,
    'demo', false,
    'persisted', true
  );
end;
$$;

create or replace function public.review_billing_candidate(
  p_client_id text,
  p_site_id text,
  p_candidate_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  returning * into v_candidate;

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
    'demo', false,
    'persisted', true
  );
end;
$$;

revoke all on function public.persist_billing_candidate(text, text, uuid, boolean) from public;
grant execute on function public.persist_billing_candidate(text, text, uuid, boolean) to authenticated;
revoke all on function public.review_billing_candidate(text, text, uuid, text, text) from public;
grant execute on function public.review_billing_candidate(text, text, uuid, text, text) to authenticated;
