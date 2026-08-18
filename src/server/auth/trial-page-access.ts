import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

/**
 * 試用版の画面を表示する前に、Supabaseの有効な利用者セッションを確認する。
 * Middlewareは入口の補助に留め、Cloudflare実行環境でもこのサーバー側判定を正本とする。
 */
export async function requireTrialPageAccess(pathname: string): Promise<void> {
  if (process.env.APP_ENV !== "trial") return;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (!error && user) return;
  } catch {
    // ログイン画面へ誘導し、Supabaseの接続詳細は外へ出さない。
  }

  redirect(`/login?next=${encodeURIComponent(pathname)}`);
}
