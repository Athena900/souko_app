-- M1: Excel確認後の登録に必要な商品明細・取込行・Storage権限を追加する。
-- 登録処理は public.register_warehouse_import() 内で1トランザクションとして実行する。

create table if not exists public.shipment_lines (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  site_id text not null,
  shipment_id uuid not null references public.shipments(id) on delete restrict,
  line_no text not null,
  product_id text not null,
  product_name text not null,
  quantity integer not null check (quantity >= 0),
  source_row_number integer not null check (source_row_number >= 1),
  created_at timestamptz not null default now(),
  unique (shipment_id, source_row_number)
);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references public.import_runs(id) on delete cascade,
  source_row_number integer not null check (source_row_number >= 1),
  shipment_no text,
  status text not null check (status in ('accepted', 'warning', 'invalid', 'duplicate')),
  raw_data jsonb not null default '{}'::jsonb,
  normalized_data jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (import_run_id, source_row_number)
);

create index if not exists shipment_lines_scope_shipment_idx
  on public.shipment_lines (client_id, site_id, shipment_id);

create index if not exists shipment_lines_product_idx
  on public.shipment_lines (client_id, site_id, product_id);

create index if not exists import_rows_import_run_row_idx
  on public.import_rows (import_run_id, source_row_number);

alter table public.shipment_lines enable row level security;
alter table public.import_rows enable row level security;

create policy "members can read shipment lines"
  on public.shipment_lines for select
  to authenticated
  using (exists (
    select 1 from public.user_memberships m
    where m.user_id = (select auth.uid())
      and m.active
      and m.client_id = shipment_lines.client_id
      and m.site_id = shipment_lines.site_id
  ));

create policy "office users can insert shipment lines"
  on public.shipment_lines for insert
  to authenticated
  with check (exists (
    select 1 from public.user_memberships m
    where m.user_id = (select auth.uid())
      and m.active
      and m.client_id = shipment_lines.client_id
      and m.site_id = shipment_lines.site_id
      and m.role in ('office', 'manager', 'admin')
  ) and exists (
    select 1 from public.shipments s
    where s.id = shipment_lines.shipment_id
      and s.client_id = shipment_lines.client_id
      and s.site_id = shipment_lines.site_id
  ));

create policy "office users can read import rows"
  on public.import_rows for select
  to authenticated
  using (exists (
    select 1
    from public.import_runs r
    join public.source_file_versions s on s.id = r.source_file_version_id
    join public.user_memberships m on m.client_id = s.client_id and m.site_id = s.site_id and m.active
    where r.id = import_rows.import_run_id
      and m.user_id = (select auth.uid())
      and m.role in ('office', 'manager', 'admin')
  ));

create policy "office users can insert import rows"
  on public.import_rows for insert
  to authenticated
  with check (exists (
    select 1
    from public.import_runs r
    join public.source_file_versions s on s.id = r.source_file_version_id
    join public.user_memberships m on m.client_id = s.client_id and m.site_id = s.site_id and m.active
    where r.id = import_rows.import_run_id
      and m.user_id = (select auth.uid())
      and m.role in ('office', 'manager', 'admin')
  ));

create policy "office users can insert import runs"
  on public.import_runs for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.source_file_versions s
      join public.user_memberships m on m.client_id = s.client_id and m.site_id = s.site_id and m.active
      where s.id = import_runs.source_file_version_id
        and m.user_id = (select auth.uid())
        and m.role in ('office', 'manager', 'admin')
    )
  );

create policy "office users can update source versions"
  on public.source_file_versions for update
  to authenticated
  using (
    uploaded_by = (select auth.uid())
    and exists (
      select 1 from public.user_memberships m
      where m.user_id = (select auth.uid())
        and m.active
        and m.client_id = source_file_versions.client_id
        and m.site_id = source_file_versions.site_id
        and m.role in ('office', 'manager', 'admin')
    )
  )
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

create policy "office users can update import runs"
  on public.import_runs for update
  to authenticated
  using (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.source_file_versions s
      join public.user_memberships m on m.client_id = s.client_id and m.site_id = s.site_id and m.active
      where s.id = import_runs.source_file_version_id
        and m.user_id = (select auth.uid())
        and m.role in ('office', 'manager', 'admin')
    )
  )
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.source_file_versions s
      join public.user_memberships m on m.client_id = s.client_id and m.site_id = s.site_id and m.active
      where s.id = import_runs.source_file_version_id
        and m.user_id = (select auth.uid())
        and m.role in ('office', 'manager', 'admin')
    )
  );

create policy "office users can insert shipments"
  on public.shipments for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_memberships m
      where m.user_id = (select auth.uid())
        and m.active
        and m.client_id = shipments.client_id
        and m.site_id = shipments.site_id
        and m.role in ('office', 'manager', 'admin')
    )
    and exists (
      select 1 from public.source_file_versions s
      where s.id = shipments.source_file_version_id
        and s.client_id = shipments.client_id
        and s.site_id = shipments.site_id
    )
    and exists (
      select 1 from public.import_runs r
      where r.id = shipments.import_run_id
        and r.source_file_version_id = shipments.source_file_version_id
    )
  );

