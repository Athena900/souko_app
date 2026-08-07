import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/import-preview/route";

describe("POST /api/import-preview", () => {
  const previousDemoMode = process.env.DEMO_MODE;
  beforeAll(() => { process.env.DEMO_MODE = "true"; });
  afterAll(() => {
    if (previousDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousDemoMode;
  });

  it("returns accepted rows and exceptions for a CSV", async () => {
    const csv = "clientId,siteId,shipmentNo,workDate,packCount\nc1,s1,A-001,2026-08-06,2";
    const response = await POST(new Request("http://localhost/api/import-preview", {
      method: "POST",
      headers: { "content-type": "text/csv", "x-source-file-version-id": "file-1" },
      body: csv,
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).accepted).toHaveLength(1);
  });

  it("requires a source version id", async () => {
    const response = await POST(new Request("http://localhost/api/import-preview", {
      method: "POST",
      headers: { "content-type": "text/csv" },
      body: "clientId,siteId,shipmentNo,workDate,packCount",
    }));
    expect(response.status).toBe(400);
  });
});
