import Link from "next/link";
import { DemoEnvironmentBanner } from "@/src/features/demo/demo-environment-banner";
import { BillingCandidateReview } from "@/src/features/billing/billing-candidate-review";
import { hasSupabasePublicEnv, isDemoMode } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const dynamic = "force-dynamic";

async function loadBillingScope(): Promise<{ clientId: string; siteId: string } | null> {
  if (isDemoMode()) return { clientId: "demo-client", siteId: "demo-site" };
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

export default async function BillingPage() {
  const scope = await loadBillingScope();
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/">CSロジネット 倉庫業務</Link>
        <nav className="nav" aria-label="事務メニュー"><Link href="/import">Excel取込</Link><Link href="/field">現場入力</Link><Link href="/">トップへ戻る</Link></nav>
      </header>
      <main className="main">
        <DemoEnvironmentBanner />
        <span className="eyebrow">事務確認</span>
        <h1>請求候補を確認</h1>
        <p className="lede">現場記録に単価を適用し、請求前の金額と明細を確認します。</p>
        <BillingCandidateReview scope={scope} />
      </main>
    </div>
  );
}
