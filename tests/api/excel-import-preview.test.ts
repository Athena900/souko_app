import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/excel-import-preview/route";

describe("POST /api/excel-import-preview", () => {
  const previousDemoMode = process.env.DEMO_MODE;
  beforeAll(() => { process.env.DEMO_MODE = "true"; });
  afterAll(() => {
    if (previousDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousDemoMode;
  });

  it("previews the real workbook without treating detail rows as duplicate shipments", async () => {
    const bytes = await readFile(path.join(process.cwd(), "7月1日リベティ.xlsx"));
    const formData = new FormData();
    formData.append("file", new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "7月1日リベティ.xlsx");

    const response = await POST(new Request("http://localhost/api/excel-import-preview", {
      method: "POST",
      headers: { "x-source-file-version-id": "file-july-1" },
      body: formData,
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.shipmentCount).toBe(167);
    expect(body.accepted.find((row: { shipmentNo: string }) => row.shipmentNo === "DR01010018697").productLines).toHaveLength(2);
  });

  it("requires an uploaded xlsx file", async () => {
    const formData = new FormData();
    const response = await POST(new Request("http://localhost/api/excel-import-preview", {
      method: "POST",
      headers: { "x-source-file-version-id": "file-empty" },
      body: formData,
    }));

    expect(response.status).toBe(400);
  });
});
