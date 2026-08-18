import { calculateFieldWorkBilling } from "@/src/domain/pricing";
import type { BillingCalculation, BillingCandidateReviewStatus, FieldWorkInput, PriceRule } from "@/src/domain/types";
import { billingCandidateResponseSchema } from "@/src/domain/validation";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { PersistenceError } from "@/src/server/repositories/field-work-repository";

export interface BillingCandidateReview {
  id: string;
  fieldWorkRecordId: string;
  clientId: string;
  siteId: string;
  shipmentNo: string;
  workDate: string;
  calculation: BillingCalculation;
  status: BillingCandidateReviewStatus;
  reviewedAt?: string;
  reviewNote?: string;
  createdAt?: string;
  demo: boolean;
  persisted: boolean;
}

export class BillingCandidateNotFoundError extends Error {}
export class BillingCandidateReviewError extends Error {}
export class BillingCandidateRuleError extends Error {}
export class BillingCandidatePermissionError extends Error {}

const demoCandidates = new Map<string, BillingCandidateReview>();
const demoCandidateByRecord = new Map<string, string>();

export function calculateDemoBillingCandidate(
  fieldWorkRecordId: string,
  record: FieldWorkInput,
  rules: PriceRule[],
  forceRecalculate = false,
): BillingCandidateReview {
  const existingId = demoCandidateByRecord.get(fieldWorkRecordId);
  if (existingId) {
    const existing = demoCandidates.get(existingId);
    if (existing && (!forceRecalculate || (existing.status !== "approved" && existing.status !== "rejected"))) {
      return structuredClone(existing);
    }
  }

  const id = `demo-${crypto.randomUUID()}`;
  const calculation = calculateFieldWorkBilling(record, rules, fieldWorkRecordId, id);
  const candidate: BillingCandidateReview = {
    id,
    fieldWorkRecordId,
    clientId: record.clientId,
    siteId: record.siteId,
    shipmentNo: record.shipmentNo,
    workDate: record.workDate,
    calculation,
    status: calculation.warnings.length > 0 ? "review_required" : "ready",
    createdAt: new Date().toISOString(),
    demo: true,
    persisted: true,
  };
  demoCandidates.set(id, candidate);
  demoCandidateByRecord.set(fieldWorkRecordId, id);
  return structuredClone(candidate);
}

export function listDemoBillingCandidates(filters: { clientId: string; siteId: string }): Array<Required<Pick<BillingCandidateReview, "fieldWorkRecordId" | "status" | "createdAt">> & Pick<BillingCandidateReview, "clientId" | "siteId">> {
  return [...demoCandidates.values()]
    .filter((candidate) => candidate.clientId === filters.clientId && candidate.siteId === filters.siteId)
    .map((candidate) => ({
      clientId: candidate.clientId,
      siteId: candidate.siteId,
      fieldWorkRecordId: candidate.fieldWorkRecordId,
      status: candidate.status,
      createdAt: candidate.createdAt ?? "",
    }));
}

export function reviewDemoBillingCandidate(
  candidateId: string,
  clientId: string,
  siteId: string,
  status: "approved" | "rejected",
  note?: string,
): BillingCandidateReview {
  const candidate = demoCandidates.get(candidateId);
  if (!candidate || candidate.clientId !== clientId || candidate.siteId !== siteId) {
    throw new BillingCandidateNotFoundError("請求候補が見つかりません");
  }
  if (candidate.status === "approved" || candidate.status === "rejected") {
    throw new BillingCandidateReviewError("確認済み・差し戻し済みの候補は再計算してください");
  }
  if (status === "rejected" && !note) {
    throw new BillingCandidateReviewError("差し戻しには確認メモが必要です");
  }
  if (candidate.calculation.warnings.length > 0 && status === "approved" && !note) {
    throw new BillingCandidateReviewError("警告がある候補には確認メモが必要です");
  }
  const reviewed: BillingCandidateReview = {
    ...candidate,
    status,
    reviewedAt: new Date().toISOString(),
    reviewNote: note,
  };
  demoCandidates.set(candidateId, reviewed);
  return structuredClone(reviewed);
}

export function getDemoBillingCandidate(candidateId: string, clientId: string, siteId: string): BillingCandidateReview | null {
  const candidate = demoCandidates.get(candidateId);
  if (!candidate || candidate.clientId !== clientId || candidate.siteId !== siteId) return null;
  return structuredClone(candidate);
}

export function resetDemoBillingCandidates(): void {
  demoCandidates.clear();
  demoCandidateByRecord.clear();
}

function mapRpcError(error: { code?: string; message?: string }): Error {
  const message = error.message ?? "請求候補のDB処理に失敗しました";
  if (error.code === "P0002") return new BillingCandidateNotFoundError(message);
  if (error.code === "P0003") return new BillingCandidateRuleError(message);
  if (error.code === "P0004") return new BillingCandidateReviewError(message);
  if (error.code === "42501") return new BillingCandidatePermissionError(message);
  return new PersistenceError("請求候補のDB処理に失敗しました");
}

function parsePersistedCandidate(data: unknown): BillingCandidateReview {
  const parsed = billingCandidateResponseSchema.safeParse(data);
  if (!parsed.success) throw new PersistenceError("請求候補のDB応答を確認できませんでした");
  return parsed.data;
}

export async function persistSupabaseBillingCandidate(
  clientId: string,
  siteId: string,
  fieldWorkRecordId: string,
  forceRecalculate = false,
): Promise<BillingCandidateReview> {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    throw new PersistenceError("Supabaseに接続できませんでした");
  }

  const { data, error } = await supabase.rpc("persist_billing_candidate", {
    p_client_id: clientId,
    p_site_id: siteId,
    p_field_work_record_id: fieldWorkRecordId,
    p_force_recalculate: forceRecalculate,
  });
  if (error) throw mapRpcError(error);
  return parsePersistedCandidate(data);
}

export async function reviewSupabaseBillingCandidate(
  clientId: string,
  siteId: string,
  candidateId: string,
  status: "approved" | "rejected",
  note?: string,
): Promise<BillingCandidateReview> {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    throw new PersistenceError("Supabaseに接続できませんでした");
  }

  const { data, error } = await supabase.rpc("review_billing_candidate", {
    p_client_id: clientId,
    p_site_id: siteId,
    p_candidate_id: candidateId,
    p_status: status,
    p_note: note ?? null,
  });
  if (error) throw mapRpcError(error);
  return parsePersistedCandidate(data);
}
