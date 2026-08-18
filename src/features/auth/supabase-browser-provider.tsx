"use client";

import { createContext, ReactNode, useContext, useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient, SupabaseBrowserConfig } from "@/src/lib/supabase/browser";

const SupabaseBrowserContext = createContext<SupabaseClient | null>(null);

interface SupabaseBrowserProviderProps {
  config: SupabaseBrowserConfig | null;
  children: ReactNode;
}

/**
 * Cloudflare Workerの実行時設定をサーバーで読み、ブラウザに必要な公開設定だけを渡す。
 * Service Role Keyはこのコンポーネントにも、HTMLにも渡さない。
 */
export function SupabaseBrowserProvider({ config, children }: SupabaseBrowserProviderProps) {
  const configUrl = config?.url;
  const configPublishableKey = config?.publishableKey;
  const client = useMemo(
    () => (configUrl && configPublishableKey ? createSupabaseBrowserClient({ url: configUrl, publishableKey: configPublishableKey }) : null),
    [configPublishableKey, configUrl],
  );

  return <SupabaseBrowserContext.Provider value={client}>{children}</SupabaseBrowserContext.Provider>;
}

export function useSupabaseBrowserClient(): SupabaseClient | null {
  return useContext(SupabaseBrowserContext);
}
