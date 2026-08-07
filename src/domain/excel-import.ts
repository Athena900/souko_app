import ExcelJS from "exceljs";
import type { Cell, Worksheet } from "exceljs";
import { shipmentKey } from "@/src/domain/reconciliation";
import type { ShipmentLine, ShipmentRow } from "@/src/domain/types";

export const LIBERTY_SOURCE_SHEET = "出荷指示貼り付け";

export type ExcelImportExceptionCode =
  | "unsupported_workbook"
  | "missing_required_column"
  | "invalid_row"
  | "duplicate_existing";

export type ExcelImportWarningCode =
  | "identifier_precision_risk"
  | "missing_box_count"
  | "duplicate_detail_line"
  | "inconsistent_box_count";

export interface ExcelImportException {
  sourceRowNumber?: number;
  code: ExcelImportExceptionCode;
  message: string;
  shipmentNo?: string;
}

export interface ExcelImportWarning {
  sourceRowNumber?: number;
  code: ExcelImportWarningCode;
  message: string;
  columnName?: string;
  shipmentNo?: string;
}

export interface ExcelImportResult {
  sourceFileVersionId: string;
  sourceSheetName: string;
  rowCount: number;
  detailRowCount: number;
  shipmentCount: number;
  accepted: ShipmentRow[];
  exceptions: ExcelImportException[];
  warnings: ExcelImportWarning[];
}

interface ImportScope {
  clientId: string;
  siteId: string;
}

interface ColumnMap {
  shipmentNo: number;
  detailNo: number;
  workDate: number;
  productId: number;
  productName: number;
  quantity: number;
  boxCount?: number;
  consignorName?: number;
  customerShipmentNo?: number;
  waybillNo?: number;
}

interface MutableShipment {
  clientId: string;
  siteId: string;
  shipmentNo: string;
  workDate: string;
  boxCount: number | null;
  sourceRowNumber: number;
  sourceRowNumbers: number[];
  sourceFileVersionId: string;
  sourceSheetName: string;
  consignorName?: string;
  customerShipmentNo?: string;
  waybillNo?: string;
  productLines: ShipmentLine[];
  detailLineKeys: Set<string>;
}

const REQUIRED_HEADERS = ["出荷指示NO", "出荷予定行NO", "出荷作業日", "商品ID", "商品名", "出荷数"] as const;

function cellText(cell: Cell): string {
  const value = cell.value as unknown;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("result" in value) return String((value as { result?: unknown }).result ?? "").trim();
    if ("richText" in value && Array.isArray((value as { richText?: unknown }).richText)) {
      return ((value as { richText: Array<{ text?: unknown }> }).richText ?? [])
        .map((part) => String(part.text ?? ""))
        .join("")
        .trim();
    }
    if (value instanceof Date) return value.toISOString();
  }
  return String(cell.text || value).trim();
}

function isIdentifierPrecisionRisk(cell: Cell): boolean {
  const value = cell.value as unknown;
  if (typeof value === "number" && Math.abs(value) >= 1_000_000_000_000_000) return true;
  return /[eE][+-]?\d{2,}/.test(cellText(cell));
}

