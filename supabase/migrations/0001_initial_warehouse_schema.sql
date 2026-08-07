-- CSロジネット M1/M2 初期スキーマ
-- 正式請求書、会計連携、送り状連携は後続モジュールで追加する。

create extension if not exists pgmq;

create table if not exists public.user_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  site_id text not null,
  role text not null check (role in ('field', 'office', 'manager', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, client_id, site_id)
);

create table if not exists public.source_file_versions (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  site_id text not null,
  data_type text not null check (data_type in ('order', 'shipment', 'work', 'billing', 'master')),
  original_name text not null,
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  state text not null default 'uploading' check (state in ('uploading', 'quarantined', 'scanned', 'registered', 'queued', 'processing', 'processed', 'failed', 'rejected', 'active', 'superseded', 'cancelled')),
  row_count integer check (row_count is null or row_count >= 0),
  fatal_error_count integer not null default 0 check (fatal_error_count >= 0),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (client_id, site_id, data_type, sha256)
);

create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  source_file_version_id uuid not null references public.source_file_versions(id),
  mapping_version text not null,
  state text not null default 'queued' check (state in ('queued', 'processing', 'processed', 'failed', 'cancelled')),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  exception_count integer not null default 0 check (exception_count >= 0),
  control_total jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  site_id text not null,
  shipment_no text not null,
  work_date date not null,
  pack_count integer not null default 0 check (pack_count >= 0),
  source_file_version_id uuid not null references public.source_file_versions(id),
  import_run_id uuid not null references public.import_runs(id),
  status text not null default 'ready' check (status in ('ready', 'exception', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, site_id, shipment_no)
);

create table if not exists public.price_rules (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  site_id text not null,
  version integer not null check (version > 0),
  work_code text not null,
  kind text not null check (kind in ('shipment', 'pack', 'material', 'additional_work')),
  material_code text,
  unit_price_yen integer not null check (unit_price_yen >= 0),
  tax_rate_bps integer not null check (tax_rate_bps between 0 and 10000),
  effective_from date not null,
  effective_to date,
  priority integer not null default 0 check (priority >= 0),
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  check (kind <> 'material' or material_code is not null),
  unique (client_id, site_id, work_code, version)
);

