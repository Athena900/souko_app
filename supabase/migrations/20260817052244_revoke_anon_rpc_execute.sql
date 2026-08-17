-- 公開APIから未認証のRPCを実行できないようにする。
-- これらの関数は SECURITY DEFINER だが、関数内で auth.uid() と membership を
-- 再確認するため、ログイン済み利用者（authenticated）だけに実行権限を残す。

revoke execute on function public.register_warehouse_import(
  uuid, text, text, text, text, text, text, text, jsonb
) from anon;

revoke execute on function public.persist_billing_candidate(
  text, text, uuid, boolean
) from anon;

revoke execute on function public.review_billing_candidate(
  text, text, uuid, text, text
) from anon;