function parseWorkDate(cell: Cell): string | null {
  const value = cell.value as unknown;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [value.getUTCFullYear(), String(value.getUTCMonth() + 1).padStart(2, "0"), String(value.getUTCDate()).padStart(2, "0")].join("-");
  }

  const raw = cellText(cell).replace(/[./]/g, "-");
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const separated = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!separated) return null;
  const month = Number(separated[2]);
  const day = Number(separated[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${separated[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseNonNegativeInteger(cell: Cell): number | null {
  const raw = cellText(cell).replace(/,/g, "");
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) return null;
  return value;
}

function headerMap(worksheet: Worksheet): Map<string, number> {
  const map = new Map<string, number>();
  const headerRow = worksheet.getRow(1);
  for (let column = 1; column <= headerRow.cellCount; column += 1) {
    const header = cellText(headerRow.getCell(column)).normalize("NFKC");
    if (header) map.set(header, column);
  }
  return map;
}

function resolveColumns(worksheet: Worksheet): ColumnMap | ExcelImportException {
  const headers = headerMap(worksheet);
  const missing = REQUIRED_HEADERS.filter((header) => !headers.has(header));
  if (missing.length > 0) {
    return {
      code: "missing_required_column",
      message: `必要な列が見つかりません: ${missing.join("、")}`,
    };
  }

  return {
    shipmentNo: headers.get("出荷指示NO") as number,
    detailNo: headers.get("出荷予定行NO") as number,
    workDate: headers.get("出荷作業日") as number,
    productId: headers.get("商品ID") as number,
    productName: headers.get("商品名") as number,
    quantity: headers.get("出荷数") as number,
    boxCount: headers.get("箱数"),
    consignorName: headers.get("荷主名"),
    customerShipmentNo: headers.get("荷主出荷NO"),
    waybillNo: headers.get("出荷伝票NO"),
  };
}

function emptyResult(sourceFileVersionId: string, sourceSheetName = LIBERTY_SOURCE_SHEET): ExcelImportResult {
  return {
    sourceFileVersionId,
    sourceSheetName,
    rowCount: 0,
    detailRowCount: 0,
    shipmentCount: 0,
    accepted: [],
    exceptions: [],
    warnings: [],
  };
}

export async function parseLibertyWorkbook(
  buffer: Uint8Array,
  sourceFileVersionId: string,
  scope: ImportScope,
  existingKeys: ReadonlySet<string> = new Set(),
): Promise<ExcelImportResult> {
  const result = emptyResult(sourceFileVersionId);
  const workbook = new ExcelJS.Workbook();

  try {
    const excelBuffer = Buffer.from(buffer) as unknown as Parameters<typeof workbook.xlsx.load>[0];
    await workbook.xlsx.load(excelBuffer);
  } catch {
    result.exceptions.push({ code: "unsupported_workbook", message: "Excelファイルを読み込めませんでした" });
    return result;
  }

  const worksheet = workbook.getWorksheet(LIBERTY_SOURCE_SHEET);
  if (!worksheet) {
    result.exceptions.push({ code: "unsupported_workbook", message: `「${LIBERTY_SOURCE_SHEET}」シートがありません` });
    return result;
  }

  const columns = resolveColumns(worksheet);
  if ("code" in columns) {
    result.exceptions.push(columns);
    return result;
  }

  const groups = new Map<string, MutableShipment>();
  const warningKeys = new Set<string>();

  const addWarning = (warning: ExcelImportWarning) => {
    const key = [warning.code, warning.sourceRowNumber ?? "", warning.columnName ?? "", warning.shipmentNo ?? ""].join(":");
    if (warningKeys.has(key)) return;
    warningKeys.add(key);
    result.warnings.push(warning);
  };

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const shipmentNo = cellText(row.getCell(columns.shipmentNo));
    const hasData = [columns.detailNo, columns.workDate, columns.productId, columns.productName, columns.quantity]
      .some((column) => Boolean(column && cellText(row.getCell(column))));
    if (!shipmentNo && !hasData) return;
    result.detailRowCount += 1;

    if (!shipmentNo) {
      result.exceptions.push({ sourceRowNumber: rowNumber, code: "invalid_row", message: "出荷番号がありません" });
      return;
    }

    const workDate = parseWorkDate(row.getCell(columns.workDate));
    const detailNo = cellText(row.getCell(columns.detailNo));
    const productId = cellText(row.getCell(columns.productId));
    const productName = cellText(row.getCell(columns.productName));
    const quantity = parseNonNegativeInteger(row.getCell(columns.quantity));
    const invalidFields = [
      !workDate ? "出荷作業日" : "",
      !detailNo ? "出荷予定行NO" : "",
      !productId ? "商品ID" : "",
      !productName ? "商品名" : "",
      quantity === null ? "出荷数" : "",
    ].filter(Boolean);
    if (invalidFields.length > 0) {
      result.exceptions.push({
        sourceRowNumber: rowNumber,
        code: "invalid_row",
        message: `必要な値を確認してください: ${invalidFields.join("、")}`,
        shipmentNo,
      });
      return;
    }

    const customerShipmentCell = columns.customerShipmentNo ? row.getCell(columns.customerShipmentNo) : undefined;
    const customerShipmentNo = customerShipmentCell ? cellText(customerShipmentCell) : undefined;
    if (customerShipmentCell && customerShipmentNo && isIdentifierPrecisionRisk(customerShipmentCell)) {
      addWarning({
        sourceRowNumber: rowNumber,
        code: "identifier_precision_risk",
        columnName: "荷主出荷NO",
        shipmentNo,
        message: "長い番号がExcel上で数値化されているため、元の桁を正確に戻せない可能性があります。照合番号には使用しません。",
      });
    }

    const boxCount = columns.boxCount ? parseNonNegativeInteger(row.getCell(columns.boxCount)) : null;
    const productLine: ShipmentLine = {
      lineNo: detailNo,
      productId,
      productName,
      quantity: quantity as number,
      sourceRowNumber: rowNumber,
    };
    const key = shipmentKey(scope.clientId, scope.siteId, shipmentNo);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        clientId: scope.clientId,
        siteId: scope.siteId,
        shipmentNo,
        workDate: workDate as string,
        boxCount,
        sourceRowNumber: rowNumber,
        sourceRowNumbers: [rowNumber],
        sourceFileVersionId,
        sourceSheetName: LIBERTY_SOURCE_SHEET,
        consignorName: columns.consignorName ? cellText(row.getCell(columns.consignorName)) || undefined : undefined,
        customerShipmentNo,
        waybillNo: columns.waybillNo ? cellText(row.getCell(columns.waybillNo)) || undefined : undefined,
        productLines: [productLine],
        detailLineKeys: new Set([`${detailNo}::${productId}`]),
      });
      return;
    }

    existing.sourceRowNumbers.push(rowNumber);
    const detailLineKey = `${detailNo}::${productId}`;
    if (existing.detailLineKeys.has(detailLineKey)) {
      addWarning({
        sourceRowNumber: rowNumber,
        code: "duplicate_detail_line",
        shipmentNo,
        message: "同じ商品明細が重複しています。内容を確認してください。",
      });
    }
    existing.detailLineKeys.add(detailLineKey);
    existing.productLines.push(productLine);
    if (boxCount !== null && existing.boxCount !== null && boxCount !== existing.boxCount) {
      addWarning({
        sourceRowNumber: rowNumber,
        code: "inconsistent_box_count",
        columnName: "箱数",
        shipmentNo,
        message: "同じ出荷番号内で箱数が一致していません。確認が必要です。",
      });
    }
    if (existing.boxCount === null && boxCount !== null) existing.boxCount = boxCount;
  });

  result.rowCount = groups.size;
  for (const group of groups.values()) {
    if (group.boxCount === null) {
      addWarning({
        sourceRowNumber: group.sourceRowNumber,
        code: "missing_box_count",
        columnName: "箱数",
        shipmentNo: group.shipmentNo,
        message: "箱数が入力されていない出荷です。現場で確認してください。",
      });
    }

    const key = shipmentKey(group.clientId, group.siteId, group.shipmentNo);
    if (existingKeys.has(key)) {
      result.exceptions.push({
        sourceRowNumber: group.sourceRowNumber,
        code: "duplicate_existing",
        shipmentNo: group.shipmentNo,
        message: "既に登録済みの出荷番号です",
      });
      continue;
    }

    result.accepted.push({
      clientId: group.clientId,
      siteId: group.siteId,
      shipmentNo: group.shipmentNo,
      workDate: group.workDate,
      packCount: group.boxCount ?? 0,
      sourceRowNumber: group.sourceRowNumber,
      sourceRowNumbers: group.sourceRowNumbers,
      sourceFileVersionId: group.sourceFileVersionId,
      sourceSheetName: group.sourceSheetName,
      consignorName: group.consignorName,
      customerShipmentNo: group.customerShipmentNo,
      waybillNo: group.waybillNo,
      productLines: group.productLines,
    });
  }

  result.shipmentCount = result.accepted.length;
  return result;
}
