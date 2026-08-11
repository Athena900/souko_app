import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as billingPreview } from "@/app/api/billing-preview/route";
import { POST as fieldRecords } from "@/app/api/field-records/route";
import { POST as importPreview } from "@/app/api/import-preview/route";
import { GET as shipments } from "@/app/api/shipments/route";

const record = {
  clientId: "client-a",
  siteId: "site-1",
  shipmentNo: "S-100",
  workDate: "2026-08-06",
  packCount: 1,
  materialLines: [],
  additionalWorkLines: [],
  boxDetails: [],
  photoPaths: [],
};

function sameOriginHeaders(contentType = "application/json") {
  return {
    "content-type": contentType,
    origin: "http://localhost",
    host: "localhost",
  };
}

describe("API security boundaries", () => {
  const originalDemoMode = process.env.DEMO_MODE;

  beforeEach(() => {
    delete process.env.DEMO_MODE;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  });

  afterEach(() => {
    if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = originalDemoMode;
  });

  it("does not calculate a billing preview from client-supplied rules in production mode", async () => {
    const response = await billingPreview(
      new Request("http://localhost/api/billing-preview", {
        method: "POST",
        headers: sameOriginHeaders(),
        body: JSON.stringify({
          sourceId: "source-1",
          record,
          priceRules: [
            {
              id: "rule-client",
              version: 1,
              workCode: "shipment_base",
              kind: "shipment",
              unitPriceYen: 1,
              taxRateBps: 0,
              effectiveFrom: "2026-01-01",
              priority: 0,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "認証基盤に接続できませんでした" });
  });

  it("rejects a field record without production Supabase configuration", async () => {
    const response = await fieldRecords(
      new Request("http://localhost/api/field-records", {
        method: "POST",
        headers: sameOriginHeaders(),
        body: JSON.stringify({
          ...record,
          idempotencyKey: "field:client-a:site-1:S-100:2026-08-06",
        }),
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Supabaseの設定が必要です" });
  });

  it("does not list shipments without production Supabase configuration", async () => {
    const response = await shipments(new Request("http://localhost/api/shipments?clientId=client-a&siteId=site-1"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Supabaseの設定が必要です" });
  });

  it("requires scope headers before parsing a production CSV", async () => {
    const response = await importPreview(
      new Request("http://localhost/api/import-preview", {
        method: "POST",
        headers: {
          ...sameOriginHeaders("text/csv"),
          "x-source-file-version-id": "source-1",
        },
        body: "shipment_no,client_id,site_id,work_date,pack_count\nS-100,client-a,site-1,2026-08-06,1\n",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "荷主・拠点ヘッダーが必要です" });
  });

  it("rejects cross-origin requests outside demo mode", async () => {
    const response = await fieldRecords(
      new Request("http://localhost/api/field-records", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
          host: "localhost",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "不正なリクエストです" });
  });

  it("enforces the JSON body limit even when Content-Length is absent", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";
    const response = await fieldRecords(
      new Request("http://localhost/api/field-records", {
        method: "POST",
        headers: sameOriginHeaders(),
        body: `${JSON.stringify(record)}${"x".repeat(1_000_001)}`,
      }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "リクエストが大きすぎます" });
  });
});