create table if not exists public.field_work_records (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  site_id text not null,
  shipment_no text not null,
  shipment_id uuid not null references public.shipments(id),
  work_date date not null,
  entered_by uuid not null references auth.users(id),
  idempotency_key text not null unique,
  pack_count integer not null default 0 check (pack_count >= 0),
  material_lines jsonb not null default '[]'::jsonb,
  additional_work_lines jsonb not null default '[]'::jsonb,
  box_details jsonb not null default '[]'::jsonb,
  exception_reason text,
  notes text,
  photo_paths jsonb not null default '[]'::jsonb,
  recorded_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  supersedes_id uuid references public.field_work_records(id),
  status text not null default 'submitted' check (status in ('draft', 'submitted', 'review_required', 'accepted', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists field_work_records_shipment_idx
  on public.field_work_records (client_id, site_id, shipment_no, work_date);

create index if not exists field_work_records_shipment_id_idx
  on public.field_work_records (shipment_id);

create table if not exists public.calculation_runs (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  site_id text not null,
  period_start date not null,
  period_end date not null,
  state text not null default 'queued' check (state in ('queued', 'processing', 'current', 'superseded', 'failed')),
  input_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check (period_end >= period_start)
);

create unique index if not exists one_current_calculation_per_period
  on public.calculation_runs (client_id, site_id, period_start, period_end)
  where state = 'current';

create index if not exists import_runs_source_file_version_idx
  on public.import_runs (source_file_version_id);

create table if not exists public.billing_candidate_lines (
  id uuid primary key default gen_random_uuid(),
  calculation_run_id uuid not null references public.calculation_runs(id),
  source_type text not null check (source_type in ('shipment', 'field_work')),
  source_id uuid not null,
  work_code text not null,
  description text not null,
  quantity integer not null check (quantity >= 0),
  unit_price_yen integer not null check (unit_price_yen >= 0),
  subtotal_yen integer not null check (subtotal_yen >= 0),
  tax_yen integer not null check (tax_yen >= 0),
  total_yen integer not null check (total_yen >= 0),
  price_rule_id uuid not null references public.price_rules(id),
  price_rule_version integer not null check (price_rule_version > 0),
  created_at timestamptz not null default now(),
  unique (calculation_run_id, source_type, source_id, work_code, price_rule_id, price_rule_version)
);

create index if not exists billing_candidate_lines_calculation_run_idx
  on public.billing_candidate_lines (calculation_run_id);

create table if not exists public.outbox_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('source_scan', 'import', 'recalculate', 'excel_export')),
  aggregate_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  state text not null default 'pending' check (state in ('pending', 'enqueued', 'processing', 'completed', 'failed', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists outbox_jobs_ready_idx
  on public.outbox_jobs (state, available_at);

create index if not exists source_file_versions_scope_state_idx
  on public.source_file_versions (client_id, site_id, state, created_at desc);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  site_id text not null,
  actor_id uuid references auth.users(id),
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id text,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_scope_created_idx
  on public.audit_events (client_id, site_id, created_at desc);

-- 外部キーの削除・結合・監査検索が全件走査にならないよう、参照列にも索引を置く。
create index if not exists source_file_versions_uploaded_by_idx
  on public.source_file_versions (uploaded_by);

create index if not exists import_runs_created_by_idx
  on public.import_runs (created_by);

create index if not exists shipments_source_file_version_idx
  on public.shipments (source_file_version_id);

create index if not exists shipments_import_run_idx
  on public.shipments (import_run_id);

create index if not exists price_rules_approved_by_idx
  on public.price_rules (approved_by);

create index if not exists field_work_records_entered_by_idx
  on public.field_work_records (entered_by);

create index if not exists field_work_records_supersedes_idx
  on public.field_work_records (supersedes_id);

create index if not exists calculation_runs_created_by_idx
  on public.calculation_runs (created_by);

create index if not exists billing_candidate_lines_price_rule_idx
  on public.billing_candidate_lines (price_rule_id);

create index if not exists audit_events_actor_idx
  on public.audit_events (actor_id);

alter table public.user_memberships enable row level security;
alter table public.source_file_versions enable row level security;
alter table public.import_runs enable row level security;
alter table public.shipments enable row level security;
alter table public.price_rules enable row level security;
alter table public.field_work_records enable row level security;
alter table public.calculation_runs enable row level security;
alter table public.billing_candidate_lines enable row level security;
alter table public.outbox_jobs enable row level security;
alter table public.audit_events enable row level security;

create policy "memberships are visible to the member"
  on public.user_memberships for select
  to authenticated
  using ((select auth.uid()) = user_id and active);

create policy "office users can read source versions"
  on public.source_file_versions for select
  to authenticated
  using (exists (
    select 1 from public.user_memberships m
    where m.user_id = (select auth.uid())
      and m.active
      and m.client_id = source_file_versions.client_id
      and m.site_id = source_file_versions.site_id
      and m.role in ('office', 'manager', 'admin')
  ));

create policy "office users can create source versions"
  on public.source_file_versions for insert
  to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and exists (
      select 1 from public.user_memberships m
      where m.user_id = (select auth.uid())
        and m.active
        and m.client_id = source_file_versions.client_id
        and m.site_id = source_file_versions.site_id
        and m.role in ('office', 'manager', 'admin')
    )
  );

create policy "members can read shipments"
  on public.shipments for select
  to authenticated
  using (exists (
    select 1 from public.user_memberships m
    where m.user_id = (select auth.uid())
      and m.active
      and m.client_id = shipments.client_id
      and m.site_id = shipments.site_id
  ));

create policy "office users can read price rules"
  on public.price_rules for select
  to authenticated
  using (exists (
    select 1 from public.user_memberships m
    where m.user_id = (select auth.uid())
      and m.active
      and m.client_id = price_rules.client_id
      and m.site_id = price_rules.site_id
      and m.role in ('office', 'manager', 'admin')
  ));

create policy "members can read their field records"
  on public.field_work_records for select
  to authenticated
  using (
    exists (
      select 1 from public.user_memberships m
      where m.user_id = (select auth.uid())
        and m.active
        and m.client_id = field_work_records.client_id
        and m.site_id = field_work_records.site_id
        and (
          entered_by = (select auth.uid())
          or m.role in ('office', 'manager', 'admin')
        )
    )
  );

create policy "members can submit field records"
  on public.field_work_records for insert
  to authenticated
  with check (
    entered_by = (select auth.uid())
    and exists (
    select 1 from public.user_memberships m
    where m.user_id = (select auth.uid())
      and m.active
      and m.client_id = field_work_records.client_id
      and m.site_id = field_work_records.site_id
      and exists (
        select 1 from public.shipments s
        where s.id = field_work_records.shipment_id
          and s.client_id = field_work_records.client_id
          and s.site_id = field_work_records.site_id
          and s.shipment_no = field_work_records.shipment_no
      )
    )
  );

-- 現場記録は追記専用。状態変更は将来の承認用RPCで、変更可能な列を限定して追加する。

create policy "office users can read calculation runs"
  on public.calculation_runs for select
  to authenticated
  using (exists (
    select 1 from public.user_memberships m
    where m.user_id = (select auth.uid())
      and m.active
      and m.client_id = calculation_runs.client_id
      and m.site_id = calculation_runs.site_id
      and m.role in ('office', 'manager', 'admin')
  ));

create policy "office users can read billing candidates"
  on public.billing_candidate_lines for select
  to authenticated
  using (exists (
    select 1
    from public.calculation_runs r
    join public.user_memberships m on m.client_id = r.client_id and m.site_id = r.site_id and m.active
    where r.id = billing_candidate_lines.calculation_run_id
      and m.user_id = (select auth.uid())
      and m.role in ('office', 'manager', 'admin')
  ));

create policy "managers can read audit events"
  on public.audit_events for select
  to authenticated
  using (exists (
    select 1 from public.user_memberships m
    where m.user_id = (select auth.uid())
      and m.active
      and m.role in ('manager', 'admin')
      and m.client_id = audit_events.client_id
      and m.site_id = audit_events.site_id
  ));

create policy "outbox jobs are never exposed to clients"
  on public.outbox_jobs for all
  to authenticated
  using (false)
  with check (false);

create policy "office users can read import runs"
  on public.import_runs for select
  to authenticated
  using (exists (
    select 1
    from public.source_file_versions s
    join public.user_memberships m on m.client_id = s.client_id and m.site_id = s.site_id and m.active
    where s.id = import_runs.source_file_version_id
      and m.user_id = (select auth.uid())
      and m.role in ('office', 'manager', 'admin')
  ));

-- 新規プロジェクトではData APIへの公開が自動で有効にならないため、必要な表だけ明示する。
grant select on public.user_memberships, public.shipments, public.price_rules, public.field_work_records to authenticated;
grant insert on public.field_work_records to authenticated;

-- ワーカーはサーバー側の専用接続で outbox_jobs を処理する。
-- ブラウザからキュー表を直接公開しない。
select pgmq.create('warehouse-imports')
where not exists (
  select 1 from pgmq.list_queues() where queue_name = 'warehouse-imports'
);
