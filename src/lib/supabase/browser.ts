import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseBrowserConfig {
  url: string;
  publishableKey: string;
}

/** Publishable Keyだけで、ブラウザ用のAuth・Realtimeクライアントを作る。 */
export function createSupabaseBrowserClient(config: SupabaseBrowserConfig): SupabaseClient {
  return createBrowserClient(config.url, config.publishableKey);
}
