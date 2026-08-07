import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLibertyWorkbook } from "@/src/domain/excel-import";

const workspace = process.cwd();

describe("parseLibertyWorkbook", () => {
  it("groups the two product rows in the real July 1 workbook into one shipment", async () => {
    const buffer = await readFile(path.join(workspace, "7月1日リベティ.xlsx"));
    const result = await parseLibertyWorkbook(buffer, "file-july-1", { clientId: "client-a", siteId: "site-a" });

    expect(result.exceptions).toHaveLength(0);
    expect(result.shipmentCount).toBe(167);
    const shipment = result.accepted.find((row) => row.shipmentNo === "DR01010018697");
    expect(shipment).toMatchObject({ shipmentNo: "DR01010018697", workDate: "2026-07-01", packCount: 1 });
    expect(shipment?.sourceRowNumbers).toEqual([8, 9]);
    expect(shipment?.productLines).toEqual([
      expect.objectContaining({ lineNo: "1", productId: "106", productName: "マットブラック　S", quantity: 1, sourceRowNumber: 8 }),
      expect.objectContaining({ lineNo: "2", productId: "mobilebattery001", productName: "モバイルバッテリー", quantity: 1, sourceRowNumber: 9 }),
    ]);
  });

  it("keeps the work date and warns when the customer shipment number was converted to scientific notation", async () => {
    const buffer = await readFile(path.join(workspace, "7月15日リベティ様.xlsx"));
    const result = await parseLibertyWorkbook(buffer, "file-july-15", { clientId: "client-a", siteId: "site-a" });

    expect(result.shipmentCount).toBe(48);
    expect(result.accepted.every((row) => row.workDate === "2026-07-15")).toBe(true);
    expect(result.warnings.some((warning) => warning.code === "identifier_precision_risk")).toBe(true);
    expect(result.warnings.some((warning) => warning.code === "missing_box_count")).toBe(true);
  });
});
