"use client";

import { useEffect, useRef } from "react";
import { useSupabaseBrowserClient } from "@/src/features/auth/supabase-browser-provider";

export interface RealtimeScope {
  clientId: string;
  siteId: string;
}

export type RealtimeTable = "shipments" | "field_work_records" | "billing_candidates" | "billing_candidate_reviews";

interface UseScopeRealtimeRefreshOptions {
  scope: RealtimeScope | null;
  tables: readonly RealtimeTable[];
  onRefresh: () => void | Promise<void>;
  enabled?: boolean;
}

/**
 * Realtimeのイベントは画面データとして使わず、認可済みAPIを再取得する合図だけにする。
 * 画面離脱・ログアウト時には必ずchannelを解除し、再接続時は通知の取りこぼしを補う。
 */
export function useScopeRealtimeRefresh({ scope, tables, onRefresh, enabled = true }: UseScopeRealtimeRefreshOptions): void {
  const client = useSupabaseBrowserClient();
  const refreshRef = useRef(onRefresh);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientId = scope?.clientId;
  const siteId = scope?.siteId;
  const tableKey = tables.join(",");

  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled || !client || !clientId || !siteId || !tableKey) return;

    let disposed = false;
    let subscribed = false;
    const channel = client.channel(`warehouse:${clientId}:${siteId}:${tableKey}`);
    const refresh = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        if (!disposed) void refreshRef.current();
      }, 500);
    };
    const filter = `client_id=eq.${clientId},site_id=eq.${siteId}`;

    for (const table of tableKey.split(",") as RealtimeTable[]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, refresh);
    }
    channel.subscribe((status) => {
      if (disposed) return;
      if (status === "SUBSCRIBED") {
        if (subscribed) refresh();
        subscribed = true;
      }
    });

    return () => {
      disposed = true;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      void client.removeChannel(channel);
    };
  }, [client, clientId, enabled, siteId, tableKey]);
}
