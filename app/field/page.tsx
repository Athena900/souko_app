import { DemoEnvironmentBanner } from "@/src/features/demo/demo-environment-banner";
import { FieldRecordForm } from "@/src/features/field/field-record-form";
import { AppFrame } from "@/src/features/layout/app-shell";
import { hasSupabasePublicEnv, isDemoMode, usesDemoMemoryStorage } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const dynamic = "force-dynamic";

async function loadFieldScope(): Promise<{ clientId: string; siteId: string } | null> {
  if (usesDemoMemoryStorage()) return { clientId: "demo-client", siteId: "demo-site" };
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
    <AppFrame active="field">
      <div className="screen-page field-page">
        <main className="main screen-main field-page-main">
        <DemoEnvironmentBanner />
        <FieldRecordForm scope={scope} demoMode={isDemoMode()} />
        </main>
      </div>
    </AppFrame>
  );
}
