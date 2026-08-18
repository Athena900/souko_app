import { NextResponse } from "next/server";
import { hasSupabasePublicEnv, isDemoMode, usesDemoMemoryStorage, usesSupabaseStorage } from "@/src/lib/env";
import {
  requireMembership,
  RouteConfigurationError,
  RouteForbiddenError,
  RouteUnauthorizedError,
} from "@/src/server/auth/access";
import { listDemoExcelShipments } from "@/src/server/repositories/excel-import-repository";
import {
  listSupabaseShipments,
  ShipmentListPersistenceError,
} from "@/src/server/repositories/shipment-repository";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
// 1回のExcel取込で167件ある実データを、現場画面で選択できるようにする。
// 大量運用では検索・ページングを追加するが、初期版では500件までを扱う。
const MAX_LIMIT = 500;
const MAX_SEARCH_LENGTH = 80;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw new Error(`limitは1〜${MAX_LIMIT}の整数で指定してください`);
  }
  return parsed;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const clientId = params.get("clientId")?.trim() || (isDemoMode() ? "demo-client" : "");
  const siteId = params.get("siteId")?.trim() || (isDemoMode() ? "demo-site" : "");
  const search = params.get("search")?.trim() || undefined;
  const workDate = params.get("workDate")?.trim() || undefined;

  if (!clientId || !siteId) return NextResponse.json({ error: "荷主・拠点が必要です" }, { status: 400 });
  if (search && search.length > MAX_SEARCH_LENGTH) {
    return NextResponse.json({ error: `検索語は${MAX_SEARCH_LENGTH}文字以内で指定してください` }, { status: 400 });
  }
  if (workDate && !DATE_PATTERN.test(workDate)) {
    return NextResponse.json({ error: "作業日はYYYY-MM-DD形式で指定してください" }, { status: 400 });
  }

  let limit: number;
  try {
    limit = parseLimit(params.get("limit"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "limitの指定が不正です" }, { status: 400 });
  }

  const useMemoryStorage = usesDemoMemoryStorage();
  if (usesSupabaseStorage() && !hasSupabasePublicEnv()) {
    return NextResponse.json({ error: "Supabaseの設定が必要です" }, { status: 503 });
  }

  try {
    if (!useMemoryStorage) await requireMembership(clientId, siteId, ["field", "office", "manager", "admin"]);
    const shipments = useMemoryStorage
      ? listDemoExcelShipments({ clientId, siteId, search, workDate, limit })
      : await listSupabaseShipments({ clientId, siteId, search, workDate, limit });
    return NextResponse.json({ shipments }, { status: 200 });
  } catch (error) {
    if (error instanceof RouteUnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof RouteForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof RouteConfigurationError || error instanceof ShipmentListPersistenceError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "登録済み出荷を読み込めませんでした" }, { status: 503 });
  }
}
