import Link from "next/link";
import { DemoEnvironmentBanner } from "@/src/features/demo/demo-environment-banner";
import { AppFrame } from "@/src/features/layout/app-shell";
import { requireTrialPageAccess } from "@/src/server/auth/trial-page-access";

export const dynamic = "force-dynamic";

const shortcuts = [
  ["出荷管理", "▰", "/shipments"],
  ["Excel取込", "▤", "/import"],
  ["現場入力", "✎", "/field"],
  ["請求確認", "▤", "/billing"],
  ["マスタ設定", "●", "/settings"],
  ["ヘルプ", "?", "/help"],
] as const;

function formatToday(): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date());
}

export default async function HomePage() {
  await requireTrialPageAccess("/");

  return (
    <AppFrame active="home">
      <main className="dashboard-page">
        <DemoEnvironmentBanner />

        <header className="dashboard-header">
          <div className="dashboard-title">
            <h1>今日の状況</h1>
            <span className="dashboard-date">{formatToday()}</span>
          </div>
        </header>

        <section className="dashboard-panel dashboard-empty-state" aria-labelledby="dashboard-status-title">
          <div>
            <span className="eyebrow">業務を始める</span>
            <h2 id="dashboard-status-title">登録済みの出荷はありません</h2>
            <p>まずExcelを取り込むと、出荷管理・現場入力・請求確認で実際のデータを確認できます。</p>
          </div>
          <Link className="button" href="/import">Excel取込を始める</Link>
        </section>

        <section className="dashboard-bottom-grid dashboard-cleanup-grid" aria-label="業務メニュー">
          <section className="dashboard-panel shortcut-panel" aria-labelledby="shortcut-title">
            <div className="dashboard-panel-heading"><h2 id="shortcut-title">ショートカット</h2></div>
            <div className="shortcut-grid">
              {shortcuts.map(([label, icon, href]) => <Link className="shortcut-card" href={href} key={label}><span className="shortcut-icon" aria-hidden="true">{icon}</span><span>{label}</span></Link>)}
            </div>
          </section>

          <section className="dashboard-panel dashboard-guide-panel" aria-labelledby="demo-guide-title">
            <div className="dashboard-panel-heading"><h2 id="demo-guide-title">操作の流れ</h2></div>
            <ol className="dashboard-flow-list">
              <li><strong>Excel取込</strong><span>出荷データを登録します。</span></li>
              <li><strong>現場入力</strong><span>箱数や緩衝材などを記録します。</span></li>
              <li><strong>請求確認</strong><span>計算結果を確認します。</span></li>
            </ol>
          </section>
        </section>
      </main>
    </AppFrame>
  );
}
