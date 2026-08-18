"use client";

import Link from "next/link";
import { useState } from "react";
import type { ExcelImportResult } from "@/src/domain/excel-import";

interface PreviewResponse extends ExcelImportResult {
  fileName: string;
  sha256: string;
  error?: string;
}

interface RegistrationResponse {
  registered: boolean;
  sourceFileVersionId: string;
  importRunId: string;
  shipmentCount: number;
  detailCount: number;
  demo: boolean;
  error?: string;
}

interface ImportScope {
  clientId: string;
  siteId: string;
}

function yenDate(value: string): string {
  return value.replace(/-/g, "/");
}

export function ExcelImportPreview({ demoMode = false, scope }: { demoMode?: boolean; scope: ImportScope | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [registration, setRegistration] = useState<RegistrationResponse | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function previewFile() {
    if (!file) {
      setMessage({ kind: "error", text: "Excelファイルを選択してください" });
      return;
    }
    setBusy(true);
    setMessage(null);
    setPreview(null);
    setRegistration(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const sourceId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `preview-${Date.now()}`;
      const headers: Record<string, string> = { "x-source-file-version-id": sourceId };
      if (scope) {
        headers["x-client-id"] = scope.clientId;
        headers["x-site-id"] = scope.siteId;
      }
      const response = await fetch("/api/excel-import-preview", {
        method: "POST",
        headers,
        body: formData,
      });
      const body = (await response.json()) as PreviewResponse;
      if (!response.ok) throw new Error(body.error ?? "Excelを確認できませんでした");
      setPreview(body);
      setMessage({ kind: "success", text: "Excelを確認しました。まだ登録はしていません。" });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Excelを確認できませんでした" });
    } finally {
      setBusy(false);
    }
  }

  async function registerFile() {
    if (!file || !preview) {
      setMessage({ kind: "error", text: "先にExcelの内容を確認してください" });
      return;
    }
    if (preview.exceptions.length > 0) {
      setMessage({ kind: "error", text: "エラーがあるため登録できません。内容を修正して再確認してください" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const headers: Record<string, string> = {
        "x-source-file-version-id": preview.sourceFileVersionId,
        "x-preview-sha256": preview.sha256,
      };
      if (scope) {
        headers["x-client-id"] = scope.clientId;
        headers["x-site-id"] = scope.siteId;
      }
      const response = await fetch("/api/excel-import-register", {
        method: "POST",
        headers,
        body: formData,
      });
      const body = (await response.json()) as RegistrationResponse;
      if (!response.ok) throw new Error(body.error ?? "Excelを登録できませんでした");
      setRegistration(body);
      setMessage({ kind: "success", text: "Excelを登録しました。次は現場入力と単価計算に進めます。" });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Excelを登録できませんでした" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="import-layout">
      <ol className="import-steps" aria-label="Excel取込の手順">
        <li className="active"><span>1</span><strong>ファイルを選ぶ</strong></li>
        <li><span>2</span><strong>内容を確認</strong></li>
        <li><span>3</span><strong>登録する</strong></li>
      </ol>
      <section className="panel upload-card" aria-labelledby="excel-import-title">
        <h2 id="excel-import-title">Excelを確認する</h2>
        <p className="muted">「出荷指示貼り付け」シートだけを読み込み、出荷ごとに整理します。ここではデータを保存しません。</p>
        {demoMode && <p className="notice">受け取ったExcelを選び、「内容を確認する」で内容を確認してから登録してください。</p>}
        <div className="upload-dropzone">
          <label htmlFor="shipmentExcel">Excelファイル（.xlsx）</label>
          <input id="shipmentExcel" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setRegistration(null); setMessage(null); }} />
          <p className="muted">PCではドラッグ＆ドロップ、スマホではファイルを選択できます。</p>
        </div>
        <div className="actions">
          <button className="button" type="button" onClick={previewFile} disabled={busy}>{busy ? "確認中…" : "内容を確認する"}</button>
          {preview && <button className="button secondary" type="button" onClick={registerFile} disabled={busy || preview.exceptions.length > 0 || Boolean(registration)}>{registration ? "登録済み" : busy ? "登録中…" : "この内容で登録する"}</button>}
        </div>
        {message && <div className={`status ${message.kind === "error" ? "error" : ""}`} role="status">{message.text}</div>}
        {registration && <>
          <div className="status" role="status">登録番号：{registration.importRunId} / 出荷{registration.shipmentCount}件・商品明細{registration.detailCount}行</div>
          <div className="actions"><Link className="button secondary" href="/field">登録した出荷で現場入力へ</Link></div>
        </>}
      </section>

      <section className="panel import-summary-panel" aria-labelledby="excel-summary-title">
        <h2 id="excel-summary-title">確認結果</h2>
        {!preview ? <p className="muted">Excelを選ぶと、出荷件数と確認が必要な行を表示します。</p> : <>
          <p className="muted">{preview.fileName} / {preview.sourceSheetName}</p>
          <div className="summary-grid import-summary-grid">
            <div><span className="summary-label">出荷グループ</span><strong>{preview.accepted.length}</strong></div>
            <div><span className="summary-label">出荷件数</span><strong>{preview.shipmentCount}</strong></div>
            <div><span className="summary-label">商品明細行</span><strong>{preview.detailRowCount}</strong></div>
            <div><span className="summary-label">確認が必要</span><strong>{preview.exceptions.length + preview.warnings.length}</strong></div>
          </div>
          {preview.exceptions.length > 0 && <div className="status error"><strong>エラー</strong>{preview.exceptions.slice(0, 10).map((item) => <div key={`${item.code}-${item.sourceRowNumber}-${item.shipmentNo}`}>行{item.sourceRowNumber ?? "-"}：{item.message}</div>)}</div>}
          {preview.warnings.length > 0 && <div className="status warning"><strong>確認が必要な内容</strong>{preview.warnings.slice(0, 10).map((item) => <div key={`${item.code}-${item.sourceRowNumber}-${item.shipmentNo}`}>行{item.sourceRowNumber ?? "-"}：{item.message}</div>)}{preview.warnings.length > 10 && <div>ほか{preview.warnings.length - 10}件</div>}</div>}
          {preview.exceptions.length === 0 && <p className="muted">エラーはありません。警告を確認したうえで「この内容で登録する」を押すと保存します。</p>}
        </>}
      </section>

      {preview && <section className="panel full-panel" aria-labelledby="shipment-list-title">
        <h2 id="shipment-list-title">出荷の一覧（先頭20件）</h2>
        <div className="table-scroll">
          <table className="line-table">
            <thead><tr><th>作業日</th><th>出荷番号</th><th>箱数</th><th>商品</th></tr></thead>
            <tbody>{preview.accepted.slice(0, 20).map((shipment) => <tr key={shipment.shipmentNo}><td>{yenDate(shipment.workDate)}</td><td>{shipment.shipmentNo}</td><td>{shipment.packCount || "未入力"}</td><td>{shipment.productLines?.map((line) => `${line.productName} × ${line.quantity}`).join("、") || "-"}</td></tr>)}</tbody>
          </table>
        </div>
      </section>}
    </div>
  );
}
