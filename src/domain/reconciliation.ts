import { rawShipmentRowSchema } from "@/src/domain/validation";
import type { ReconciliationResult, ShipmentRow } from "@/src/domain/types";

export function shipmentKey(clientId: string, siteId: string, shipmentNo: string): string {
  return [clientId, siteId, shipmentNo].map((value) => value.trim().toLowerCase()).join("::");
}

export function reconcileShipmentRows(
  rows: unknown[],
  sourceFileVersionId: string,
  existingKeys: ReadonlySet<string> = new Set(),
): ReconciliationResult {
  const accepted: ShipmentRow[] = [];
  const exceptions: ReconciliationResult["exceptions"] = [];
  const seenKeys = new Set<string>();

  rows.forEach((rawRow, index) => {
    const sourceRowNumber = index + 2;
    const parsed = rawShipmentRowSchema.safeParse(rawRow);
    if (!parsed.success) {
      exceptions.push({
        sourceRowNumber,
        code: "invalid_row",
        message: parsed.error.issues.map((issue) => issue.message).join("、"),
      });
      return;
    }

    const row = parsed.data;
    const key = shipmentKey(row.clientId, row.siteId, row.shipmentNo);
    if (seenKeys.has(key)) {
      exceptions.push({
        sourceRowNumber,
        code: "duplicate_in_file",
        message: "同じファイル内に同じ出荷番号があります",
        shipmentNo: row.shipmentNo,
      });
      return;
    }
    if (existingKeys.has(key)) {
      exceptions.push({
        sourceRowNumber,
        code: "duplicate_existing",
        message: "既に登録済みの出荷番号です",
        shipmentNo: row.shipmentNo,
      });
      return;
    }

    seenKeys.add(key);
    accepted.push({ ...row, sourceRowNumber, sourceFileVersionId });
  });

  return { accepted, exceptions };
}
