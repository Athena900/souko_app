"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DashboardShipmentState, DashboardSummary } from "@/src/server/dashboard/dashboard-summary";

const shortcuts = [
  ["出荷管理", "▰", "/shipments"],
  ["Excel取込", "▤", "/import"],
  ["現場入力", "✎", "/field"],
  ["請求確認", "▤", "/billing"],
  ["マスタ設定", "●", "/settings"],
  ["ヘルプ", "?", "/help"],
] as const;

const stateClass: Record<DashboardShipmentState, string> = {
  "未着手": "waiting",
  "現場入力済み": "progress",
  "確認待ち": "waiting",
  "確認済み": "done",
  "要確認": "alert",
};

const emptySummary: DashboardSummary = {
  totalShipments: 0,
  totalPackCount: 0,
  enteredShipments: 0,
  pendingShipments: 0,
  attentionShipments: 0,
  states: [
    { label: "未着手", count: 0, packCount: 0, color: "#9eabb1" },
    { label: "現場入力済み", count: 0, packCount: 0, color: "#39aab0" },
    { label: "確認待ち", count: 0, packCount: 0, color: "#f6b324" },
    { label: "確認済み", count: 0, packCount: 0, color: "#0a6676" },
    { label: "要確認", count: 0, packCount: 0, color: "#e86157" },
  ],
  recentShipments: [],
};

function formatToday(): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date());
}

function formatWorkDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date(`${value}T00:00:00+09:00`));
}

function chartBackground(summary: DashboardSummary): string {
  if (summary.totalShipments === 0) return "#edf2f2";
  let position = 0;
  const segments = summary.states
    .filter((state) => state.count > 0)
    .map((state) => {
      const start = position;
      position += (state.count / summary.totalShipments) * 100;
      return `${state.color} ${start}% ${position}%`;
    });
  return `conic-gradient(${segments.join(", ")})`;
}

