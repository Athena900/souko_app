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
  updatedAt?: string;
  demo: boolean;
  persisted: boolean;
}

export class BillingCandidateNotFoundError extends Error {}
export class BillingCandidateReviewError extends Error {}
export class BillingCandidateRuleError extends Error {}
export class BillingCandidatePermissionError extends Error {}
export class BillingCandidateConflictError extends Error {}

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
    updatedAt: new Date().toISOString(),
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
  expectedUpdatedAt?: string,
): BillingCandidateReview {
  const candidate = demoCandidates.get(candidateId);
  if (!candidate || candidate.clientId !== clientId || candidate.siteId !== siteId) {
    throw new BillingCandidateNotFoundError("請求候補が見つかりません");
  }
  if (expectedUpdatedAt && candidate.updatedAt !== expectedUpdatedAt) {
    throw new BillingCandidateConflictError("他の利用者が先に確認しました。最新の状態を表示します");
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
  const updatedAt = new Date().toISOString();
  const reviewed: BillingCandidateReview = {
    ...candidate,
    status,
    reviewedAt: new Date().toISOString(),
    reviewNote: note,
    updatedAt,
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
  if (error.code === "P0005") return new BillingCandidateConflictError(message);
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

export async function getSupabaseBillingCandidate(
  clientId: string,
  siteId: string,
  candidateId: string,
): Promise<BillingCandidateReview | null> {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    throw new PersistenceError("Supabaseに接続できませんでした");
  }

  const { data: candidate, error: candidateError } = await supabase
    .from("billing_candidates")
    .select("id,field_work_record_id,client_id,site_id,shipment_no,work_date,calculation_run_id,status,subtotal_yen,tax_yen,total_yen,warnings,reviewed_at,review_note,created_at,updated_at")
    .eq("id", candidateId)
    .eq("client_id", clientId)
    .eq("site_id", siteId)
    .maybeSingle();
  if (candidateError) throw new PersistenceError("請求候補を読み込めませんでした");
  if (!candidate) return null;

  const { data: lines, error: linesError } = await supabase
    .from("billing_candidate_lines")
    .select("source_type,source_id,work_code,description,quantity,unit_price_yen,subtotal_yen,tax_yen,total_yen,price_rule_id,price_rule_version,calculation_run_id")
    .eq("calculation_run_id", candidate.calculation_run_id)
    .order("created_at", { ascending: true });
  if (linesError) throw new PersistenceError("請求明細を読み込めませんでした");

  return parsePersistedCandidate({
    id: candidate.id,
    fieldWorkRecordId: candidate.field_work_record_id,
    clientId: candidate.client_id,
    siteId: candidate.site_id,
    shipmentNo: candidate.shipment_no,
    workDate: candidate.work_date,
    calculation: {
      calculationRunId: candidate.calculation_run_id,
      lines: (lines ?? []).map((line) => ({
        sourceType: line.source_type,
        sourceId: line.source_id,
        workCode: line.work_code,
        description: line.description,
        quantity: line.quantity,
        unitPriceYen: Number(line.unit_price_yen),
        subtotalYen: Number(line.subtotal_yen),
        taxYen: Number(line.tax_yen),
        totalYen: Number(line.total_yen),
        priceRuleId: line.price_rule_id,
        priceRuleVersion: line.price_rule_version,
        calculationRunId: line.calculation_run_id,
      })),
      subtotalYen: Number(candidate.subtotal_yen),
      taxYen: Number(candidate.tax_yen),
      totalYen: Number(candidate.total_yen),
      warnings: Array.isArray(candidate.warnings) ? candidate.warnings.filter((warning): warning is string => typeof warning === "string") : [],
    },
    status: candidate.status,
    ...(candidate.reviewed_at ? { reviewedAt: candidate.reviewed_at } : {}),
    ...(candidate.review_note ? { reviewNote: candidate.review_note } : {}),
    updatedAt: candidate.updated_at,
    demo: false,
    persisted: true,
  });
}

export async function reviewSupabaseBillingCandidate(
  clientId: string,
  siteId: string,
  candidateId: string,
  status: "approved" | "rejected",
  note?: string,
  expectedUpdatedAt?: string,
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
    p_expected_updated_at: expectedUpdatedAt ?? null,
  });
  if (error) throw mapRpcError(error);
  return parsePersistedCandidate(data);
}
