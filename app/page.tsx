import Link from "next/link";

export default function HomePage() {
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/">CSロジネット 倉庫業務</Link>
        <nav className="nav" aria-label="メインメニュー">
          <Link href="/import">Excel取込</Link>
          <Link href="/field">現場入力</Link>
          <Link href="/api/health">稼働確認</Link>
        </nav>
      </header>

      <main className="main">
        <span className="eyebrow">Module 1 / Module 2</span>
        <h1>出荷と現場実績を、<br />請求候補までつなぐ。</h1>
        <p className="lede">
          スマホで入力した梱包・資材・追加作業を出荷番号へ結び付け、単価計算の根拠を残したまま確認用データを作ります。
          正式な請求確定と請求書発行は後続モジュールで行います。
        </p>
        <div className="actions">
          <Link className="button" href="/field">現場入力を開く</Link>
        </div>

        <section className="grid" aria-label="実装状況">
          <div className="panel">
            <span className="tag">M1</span>
            <div className="metric">取込・照合</div>
            <p className="muted">現場のExcelを読み込み、出荷ごとに内容を確認します。</p>
          </div>
          <div className="panel">
            <span className="tag">M2</span>
            <div className="metric">スマホ入力</div>
            <p className="muted">梱包数、資材、追加作業、箱内訳、例外を記録します。</p>
          </div>
          <div className="panel">
            <span className="tag">安全策</span>
            <div className="metric">二重防止</div>
            <p className="muted">同じ入力を再送しても、請求候補を二重に作らない設計です。</p>
          </div>
        </section>

        <section className="two-column" style={{ marginTop: 24 }}>
          <div className="panel">
            <h2>今回の縦切り実装</h2>
            <ol className="steps">
              <li>出荷番号を選び、現場の梱包実績をスマホで入力</li>
              <li>単価ルールを適用し、税・小計・合計を計算</li>
              <li>計算根拠付きの請求候補を確認</li>
              <li>本番では担当者が確認してから次モジュールへ渡す</li>
            </ol>
          </div>
          <div className="panel">
            <h2>本番接続について</h2>
            <p className="notice">
              開発環境でデモ保存を使うには、環境変数 <code>DEMO_MODE=true</code> を設定します。本番ではSupabase Auth・RLS・Storageを必須にします。
            </p>
          </div>
        </section>
      </main>
      <footer className="footer">CSロジネット M1/M2 初期実装</footer>
    </div>
  );
}
