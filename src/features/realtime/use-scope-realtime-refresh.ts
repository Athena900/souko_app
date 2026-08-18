"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/src/lib/supabase/browser";

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
  const refreshRef = useRef(onRefresh);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientId = scope?.clientId;
  const siteId = scope?.siteId;
  const tableKey = tables.join(",");

  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled || !clientId || !siteId || !tableKey) return;

    let disposed = false;
    let subscribed = false;
    let client: Awaited<ReturnType<typeof getSupabaseBrowserClient>> | null = null;
    let channel: ReturnType<Awaited<ReturnType<typeof getSupabaseBrowserClient>>["channel"]> | null = null;
    const refresh = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        if (!disposed) void refreshRef.current();
      }, 500);
    };
    const filter = `client_id=eq.${clientId},site_id=eq.${siteId}`;

    void getSupabaseBrowserClient().then((connectedClient) => {
      if (disposed) return;
      client = connectedClient;
      channel = client.channel(`warehouse:${clientId}:${siteId}:${tableKey}`);
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
    });

    return () => {
      disposed = true;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      if (client && channel) void client.removeChannel(channel);
    };
  }, [clientId, enabled, siteId, tableKey]);
}
