"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useScopeRealtimeRefresh } from "@/src/features/realtime/use-scope-realtime-refresh";

interface ShipmentScope {
  clientId: string;
  siteId: string;
}

interface ShipmentRow {
  id: string;
  shipmentNo: string;
  workDate: string;
  packCount: number;
  status: "ready" | "exception" | "cancelled";
}

const shipmentRealtimeTables = ["shipments", "field_work_records", "billing_candidates", "billing_candidate_reviews"] as const;

function statusLabel(status: ShipmentRow["status"]): string {
  if (status === "ready") return "入力待ち";
  if (status === "exception") return "要確認";
  return "取消";
}

export function ShipmentList({ scope }: { scope: ShipmentScope | null }) {
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestShipments = useCallback(async (searchValue: string): Promise<ShipmentRow[]> => {
    if (!scope) return [];
    const query = new URLSearchParams({ clientId: scope.clientId, siteId: scope.siteId, limit: "500" });
    if (searchValue.trim()) query.set("search", searchValue.trim());
    const response = await fetch(`/api/shipments?${query.toString()}`);
    const body = (await response.json()) as { shipments?: ShipmentRow[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? "登録済み出荷を読み込めませんでした");
    return body.shipments ?? [];
  }, [scope]);

  const loadShipments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setShipments(await requestShipments(search));
    } catch (cause) {
      setShipments([]);
      setError(cause instanceof Error ? cause.message : "登録済み出荷を読み込めませんでした");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [requestShipments, search]);

  useEffect(() => {
    let active = true;
    void requestShipments("")
      .then((nextShipments) => {
        if (!active) return;
        setShipments(nextShipments);
        setError(null);
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setShipments([]);
        setError(cause instanceof Error ? cause.message : "登録済み出荷を読み込めませんでした");
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [requestShipments]);

  useScopeRealtimeRefresh({
    scope,
    tables: shipmentRealtimeTables,
    onRefresh: loadShipments,
  });

  if (!scope) {
    return (
      <section className="panel" aria-labelledby="shipment-access-title">
        <h1 id="shipment-access-title">出荷管理を利用できません</h1>
        <p className="notice">ログイン済みの利用者に、対象荷主・拠点の所属が必要です。</p>
      </section>
    );
  }

  return (
    <section className="panel shipment-list-panel" aria-labelledby="shipment-list-title">
      <span className="eyebrow">出荷管理</span>
      <h1 id="shipment-list-title">登録済み出荷</h1>
      <p className="lede">Excelで登録した出荷を確認し、現場入力へ進みます。</p>
      <div className="actions">
        <label className="field shipment-search-field" htmlFor="shipmentSearch">
          <span>出荷番号で検索</span>
          <input id="shipmentSearch" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="例：SHP-001" />
        </label>
        <button className="button secondary" type="button" onClick={() => void loadShipments()} disabled={loading}>{loading ? "読込中…" : "検索"}</button>
        <Link className="button" href="/import">Excel取込へ</Link>
      </div>

      {error && <div className="status error" role="alert">{error}</div>}
      {loaded && !error && shipments.length === 0 && <div className="notice">登録済み出荷はありません。先にExcel取込で登録してください。</div>}
      {shipments.length > 0 && (
        <div className="table-scroll">
          <table className="line-table" aria-label="登録済み出荷一覧">
            <thead><tr><th>出荷番号</th><th>出荷予定日</th><th>登録箱数</th><th>状態</th><th>次の作業</th></tr></thead>
            <tbody>{shipments.map((shipment) => (
              <tr key={shipment.id}>
                <td>{shipment.shipmentNo}</td>
                <td>{shipment.workDate}</td>
                <td>{shipment.packCount}箱</td>
                <td><span className={`state-badge state-${shipment.status === "ready" ? "ok" : shipment.status === "exception" ? "warning" : "error"}`}>{statusLabel(shipment.status)}</span></td>
                <td><Link className="text-button" href={`/field?shipment=${encodeURIComponent(shipment.shipmentNo)}`}>現場入力へ</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {shipments.length > 0 && <div className="actions shipment-list-footer"><Link className="button secondary" href="/field">現場入力へ</Link></div>}
    </section>
  );
}
