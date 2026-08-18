import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/shipments/route";
import type { ShipmentRow } from "@/src/domain/types";
import {
  createDemoExcelImportRepository,
  resetDemoExcelImportRegistrations,
} from "@/src/server/repositories/excel-import-repository";

describe("GET /api/shipments", () => {
  const previousDemoMode = process.env.DEMO_MODE;

  beforeAll(() => { process.env.DEMO_MODE = "true"; });
  beforeEach(() => resetDemoExcelImportRegistrations());
  afterAll(() => {
    if (previousDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousDemoMode;
  });

  it("returns registered shipments scoped to the requested client and site", async () => {
    const rows: ShipmentRow[] = [
      {
        clientId: "demo-client",
        siteId: "demo-site",
        shipmentNo: "SHP-100",
        workDate: "2026-08-01",
        packCount: 2,
        sourceRowNumber: 2,
        sourceFileVersionId: "source-1",
      },
      {
        clientId: "demo-client",
        siteId: "demo-site",
        shipmentNo: "SHP-200",
        workDate: "2026-08-02",
        packCount: 1,
        sourceRowNumber: 3,
        sourceFileVersionId: "source-1",
      },
    ];
    await createDemoExcelImportRepository().register({
      sourceFileVersionId: "source-1",
      clientId: "demo-client",
      siteId: "demo-site",
      originalName: "source.xlsx",
      sha256: "a".repeat(64),
      fileBytes: new Uint8Array(),
      rows,
    });

    const response = await GET(new Request("http://localhost/api/shipments?clientId=demo-client&siteId=demo-site&search=200"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      shipments: [{ id: expect.stringMatching(/^demo-/), shipmentNo: "SHP-200", workDate: "2026-08-02", packCount: 1, status: "ready" }],
    });

    const otherScope = await GET(new Request("http://localhost/api/shipments?clientId=other-client&siteId=demo-site"));
    await expect(otherScope.json()).resolves.toEqual({ shipments: [] });
  });

  it("uses the demo scope when no scope query is supplied", async () => {
    const response = await GET(new Request("http://localhost/api/shipments"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ shipments: [] });
  });

  it("rejects an invalid limit and date before reading data", async () => {
    const invalidLimit = await GET(new Request("http://localhost/api/shipments?limit=501"));
    expect(invalidLimit.status).toBe(400);
    const invalidDate = await GET(new Request("http://localhost/api/shipments?workDate=2026/08/01"));
    expect(invalidDate.status).toBe(400);
  });
});
