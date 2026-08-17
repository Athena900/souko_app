import { NextResponse } from "next/server";
import { calculateDemoBillingCandidate, BillingCandidateNotFoundError, BillingCandidatePermissionError, BillingCandidateRuleError, persistSupabaseBillingCandidate } from "@/src/server/repositories/billing-candidate-repository";
import { billingCandidateRequestSchema } from "@/src/domain/validation";
import { demoPriceRules } from "@/src/domain/demo-fixtures";
import { hasSupabasePublicEnv, usesDemoMemoryStorage, usesSupabaseStorage } from "@/src/lib/env";
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
  const useMemoryStorage = usesDemoMemoryStorage();
  if (usesSupabaseStorage() && !hasSupabasePublicEnv()) return NextResponse.json({ error: "Supabaseの設定が必要です" }, { status: 503 });

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
    if (!useMemoryStorage) await requireMembership(clientId, siteId, ["office", "manager", "admin"]);
    const record = useMemoryStorage
      ? getDemoBillingSourceFieldWorkRecord(fieldWorkRecordId, clientId, siteId)
      : await getSupabaseBillingSourceFieldWorkRecord(fieldWorkRecordId, clientId, siteId);
    if (!record) return NextResponse.json({ error: "対象の現場記録が見つかりません" }, { status: 404 });

    if (!useMemoryStorage) {
      const candidate = await persistSupabaseBillingCandidate(clientId, siteId, record.id, parsed.data.recalculate ?? false);
      return NextResponse.json(candidate, { status: 200 });
    }

    const candidate = calculateDemoBillingCandidate(record.id, record.input, demoPriceRules, parsed.data.recalculate ?? false);
    return NextResponse.json(candidate, { status: 201 });
  } catch (error) {
    if (error instanceof RouteUnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof RouteForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof BillingCandidateNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof BillingCandidatePermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof BillingCandidateRuleError) return NextResponse.json({ error: error.message }, { status: 422 });
    if (error instanceof RouteConfigurationError || error instanceof PersistenceError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "請求候補を計算できませんでした" }, { status: 503 });
  }
}
