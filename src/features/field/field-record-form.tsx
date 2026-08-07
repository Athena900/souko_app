"use client";

import { useMemo, useState } from "react";
import type { BillingCalculation, FieldWorkInput } from "@/src/domain/types";
import { fieldWorkInputSchema } from "@/src/domain/validation";

function localDate(): string {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

export interface FieldScope {
  clientId: string;
  siteId: string;
}

function makeInitialRecord(scope: FieldScope | null): FieldWorkInput {
  return {
    clientId: scope?.clientId ?? "",
    siteId: scope?.siteId ?? "",
    shipmentNo: "",
    workDate: localDate(),
    packCount: 1,
    materialLines: [{ code: "bubble_wrap", name: "緩衝材", quantity: 0 }],
    additionalWorkLines: [{ code: "extra_pack", name: "追加梱包", quantity: 0 }],
    boxDetails: [],
    notes: "",
  };
}

function yen(value: number): string {
  return `${new Intl.NumberFormat("ja-JP").format(value)}円`;
}

export function FieldRecordForm({ scope }: { scope: FieldScope | null }) {
  const [record, setRecord] = useState<FieldWorkInput>(() => makeInitialRecord(scope));
  const [preview, setPreview] = useState<BillingCalculation | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error" | "warning"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const canPreview = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  const firstBox = record.boxDetails[0];
  const totalMaterialQuantity = useMemo(
    () => record.materialLines.reduce((sum, line) => sum + line.quantity, 0),
    [record.materialLines],
  );

  function updateRecord<K extends keyof FieldWorkInput>(key: K, value: FieldWorkInput[K]) {
    setRecord((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }

  function updateMaterialQuantity(value: number) {
    updateRecord("materialLines", [{ ...record.materialLines[0], quantity: Math.max(0, value) }]);
  }

  function updateAdditionalWorkQuantity(value: number) {
    updateRecord("additionalWorkLines", [{ ...record.additionalWorkLines[0], quantity: Math.max(0, value) }]);
  }

  function updateFirstBox(patch: Partial<NonNullable<typeof firstBox>>) {
    const current = firstBox ?? { boxNo: "1", items: [{ sku: "", name: "", quantity: 1 }], materialLines: [] };
    updateRecord("boxDetails", [{ ...current, ...patch }]);
  }

  async function previewBilling() {
    const parsed = fieldWorkInputSchema.safeParse(record);
    if (!parsed.success) {
      setMessage({ kind: "error", text: parsed.error.issues.map((issue) => issue.message).join(" / ") });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/billing-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceId: `field-${record.shipmentNo}`, record }),
      });
      const body = (await response.json()) as BillingCalculation & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "計算に失敗しました");
      setPreview(body);
      setMessage({ kind: body.warnings.length ? "warning" : "success", text: body.warnings.length ? "計算できましたが確認が必要です" : "請求候補を計算しました" });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "計算に失敗しました" });
    } finally {
      setBusy(false);
    }
  }

  async function saveRecord() {
    const parsed = fieldWorkInputSchema.safeParse({ ...record, idempotencyKey: `field:${record.clientId}:${record.siteId}:${record.shipmentNo}:${record.workDate}` });
    if (!parsed.success) {
      setMessage({ kind: "error", text: parsed.error.issues.map((issue) => issue.message).join(" / ") });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/field-records", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json()) as { error?: string; demo?: boolean };
      if (!response.ok) throw new Error(body.error ?? "保存に失敗しました");
      setMessage({ kind: "success", text: body.demo ? "デモモードで保存しました" : "Supabaseへ保存しました" });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "保存に失敗しました" });
    } finally {
      setBusy(false);
    }
  }

  if (!scope) {
    return (
      <section className="panel" aria-labelledby="field-access-title">
        <h2 id="field-access-title">現場入力を利用できません</h2>
        <p className="notice">ログイン済みの利用者に、対象荷主・拠点の所属が必要です。管理者にアカウントと権限を確認してもらってください。</p>
      </section>
    );
  }

  return (
    <div className="two-column">
      <section className="panel" aria-labelledby="field-form-title">
        <h2 id="field-form-title">作業内容</h2>
        <div className="form-grid">
          <div className="field"><label htmlFor="shipmentNo">出荷番号</label><input id="shipmentNo" value={record.shipmentNo} onChange={(event) => updateRecord("shipmentNo", event.target.value)} placeholder="例：SHP-20260806-001" /></div>
          <div className="field"><label htmlFor="workDate">作業日</label><input id="workDate" type="date" value={record.workDate} onChange={(event) => updateRecord("workDate", event.target.value)} /></div>
          <div className="field"><label htmlFor="packCount">箱数</label><input id="packCount" type="number" min="0" inputMode="numeric" value={record.packCount} onChange={(event) => updateRecord("packCount", Number(event.target.value))} /></div>
          <div className="field"><label htmlFor="materialQuantity">緩衝材の個数</label><input id="materialQuantity" type="number" min="0" inputMode="numeric" value={record.materialLines[0]?.quantity ?? 0} onChange={(event) => updateMaterialQuantity(Number(event.target.value))} /></div>
          <div className="field"><label htmlFor="extraWorkQuantity">追加梱包の件数</label><input id="extraWorkQuantity" type="number" min="0" inputMode="numeric" value={record.additionalWorkLines[0]?.quantity ?? 0} onChange={(event) => updateAdditionalWorkQuantity(Number(event.target.value))} /></div>
          <div className="field"><label htmlFor="exceptionReason">例外理由</label><select id="exceptionReason" value={record.exceptionReason ?? ""} onChange={(event) => updateRecord("exceptionReason", event.target.value || undefined)}><option value="">なし</option><option value="数量差異">数量差異</option><option value="破損">破損</option><option value="再出荷">再出荷</option></select></div>
          <div className="field full"><label htmlFor="notes">備考</label><textarea id="notes" value={record.notes ?? ""} onChange={(event) => updateRecord("notes", event.target.value)} placeholder="例外があれば理由も記録します" /></div>
        </div>

        <fieldset className="fieldset">
          <legend>箱内訳（任意）</legend>
          <div className="inline-row">
            <div className="field"><label htmlFor="boxNo">箱番号</label><input id="boxNo" value={firstBox?.boxNo ?? ""} onChange={(event) => updateFirstBox({ boxNo: event.target.value })} placeholder="1" /></div>
            <div className="field"><label htmlFor="boxQuantity">商品数量</label><input id="boxQuantity" type="number" min="0" value={firstBox?.items[0]?.quantity ?? 0} onChange={(event) => updateFirstBox({ items: [{ ...(firstBox?.items[0] ?? { sku: "", name: "" }), quantity: Number(event.target.value) }] })} /></div>
          </div>
          <div className="field" style={{ marginTop: 12 }}><label htmlFor="boxSku">商品/SKU</label><input id="boxSku" value={firstBox?.items[0]?.sku ?? ""} onChange={(event) => updateFirstBox({ items: [{ ...(firstBox?.items[0] ?? { quantity: 1, name: "" }), sku: event.target.value }] })} placeholder="例：SKU-001" /></div>
        </fieldset>

        <div className="actions">
          {canPreview && <button className="button" type="button" onClick={previewBilling} disabled={busy}>請求候補を計算</button>}
          <button className="button secondary" type="button" onClick={saveRecord} disabled={busy}>入力を保存</button>
        </div>
        {message && <div className={`status ${message.kind === "error" ? "error" : message.kind === "warning" ? "warning" : ""}`} role="status">{message.text}</div>}
        <p className="muted" style={{ marginBottom: 0 }}>資材合計：{totalMaterialQuantity}個。保存時は同じ出荷番号・作業日の二重送信を防ぐキーを付けます。</p>
      </section>

      <section className="panel" aria-labelledby="preview-title">
        <h2 id="preview-title">請求候補プレビュー</h2>
        {!canPreview ? <p className="notice">現場画面では金額を表示しません。請求候補の確認は事務担当の画面で行います。</p> : !preview ? <p className="muted">左の入力後、「請求候補を計算」を押してください。</p> : <>
          <div className="result-total">{yen(preview.totalYen)}</div>
          <p className="muted">小計 {yen(preview.subtotalYen)} / 税 {yen(preview.taxYen)}</p>
          {preview.warnings.length > 0 && <div className="status warning">{preview.warnings.map((warning) => <div key={warning}>{warning}</div>)}</div>}
          <table className="line-table"><thead><tr><th>明細</th><th>数量</th><th>金額</th></tr></thead><tbody>{preview.lines.map((line) => <tr key={`${line.workCode}-${line.priceRuleId}`}><td>{line.description}</td><td>{line.quantity}</td><td>{yen(line.totalYen)}</td></tr>)}</tbody></table>
        </>}
      </section>
    </div>
  );
}
