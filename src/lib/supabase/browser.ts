import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "@/src/lib/env";

export function createSupabaseBrowserClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  return createBrowserClient(url, publishableKey);
}
