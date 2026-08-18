import { usesDemoMemoryStorage } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { listDemoBillingCandidates } from "@/src/server/repositories/billing-candidate-repository";
import { listDemoExcelShipments } from "@/src/server/repositories/excel-import-repository";
import { listDemoBillingSourceFieldWorkRecords } from "@/src/server/repositories/field-work-repository";
import type { ActiveScope } from "@/src/server/auth/active-scope";

type ShipmentStatus = "ready" | "exception" | "cancelled";
type FieldWorkStatus = "draft" | "submitted" | "review_required" | "accepted" | "cancelled";
type BillingStatus = "ready" | "review_required" | "approved" | "rejected";

export type DashboardShipmentState = "未着手" | "現場入力済み" | "確認待ち" | "確認済み" | "要確認";

export interface DashboardSummary {
  totalShipments: number;
  totalPackCount: number;
  enteredShipments: number;
  pendingShipments: number;
  attentionShipments: number;
  states: Array<{ label: DashboardShipmentState; count: number; packCount: number; color: string }>;
  recentShipments: Array<{ shipmentNo: string; workDate: string; packCount: number; state: DashboardShipmentState }>;
}

interface DashboardShipmentRow {
  id: string;
  shipmentNo: string;
  workDate: string;
  packCount: number;
  status: ShipmentStatus;
  createdAt: string;
}

interface DashboardFieldWorkRow {
  id: string;
  shipmentId: string;
  shipmentNo: string;
  status: FieldWorkStatus;
  createdAt: string;
}

interface DashboardBillingCandidateRow {
  fieldWorkRecordId: string;
  status: BillingStatus;
  createdAt: string;
}

const STATE_ORDER: Array<{ label: DashboardShipmentState; color: string }> = [
  { label: "未着手", color: "#9eabb1" },
  { label: "現場入力済み", color: "#39aab0" },
  { label: "確認待ち", color: "#f6b324" },
  { label: "確認済み", color: "#0a6676" },
  { label: "要確認", color: "#e86157" },
];

export class DashboardSummaryError extends Error {}

export function createEmptyDashboardSummary(): DashboardSummary {
  return buildDashboardSummary({ shipments: [], fieldWorkRecords: [], billingCandidates: [] });
}

export function buildDashboardSummary(input: {
  shipments: DashboardShipmentRow[];
  fieldWorkRecords: DashboardFieldWorkRow[];
  billingCandidates: DashboardBillingCandidateRow[];
}): DashboardSummary {
  const latestFieldWorkByShipment = latestBy(input.fieldWorkRecords, (record) => record.shipmentId);
  const latestCandidateByFieldWork = latestBy(input.billingCandidates, (candidate) => candidate.fieldWorkRecordId);
  const activeShipments = input.shipments.filter((shipment) => shipment.status !== "cancelled");
  const rows = activeShipments.map((shipment) => {
    const fieldWork = latestFieldWorkByShipment.get(shipment.id);
    const candidate = fieldWork ? latestCandidateByFieldWork.get(fieldWork.id) : undefined;
    return { shipment, state: shipmentState(shipment, fieldWork, candidate) };
  });

  const states = STATE_ORDER.map(({ label, color }) => ({
    label,
    color,
    count: rows.filter((row) => row.state === label).length,
    packCount: rows.filter((row) => row.state === label).reduce((total, row) => total + row.shipment.packCount, 0),
  }));

  return {
    totalShipments: activeShipments.length,
    totalPackCount: activeShipments.reduce((total, shipment) => total + shipment.packCount, 0),
    enteredShipments: states.find((state) => state.label === "現場入力済み")!.count,
    pendingShipments: states.find((state) => state.label === "確認待ち")!.count,
    attentionShipments: states.find((state) => state.label === "要確認")!.count,
    states,
    recentShipments: [...rows]
      .sort((left, right) => right.shipment.createdAt.localeCompare(left.shipment.createdAt) || right.shipment.workDate.localeCompare(left.shipment.workDate))
      .slice(0, 5)
      .map(({ shipment, state }) => ({ shipmentNo: shipment.shipmentNo, workDate: shipment.workDate, packCount: shipment.packCount, state })),
  };
}

