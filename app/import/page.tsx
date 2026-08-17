import Link from "next/link";
import { DemoEnvironmentBanner } from "@/src/features/demo/demo-environment-banner";
import { ExcelImportPreview } from "@/src/features/import/excel-import-preview";
import { hasSupabasePublicEnv, isDemoMode, usesDemoMemoryStorage } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const dynamic = "force-dynamic";

async function loadImportScope(): Promise<{ clientId: string; siteId: string } | null> {
  if (usesDemoMemoryStorage()) return { clientId: "demo-client", siteId: "demo-site" };
  if (!hasSupabasePublicEnv()) return null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("user_memberships")
      .select("client_id,site_id")
      .eq("user_id", user.id)
      .eq("active", true)
      .in("role", ["office", "manager", "admin"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return { clientId: data.client_id, siteId: data.site_id };
  } catch {
    return null;
  }
}

export default async function ImportPage() {
  const scope = await loadImportScope();
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/">CSロジネット 倉庫業務</Link>
        <nav className="nav" aria-label="事務メニュー"><Link href="/field">現場入力</Link><Link href="/billing">請求候補</Link><Link href="/">トップへ戻る</Link></nav>
      </header>
      <main className="main">
        <DemoEnvironmentBanner />
        <span className="eyebrow">STEP 1 · 事務作業</span>
        <h1>Excel取込</h1>
        <p className="lede">ファイルを選び、出荷番号ごとの内容を確認してから登録します。</p>
        <ExcelImportPreview demoMode={isDemoMode()} scope={scope} />
      </main>
    </div>
  );
}
