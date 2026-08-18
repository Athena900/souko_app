-- 新しい画面の公開前に既存の5引数RPCを呼ぶブラウザがあっても、通常の確認を止めない。
-- 更新日時はDB内で取得して6引数版へ渡すため、同時確認の二重保存は防止される。
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
declare
  v_expected_updated_at timestamptz;
begin
  select updated_at
  into v_expected_updated_at
  from public.billing_candidates
  where id = p_candidate_id
    and client_id = p_client_id
    and site_id = p_site_id;

  return private.review_billing_candidate(
    p_client_id,
    p_site_id,
    p_candidate_id,
    p_status,
    p_note,
    v_expected_updated_at
  );
end;
$function$;