export async function loadDashboardSummary(scope: ActiveScope): Promise<DashboardSummary> {
  if (usesDemoMemoryStorage()) {
    const shipments = listDemoExcelShipments({ clientId: scope.clientId, siteId: scope.siteId, limit: 500 });
    const shipmentIdsByNo = new Map(shipments.map((shipment) => [shipment.shipmentNo, shipment.id]));
    const fieldWorkRecords = listDemoBillingSourceFieldWorkRecords({ clientId: scope.clientId, siteId: scope.siteId, limit: 500 });
    return buildDashboardSummary({
      shipments: shipments.map((shipment) => ({ ...shipment, createdAt: shipment.workDate })),
      fieldWorkRecords: fieldWorkRecords.map((record) => ({
        id: record.id,
        shipmentId: shipmentIdsByNo.get(record.input.shipmentNo) ?? `missing:${record.input.shipmentNo}`,
        shipmentNo: record.input.shipmentNo,
        status: record.status as FieldWorkStatus,
        createdAt: record.createdAt,
      })),
      billingCandidates: listDemoBillingCandidates(scope).map((candidate) => ({
        fieldWorkRecordId: candidate.fieldWorkRecordId,
        status: candidate.status,
        createdAt: candidate.createdAt,
      })),
    });
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    throw new DashboardSummaryError("ダッシュボードの接続設定を確認できませんでした");
  }

  const shipmentsQuery = supabase
    .from("shipments")
    .select("id,shipment_no,work_date,pack_count,status,created_at")
    .eq("client_id", scope.clientId)
    .eq("site_id", scope.siteId)
    .order("created_at", { ascending: false })
    .limit(500);
  const fieldWorkQuery = supabase
    .from("field_work_records")
    .select("id,shipment_id,shipment_no,status,created_at")
    .eq("client_id", scope.clientId)
    .eq("site_id", scope.siteId)
    .order("created_at", { ascending: false })
    .limit(500);
  const candidateQuery = ["office", "manager", "admin"].includes(scope.role)
    ? supabase
      .from("billing_candidates")
      .select("field_work_record_id,status,created_at")
      .eq("client_id", scope.clientId)
      .eq("site_id", scope.siteId)
      .order("created_at", { ascending: false })
      .limit(500)
    : null;

  const [shipmentsResult, fieldWorkResult, candidateResult] = await Promise.all([
    shipmentsQuery,
    fieldWorkQuery,
    candidateQuery ?? Promise.resolve({ data: [], error: null }),
  ]);
  if (shipmentsResult.error || fieldWorkResult.error || candidateResult.error) {
    throw new DashboardSummaryError("ダッシュボードの集計データを読み込めませんでした");
  }

  return buildDashboardSummary({
    shipments: (shipmentsResult.data ?? []).map((row) => ({
      id: row.id,
      shipmentNo: row.shipment_no,
      workDate: row.work_date,
      packCount: row.pack_count,
      status: row.status as ShipmentStatus,
      createdAt: row.created_at,
    })),
    fieldWorkRecords: (fieldWorkResult.data ?? []).map((row) => ({
      id: row.id,
      shipmentId: row.shipment_id,
      shipmentNo: row.shipment_no,
      status: row.status as FieldWorkStatus,
      createdAt: row.created_at,
    })),
    billingCandidates: (candidateResult.data ?? []).map((row) => ({
      fieldWorkRecordId: row.field_work_record_id,
      status: row.status as BillingStatus,
      createdAt: row.created_at,
    })),
  });
}

function shipmentState(
  shipment: DashboardShipmentRow,
  fieldWork: DashboardFieldWorkRow | undefined,
  candidate: DashboardBillingCandidateRow | undefined,
): DashboardShipmentState {
  if (shipment.status === "exception" || fieldWork?.status === "review_required" || candidate?.status === "review_required" || candidate?.status === "rejected") return "要確認";
  if (candidate?.status === "approved") return "確認済み";
  if (candidate?.status === "ready") return "確認待ち";
  if (fieldWork && fieldWork.status !== "cancelled" && fieldWork.status !== "draft") return "現場入力済み";
  return "未着手";
}

function latestBy<Row extends { createdAt: string }>(rows: Row[], keyFor: (row: Row) => string): Map<string, Row> {
  const result = new Map<string, Row>();
  for (const row of rows) {
    const key = keyFor(row);
    const current = result.get(key);
    if (!current || row.createdAt > current.createdAt) result.set(key, row);
  }
  return result;
}
