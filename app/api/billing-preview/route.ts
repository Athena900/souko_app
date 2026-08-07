import { NextResponse } from "next/server";
import { calculateFieldWorkBilling } from "@/src/domain/pricing";
import { billingPreviewRequestSchema } from "@/src/domain/validation";
import { demoPriceRules } from "@/src/domain/demo-fixtures";
import { isDemoMode } from "@/src/lib/env";
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
import { loadApprovedPriceRules } from "@/src/server/repositories/price-rule-repository";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertBodySize(request, 1_000_000);
  } catch (error) {
    if (error instanceof RoutePayloadTooLargeError) return NextResponse.json({ error: error.message }, { status: 413 });
    if (error instanceof RouteForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await readJsonBody(request, 1_000_000);
  } catch (error) {
    if (error instanceof RoutePayloadTooLargeError) return NextResponse.json({ error: error.message }, { status: 413 });
    if (error instanceof RouteBodyParseError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "JSON形式の入力が必要です" }, { status: 400 });
  }

  const parsed = billingPreviewRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力内容を確認してください", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const rules = isDemoMode()
      ? parsed.data.priceRules ?? demoPriceRules
      : (await requireMembership(parsed.data.record.clientId, parsed.data.record.siteId, ["office", "manager", "admin"]),
        await loadApprovedPriceRules(parsed.data.record.clientId, parsed.data.record.siteId, parsed.data.record.workDate));
    if (rules.length === 0) {
      return NextResponse.json({ error: "承認済み単価がありません" }, { status: 422 });
    }
    const result = calculateFieldWorkBilling(
      parsed.data.record,
      rules,
      parsed.data.sourceId,
      parsed.data.calculationRunId ?? crypto.randomUUID(),
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof RouteUnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof RouteForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof RouteConfigurationError) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: "請求候補を計算できませんでした" }, { status: 503 });
  }
}
