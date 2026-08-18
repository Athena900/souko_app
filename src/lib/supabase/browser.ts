import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

interface SupabaseBrowserConfig {
  url: string;
  publishableKey: string;
}

let browserClient: SupabaseClient | null = null;
let configKey: string | null = null;
let loadingClient: Promise<SupabaseClient> | null = null;

/**
 * Cloudflare Workerの実行時シークレットはクライアントバンドルへ自動展開されない。
 * サーバーが公開可能なURL・Publishable Keyだけを返し、ブラウザ側のAuth/Realtimeを初期化する。
 */
export async function getSupabaseBrowserClient(): Promise<SupabaseClient> {
  if (typeof window === "undefined") throw new Error("ブラウザ上でのみSupabaseへ接続できます");
  if (!loadingClient) {
    loadingClient = loadClient().finally(() => {
      loadingClient = null;
    });
  }
  return loadingClient;
}

async function loadClient(): Promise<SupabaseClient> {
  const response = await fetch("/api/runtime-config", { cache: "no-store" });
  if (!response.ok) throw new Error("Supabaseの接続設定を読み込めませんでした");
  const config = await response.json() as Partial<SupabaseBrowserConfig>;
  if (typeof config.url !== "string" || typeof config.publishableKey !== "string" || !config.url || !config.publishableKey) {
    throw new Error("Supabaseの接続設定が不正です");
  }

  const nextConfigKey = `${config.url}:${config.publishableKey}`;
  if (!browserClient || configKey !== nextConfigKey) {
    browserClient = createBrowserClient(config.url, config.publishableKey);
    configKey = nextConfigKey;
  }
  return browserClient;
}
