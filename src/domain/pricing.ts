import type {
  AdditionalWorkLine,
  BillingCalculation,
  BillingCandidateLine,
  FieldWorkInput,
  MaterialLine,
  PriceRule,
} from "@/src/domain/types";

function roundTax(subtotalYen: number, taxRateBps: number): number {
  return Math.floor((subtotalYen * taxRateBps + 5_000) / 10_000);
}

function isRuleActive(rule: PriceRule, workDate: string): boolean {
  return rule.effectiveFrom <= workDate && (!rule.effectiveTo || workDate <= rule.effectiveTo);
}

function selectRule(
  rules: PriceRule[],
  kind: PriceRule["kind"],
  workDate: string,
  materialCode?: string,
  workCode?: string,
): PriceRule | undefined {
  return rules
    .filter((rule) => rule.kind === kind && isRuleActive(rule, workDate))
    .filter((rule) => (kind === "material" ? rule.materialCode === materialCode : !workCode || rule.workCode === workCode))
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))[0];
}

function makeLine(
  sourceId: string,
  calculationRunId: string,
  rule: PriceRule,
  description: string,
  quantity: number,
): BillingCandidateLine {
  const subtotalYen = rule.unitPriceYen * quantity;
  const taxYen = roundTax(subtotalYen, rule.taxRateBps);
  return {
    sourceType: "field_work",
    sourceId,
    workCode: rule.workCode,
    description,
    quantity,
    unitPriceYen: rule.unitPriceYen,
    subtotalYen,
    taxYen,
    totalYen: subtotalYen + taxYen,
    priceRuleId: rule.id,
    priceRuleVersion: rule.version,
    calculationRunId,
  };
}

function addMaterialLines(
  lines: BillingCandidateLine[],
  warnings: string[],
  record: FieldWorkInput,
  rules: PriceRule[],
  sourceId: string,
  calculationRunId: string,
): void {
  for (const material of record.materialLines) {
    if (material.quantity === 0) continue;
    const rule = selectRule(rules, "material", record.workDate, material.code);
    if (!rule) {
      warnings.push(`資材「${material.code}」の有効な単価がありません`);
      continue;
    }
    lines.push(makeLine(sourceId, calculationRunId, rule, material.name, material.quantity));
  }
}

function addAdditionalWorkLines(
  lines: BillingCandidateLine[],
  warnings: string[],
  workLines: AdditionalWorkLine[],
  record: FieldWorkInput,
  rules: PriceRule[],
  sourceId: string,
  calculationRunId: string,
): void {
  for (const work of workLines) {
    if (work.quantity === 0) continue;
    const rule = selectRule(rules, "additional_work", record.workDate, undefined, work.code);
    if (!rule) {
      warnings.push(`追加作業「${work.code}」の有効な単価がありません`);
      continue;
    }
    lines.push(makeLine(sourceId, calculationRunId, rule, work.name, work.quantity));
  }
}

export function calculateFieldWorkBilling(
  record: FieldWorkInput,
  rules: PriceRule[],
  sourceId: string,
  calculationRunId = "preview",
): BillingCalculation {
  const lines: BillingCandidateLine[] = [];
  const warnings: string[] = [];

  const shipmentRule = selectRule(rules, "shipment", record.workDate, undefined, "shipment_handling");
  if (shipmentRule) {
    lines.push(makeLine(sourceId, calculationRunId, shipmentRule, "出荷基本作業", 1));
  } else {
    warnings.push("出荷基本作業の有効な単価がありません");
  }

  if (record.packCount > 0) {
    const packRule = selectRule(rules, "pack", record.workDate, undefined, "pack_count");
    if (packRule) {
      lines.push(makeLine(sourceId, calculationRunId, packRule, "梱包箱数", record.packCount));
    } else {
      warnings.push("梱包数の有効な単価がありません");
    }
  }

  addMaterialLines(lines, warnings, record, rules, sourceId, calculationRunId);
  addAdditionalWorkLines(lines, warnings, record.additionalWorkLines, record, rules, sourceId, calculationRunId);

  const subtotalYen = lines.reduce((sum, line) => sum + line.subtotalYen, 0);
  const taxYen = lines.reduce((sum, line) => sum + line.taxYen, 0);
  return {
    calculationRunId,
    lines,
    subtotalYen,
    taxYen,
    totalYen: subtotalYen + taxYen,
    warnings,
  };
}

export function calculateLineTotal(line: Pick<BillingCandidateLine, "quantity" | "unitPriceYen" | "taxYen">): number {
  return line.quantity * line.unitPriceYen + line.taxYen;
}

export function summarizeMaterialQuantity(lines: MaterialLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}
