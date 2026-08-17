"use client";

import { useEffect, useMemo, useState } from "react";
import type { BillingCalculation, BoxDetail, BoxItem, FieldWorkInput, MaterialLine } from "@/src/domain/types";
import { demoFieldWorkInput } from "@/src/domain/demo-fixtures";
import { fieldWorkInputSchema } from "@/src/domain/validation";

function localDate(): string {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

export interface FieldScope {
  clientId: string;
  siteId: string;
}

interface ShipmentOption {
  id: string;
  shipmentNo: string;
  workDate: string;
  packCount: number;
  status: string;
}

function emptyBox(boxNo: string): BoxDetail {
  return { boxNo, items: [], materialLines: [] };
}

function emptyItem(): BoxItem {
  return { sku: "", name: "", quantity: 1 };
}

function materialLine(quantity: number): MaterialLine {
  return { code: "bubble_wrap", name: "緩衝材", quantity };
}

function makeInitialRecord(scope: FieldScope | null): FieldWorkInput {
  return {
    clientId: scope?.clientId ?? "",
    siteId: scope?.siteId ?? "",
    shipmentNo: "",
    workDate: localDate(),
    packCount: 1,
    materialLines: [materialLine(0)],
    additionalWorkLines: [{ code: "extra_pack", name: "追加梱包", quantity: 0 }],
    boxDetails: [],
    notes: "",
  };
}

function yen(value: number): string {
  return `${new Intl.NumberFormat("ja-JP").format(value)}円`;
}

function cloneBox(box: BoxDetail): BoxDetail {
  return {
    ...box,
    items: box.items.map((item) => ({ ...item })),
    materialLines: box.materialLines.map((line) => ({ ...line })),
  };
}

function nextBoxNumber(boxes: BoxDetail[]): string {
  const used = new Set(boxes.map((box) => box.boxNo));
  let candidate = 1;
  while (used.has(String(candidate))) candidate += 1;
  return String(candidate);
}

function numericValue(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

export function FieldRecordForm({ scope, demoMode = false }: { scope: FieldScope | null; demoMode?: boolean }) {
  const [record, setRecord] = useState<FieldWorkInput>(() => makeInitialRecord(scope));
  const [activeBoxIndex, setActiveBoxIndex] = useState(0);
  const [shipments, setShipments] = useState<ShipmentOption[]>([]);
  const [shipmentLoadState, setShipmentLoadState] = useState<{ scopeKey: string; error: string | null }>({ scopeKey: "", error: null });
  const [preview, setPreview] = useState<BillingCalculation | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error" | "warning"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const canPreview = demoMode;
  const clientId = scope?.clientId;
  const siteId = scope?.siteId;
  const scopeKey = clientId && siteId ? JSON.stringify([clientId, siteId]) : "";
  const shipmentsLoading = Boolean(scopeKey && shipmentLoadState.scopeKey !== scopeKey);
  const shipmentsError = shipmentLoadState.scopeKey === scopeKey ? shipmentLoadState.error : null;
  const visibleShipments = shipmentLoadState.scopeKey === scopeKey ? shipments : [];
  const activeBox = record.boxDetails[activeBoxIndex];
  const totalMaterialQuantity = useMemo(
    () => record.materialLines.reduce((sum, line) => sum + line.quantity, 0),
    [record.materialLines],
  );
  const totalItemQuantity = useMemo(
    () => record.boxDetails.reduce((sum, box) => sum + box.items.reduce((boxSum, item) => boxSum + item.quantity, 0), 0),
    [record.boxDetails],
  );

  useEffect(() => {
    if (!clientId || !siteId) return;

    const controller = new AbortController();
    let active = true;
    const requestScopeKey = scopeKey;
    const query = new URLSearchParams({ clientId, siteId, limit: "100" });
    fetch(`/api/shipments?${query.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as { shipments?: ShipmentOption[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "登録済み出荷を読み込めませんでした");
        return body.shipments ?? [];
      })
      .then((nextShipments) => {
        if (active) {
          setShipments(nextShipments);
          setShipmentLoadState({ scopeKey: requestScopeKey, error: null });
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!active) return;
        setShipments([]);
        setShipmentLoadState({
          scopeKey: requestScopeKey,
          error: error instanceof Error ? error.message : "登録済み出荷を読み込めませんでした",
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [clientId, siteId, scopeKey]);

  function updateRecord<K extends keyof FieldWorkInput>(key: K, value: FieldWorkInput[K]) {
    setRecord((current) => ({ ...current, [key]: value }));
    setMessage(null);
    setPreview(null);
  }

  function updateMaterialQuantity(value: number) {
    updateRecord("materialLines", [materialLine(Math.max(0, value))]);
  }

  function updateAdditionalWorkQuantity(value: number) {
    updateRecord("additionalWorkLines", [{ code: "extra_pack", name: "追加梱包", quantity: Math.max(0, value) }]);
  }

  function selectRegisteredShipment(shipmentNo: string) {
    const shipment = visibleShipments.find((item) => item.shipmentNo === shipmentNo);
    if (!shipment) {
      updateRecord("shipmentNo", "");
      return;
    }
    setRecord((current) => ({
      ...current,
      shipmentNo: shipment.shipmentNo,
      workDate: shipment.workDate,
      packCount: shipment.packCount,
    }));
    setMessage(null);
    setPreview(null);
  }

  function updateBox(boxIndex: number, patch: Partial<BoxDetail>) {
    setRecord((current) => ({
      ...current,
      boxDetails: current.boxDetails.map((box, index) => index === boxIndex ? { ...box, ...patch } : box),
    }));
    setMessage(null);
    setPreview(null);
  }

  function addBox() {
    setRecord((current) => ({ ...current, boxDetails: [...current.boxDetails, emptyBox(nextBoxNumber(current.boxDetails))] }));
    setActiveBoxIndex(record.boxDetails.length);
    setMessage(null);
  }

  function removeBox(boxIndex: number) {
    setRecord((current) => ({ ...current, boxDetails: current.boxDetails.filter((_, index) => index !== boxIndex) }));
    setActiveBoxIndex((current) => {
      if (boxIndex < current) return current - 1;
      if (boxIndex === current) return Math.max(0, Math.min(current, record.boxDetails.length - 2));
      return current;
    });
    setMessage(null);
    setPreview(null);
  }

  function addItem(boxIndex: number) {
    const box = record.boxDetails[boxIndex];
    if (!box) return;
    updateBox(boxIndex, { items: [...box.items, emptyItem()] });
  }

  function updateItem(boxIndex: number, itemIndex: number, patch: Partial<BoxItem>) {
    const box = record.boxDetails[boxIndex];
    if (!box) return;
    updateBox(boxIndex, { items: box.items.map((item, index) => index === itemIndex ? { ...item, ...patch } : item) });
  }

  function removeItem(boxIndex: number, itemIndex: number) {
    const box = record.boxDetails[boxIndex];
    if (!box) return;
    updateBox(boxIndex, { items: box.items.filter((_, index) => index !== itemIndex) });
  }

  function updateBoxMaterial(boxIndex: number, value: number) {
    const quantity = Math.max(0, value);
    setRecord((current) => {
      const nextBoxes = current.boxDetails.map((box, index) => {
        if (index !== boxIndex) return box;
        const nextLine = materialLine(quantity);
        const hasLine = box.materialLines.some((line) => line.code === "bubble_wrap");
        return { ...box, materialLines: hasLine ? box.materialLines.map((line) => line.code === "bubble_wrap" ? nextLine : line) : [...box.materialLines, nextLine] };
      });
      const total = nextBoxes.reduce((sum, box) => sum + (box.materialLines.find((line) => line.code === "bubble_wrap")?.quantity ?? 0), 0);
      return { ...current, boxDetails: nextBoxes, materialLines: [materialLine(total)] };
    });
    setMessage(null);
    setPreview(null);
  }

  function loadDemoInput() {
    const selectedShipment = visibleShipments.find((shipment) => shipment.shipmentNo === record.shipmentNo);
    setRecord({
      ...demoFieldWorkInput,
      clientId: scope?.clientId ?? demoFieldWorkInput.clientId,
      siteId: scope?.siteId ?? demoFieldWorkInput.siteId,
      ...(selectedShipment ? {
        shipmentNo: selectedShipment.shipmentNo,
        workDate: selectedShipment.workDate,
        packCount: selectedShipment.packCount,
      } : {}),
      materialLines: demoFieldWorkInput.materialLines.map((line) => ({ ...line })),
      additionalWorkLines: demoFieldWorkInput.additionalWorkLines.map((line) => ({ ...line })),
      boxDetails: demoFieldWorkInput.boxDetails.map(cloneBox),
    });
    setActiveBoxIndex(0);
    setPreview(null);
    setMessage({ kind: "success", text: "デモ用の入力例を入れました。箱1・箱2の内容を確認して保存できます。" });
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
    <div className="field-layout">
      <section className="panel field-main-panel" aria-labelledby="field-form-title">
        <div className="section-heading">
          <div><span className="tag">現場入力</span><h2 id="field-form-title">箱ごとの作業を記録</h2></div>
          <span className="progress-chip">{record.boxDetails.length}箱入力済み</span>
        </div>

        <div className="shipment-card">
          <div className="field full">
            <label htmlFor="registeredShipment">登録済みの出荷から選ぶ</label>
            <select id="registeredShipment" value={visibleShipments.some((shipment) => shipment.shipmentNo === record.shipmentNo) ? record.shipmentNo : ""} onChange={(event) => selectRegisteredShipment(event.target.value)} disabled={shipmentsLoading}>
              <option value="">出荷番号を手入力する</option>
              {visibleShipments.map((shipment) => <option key={shipment.id} value={shipment.shipmentNo}>{shipment.shipmentNo}（{shipment.workDate}・箱{shipment.packCount}）</option>)}
            </select>
            {shipmentsLoading ? <p className="muted compact-note">登録済み出荷を読み込み中…</p> : shipmentsError ? <p className="notice compact-note">登録済み出荷を読み込めませんでした。出荷番号を手入力してください。</p> : visibleShipments.length === 0 ? <p className="muted compact-note">登録済み出荷はありません。出荷番号を手入力できます。</p> : <p className="muted compact-note">選択すると作業日と登録済み箱数が反映されます。</p>}
          </div>
          <div className="form-grid">
            <div className="field"><label htmlFor="shipmentNo">出荷番号</label><input id="shipmentNo" value={record.shipmentNo} onChange={(event) => updateRecord("shipmentNo", event.target.value)} placeholder="例：SHP-20260806-001" /></div>
            <div className="field"><label htmlFor="workDate">作業日</label><input id="workDate" type="date" value={record.workDate} onChange={(event) => updateRecord("workDate", event.target.value)} /></div>
            <div className="field"><label htmlFor="packCount">箱数</label><input id="packCount" type="number" min="0" inputMode="numeric" value={record.packCount} onChange={(event) => updateRecord("packCount", numericValue(event.target.value))} /></div>
            <div className="field"><label htmlFor="materialQuantity">緩衝材の個数</label><div className="stepper"><button type="button" aria-label="緩衝材を1個減らす" disabled={record.boxDetails.length > 0} onClick={() => updateMaterialQuantity(Math.max(0, totalMaterialQuantity - 1))}>−</button><input id="materialQuantity" type="number" min="0" inputMode="numeric" value={totalMaterialQuantity} readOnly={record.boxDetails.length > 0} onChange={(event) => updateMaterialQuantity(numericValue(event.target.value))} /><button type="button" aria-label="緩衝材を1個増やす" disabled={record.boxDetails.length > 0} onClick={() => updateMaterialQuantity(totalMaterialQuantity + 1)}>＋</button></div>{record.boxDetails.length > 0 && <span className="field-help">箱ごとの入力合計を表示しています</span>}</div>
            <div className="field"><label htmlFor="extraWorkQuantity">追加梱包の件数</label><div className="stepper"><button type="button" aria-label="追加梱包を1件減らす" onClick={() => updateAdditionalWorkQuantity(Math.max(0, (record.additionalWorkLines[0]?.quantity ?? 0) - 1))}>−</button><input id="extraWorkQuantity" type="number" min="0" inputMode="numeric" value={record.additionalWorkLines[0]?.quantity ?? 0} onChange={(event) => updateAdditionalWorkQuantity(numericValue(event.target.value))} /><button type="button" aria-label="追加梱包を1件増やす" onClick={() => updateAdditionalWorkQuantity((record.additionalWorkLines[0]?.quantity ?? 0) + 1)}>＋</button></div></div>
            <div className="field"><label htmlFor="exceptionReason">例外理由</label><select id="exceptionReason" value={record.exceptionReason ?? ""} onChange={(event) => updateRecord("exceptionReason", event.target.value || undefined)}><option value="">なし</option><option value="数量差異">数量差異</option><option value="破損">破損</option><option value="再出荷">再出荷</option><option value="その他">その他</option></select></div>
            <div className="field full"><label htmlFor="notes">備考</label><textarea id="notes" value={record.notes ?? ""} onChange={(event) => updateRecord("notes", event.target.value)} placeholder="例外があれば理由も記録します" /></div>
          </div>
        </div>

        <fieldset className="fieldset box-editor">
          <legend>箱の内容</legend>
          <div className="box-tabs" role="tablist" aria-label="入力する箱">
            {record.boxDetails.map((box, index) => <button key={`${box.boxNo}-${index}`} className={index === activeBoxIndex ? "box-tab active" : "box-tab"} type="button" role="tab" aria-selected={index === activeBoxIndex} onClick={() => setActiveBoxIndex(index)}>箱 {box.boxNo}<span>{box.items.length}明細</span></button>)}
            <button className="box-tab add" type="button" onClick={addBox}>＋ 箱を追加</button>
          </div>

          {activeBox ? <div className="box-card">
            <div className="section-heading compact-heading">
              <div><span className="summary-label">入力中の箱</span><h3>箱 {activeBox.boxNo}</h3></div>
              <button className="text-button danger-text" type="button" onClick={() => removeBox(activeBoxIndex)}>この箱を削除</button>
            </div>
            {activeBox.items.length === 0 ? <p className="empty-box">まだ商品がありません。下のボタンから明細を追加してください。</p> : <div className="box-items">
              {activeBox.items.map((item, itemIndex) => <div className="box-item-row" key={`${activeBox.boxNo}-${itemIndex}`}>
                <div className="field"><label htmlFor={`box-${activeBoxIndex}-sku-${itemIndex}`}>箱{activeBox.boxNo}の商品コード</label><input id={`box-${activeBoxIndex}-sku-${itemIndex}`} value={item.sku} onChange={(event) => updateItem(activeBoxIndex, itemIndex, { sku: event.target.value })} placeholder="SKU-001" /></div>
                <div className="field"><label htmlFor={`box-${activeBoxIndex}-name-${itemIndex}`}>商品名</label><input id={`box-${activeBoxIndex}-name-${itemIndex}`} value={item.name ?? ""} onChange={(event) => updateItem(activeBoxIndex, itemIndex, { name: event.target.value })} placeholder="商品名" /></div>
                <div className="field"><label htmlFor={`box-${activeBoxIndex}-quantity-${itemIndex}`}>箱{activeBox.boxNo}の商品数量</label><input id={`box-${activeBoxIndex}-quantity-${itemIndex}`} type="number" min="0" inputMode="numeric" value={item.quantity} onChange={(event) => updateItem(activeBoxIndex, itemIndex, { quantity: numericValue(event.target.value) })} /></div>
                <button className="text-button danger-text row-delete" type="button" onClick={() => removeItem(activeBoxIndex, itemIndex)}>削除</button>
              </div>)}
            </div>}
            <div className="box-footer-row">
              <button className="button secondary" type="button" onClick={() => addItem(activeBoxIndex)}>＋ 明細を追加</button>
              <div className="field box-material-field"><label htmlFor={`box-${activeBoxIndex}-material`}>箱{activeBox.boxNo}の緩衝材</label><div className="stepper"><button type="button" aria-label={`箱${activeBox.boxNo}の緩衝材を1個減らす`} onClick={() => updateBoxMaterial(activeBoxIndex, Math.max(0, (activeBox.materialLines.find((line) => line.code === "bubble_wrap")?.quantity ?? 0) - 1))}>−</button><input id={`box-${activeBoxIndex}-material`} type="number" min="0" inputMode="numeric" value={activeBox.materialLines.find((line) => line.code === "bubble_wrap")?.quantity ?? 0} onChange={(event) => updateBoxMaterial(activeBoxIndex, numericValue(event.target.value))} /><button type="button" aria-label={`箱${activeBox.boxNo}の緩衝材を1個増やす`} onClick={() => updateBoxMaterial(activeBoxIndex, (activeBox.materialLines.find((line) => line.code === "bubble_wrap")?.quantity ?? 0) + 1)}>＋</button></div></div>
            </div>
          </div> : <div className="empty-box add-box-prompt"><p>箱ごとの内訳が必要な場合は、箱を追加してください。</p><button className="button secondary" type="button" onClick={addBox}>＋ 箱1を追加</button></div>}
        </fieldset>

        <div className="actions field-actions">
          {canPreview && <button className="button secondary" type="button" onClick={loadDemoInput} disabled={busy}>入力例を入れる</button>}
          {canPreview && <button className="button" type="button" onClick={previewBilling} disabled={busy}>請求候補を計算</button>}
          <button className="button primary-action" type="button" onClick={saveRecord} disabled={busy}>{busy ? "保存中…" : "入力を保存"}</button>
        </div>
        {message && <div className={`status ${message.kind === "error" ? "error" : message.kind === "warning" ? "warning" : ""}`} role="status">{message.text}</div>}
      </section>

      <aside className="field-side-column">
        <section className="panel field-summary" aria-labelledby="field-summary-title">
          <div className="section-heading"><div><span className="tag">入力状況</span><h2 id="field-summary-title">箱の内容を確認</h2></div><span className="summary-number">{totalItemQuantity}<small>点</small></span></div>
          <dl className="summary-list"><div><dt>出荷番号</dt><dd>{record.shipmentNo || "未入力"}</dd></div><div><dt>箱数</dt><dd>{record.packCount}箱</dd></div><div><dt>入力済み箱</dt><dd>{record.boxDetails.length}箱</dd></div><div><dt>緩衝材</dt><dd>{totalMaterialQuantity}個</dd></div></dl>
          {record.packCount !== record.boxDetails.length && record.boxDetails.length > 0 && <div className="status warning">登録箱数（{record.packCount}箱）と入力箱数（{record.boxDetails.length}箱）が違います。</div>}
          <p className="muted compact-note">保存前に出荷番号、箱数、商品数量を確認してください。</p>
        </section>

        <section className="panel" aria-labelledby="preview-title">
          <div className="section-heading"><div><span className="tag">事務確認</span><h2 id="preview-title">請求候補プレビュー</h2></div></div>
          {!canPreview ? <p className="notice">現場画面では金額を表示しません。請求候補の確認は事務担当の画面で行います。</p> : !preview ? <p className="muted">入力例または作業内容を入力し、「請求候補を計算」を押してください。</p> : <>
            <div className="result-total">{yen(preview.totalYen)}</div>
            <p className="muted">小計 {yen(preview.subtotalYen)} / 税 {yen(preview.taxYen)}</p>
            {preview.warnings.length > 0 && <div className="status warning">{preview.warnings.map((warning) => <div key={warning}>{warning}</div>)}</div>}
            <div className="table-scroll"><table className="line-table"><thead><tr><th>明細</th><th>数量</th><th>金額</th></tr></thead><tbody>{preview.lines.map((line, index) => <tr key={`${index}-${line.workCode}-${line.priceRuleId}`}><td>{line.description}</td><td>{line.quantity}</td><td>{yen(line.totalYen)}</td></tr>)}</tbody></table></div>
          </>}
        </section>
      </aside>
    </div>
  );
}