create policy "office users can insert audit events"
  on public.audit_events for insert
  to authenticated
  with check (
    actor_id = (select auth.uid())
    and exists (
      select 1 from public.user_memberships m
      where m.user_id = (select auth.uid())
        and m.active
        and m.client_id = audit_events.client_id
        and m.site_id = audit_events.site_id
        and m.role in ('office', 'manager', 'admin')
    )
  );

grant select on public.source_file_versions to authenticated;
grant select on public.import_runs to authenticated;
grant select on public.shipments to authenticated;
grant select on public.shipment_lines to authenticated;
grant select on public.import_rows to authenticated;
grant select on public.audit_events to authenticated;
revoke insert, update on public.source_file_versions from authenticated;
revoke insert, update on public.import_runs from authenticated;
revoke insert on public.shipments from authenticated;
revoke insert on public.shipment_lines from authenticated;
revoke insert on public.import_rows from authenticated;
revoke insert on public.audit_events from authenticated;

-- 原本は非公開バケットに保存する。Storage APIのアップロードはINSERT後に
-- メタデータを返すため、同じ条件のSELECTポリシーも必須にする。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'warehouse-source-files',
  'warehouse-source-files',
  false,
  10485760,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "warehouse source objects can be inserted" on storage.objects;
create policy "warehouse source objects can be inserted"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'warehouse-source-files'
    and exists (
      select 1 from public.user_memberships m
      where m.user_id = (select auth.uid())
        and m.active
        and m.role in ('office', 'manager', 'admin')
        and m.client_id = split_part(name, '/', 1)
        and m.site_id = split_part(name, '/', 2)
    )
  );

drop policy if exists "warehouse source objects can be read" on storage.objects;
create policy "warehouse source objects can be read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'warehouse-source-files'
    and exists (
      select 1 from public.user_memberships m
      where m.user_id = (select auth.uid())
        and m.active
        and m.role in ('office', 'manager', 'admin')
        and m.client_id = split_part(name, '/', 1)
        and m.site_id = split_part(name, '/', 2)
    )
  );

drop policy if exists "warehouse source objects can be deleted" on storage.objects;
create policy "warehouse source objects can be deleted"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'warehouse-source-files'
    and owner_id = (select auth.uid())::text
    and exists (
      select 1 from public.user_memberships m
      where m.user_id = (select auth.uid())
        and m.active
        and m.role in ('office', 'manager', 'admin')
        and m.client_id = split_part(name, '/', 1)
        and m.site_id = split_part(name, '/', 2)
    )
  );

