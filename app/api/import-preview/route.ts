import { NextResponse } from "next/server";
import { parseShipmentCsv } from "@/src/domain/csv-import";
import { usesDemoMemoryStorage } from "@/src/lib/env";
import {
  assertBodySize,
  assertSameOrigin,
  requireMembership,
  RouteConfigurationError,
  RouteForbiddenError,
  RoutePayloadTooLargeError,
  RouteUnauthorizedError,
} from "@/src/server/auth/access";

const MAX_CSV_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertBodySize(request, MAX_CSV_BYTES);
  } catch (error) {
    if (error instanceof RoutePayloadTooLargeError) return NextResponse.json({ error: error.message }, { status: 413 });
    if (error instanceof RouteForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 403 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("text/csv")) {
    return NextResponse.json({ error: "Content-Type: text/csv が必要です" }, { status: 415 });
  }

  const encoding = request.headers.get("x-csv-encoding") === "shift_jis" ? "shift_jis" : "utf8";
  const sourceFileVersionId = request.headers.get("x-source-file-version-id")?.trim();
  if (!sourceFileVersionId) {
    return NextResponse.json({ error: "原本版IDが必要です" }, { status: 400 });
  }

  const clientId = request.headers.get("x-client-id")?.trim();
  const siteId = request.headers.get("x-site-id")?.trim();
  const useMemoryStorage = usesDemoMemoryStorage();
  if (!useMemoryStorage && (!clientId || !siteId)) {
    return NextResponse.json({ error: "荷主・拠点ヘッダーが必要です" }, { status: 400 });
  }

  try {
    if (!useMemoryStorage) await requireMembership(clientId as string, siteId as string, ["office", "manager", "admin"]);
  } catch (error) {
    if (error instanceof RouteUnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof RouteForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof RouteConfigurationError) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: "取込権限を確認できませんでした" }, { status: 503 });
  }

  const buffer = new Uint8Array(await request.arrayBuffer());
  if (buffer.byteLength > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "CSVが大きすぎます（最大10MB）" }, { status: 413 });
  }
  try {
    const result = parseShipmentCsv(buffer, sourceFileVersionId, encoding);
    if (!useMemoryStorage && result.accepted.some((row) => row.clientId !== clientId || row.siteId !== siteId)) {
      return NextResponse.json({ error: "CSVの荷主・拠点がヘッダーと一致しません" }, { status: 400 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json({ error: "CSVを読み込めませんでした" }, { status: 400 });
  }
}
