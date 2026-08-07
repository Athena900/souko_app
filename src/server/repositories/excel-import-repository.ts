import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import type { ShipmentRow } from "@/src/domain/types";

export interface ExcelImportRegistrationInput {
  sourceFileVersionId: string;
  clientId: string;
  siteId: string;
  originalName: string;
  sha256: string;
  fileBytes: Uint8Array;
  rows: ShipmentRow[];
}

export interface StoredExcelImport {
  sourceFileVersionId: string;
  importRunId: string;
  shipmentCount: number;
  detailCount: number;
  demo: boolean;
}

export class ExcelImportUnauthorizedError extends Error {}
export class ExcelImportDuplicateError extends Error {}
export class ExcelImportPersistenceError extends Error {}

const SOURCE_BUCKET = "warehouse-source-files";
const MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function safeStorageName(originalName: string): string {
  const baseName = originalName.trim().split(/[\\/]/).pop() ?? "source.xlsx";
  const sanitized = baseName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, ".");
  return sanitized.toLowerCase().endsWith(".xlsx") && sanitized.length > 5 ? sanitized : "source.xlsx";
}

function storagePath(input: ExcelImportRegistrationInput): string {
  return `${input.clientId}/${input.siteId}/${input.sourceFileVersionId}/${safeStorageName(input.originalName)}`;
}

function registrationResult(data: unknown): StoredExcelImport | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  if (typeof value.sourceFileVersionId !== "string" || typeof value.importRunId !== "string") return null;
  if (typeof value.shipmentCount !== "number" || typeof value.detailCount !== "number") return null;
  return {
    sourceFileVersionId: value.sourceFileVersionId,
    importRunId: value.importRunId,
    shipmentCount: value.shipmentCount,
    detailCount: value.detailCount,
    demo: false,
  };
}

export interface ExcelImportRepository {
  register(input: ExcelImportRegistrationInput): Promise<StoredExcelImport>;
}

export function createSupabaseExcelImportRepository(): ExcelImportRepository {
  return {
    async register(input) {
      let supabase;
      try {
        supabase = await createSupabaseServerClient();
      } catch {
        throw new ExcelImportPersistenceError("Supabaseに接続できませんでした");
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new ExcelImportUnauthorizedError("ログインが必要です");

      const path = storagePath(input);
      const { error: uploadError } = await supabase.storage
        .from(SOURCE_BUCKET)
        .upload(path, Buffer.from(input.fileBytes), {
          contentType: MIME_TYPE,
          metadata: { sha256: input.sha256, source_file_version_id: input.sourceFileVersionId },
          upsert: false,
        });
      if (uploadError) {
        if (uploadError.message.toLowerCase().includes("already exists") || uploadError.name === "Duplicate") {
          throw new ExcelImportDuplicateError("同じファイル名の原本がすでに存在します");
        }
        throw new ExcelImportPersistenceError("Excel原本の保存に失敗しました");
      }

      const { data, error: rpcError } = await supabase.rpc("register_warehouse_import", {
        p_source_file_version_id: input.sourceFileVersionId,
        p_client_id: input.clientId,
        p_site_id: input.siteId,
        p_data_type: "shipment",
        p_original_name: input.originalName,
        p_storage_path: path,
        p_sha256: input.sha256,
        p_mapping_version: "liberty-v1",
        p_rows: input.rows,
      });

      if (rpcError) {
        await supabase.storage.from(SOURCE_BUCKET).remove([path]);
        if (rpcError.code === "23505" || rpcError.message.includes("すでに登録")) {
          throw new ExcelImportDuplicateError(rpcError.message);
        }
        if (rpcError.code === "42501") throw new ExcelImportUnauthorizedError(rpcError.message);
        throw new ExcelImportPersistenceError("Excelの登録に失敗しました");
      }

      const result = registrationResult(data);
      if (!result) {
        await supabase.storage.from(SOURCE_BUCKET).remove([path]);
        throw new ExcelImportPersistenceError("登録結果を確認できませんでした");
      }
      return result;
    },
  };
}

const demoRegistrations = new Map<string, StoredExcelImport>();

export function createDemoExcelImportRepository(): ExcelImportRepository {
  return {
    async register(input) {
      const key = `${input.clientId}:${input.siteId}:${input.sha256}`;
      const existing = demoRegistrations.get(key);
      if (existing) throw new ExcelImportDuplicateError("同じExcelはすでに登録されています");
      const result: StoredExcelImport = {
        sourceFileVersionId: input.sourceFileVersionId,
        importRunId: `demo-${crypto.randomUUID()}`,
        shipmentCount: input.rows.length,
        detailCount: input.rows.reduce((count, row) => count + (row.productLines?.length ?? 0), 0),
        demo: true,
      };
      demoRegistrations.set(key, result);
      return result;
    },
  };
}

export function resetDemoExcelImportRegistrations(): void {
  demoRegistrations.clear();
}
