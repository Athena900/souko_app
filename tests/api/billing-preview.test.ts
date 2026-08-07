import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/billing-preview/route";
import { demoFieldWorkInput, demoPriceRules } from "@/src/domain/demo-fixtures";

describe("POST /api/billing-preview", () => {
  const previousDemoMode = process.env.DEMO_MODE;
  beforeAll(() => { process.env.DEMO_MODE = "true"; });
  afterAll(() => {
    if (previousDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousDemoMode;
  });

  it("returns a calculation for a valid request", async () => {
    const response = await POST(new Request("http://localhost/api/billing-preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceId: "field-1", record: demoFieldWorkInput, priceRules: demoPriceRules }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.totalYen).toBe(1_166);
    expect(body.lines).toHaveLength(4);
  });

  it("returns 400 and does not calculate malformed input", async () => {
    const response = await POST(new Request("http://localhost/api/billing-preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceId: "field-1", record: { shipmentNo: "" }, priceRules: [] }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("入力内容");
  });
});
