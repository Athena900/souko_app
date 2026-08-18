import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as fieldRecords, POST as createFieldRecord } from "@/app/api/field-records/route";
import { GET as getCandidate, POST as createCandidate } from "@/app/api/billing-candidates/route";
import { POST as reviewCandidate } from "@/app/api/billing-candidates/review/route";
import { demoFieldWorkInput } from "@/src/domain/demo-fixtures";
import { resetDemoBillingCandidates } from "@/src/server/repositories/billing-candidate-repository";
import { resetDemoFieldWorkRecords } from "@/src/server/repositories/field-work-repository";

describe("billing candidate review APIs", () => {
  const previousDemoMode = process.env.DEMO_MODE;

  beforeAll(() => { process.env.DEMO_MODE = "true"; });
  beforeEach(() => {
    resetDemoFieldWorkRecords();
    resetDemoBillingCandidates();
  });
  afterAll(() => {
    if (previousDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousDemoMode;
  });

  it("lists a saved field record, calculates a candidate, and saves an approval", async () => {
    const saved = await createFieldRecord(new Request("http://localhost/api/field-records", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...demoFieldWorkInput, idempotencyKey: "billing-candidate-test" }),
    }));
    expect(saved.status).toBe(201);
    const savedBody = await saved.json() as { id: string };

    const list = await fieldRecords(new Request("http://localhost/api/field-records?clientId=demo-client&siteId=demo-site"));
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toMatchObject({ records: [{ id: savedBody.id, shipmentNo: "DEMO-001", workDate: "2026-08-06", packCount: 2 }] });

    const response = await createCandidate(new Request("http://localhost/api/billing-candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "demo-client", siteId: "demo-site", fieldWorkRecordId: savedBody.id }),
    }));
    expect(response.status).toBe(201);
    const candidate = await response.json();
    expect(candidate).toMatchObject({ status: "ready", persisted: true, updatedAt: expect.any(String), calculation: { totalYen: 1_166, lines: expect.any(Array) } });
    expect(candidate.calculation.lines).toHaveLength(4);

    const loaded = await getCandidate(new Request(`http://localhost/api/billing-candidates?clientId=demo-client&siteId=demo-site&candidateId=${candidate.id}`));
    expect(loaded.status).toBe(200);
    await expect(loaded.json()).resolves.toMatchObject({ id: candidate.id, updatedAt: candidate.updatedAt, persisted: true });

    const rejectedWithoutNote = await reviewCandidate(new Request("http://localhost/api/billing-candidates/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "demo-client", siteId: "demo-site", candidateId: candidate.id, status: "rejected", expectedUpdatedAt: candidate.updatedAt }),
    }));
    expect(rejectedWithoutNote.status).toBe(422);

    const approval = await reviewCandidate(new Request("http://localhost/api/billing-candidates/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "demo-client", siteId: "demo-site", candidateId: candidate.id, status: "approved", note: "内容を確認しました", expectedUpdatedAt: candidate.updatedAt }),
    }));
    expect(approval.status).toBe(200);
    await expect(approval.json()).resolves.toMatchObject({ id: candidate.id, status: "approved", reviewNote: "内容を確認しました" });

    const reReview = await reviewCandidate(new Request("http://localhost/api/billing-candidates/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "demo-client", siteId: "demo-site", candidateId: candidate.id, status: "rejected", note: "再確認", expectedUpdatedAt: candidate.updatedAt }),
    }));
    expect(reReview.status).toBe(409);

    const recalculated = await createCandidate(new Request("http://localhost/api/billing-candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "demo-client", siteId: "demo-site", fieldWorkRecordId: savedBody.id, recalculate: true }),
    }));
    expect(recalculated.status).toBe(201);
    await expect(recalculated.json()).resolves.toMatchObject({ status: "ready", persisted: true, id: expect.not.stringMatching(`^${candidate.id}$`) });
  });

  it("requires a note before approving a candidate with a warning", async () => {
    const saved = await createFieldRecord(new Request("http://localhost/api/field-records", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...demoFieldWorkInput,
        shipmentNo: "DEMO-WARNING",
        materialLines: [{ code: "unknown_material", name: "不明資材", quantity: 1 }],
        idempotencyKey: "billing-warning-test",
      }),
    }));
    const savedBody = await saved.json() as { id: string };
    const response = await createCandidate(new Request("http://localhost/api/billing-candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "demo-client", siteId: "demo-site", fieldWorkRecordId: savedBody.id }),
    }));
    const candidate = await response.json();
    expect(candidate.status).toBe("review_required");

    const withoutNote = await reviewCandidate(new Request("http://localhost/api/billing-candidates/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "demo-client", siteId: "demo-site", candidateId: candidate.id, status: "approved", expectedUpdatedAt: candidate.updatedAt }),
    }));
    expect(withoutNote.status).toBe(422);

    const withNote = await reviewCandidate(new Request("http://localhost/api/billing-candidates/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "demo-client", siteId: "demo-site", candidateId: candidate.id, status: "approved", note: "資材単価の対象外であることを確認しました", expectedUpdatedAt: candidate.updatedAt }),
    }));
    expect(withNote.status).toBe(200);
  });

  it("does not reveal a candidate across scopes", async () => {
    const notFound = await reviewCandidate(new Request("http://localhost/api/billing-candidates/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "other-client", siteId: "other-site", candidateId: "demo-missing", status: "approved", expectedUpdatedAt: new Date().toISOString() }),
    }));
    expect(notFound.status).toBe(404);
  });
});
