import { NextResponse } from "next/server";
import { calculateTransientBillingCandidate, calculateDemoBillingCandidate } from "@/src/server/repositories/billing-candidate-repository";
import { billingCandidateRequestSchema } from "@/src/domain/validation";
import { demoPriceRules } from "@/src/domain/demo-fixtures";
import { hasSupabasePublicEnv, isDemoMode } from "@/src/lib/env";
import {
  assertBodySize,
  assertSameOrigin,
  readJsonBody,
  requireMembership,
  RouteBodyParseError,
  RouteConfigurationError,
  RouteForbiddenError,
  RoutePayloadTooLargeError,
  RouteUnauthorizedError,
} from "@/src/server/auth/access";
import {
  getDemoBillingSourceFieldWorkRecord,
  getSupabaseBillingSourceFieldWorkRecord,
  PersistenceError,
} from "@/src/server/repositories/field-work-repository";
import { loadApprovedPriceRules } from "@/src/server/repositories/price-rule-repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertBodySize(request, 1_000_000);
  } catch (error) {
    if (error instanceof RoutePayloadTooLargeError) return NextResponse.json({ error: error.message }, { status: 413 });
    if (error instanceof RouteForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 403 });
  }
  if (!isDemoMode() && !hasSupabasePublicEnv()) return NextResponse.json({ error: "Supabaseの設定が必要です" }, { status: 503 });

  let body: unknown;
  try {
    body = await readJsonBody(request, 1_000_000);
  } catch (error) {
    if (error instanceof RoutePayloadTooLargeError) return NextResponse.json({ error: error.message }, { status: 413 });
    if (error instanceof RouteBodyParseError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "JSON形式の入力が必要です" }, { status: 400 });
  }

  const parsed = billingCandidateRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "請求候補の対象を確認してください", issues: parsed.error.issues }, { status: 400 });

  const { clientId, siteId, fieldWorkRecordId } = parsed.data;
  try {
    if (!isDemoMode()) await requireMembership(clientId, siteId, ["office", "manager", "admin"]);
    const record = isDemoMode()
      ? getDemoBillingSourceFieldWorkRecord(fieldWorkRecordId, clientId, siteId)
      : await getSupabaseBillingSourceFieldWorkRecord(fieldWorkRecordId, clientId, siteId);
    if (!record) return NextResponse.json({ error: "対象の現場記録が見つかりません" }, { status: 404 });

    const rules = isDemoMode()
      ? demoPriceRules
      : await loadApprovedPriceRules(clientId, siteId, record.input.workDate);
    if (rules.length === 0) return NextResponse.json({ error: "承認済み単価がありません" }, { status: 422 });

    const candidate = isDemoMode()
      ? calculateDemoBillingCandidate(record.id, record.input, rules)
      : calculateTransientBillingCandidate(record.id, record.input, rules);
    return NextResponse.json(candidate, { status: 201 });
  } catch (error) {
    if (error instanceof RouteUnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof RouteForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof RouteConfigurationError || error instanceof PersistenceError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof Error && error.message === "承認済み単価がありません") {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json({ error: "請求候補を計算できませんでした" }, { status: 503 });
  }
}
