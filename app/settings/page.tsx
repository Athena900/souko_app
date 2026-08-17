import Link from "next/link";
import { DemoEnvironmentBanner } from "@/src/features/demo/demo-environment-banner";
import { AppFrame } from "@/src/features/layout/app-shell";

export default function SettingsPage() {
  return (
    <AppFrame active="settings">
      <div className="screen-page settings-page">
        <main className="main screen-main">
          <DemoEnvironmentBanner />
          <section className="panel">
            <span className="eyebrow">マスタ設定</span>
            <h1>マスタ設定</h1>
            <p className="lede">本番版では荷主、商品、作業単価を管理します。デモ版では画面の導線のみ確認できます。</p>
            <div className="notice">単価や作業コードの登録は、正式な業務ルールを確認してから追加します。</div>
            <div className="actions"><Link className="button secondary" href="/">ホームへ戻る</Link></div>
          </section>
        </main>
      </div>
    </AppFrame>
  );
}
