import { hasSupabasePublicEnv, usesDemoMemoryStorage } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export const appRoles = ["field", "office", "manager", "admin"] as const;
export type AppRole = (typeof appRoles)[number];

export interface ActiveScope {
  clientId: string;
  siteId: string;
  role: AppRole;
}

/**
 * 画面表示に使う最初の有効な所属を返す。
 * 保存API側の権限判定は別途requireMembershipで必ず再確認する。
 */
export async function loadActiveScope(roles: readonly AppRole[]): Promise<ActiveScope | null> {
  if (usesDemoMemoryStorage()) return { clientId: "demo-client", siteId: "demo-site", role: "admin" };
  if (!hasSupabasePublicEnv()) return null;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return null;

    const { data, error } = await supabase
      .from("user_memberships")
      .select("client_id,site_id,role")
      .eq("user_id", user.id)
      .eq("active", true)
      .in("role", [...roles])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data || !appRoles.includes(data.role as AppRole)) return null;

    return { clientId: data.client_id, siteId: data.site_id, role: data.role as AppRole };
  } catch {
    return null;
  }
}
