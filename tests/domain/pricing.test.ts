import { describe, expect, it } from "vitest";
import { demoFieldWorkInput, demoPriceRules } from "@/src/domain/demo-fixtures";
import { calculateFieldWorkBilling, calculateLineTotal } from "@/src/domain/pricing";

describe("calculateFieldWorkBilling", () => {
  it("calculates shipment, packs, materials, and additional work in yen", () => {
    const result = calculateFieldWorkBilling(demoFieldWorkInput, demoPriceRules, "field-1", "run-1");

    expect(result.subtotalYen).toBe(1_060);
    expect(result.taxYen).toBe(106);
    expect(result.totalYen).toBe(1_166);
    expect(result.warnings).toEqual([]);
    expect(result.lines).toHaveLength(4);
    expect(result.lines.every((line) => line.calculationRunId === "run-1")).toBe(true);
  });

  it("uses the highest-priority active rule without changing historical dates", () => {
    const result = calculateFieldWorkBilling(
      { ...demoFieldWorkInput, workDate: "2026-08-06", packCount: 1 },
      [
        ...demoPriceRules,
        {
          ...demoPriceRules[1],
          id: "new-pack-rule",
          version: 2,
          unitPriceYen: 200,
          effectiveFrom: "2026-08-01",
          priority: 20,
        },
      ],
      "field-2",
      "run-2",
    );

    expect(result.lines.find((line) => line.workCode === "pack_count")?.unitPriceYen).toBe(200);

    const oldResult = calculateFieldWorkBilling(
      { ...demoFieldWorkInput, workDate: "2026-07-31", packCount: 1 },
      [
        ...demoPriceRules,
        {
          ...demoPriceRules[1],
          id: "future-pack-rule",
          version: 2,
          unitPriceYen: 200,
          effectiveFrom: "2026-08-01",
          priority: 20,
        },
      ],
      "field-3",
      "run-3",
    );
    expect(oldResult.lines.find((line) => line.workCode === "pack_count")?.unitPriceYen).toBe(100);
  });

  it("keeps missing prices visible as warnings instead of silently billing", () => {
    const result = calculateFieldWorkBilling(
      { ...demoFieldWorkInput, materialLines: [{ code: "unknown", name: "不明資材", quantity: 2 }] },
      demoPriceRules,
      "field-4",
    );
    expect(result.warnings).toContain("資材「unknown」の有効な単価がありません");
    expect(result.lines.some((line) => line.description === "不明資材")).toBe(false);
  });

  it("calculates line totals from integer yen values", () => {
    expect(calculateLineTotal({ quantity: 3, unitPriceYen: 20, taxYen: 6 })).toBe(66);
  });
});
