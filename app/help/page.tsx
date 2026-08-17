import Link from "next/link";
import { DemoEnvironmentBanner } from "@/src/features/demo/demo-environment-banner";
import { AppFrame } from "@/src/features/layout/app-shell";

export default function HelpPage() {
  return (
    <AppFrame active="help">
      <div className="screen-page help-page">
        <main className="main screen-main">
          <DemoEnvironmentBanner />
          <section className="panel">
            <span className="eyebrow">ヘルプ</span>
            <h1>ヘルプ</h1>
            <p className="lede">Excel取込、現場入力、請求確認の順に進めると、デモの流れを確認できます。</p>
            <div className="actions"><Link className="button" href="/import">Excel取込を始める</Link><Link className="button secondary" href="/">ホームへ戻る</Link></div>
          </section>
        </main>
      </div>
    </AppFrame>
  );
}
