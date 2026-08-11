import { calculateFieldWorkBilling } from "@/src/domain/pricing";
import type { BillingCalculation, BillingCandidateReviewStatus, FieldWorkInput, PriceRule } from "@/src/domain/types";

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
  demo: boolean;
  persisted: boolean;
}

export class BillingCandidateNotFoundError extends Error {}
export class BillingCandidateReviewError extends Error {}

const demoCandidates = new Map<string, BillingCandidateReview>();
const demoCandidateByRecord = new Map<string, string>();

export function calculateDemoBillingCandidate(
  fieldWorkRecordId: string,
  record: FieldWorkInput,
  rules: PriceRule[],
): BillingCandidateReview {
  const existingId = demoCandidateByRecord.get(fieldWorkRecordId);
  if (existingId) {
    const existing = demoCandidates.get(existingId);
    if (existing && existing.status !== "rejected") return structuredClone(existing);
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
    demo: true,
    persisted: true,
  };
  demoCandidates.set(id, candidate);
  demoCandidateByRecord.set(fieldWorkRecordId, id);
  return structuredClone(candidate);
}

export function calculateTransientBillingCandidate(
  fieldWorkRecordId: string,
  record: FieldWorkInput,
  rules: PriceRule[],
): BillingCandidateReview {
  const id = crypto.randomUUID();
  const calculation = calculateFieldWorkBilling(record, rules, fieldWorkRecordId, id);
  return {
    id,
    fieldWorkRecordId,
    clientId: record.clientId,
    siteId: record.siteId,
    shipmentNo: record.shipmentNo,
    workDate: record.workDate,
    calculation,
    status: calculation.warnings.length > 0 ? "review_required" : "ready",
    demo: false,
    persisted: false,
  };
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
