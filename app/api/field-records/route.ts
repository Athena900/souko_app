import { NextResponse } from "next/server";
import { hasSupabasePublicEnv, isDemoMode, usesDemoMemoryStorage, usesSupabaseStorage } from "@/src/lib/env";
import {
  assertBodySize,
  assertSameOrigin,
  readJsonBody,
  requireMembership,
  RouteBodyParseError,
  RouteConfigurationError,
  RouteForbiddenError,
  RoutePayloadTooLargeError,
  RouteUnauthorizedError,
} from "@/src/server/auth/access";
import {
  createDemoFieldWorkRepository,
  createSupabaseFieldWorkRepository,
  DuplicateRecordError,
  listDemoBillingSourceFieldWorkRecords,
  listSupabaseBillingSourceFieldWorkRecords,
  PersistenceError,
  UnauthorizedError,
} from "@/src/server/repositories/field-work-repository";
import { fieldWorkInputSchema } from "@/src/domain/validation";

const MAX_LIST_LIMIT = 100;

function parseListLimit(value: string | null): number {
  if (!value) return MAX_LIST_LIMIT;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) throw new Error("limitは1〜100の整数で指定してください");
  return limit;
}

function sourceSummary(record: { id: string; input: { shipmentNo: string; workDate: string; packCount: number }; status: string; createdAt: string; demo: boolean }) {
  return {
    id: record.id,
    shipmentNo: record.input.shipmentNo,
    workDate: record.input.workDate,
    packCount: record.input.packCount,
    status: record.status,
    createdAt: record.createdAt,
    demo: record.demo,
  };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const clientId = params.get("clientId")?.trim() || (isDemoMode() ? "demo-client" : "");
  const siteId = params.get("siteId")?.trim() || (isDemoMode() ? "demo-site" : "");
  if (!clientId || !siteId) return NextResponse.json({ error: "荷主・拠点が必要です" }, { status: 400 });

  let limit: number;
  try {
    limit = parseListLimit(params.get("limit"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "limitの指定が不正です" }, { status: 400 });
  }
  const useMemoryStorage = usesDemoMemoryStorage();
  if (usesSupabaseStorage() && !hasSupabasePublicEnv()) return NextResponse.json({ error: "Supabaseの設定が必要です" }, { status: 503 });

  try {
    if (!useMemoryStorage) await requireMembership(clientId, siteId, ["office", "manager", "admin"]);
    const records = useMemoryStorage
      ? listDemoBillingSourceFieldWorkRecords({ clientId, siteId, limit })
      : await listSupabaseBillingSourceFieldWorkRecords({ clientId, siteId, limit });
    return NextResponse.json({ records: records.map(sourceSummary) }, { status: 200 });
  } catch (error) {
    if (error instanceof RouteUnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof RouteForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof RouteConfigurationError || error instanceof PersistenceError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "現場記録を読み込めませんでした" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertBodySize(request, 1_000_000);
  } catch (error) {
    if (error instanceof RoutePayloadTooLargeError) return NextResponse.json({ error: error.message }, { status: 413 });
    if (error instanceof RouteForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 403 });
  }
  const useMemoryStorage = usesDemoMemoryStorage();
  if (usesSupabaseStorage() && !hasSupabasePublicEnv()) {
    return NextResponse.json({ error: "Supabaseの設定が必要です" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await readJsonBody(request, 1_000_000);
  } catch (error) {
    if (error instanceof RoutePayloadTooLargeError) return NextResponse.json({ error: error.message }, { status: 413 });
    if (error instanceof RouteBodyParseError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "JSON形式の入力が必要です" }, { status: 400 });
  }

  const parsed = fieldWorkInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力内容を確認してください", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    if (!useMemoryStorage) {
      await requireMembership(parsed.data.clientId, parsed.data.siteId, ["field", "office", "manager", "admin"]);
    }
    const repository = useMemoryStorage ? createDemoFieldWorkRepository() : createSupabaseFieldWorkRepository();
    const result = await repository.create(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof RouteUnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof RouteForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof RouteConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof DuplicateRecordError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof PersistenceError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
