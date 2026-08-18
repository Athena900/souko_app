import { NextResponse } from "next/server";
import { appRoles, loadActiveScope } from "@/src/server/auth/active-scope";
import { DashboardSummaryError, loadDashboardSummary } from "@/src/server/dashboard/dashboard-summary";

export const runtime = "nodejs";

export async function GET() {
  const scope = await loadActiveScope(appRoles);
  if (!scope) return NextResponse.json({ error: "利用者の荷主・拠点を確認できません" }, { status: 403 });

  try {
    return NextResponse.json({ summary: await loadDashboardSummary(scope) }, { status: 200 });
  } catch (error) {
    const message = error instanceof DashboardSummaryError ? error.message : "ダッシュボードを読み込めませんでした";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
