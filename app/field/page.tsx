import Link from "next/link";
import { FieldRecordForm } from "@/src/features/field/field-record-form";
import { isDemoMode, hasSupabasePublicEnv } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const dynamic = "force-dynamic";

async function loadFieldScope(): Promise<{ clientId: string; siteId: string } | null> {
  if (isDemoMode()) return { clientId: "demo-client", siteId: "demo-site" };
  if (!hasSupabasePublicEnv()) return null;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("user_memberships")
      .select("client_id,site_id")
      .eq("user_id", user.id)
      .eq("active", true)
      .in("role", ["field", "office", "manager", "admin"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return { clientId: data.client_id, siteId: data.site_id };
  } catch {
    return null;
  }
}

export default async function FieldPage() {
  const scope = await loadFieldScope();
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/">CSロジネット 倉庫業務</Link>
        <nav className="nav" aria-label="現場メニュー"><Link href="/import">Excel取込</Link><Link href="/">トップへ戻る</Link></nav>
      </header>
      <main className="main">
        <span className="eyebrow">Field work</span>
        <h1>現場実績を入力</h1>
        <p className="lede">出荷番号を選び、梱包数と資材を入力します。箱内訳は必要な案件だけ登録できます。</p>
        <FieldRecordForm scope={scope} />
      </main>
    </div>
  );
}
