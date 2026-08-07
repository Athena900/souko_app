import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import { reconcileShipmentRows } from "@/src/domain/reconciliation";
import type { ReconciliationResult } from "@/src/domain/types";

export type CsvEncoding = "utf8" | "shift_jis";

export function decodeCsv(buffer: Uint8Array, encoding: CsvEncoding = "utf8"): string {
  return iconv.decode(Buffer.from(buffer), encoding === "shift_jis" ? "Shift_JIS" : "utf8");
}

export function parseShipmentCsv(
  buffer: Uint8Array,
  sourceFileVersionId: string,
  encoding: CsvEncoding = "utf8",
  existingKeys: ReadonlySet<string> = new Set(),
): ReconciliationResult {
  const rows = parse(decodeCsv(buffer, encoding), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: false,
  }) as unknown[];
  return reconcileShipmentRows(rows, sourceFileVersionId, existingKeys);
}