create or replace function public.register_warehouse_import(
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
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_import_run_id uuid := gen_random_uuid();
  v_shipment jsonb;
  v_line jsonb;
  v_source_row_number integer;
  v_shipment_id uuid;
  v_shipment_count integer := 0;
  v_detail_count integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'ログインが必要です';
  end if;

  if nullif(trim(p_client_id), '') is null or nullif(trim(p_site_id), '') is null then
    raise exception using errcode = '22023', message = '荷主・拠点が必要です';
  end if;

  if p_data_type is distinct from 'shipment' then
    raise exception using errcode = '22023', message = '対応していないデータ種別です';
  end if;

  if p_source_file_version_id is null or nullif(trim(p_mapping_version), '') is null then
    raise exception using errcode = '22023', message = '原本版ID・取込方式が必要です';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception using errcode = '22023', message = '登録する出荷データがありません';
  end if;

  if jsonb_array_length(p_rows) > 10000 then
    raise exception using errcode = '22023', message = '一度に登録できる出荷件数を超えています';
  end if;

  if p_original_name is null or lower(p_original_name) not like '%.xlsx' then
    raise exception using errcode = '22023', message = 'xlsx形式の原本名が必要です';
  end if;

  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = '原本ハッシュの形式が不正です';
  end if;

  if p_storage_path is null
     or array_length(string_to_array(p_storage_path, '/'), 1) <> 4
     or split_part(p_storage_path, '/', 1) <> p_client_id
     or split_part(p_storage_path, '/', 2) <> p_site_id
     or split_part(p_storage_path, '/', 3) <> p_source_file_version_id::text
     or split_part(p_storage_path, '/', 4) = ''
     or p_storage_path like '%..%' then
    raise exception using errcode = '22023', message = '原本保存先の形式が不正です';
  end if;

  if not exists (
    select 1 from public.user_memberships m
    where m.user_id = v_user_id
      and m.active
      and m.client_id = p_client_id
      and m.site_id = p_site_id
      and m.role in ('office', 'manager', 'admin')
  ) then
    raise exception using errcode = '42501', message = 'この荷主・拠点への取込権限がありません';
  end if;

  if exists (
    select 1 from public.source_file_versions s
    where s.client_id = p_client_id
      and s.site_id = p_site_id
      and s.data_type = p_data_type
      and s.sha256 = p_sha256
  ) then
    raise exception using errcode = '23505', message = '同じExcelはすでに登録されています';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'warehouse-source-files'
      and o.name = p_storage_path
      and o.owner_id = v_user_id::text
      and o.metadata->>'sha256' = p_sha256
  ) then
    raise exception using errcode = '22023', message = 'アップロード済みの原本が見つかりません';
  end if;

  insert into public.source_file_versions (
    id, client_id, site_id, data_type, original_name, storage_path, sha256,
    state, uploaded_by
  ) values (
    p_source_file_version_id, p_client_id, p_site_id, p_data_type,
    p_original_name, p_storage_path, p_sha256, 'registered', v_user_id
  );

  insert into public.import_runs (
    id, source_file_version_id, mapping_version, state, created_by
  ) values (
    v_import_run_id, p_source_file_version_id, p_mapping_version, 'processing', v_user_id
  );

  for v_shipment in select value from jsonb_array_elements(p_rows) loop
    if v_shipment->>'clientId' is distinct from p_client_id
       or v_shipment->>'siteId' is distinct from p_site_id
       or nullif(trim(v_shipment->>'shipmentNo'), '') is null then
      raise exception using errcode = '22023', message = '出荷データの荷主・拠点・出荷番号が不正です';
    end if;

    if jsonb_typeof(v_shipment->'productLines') is distinct from 'array'
       or jsonb_array_length(v_shipment->'productLines') = 0 then
      raise exception using errcode = '22023', message = '商品明細がない出荷は登録できません';
    end if;

    if jsonb_typeof(v_shipment->'sourceRowNumbers') is distinct from 'array'
       or jsonb_array_length(v_shipment->'sourceRowNumbers') = 0 then
      raise exception using errcode = '22023', message = '取込元行がない出荷は登録できません';
    end if;

    if exists (
      select 1 from public.shipments s
      where s.client_id = p_client_id
        and s.site_id = p_site_id
        and s.shipment_no = v_shipment->>'shipmentNo'
    ) then
      raise exception using errcode = '23505', message = format('出荷番号 %s はすでに登録されています', v_shipment->>'shipmentNo');
    end if;

    insert into public.shipments (
      client_id, site_id, shipment_no, work_date, pack_count,
      source_file_version_id, import_run_id, status
    ) values (
      p_client_id,
      p_site_id,
      v_shipment->>'shipmentNo',
      (v_shipment->>'workDate')::date,
      greatest(coalesce((v_shipment->>'packCount')::integer, 0), 0),
      p_source_file_version_id,
      v_import_run_id,
      'ready'
    ) returning id into v_shipment_id;
    v_shipment_count := v_shipment_count + 1;

    for v_line in select value from jsonb_array_elements(coalesce(v_shipment->'productLines', '[]'::jsonb)) loop
      if nullif(trim(v_line->>'lineNo'), '') is null
         or nullif(trim(v_line->>'productId'), '') is null
         or nullif(trim(v_line->>'productName'), '') is null
         or nullif(trim(v_line->>'quantity'), '') is null
         or (v_line->>'quantity') !~ '^[0-9]+$' then
        raise exception using errcode = '22023', message = '商品明細の必須値が不正です';
      end if;

      insert into public.shipment_lines (
        client_id, site_id, shipment_id, line_no, product_id, product_name,
        quantity, source_row_number
      ) values (
        p_client_id,
        p_site_id,
        v_shipment_id,
        v_line->>'lineNo',
        v_line->>'productId',
        v_line->>'productName',
        (v_line->>'quantity')::integer,
        (v_line->>'sourceRowNumber')::integer
      );
      v_detail_count := v_detail_count + 1;
    end loop;

    for v_source_row_number in
      select value::integer from jsonb_array_elements_text(coalesce(v_shipment->'sourceRowNumbers', '[]'::jsonb))
    loop
      insert into public.import_rows (
        import_run_id, source_row_number, shipment_no, status, normalized_data
      ) values (
        v_import_run_id, v_source_row_number, v_shipment->>'shipmentNo', 'accepted', v_shipment
      );
    end loop;
  end loop;

  update public.source_file_versions
  set state = 'registered', row_count = v_detail_count, fatal_error_count = 0
  where id = p_source_file_version_id;

  update public.import_runs
  set state = 'processed',
      accepted_count = v_shipment_count,
      exception_count = 0,
      control_total = jsonb_build_object('shipment_count', v_shipment_count, 'detail_count', v_detail_count),
      started_at = coalesce(started_at, now()),
      finished_at = now()
  where id = v_import_run_id;

  insert into public.audit_events (
    client_id, site_id, actor_id, action, target_type, target_id, metadata
  ) values (
    p_client_id, p_site_id, v_user_id, 'import.registered', 'source_file_version',
    p_source_file_version_id::text,
    jsonb_build_object('import_run_id', v_import_run_id, 'shipment_count', v_shipment_count, 'detail_count', v_detail_count)
  );

  return jsonb_build_object(
    'sourceFileVersionId', p_source_file_version_id,
    'importRunId', v_import_run_id,
    'shipmentCount', v_shipment_count,
    'detailCount', v_detail_count
  );
end;
$$;

revoke all on function public.register_warehouse_import(uuid, text, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.register_warehouse_import(uuid, text, text, text, text, text, text, text, jsonb) to authenticated;
