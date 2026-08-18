import { NextResponse } from "next/server";
import { parseLibertyWorkbook } from "@/src/domain/excel-import";
import { hasSupabasePublicEnv, isDemoMode, usesDemoMemoryStorage, usesSupabaseStorage } from "@/src/lib/env";
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
import {
  createDemoExcelImportRepository,
  createSupabaseExcelImportRepository,
  ExcelImportDuplicateError,
  ExcelImportPersistenceError,
  ExcelImportUnauthorizedError,
} from "@/src/server/repositories/excel-import-repository";
import { assertTrialWriteAllowed, TrialWriteDisabledError } from "@/src/server/trial/trial-write-guard";

export const runtime = "nodejs";

const MAX_EXCEL_BYTES = 10 * 1024 * 1024;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  try {
    assertTrialWriteAllowed();
  } catch (error) {
    if (error instanceof TrialWriteDisabledError) return NextResponse.json({ error: error.message }, { status: 423 });
    return NextResponse.json({ error: "試用期間を確認できませんでした" }, { status: 503 });
  }

  const useMemoryStorage = usesDemoMemoryStorage();
  if (usesSupabaseStorage() && !hasSupabasePublicEnv()) {
    return NextResponse.json({ error: "Supabaseの設定が必要です" }, { status: 503 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "multipart/form-data が必要です" }, { status: 415 });
  }

  const sourceFileVersionId = request.headers.get("x-source-file-version-id")?.trim();
  const previewSha256 = request.headers.get("x-preview-sha256")?.trim().toLowerCase();
  if (!sourceFileVersionId) return NextResponse.json({ error: "原本版IDが必要です" }, { status: 400 });
  if (!previewSha256 || !SHA256_PATTERN.test(previewSha256)) {
    return NextResponse.json({ error: "確認済みExcelのハッシュが必要です" }, { status: 400 });
  }
  if (!useMemoryStorage && !UUID_PATTERN.test(sourceFileVersionId)) {
    return NextResponse.json({ error: "原本版IDの形式が不正です" }, { status: 400 });
  }

  const clientId = request.headers.get("x-client-id")?.trim() || (isDemoMode() ? "demo-client" : "");
  const siteId = request.headers.get("x-site-id")?.trim() || (isDemoMode() ? "demo-site" : "");
  if (!clientId || !siteId) return NextResponse.json({ error: "荷主・拠点ヘッダーが必要です" }, { status: 400 });

  try {
    if (!useMemoryStorage) await requireMembership(clientId, siteId, ["office", "manager", "admin"]);
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

  const actualSha256 = sha256Hex(buffer);
  if (actualSha256 !== previewSha256) {
    return NextResponse.json({ error: "プレビュー後にファイルが変更されています。もう一度確認してください" }, { status: 409 });
  }

  let result;
  try {
    result = await parseLibertyWorkbook(buffer, sourceFileVersionId, { clientId, siteId });
  } catch {
    return NextResponse.json({ error: "Excelの内容を確認できませんでした" }, { status: 422 });
  }
  if (result.exceptions.length > 0 || result.accepted.length === 0) {
    return NextResponse.json(
      { fileName: fileEntry.name, sha256: actualSha256, ...result, error: "エラーを修正してから登録してください" },
      { status: 422 },
    );
  }

  try {
    const repository = useMemoryStorage ? createDemoExcelImportRepository() : createSupabaseExcelImportRepository();
    const registration = await repository.register({
      sourceFileVersionId,
      clientId,
      siteId,
      originalName: fileEntry.name,
      sha256: actualSha256,
      fileBytes: buffer,
      rows: result.accepted,
    });
    return NextResponse.json({ registered: true, ...registration }, { status: 201 });
  } catch (error) {
    if (error instanceof ExcelImportUnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ExcelImportDuplicateError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof ExcelImportPersistenceError) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ error: "Excelの登録に失敗しました" }, { status: 500 });
  }
}
