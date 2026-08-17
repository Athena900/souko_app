import Link from "next/link";
import { DemoEnvironmentBanner } from "@/src/features/demo/demo-environment-banner";
import { AppFrame } from "@/src/features/layout/app-shell";
import { isDemoMode } from "@/src/lib/env";

const kpis = [
  { label: "出荷予定", value: "128", detail: "（8,450 個口）", tone: "teal", icon: "▣", href: "/shipments" },
  { label: "作業中", value: "45", detail: "（3,210 個口）", tone: "yellow", icon: "▰", href: "/field" },
  { label: "確認待ち", value: "18", detail: "（1,120 個口）", tone: "blue", icon: "⌛", href: "/billing" },
  { label: "エラー", value: "5", detail: "（230 個口）", tone: "red", icon: "!", href: "/import" },
] as const;

const statusLegend = [
  ["出荷済み", "58", "3,820 個口", "legend-teal"],
  ["作業中", "32", "2,160 個口", "legend-aqua"],
  ["確認待ち", "18", "1,120 個口", "legend-yellow"],
  ["未着手", "12", "920 個口", "legend-grey"],
  ["エラー", "8", "430 個口", "legend-red"],
] as const;

const alerts = [
  { type: "error", icon: "!", label: "エラー", message: "出荷データにエラーがあります", count: "5件" },
  { type: "warning", icon: "▲", label: "確認待ち", message: "確認待ちの出荷があります", count: "18件" },
  { type: "warning", icon: "▲", label: "遅延注意", message: "出荷予定日を過ぎた未出荷があります", count: "3件" },
  { type: "info", icon: "i", label: "お知らせ", message: "倉庫棚卸のお知らせ（5/25〜5/26）", count: "" },
] as const;

const recentShipments = [
  ["S250522-0001", "2025/05/22", "株式会社ABC商事", "文具セットA", "120 個口", "出荷済み", "done"],
  ["S250522-0002", "2025/05/22", "株式会社DEF物流", "コピー用紙 A4", "80 個口", "作業中", "progress"],
  ["S250522-0003", "2025/05/22", "株式会社GHI商会", "ファイルケース", "60 個口", "確認待ち", "waiting"],
  ["S250522-0004", "2025/05/23", "株式会社JKLストア", "ラベルシール", "40 個口", "未着手", "waiting"],
  ["S250522-0005", "2025/05/23", "株式会社MNO販売", "クリアファイル", "70 個口", "エラー", "alert"],
] as const;

const shortcuts = [
  ["出荷管理", "▰", "/shipments"],
  ["Excel取込", "▤", "/import"],
  ["現場入力", "✎", "/field"],
  ["請求確認", "▤", "/billing"],
  ["マスタ設定", "●", "/settings"],
  ["ヘルプ", "?", "/help"],
] as const;

