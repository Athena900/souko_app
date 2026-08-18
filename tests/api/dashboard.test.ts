import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/dashboard/route";
import { calculateDemoBillingCandidate, resetDemoBillingCandidates } from "@/src/server/repositories/billing-candidate-repository";
import { createDemoExcelImportRepository, resetDemoExcelImportRegistrations } from "@/src/server/repositories/excel-import-repository";
import { createDemoFieldWorkRepository, resetDemoFieldWorkRecords } from "@/src/server/repositories/field-work-repository";
import { demoFieldWorkInput, demoPriceRules } from "@/src/domain/demo-fixtures";

describe("GET /api/dashboard", () => {
  const previousDemoMode = process.env.DEMO_MODE;
  const previousStorageMode = process.env.DEMO_STORAGE;

  beforeAll(() => {
    process.env.DEMO_MODE = "true";
    process.env.DEMO_STORAGE = "memory";
  });
  beforeEach(() => {
    resetDemoExcelImportRegistrations();
    resetDemoFieldWorkRecords();
    resetDemoBillingCandidates();
  });
  afterAll(() => {
    if (previousDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousDemoMode;
    if (previousStorageMode === undefined) delete process.env.DEMO_STORAGE;
    else process.env.DEMO_STORAGE = previousStorageMode;
  });

  it("aggregates imported shipments and a billing candidate from the current scope", async () => {
    await createDemoExcelImportRepository().register({
      sourceFileVersionId: "source-dashboard",
      clientId: "demo-client",
      siteId: "demo-site",
      originalName: "dashboard.xlsx",
      sha256: "d".repeat(64),
      fileBytes: new Uint8Array(),
      rows: [{ clientId: "demo-client", siteId: "demo-site", shipmentNo: "SHP-DASHBOARD", workDate: "2026-08-18", packCount: 2, sourceRowNumber: 2, sourceFileVersionId: "source-dashboard" }],
    });
    const stored = await createDemoFieldWorkRepository().create({ ...demoFieldWorkInput, shipmentNo: "SHP-DASHBOARD", workDate: "2026-08-18", idempotencyKey: "dashboard-record" });
    calculateDemoBillingCandidate(stored.id, { ...demoFieldWorkInput, shipmentNo: "SHP-DASHBOARD", workDate: "2026-08-18" }, demoPriceRules);

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      summary: {
        totalShipments: 1,
        totalPackCount: 2,
        enteredShipments: 0,
        pendingShipments: 1,
        attentionShipments: 0,
        recentShipments: [{ shipmentNo: "SHP-DASHBOARD", state: "確認待ち" }],
      },
    });
  });
});
