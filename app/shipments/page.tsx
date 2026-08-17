import Link from "next/link";
import { DemoEnvironmentBanner } from "@/src/features/demo/demo-environment-banner";
import { AppFrame } from "@/src/features/layout/app-shell";

const demoShipments = [
  ["S250522-0001", "2025/05/22", "株式会社ABC商事", "文具セットA", "120 個口", "出荷済み"],
  ["S250522-0002", "2025/05/22", "株式会社DEF物流", "コピー用紙 A4", "80 個口", "作業中"],
  ["S250522-0003", "2025/05/22", "株式会社GHI商会", "ファイルケース", "60 個口", "確認待ち"],
  ["S250522-0004", "2025/05/23", "株式会社JKLストア", "ラベルシール", "40 個口", "未着手"],
] as const;

export default function ShipmentsPage() {
  return (
    <AppFrame active="shipments">
      <div className="screen-page shipments-page">
        <main className="main screen-main">
          <DemoEnvironmentBanner />
          <section className="panel">
            <span className="eyebrow">出荷管理</span>
            <h1>出荷管理</h1>
            <p className="lede">登録した出荷の状況を確認し、Excel取込や現場入力へ進みます。</p>
            <div className="table-scroll">
              <table className="line-table" aria-label="出荷一覧">
                <thead><tr><th>出荷番号</th><th>出荷予定日</th><th>取引先</th><th>商品名</th><th>個口数</th><th>ステータス</th></tr></thead>
                <tbody>{demoShipments.map((shipment) => <tr key={shipment[0]}>{shipment.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <div className="actions"><Link className="button" href="/import">Excel取込へ</Link><Link className="button secondary" href="/field">現場入力へ</Link></div>
          </section>
        </main>
      </div>
    </AppFrame>
  );
}