export default function HomePage() {
  const userName = isDemoMode() ? "山田 太郎" : "担当者";

  return (
    <AppFrame active="home">
      <main className="dashboard-page">
        <DemoEnvironmentBanner />

        <header className="dashboard-header">
          <div className="dashboard-title">
            <h1>今日の状況</h1>
            <span className="dashboard-date">2025年5月22日（木）</span>
          </div>
          <div className="dashboard-tools">
            <input className="dashboard-search" type="search" aria-label="出荷番号、取引先、商品名で検索" placeholder="出荷番号、取引先、商品名で検索" />
            <button className="notification" type="button" disabled aria-label="通知 3件" title="通知機能は準備中です">♧<span className="notification-badge">3</span></button>
            <div className="dashboard-user"><span className="user-avatar" aria-hidden="true">○</span><span>{userName}</span><span className="user-chevron" aria-hidden="true">⌄</span></div>
          </div>
        </header>

        <section className="dashboard-welcome-panel" aria-labelledby="dashboard-status-title">
          <div className="dashboard-welcome-copy">
            <p>ようこそ、{userName}さん</p>
            <h2 id="dashboard-status-title">本日の業務状況</h2>
            <small>本日も安全第一で、正確な出荷業務をお願いします。</small>
          </div>
          <div className="dashboard-kpi-grid">
            {kpis.map((kpi) => (
              <article className={`dashboard-kpi kpi-${kpi.tone}`} key={kpi.label}>
                <div className="dashboard-kpi-main">
                  <span className="dashboard-kpi-icon" aria-hidden="true">{kpi.icon}</span>
                  <div className="dashboard-kpi-copy">
                    <span className="dashboard-kpi-label">{kpi.label}</span>
                    <strong className="dashboard-kpi-value">{kpi.value}</strong><span className="dashboard-kpi-unit">件</span>
                    <small className="dashboard-kpi-detail">{kpi.detail}</small>
                  </div>
                </div>
                <Link className="dashboard-kpi-action" href={kpi.href}>詳細を見る　›</Link>
              </article>
            ))}
          </div>
        </section>

        <section className="dashboard-middle-grid" aria-label="業務状況の詳細">
          <section className="dashboard-panel shipment-status-panel" aria-labelledby="shipment-status-title">
            <div className="dashboard-panel-heading">
              <h2 id="shipment-status-title">出荷ステータス（本日）</h2>
              <span className="muted">（件）</span>
            </div>
            <div className="shipment-status-body">
              <div className="donut-chart" aria-label="出荷ステータスの内訳">
                <div className="donut-chart-content"><small>総出荷予定</small><strong>128</strong><small>件<br />（8,450 個口）</small></div>
              </div>
              <ul className="status-legend">
                {statusLegend.map(([label, count, packages, color]) => <li key={label}><span className={`legend-dot ${color}`} aria-hidden="true" /><span>{label}</span><strong>{count}件</strong><small>（{packages}）</small></li>)}
              </ul>
            </div>
            <div className="dashboard-panel-heading"><span /> <Link className="panel-link" href="/shipments">出荷管理へ　›</Link></div>
          </section>

          <section className="dashboard-panel alert-panel" aria-labelledby="alert-title">
            <div className="dashboard-panel-heading"><h2 id="alert-title">要対応</h2><Link className="panel-link" href="/shipments">すべて見る　›</Link></div>
            <ul className="alert-list">
              {alerts.map((alert) => <li className={`alert-row alert-${alert.type}`} key={alert.label}><span className="alert-symbol" aria-hidden="true">{alert.icon}</span><span className="alert-label">{alert.label}</span><span className="alert-message">{alert.message}</span><strong className="alert-count">{alert.count}</strong><span className="alert-arrow" aria-hidden="true">›</span></li>)}
            </ul>
          </section>
        </section>

        <section className="dashboard-bottom-grid" aria-label="最近の業務">
          <section className="dashboard-panel recent-panel" aria-labelledby="recent-title">
            <div className="dashboard-panel-heading"><h2 id="recent-title">最近の出荷</h2><Link className="panel-link" href="/shipments">すべて見る　›</Link></div>
            <div className="recent-table-wrap">
              <table className="line-table recent-table">
                <thead><tr><th>出荷番号</th><th>出荷予定日</th><th>取引先</th><th>商品名</th><th>個口数</th><th>ステータス</th></tr></thead>
                <tbody>{recentShipments.map(([shipmentNo, date, customer, product, packages, status, statusClass]) => <tr key={shipmentNo}><td>{shipmentNo}</td><td>{date}</td><td>{customer}</td><td>{product}</td><td>{packages}</td><td><span className={`recent-status ${statusClass}`}>{status}</span></td></tr>)}</tbody>
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

        <section className="dashboard-demo-guide" aria-labelledby="demo-guide-title">
          <div><span className="tag">デモの流れ</span><h2 id="demo-guide-title">Excelから請求候補までを一周できます</h2></div>
          <div className="dashboard-demo-links"><Link href="/import">① Excel取込を始める</Link><Link href="/field">② 現場入力を試す</Link><Link href="/billing">③ 請求候補を見る</Link></div>
        </section>
      </main>
    </AppFrame>
  );
}
