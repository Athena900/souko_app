import { describe, expect, it } from "vitest";
import { buildDashboardSummary } from "@/src/server/dashboard/dashboard-summary";

describe("dashboard summary", () => {
  it("derives each dashboard state from the actual shipment workflow", () => {
    const summary = buildDashboardSummary({
      shipments: [
        { id: "s1", shipmentNo: "SHP-001", workDate: "2026-08-01", packCount: 1, status: "ready", createdAt: "2026-08-01T01:00:00Z" },
        { id: "s2", shipmentNo: "SHP-002", workDate: "2026-08-02", packCount: 2, status: "ready", createdAt: "2026-08-02T01:00:00Z" },
        { id: "s3", shipmentNo: "SHP-003", workDate: "2026-08-03", packCount: 3, status: "ready", createdAt: "2026-08-03T01:00:00Z" },
        { id: "s4", shipmentNo: "SHP-004", workDate: "2026-08-04", packCount: 4, status: "ready", createdAt: "2026-08-04T01:00:00Z" },
        { id: "s5", shipmentNo: "SHP-005", workDate: "2026-08-05", packCount: 5, status: "exception", createdAt: "2026-08-05T01:00:00Z" },
      ],
      fieldWorkRecords: [
        { id: "f2", shipmentId: "s2", shipmentNo: "SHP-002", status: "submitted", createdAt: "2026-08-02T02:00:00Z" },
        { id: "f3", shipmentId: "s3", shipmentNo: "SHP-003", status: "submitted", createdAt: "2026-08-03T02:00:00Z" },
        { id: "f4", shipmentId: "s4", shipmentNo: "SHP-004", status: "submitted", createdAt: "2026-08-04T02:00:00Z" },
      ],
      billingCandidates: [
        { fieldWorkRecordId: "f3", status: "ready", createdAt: "2026-08-03T03:00:00Z" },
        { fieldWorkRecordId: "f4", status: "approved", createdAt: "2026-08-04T03:00:00Z" },
      ],
    });

    expect(summary).toMatchObject({
      totalShipments: 5,
      totalPackCount: 15,
      enteredShipments: 1,
      pendingShipments: 1,
      attentionShipments: 1,
    });
    expect(summary.states.map((state) => [state.label, state.count])).toEqual([
      ["未着手", 1],
      ["現場入力済み", 1],
      ["確認待ち", 1],
      ["確認済み", 1],
      ["要確認", 1],
    ]);
    expect(summary.recentShipments.map((shipment) => shipment.shipmentNo)).toEqual(["SHP-005", "SHP-004", "SHP-003", "SHP-002", "SHP-001"]);
  });

  it("ignores cancelled shipments and uses the latest work record", () => {
    const summary = buildDashboardSummary({
      shipments: [
        { id: "active", shipmentNo: "SHP-ACTIVE", workDate: "2026-08-01", packCount: 2, status: "ready", createdAt: "2026-08-01T00:00:00Z" },
        { id: "cancelled", shipmentNo: "SHP-CANCELLED", workDate: "2026-08-01", packCount: 8, status: "cancelled", createdAt: "2026-08-02T00:00:00Z" },
      ],
      fieldWorkRecords: [
        { id: "old", shipmentId: "active", shipmentNo: "SHP-ACTIVE", status: "submitted", createdAt: "2026-08-01T01:00:00Z" },
        { id: "latest", shipmentId: "active", shipmentNo: "SHP-ACTIVE", status: "review_required", createdAt: "2026-08-02T01:00:00Z" },
      ],
      billingCandidates: [],
    });

    expect(summary.totalShipments).toBe(1);
    expect(summary.totalPackCount).toBe(2);
    expect(summary.attentionShipments).toBe(1);
  });
});
