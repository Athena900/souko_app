import { NextResponse } from "next/server";
import { billingCandidateReviewRequestSchema } from "@/src/domain/validation";
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
  BillingCandidateNotFoundError,
  BillingCandidateConflictError,
  BillingCandidatePermissionError,
  BillingCandidateReviewError,
  reviewSupabaseBillingCandidate,
  reviewDemoBillingCandidate,
} from "@/src/server/repositories/billing-candidate-repository";
import { PersistenceError } from "@/src/server/repositories/field-work-repository";
import { assertTrialWriteAllowed, TrialWriteDisabledError } from "@/src/server/trial/trial-write-guard";

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
  try {
    assertTrialWriteAllowed();
  } catch (error) {
    if (error instanceof TrialWriteDisabledError) return NextResponse.json({ error: error.message }, { status: 423 });
    return NextResponse.json({ error: "試用期間を確認できませんでした" }, { status: 503 });
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

  const parsed = billingCandidateReviewRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "確認内容を確認してください", issues: parsed.error.issues }, { status: 400 });

  try {
    const result = useMemoryStorage
      ? reviewDemoBillingCandidate(
          parsed.data.candidateId,
          parsed.data.clientId,
          parsed.data.siteId,
          parsed.data.status,
          parsed.data.note,
          parsed.data.expectedUpdatedAt,
        )
      : (
          await requireMembership(parsed.data.clientId, parsed.data.siteId, ["office", "manager", "admin"]),
          await reviewSupabaseBillingCandidate(
            parsed.data.clientId,
            parsed.data.siteId,
            parsed.data.candidateId,
            parsed.data.status,
            parsed.data.note,
            parsed.data.expectedUpdatedAt,
          )
        );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof RouteUnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof RouteForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof BillingCandidatePermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof RouteConfigurationError || error instanceof PersistenceError) return NextResponse.json({ error: error.message }, { status: 503 });
    if (error instanceof BillingCandidateNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof BillingCandidateConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof BillingCandidateReviewError) return NextResponse.json({ error: error.message }, { status: 422 });
    return NextResponse.json({ error: "確認結果を保存できませんでした" }, { status: 500 });
  }
}
