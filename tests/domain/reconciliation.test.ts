import { describe, expect, it } from "vitest";
import { reconcileShipmentRows, shipmentKey } from "@/src/domain/reconciliation";

describe("reconcileShipmentRows", () => {
  it("accepts unique rows and rejects duplicates in the same file", () => {
    const result = reconcileShipmentRows(
      [
        { clientId: "c1", siteId: "s1", shipmentNo: "A-001", workDate: "2026-08-06", packCount: "2" },
        { clientId: "c1", siteId: "s1", shipmentNo: "A-001", workDate: "2026-08-06", packCount: "2" },
        { clientId: "c1", siteId: "s1", shipmentNo: "A-002", workDate: "2026-08-06", packCount: "0" },
      ],
      "file-v1",
    );

    expect(result.accepted.map((row) => row.shipmentNo)).toEqual(["A-001", "A-002"]);
    expect(result.exceptions).toHaveLength(1);
    expect(result.exceptions[0].code).toBe("duplicate_in_file");
  });

  it("rejects a shipment already present in the database key set", () => {
    const existing = new Set([shipmentKey("c1", "s1", "A-001")]);
    const result = reconcileShipmentRows(
      [{ clientId: "c1", siteId: "s1", shipmentNo: "A-001", workDate: "2026-08-06", packCount: 1 }],
      "file-v2",
      existing,
    );
    expect(result.accepted).toEqual([]);
    expect(result.exceptions[0].code).toBe("duplicate_existing");
  });

  it("does not guess malformed or missing rows into a shipment", () => {
    const result = reconcileShipmentRows(
      [{ clientId: "c1", siteId: "s1", shipmentNo: "", workDate: "bad", packCount: -1 }],
      "file-v3",
    );
    expect(result.accepted).toEqual([]);
    expect(result.exceptions[0].code).toBe("invalid_row");
  });
});