export function DashboardOverview() {
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        const body = await response.json() as { summary?: DashboardSummary; error?: string };
        if (!response.ok || !body.summary) throw new Error(body.error ?? "ダッシュボードを読み込めませんでした");
        if (!cancelled) setSummary(body.summary);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "ダッシュボードを読み込めませんでした");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const hasData = summary.totalShipments > 0;
  const alerts = [
    summary.attentionShipments > 0 ? { label: "要確認", message: "確認が必要な出荷があります", count: summary.attentionShipments, tone: "error" } : null,
    summary.pendingShipments > 0 ? { label: "確認待ち", message: "請求確認待ちの出荷があります", count: summary.pendingShipments, tone: "warning" } : null,
  ].filter((alert): alert is NonNullable<typeof alert> => Boolean(alert));

  return (
    <>
      {loadError && <div className="status warning" role="status">{loadError}</div>}
      <header className="dashboard-header">
        <div className="dashboard-title">
          <h1>今日の状況</h1>
          <span className="dashboard-date">{formatToday()}</span>
        </div>
      </header>

      <section className="dashboard-welcome-panel" aria-labelledby="dashboard-status-title">
        <div className="dashboard-welcome-copy">
          <p>出荷・現場入力・請求確認をまとめて確認できます。</p>
          <h2 id="dashboard-status-title">{hasData ? "本日の業務状況" : "登録済みの出荷はありません"}</h2>
          <small>{hasData ? "表示している件数は、登録済みの実データから集計しています。" : "Excelを取り込むと、ここに実際の業務状況が表示されます。"}</small>
        </div>
        <div className="dashboard-kpi-grid" aria-label="業務件数">
          <DashboardKpi label="登録済み出荷" value={summary.totalShipments} detail={`${summary.totalPackCount.toLocaleString("ja-JP")} 箱`} tone="teal" href="/shipments" />
          <DashboardKpi label="現場入力済み" value={summary.enteredShipments} detail="請求候補の作成前" tone="aqua" href="/field" />
          <DashboardKpi label="確認待ち" value={summary.pendingShipments} detail="請求候補を確認" tone="yellow" href="/billing" />
          <DashboardKpi label="要確認" value={summary.attentionShipments} detail="例外・差し戻し" tone="red" href="/shipments" />
        </div>
      </section>

      <section className="dashboard-middle-grid" aria-label="業務状況の詳細">
        <section className="dashboard-panel shipment-status-panel" aria-labelledby="shipment-status-title">
          <div className="dashboard-panel-heading">
            <h2 id="shipment-status-title">出荷ステータス</h2>
            <span className="muted">（件）</span>
          </div>
          <div className="shipment-status-body">
            <div className="donut-chart" aria-label="出荷ステータスの内訳" style={{ background: chartBackground(summary) }}>
              <div className="donut-chart-content"><small>登録済み出荷</small><strong>{summary.totalShipments}</strong><small>件<br />（{summary.totalPackCount.toLocaleString("ja-JP")} 箱）</small></div>
            </div>
            <ul className="status-legend">
              {summary.states.map((state) => <li key={state.label}><span className="legend-dot" style={{ background: state.color }} aria-hidden="true" /><span>{state.label}</span><strong>{state.count}件</strong><small>（{state.packCount.toLocaleString("ja-JP")} 箱）</small></li>)}
            </ul>
          </div>
          <div className="dashboard-panel-heading"><span /> <Link className="panel-link" href="/shipments">出荷管理へ　›</Link></div>
        </section>

        <section className="dashboard-panel alert-panel" aria-labelledby="alert-title">
          <div className="dashboard-panel-heading"><h2 id="alert-title">要対応</h2><Link className="panel-link" href="/shipments">出荷管理へ　›</Link></div>
          <ul className="alert-list">
            {alerts.length > 0
              ? alerts.map((alert) => <li className={`alert-row alert-${alert.tone}`} key={alert.label}><span className="alert-symbol" aria-hidden="true">{alert.tone === "error" ? "!" : "▲"}</span><span className="alert-label">{alert.label}</span><span className="alert-message">{alert.message}</span><strong className="alert-count">{alert.count}件</strong><span className="alert-arrow" aria-hidden="true">›</span></li>)
              : <li className="dashboard-no-alerts">要対応の出荷はありません。</li>}
          </ul>
        </section>
      </section>

      <section className="dashboard-bottom-grid" aria-label="最近の業務">
        <section className="dashboard-panel recent-panel" aria-labelledby="recent-title">
          <div className="dashboard-panel-heading"><h2 id="recent-title">最近の出荷</h2><Link className="panel-link" href="/shipments">すべて見る　›</Link></div>
          <div className="recent-table-wrap">
            <table className="line-table recent-table">
              <thead><tr><th>出荷番号</th><th>作業日</th><th>箱数</th><th>状態</th></tr></thead>
              <tbody>{summary.recentShipments.length > 0
                ? summary.recentShipments.map((shipment) => <tr key={shipment.shipmentNo}><td>{shipment.shipmentNo}</td><td>{formatWorkDate(shipment.workDate)}</td><td>{shipment.packCount.toLocaleString("ja-JP")} 箱</td><td><span className={`recent-status ${stateClass[shipment.state]}`}>{shipment.state}</span></td></tr>)
                : <tr><td className="dashboard-empty-row" colSpan={4}>まだ出荷データはありません。</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="dashboard-panel shortcut-panel" aria-labelledby="shortcut-title">
          <div className="dashboard-panel-heading"><h2 id="shortcut-title">ショートカット</h2></div>
          <div className="shortcut-grid">
            {shortcuts.map(([label, icon, href]) => <Link className="shortcut-card" href={href} key={label}><span className="shortcut-icon" aria-hidden="true">{icon}</span><span>{label}</span></Link>)}
          </div>
        </section>
      </section>
    </>
  );
}

function DashboardKpi({ label, value, detail, tone, href }: { label: string; value: number; detail: string; tone: "teal" | "aqua" | "yellow" | "red"; href: "/shipments" | "/field" | "/billing" }) {
  const icon = tone === "red" ? "!" : tone === "yellow" ? "⌛" : tone === "aqua" ? "▰" : "▣";
  return (
    <article className={`dashboard-kpi kpi-${tone}`} data-testid={`dashboard-kpi-${tone}`}>
      <div className="dashboard-kpi-main">
        <span className="dashboard-kpi-icon" aria-hidden="true">{icon}</span>
        <div className="dashboard-kpi-copy">
          <span className="dashboard-kpi-label">{label}</span>
          <strong className="dashboard-kpi-value">{value.toLocaleString("ja-JP")}</strong><span className="dashboard-kpi-unit">件</span>
          <small className="dashboard-kpi-detail">（{detail}）</small>
        </div>
      </div>
      <Link className="dashboard-kpi-action" href={href}>詳細を見る　›</Link>
    </article>
  );
}
