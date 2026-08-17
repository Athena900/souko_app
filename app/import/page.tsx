import Link from "next/link";
import { DemoEnvironmentBanner } from "@/src/features/demo/demo-environment-banner";
import { ExcelImportPreview } from "@/src/features/import/excel-import-preview";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/">CSロジネット 倉庫業務</Link>
        <nav className="nav" aria-label="事務メニュー"><Link href="/field">現場入力</Link><Link href="/billing">請求候補</Link><Link href="/">トップへ戻る</Link></nav>
      </header>
      <main className="main">
        <DemoEnvironmentBanner />
        <span className="eyebrow">出荷データ</span>
        <h1>出荷Excelを確認</h1>
        <p className="lede">現場で入力したExcelを読み込み、同じ出荷番号の商品を1件の出荷としてまとめて確認します。</p>
        <ExcelImportPreview />
      </main>
    </div>
  );
}
