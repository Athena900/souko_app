export type PriceRuleKind = "shipment" | "pack" | "material" | "additional_work";

export type FieldWorkStatus = "draft" | "submitted" | "review_required" | "accepted" | "cancelled";

export type BillingCandidateReviewStatus = "ready" | "review_required" | "approved" | "rejected";

export interface MaterialLine {
  code: string;
  name: string;
  quantity: number;
}

export interface AdditionalWorkLine {
  code: string;
  name: string;
  quantity: number;
}

export interface BoxItem {
  sku: string;
  name?: string;
  quantity: number;
}

export interface BoxDetail {
  boxNo: string;
  items: BoxItem[];
  materialLines: MaterialLine[];
}

export interface FieldWorkInput {
  idempotencyKey?: string;
  clientId: string;
  siteId: string;
  shipmentNo: string;
  workDate: string;
  packCount: number;
  materialLines: MaterialLine[];
  additionalWorkLines: AdditionalWorkLine[];
  boxDetails: BoxDetail[];
  exceptionReason?: string;
  notes?: string;
  photoPaths?: string[];
}

export interface ShipmentRow {
  clientId: string;
  siteId: string;
  shipmentNo: string;
  workDate: string;
  packCount: number;
  sourceRowNumber: number;
  sourceFileVersionId: string;
  sourceSheetName?: string;
  sourceRowNumbers?: number[];
  consignorName?: string;
  customerShipmentNo?: string;
  waybillNo?: string;
  productLines?: ShipmentLine[];
}

export interface ShipmentLine {
  lineNo: string;
  productId: string;
  productName: string;
  quantity: number;
  sourceRowNumber: number;
}

export interface PriceRule {
  id: string;
  version: number;
  workCode: string;
  kind: PriceRuleKind;
  materialCode?: string;
  unitPriceYen: number;
  taxRateBps: number;
  effectiveFrom: string;
  effectiveTo?: string;
  priority: number;
}

export interface BillingCandidateLine {
  sourceType: "field_work" | "shipment";
  sourceId: string;
  workCode: string;
  description: string;
  quantity: number;
  unitPriceYen: number;
  subtotalYen: number;
  taxYen: number;
  totalYen: number;
  priceRuleId: string;
  priceRuleVersion: number;
  calculationRunId: string;
}

export interface BillingCalculation {
  calculationRunId: string;
  lines: BillingCandidateLine[];
  subtotalYen: number;
  taxYen: number;
  totalYen: number;
  warnings: string[];
}

export interface ReconciliationException {
  sourceRowNumber: number;
  code: "invalid_row" | "duplicate_in_file" | "duplicate_existing";
  message: string;
  shipmentNo?: string;
}

export interface ReconciliationResult {
  accepted: ShipmentRow[];
  exceptions: ReconciliationException[];
}
