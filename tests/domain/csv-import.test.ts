import { describe, expect, it } from "vitest";
import { parseShipmentCsv } from "@/src/domain/csv-import";

describe("parseShipmentCsv", () => {
  it("parses UTF-8 CSV and returns a reconciliation result", () => {
    const csv = [
      "clientId,siteId,shipmentNo,workDate,packCount",
      "c1,s1,A-001,2026-08-06,2",
      "c1,s1,A-002,2026-08-06,1",
    ].join("\n");
    const result = parseShipmentCsv(new TextEncoder().encode(csv), "file-1");
    expect(result.accepted).toHaveLength(2);
    expect(result.accepted[0].sourceFileVersionId).toBe("file-1");
  });

  it("does not silently accept an unknown column contract", () => {
    const csv = "clientId,siteId,wrongShipmentColumn,workDate,packCount\nc1,s1,A-001,2026-08-06,2";
    const result = parseShipmentCsv(new TextEncoder().encode(csv), "file-2");
    expect(result.accepted).toHaveLength(0);
    expect(result.exceptions[0].code).toBe("invalid_row");
  });
});
