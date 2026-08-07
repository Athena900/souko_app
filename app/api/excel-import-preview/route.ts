import { NextResponse } from "next/server";
import { parseLibertyWorkbook } from "@/src/domain/excel-import";
import { isDemoMode } from "@/src/lib/env";
import { sha256Hex } from "@/src/server/import/file-hash";
import {
  assertBodySize,
  assertSameOrigin,
  requireMembership,
  RouteConfigurationError,
  RouteForbiddenError,
  RoutePayloadTooLargeError,
  RouteUnauthorizedError,
} from "@/src/server/auth/access";

export const runtime = "nodejs";

const MAX_EXCEL_BYTES = 10 * 1024 * 1024;

function isFileEntry(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value === "object" && "arrayBuffer" in value && "name" in value);
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertBodySize(request, MAX_EXCEL_BYTES);
    const bodyBytes = new Uint8Array(await request.clone().arrayBuffer());
    if (bodyBytes.byteLength > MAX_EXCEL_BYTES) throw new RoutePayloadTooLargeError("リクエストが大きすぎます");
  } catch (error) {
    if (error instanceof RoutePayloadTooLargeError) return NextResponse.json({ error: error.message }, { status: 413 });
    if (error instanceof RouteForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "multipart/form-data が必要です" }, { status: 415 });
  }

  const sourceFileVersionId = request.headers.get("x-source-file-version-id")?.trim();
  if (!sourceFileVersionId) return NextResponse.json({ error: "原本版IDが必要です" }, { status: 400 });

  const clientId = request.headers.get("x-client-id")?.trim() || (isDemoMode() ? "demo-client" : "");
  const siteId = request.headers.get("x-site-id")?.trim() || (isDemoMode() ? "demo-site" : "");
  if (!clientId || !siteId) return NextResponse.json({ error: "荷主・拠点ヘッダーが必要です" }, { status: 400 });

  try {
    if (!isDemoMode()) await requireMembership(clientId, siteId, ["office", "manager", "admin"]);
  } catch (error) {
    if (error instanceof RouteUnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof RouteForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof RouteConfigurationError) return NextResponse.json({ error: error.message }, { status: 503 });
    return NextResponse.json({ error: "取込権限を確認できませんでした" }, { status: 503 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Excelファイルを受け取れませんでした" }, { status: 400 });
  }

  const fileEntry = formData.get("file");
  if (!isFileEntry(fileEntry)) return NextResponse.json({ error: "file にExcelファイルを指定してください" }, { status: 400 });
  if (!/\.xlsx$/i.test(fileEntry.name)) return NextResponse.json({ error: "xlsx形式のExcelファイルを指定してください" }, { status: 415 });

  const buffer = new Uint8Array(await fileEntry.arrayBuffer());
  if (buffer.byteLength > MAX_EXCEL_BYTES) return NextResponse.json({ error: "Excelファイルが大きすぎます（最大10MB）" }, { status: 413 });

  const result = await parseLibertyWorkbook(buffer, sourceFileVersionId, { clientId, siteId });
  return NextResponse.json({ fileName: fileEntry.name, sha256: sha256Hex(buffer), ...result }, { status: 200 });
}
