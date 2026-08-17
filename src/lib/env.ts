export function getSupabasePublicEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase環境変数が設定されていません");
  }
  return { url, publishableKey };
}

export function hasSupabasePublicEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function isDemoMode(): boolean {
  if (process.env.DEMO_MODE === "false") return false;
  // 本番環境では、誤ってDEMO_MODE=trueを設定してもデモを有効にしない。
  if (process.env.APP_ENV === "production") return false;
  if (process.env.VERCEL_ENV === "production") return false;
  // Cloudflare Workersなど、NODE_ENVがproductionでも共有用のデモ環境を
  // 明示できるようにする。デプロイ先に依存しない環境判定を優先する。
  if (process.env.APP_ENV === "demo" || process.env.APP_ENV === "staging") return true;
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return true;
  return process.env.NODE_ENV !== "production" && process.env.DEMO_MODE === "true";
}
