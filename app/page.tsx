import Link from "next/link";
import { DemoEnvironmentBanner } from "@/src/features/demo/demo-environment-banner";

export default function HomePage() {
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/">CSロジネット 倉庫業務</Link>
        <nav className="nav" aria-label="メインメニュー">
          <Link href="/import">Excel取込</Link>
          <Link href="/field">現場入力</Link>
          <Link href="/billing">請求候補</Link>
        </nav>
      </header>

      <main className="main">
        <DemoEnvironmentBanner />
        <span className="eyebrow">倉庫業務デモ</span>
        <h1>倉庫業務をかんたんに管理</h1>
        <p className="lede">
          Excelを取り込み、現場の箱・資材・追加作業をスマホで記録し、請求候補の確認までを一つの流れで行います。
        </p>
        <div className="actions">
          <Link className="button" href="/import">① Excel取込を始める</Link>
          <Link className="button secondary" href="/field">② 現場入力を試す</Link>
          <Link className="button secondary" href="/billing">③ 請求候補を見る</Link>
        </div>

        <section className="demo-guide panel" aria-labelledby="demo-guide-title">
          <div>
            <span className="tag">デモの流れ</span>
            <h2 id="demo-guide-title">Excelから請求候補までを一周できます</h2>
            <p className="muted">実際の業務でどこが楽になるかを、次の3画面で確認できます。</p>
          </div>
          <ol className="demo-flow">
            <li><strong>Excelを確認・登録</strong><span>出荷指示NOが同じ行を1件の出荷にまとめます。</span></li>
            <li><strong>現場実績を入力</strong><span>箱数・緩衝材・追加梱包・箱内訳をスマホで記録します。</span></li>
            <li><strong>請求候補を確認</strong><span>単価・税・合計と明細を表示し、確認済みにできます。</span></li>
          </ol>
        </section>

        <section className="grid" aria-label="業務の流れ">
          <div className="panel">
            <span className="tag">STEP 1</span>
            <div className="metric">Excel取込</div>
            <p className="muted">現場のExcelを読み込み、出荷ごとに内容を確認します。</p>
          </div>
          <div className="panel">
            <span className="tag">STEP 2</span>
            <div className="metric">現場入力</div>
            <p className="muted">梱包数、資材、追加作業、箱内訳、例外を記録します。</p>
          </div>
          <div className="panel">
            <span className="tag">STEP 3</span>
            <div className="metric">請求確認</div>
            <p className="muted">単価・税・合計と明細を確認し、担当者が確認結果を残します。</p>
          </div>
        </section>

        <section className="panel" style={{ marginTop: 24 }}>
          <h2>このデモで確認できること</h2>
          <ol className="steps">
            <li>出荷番号を選び、現場の梱包実績をスマホで入力</li>
            <li>単価ルールを適用し、税・小計・合計を計算</li>
            <li>計算根拠付きの請求候補を確認</li>
            <li>担当者が内容を確認し、確認結果を残す</li>
          </ol>
        </section>
      </main>
      <footer className="footer">CSロジネット 倉庫業務デモ</footer>
    </div>
  );
}
