import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/excel-import-register/route";
import { sha256Hex } from "@/src/server/import/file-hash";
import { resetDemoExcelImportRegistrations } from "@/src/server/repositories/excel-import-repository";

describe("POST /api/excel-import-register", () => {
  const previousDemoMode = process.env.DEMO_MODE;
  let bytes: Uint8Array;
  let sha256: string;

  beforeAll(async () => {
    process.env.DEMO_MODE = "true";
    bytes = new Uint8Array(await readFile(path.join(process.cwd(), "7月1日リベティ.xlsx")));
    sha256 = sha256Hex(bytes);
  });
  beforeEach(() => resetDemoExcelImportRegistrations());
  afterAll(() => {
    if (previousDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousDemoMode;
  });

  function request(sourceId: string, previewHash = sha256): Request {
    const formData = new FormData();
    formData.append("file", new Blob([bytes.buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "7月1日リベティ.xlsx");
    return new Request("http://localhost/api/excel-import-register", {
      method: "POST",
      headers: { "x-source-file-version-id": sourceId, "x-preview-sha256": previewHash },
      body: formData,
    });
  }

  it("registers the confirmed workbook and prevents a duplicate hash", async () => {
    const sourceId = "register-july-1";
    const first = await POST(request(sourceId));
    expect(first.status).toBe(201);
    await expect(first.json()).resolves.toMatchObject({ registered: true, shipmentCount: 167, detailCount: 192, demo: true });

    const duplicate = await POST(request("register-july-1-second"));
    expect(duplicate.status).toBe(409);
  });

  it("rejects a file changed after preview", async () => {
    const response = await POST(request("register-changed", "0".repeat(64)));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("変更") });
  });
});
