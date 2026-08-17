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
      const response = await fetch("/api/excel-import-preview", { method: "POST", headers, body: formData });
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
      const response = await fetch("/api/excel-import-register", { method: "POST", headers, body: formData });
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

  function selectFile(nextFile: File | null) {
    setFile(nextFile);
    setPreview(null);
    setRegistration(null);
    setMessage(null);
  }

  function downloadErrorDetails() {
    if (!preview) return;
    const details = [
      ["種別", "行", "出荷番号", "メッセージ"],
      ...preview.exceptions.map((item) => ["停止", String(item.sourceRowNumber ?? ""), item.shipmentNo ?? "", item.message]),
      ...preview.warnings.map((item) => ["注意", String(item.sourceRowNumber ?? ""), item.shipmentNo ?? "", item.message]),
    ];
    const csv = details.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${preview.fileName.replace(/\.xlsx$/i, "")}-確認結果.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="import-layout">
      {!scope ? (
        <section className="panel import-workspace" aria-labelledby="excel-import-access-title">
          <h2 id="excel-import-access-title">Excel取込を利用できません</h2>
          <p className="notice">ログイン済みの事務担当者に、対象荷主・拠点の所属が必要です。ログイン後にもう一度開いてください。</p>
        </section>
      ) : (
        <section className="panel import-workspace" aria-labelledby="excel-import-title">
          <div className="workspace-heading">
            <div className="workspace-title">
              <span className="workspace-icon" aria-hidden="true">▧</span>
              <h2 id="excel-import-title">Excelインポート</h2>
            </div>
            <button className="outline-button" type="button" disabled title="デモ版では準備中です">↺ インポート履歴</button>
          </div>

          <label className="upload-dropzone" htmlFor="shipmentExcel">
            <span className="upload-icon" aria-hidden="true">⇧</span>
            <strong>Excelファイルをドラッグ＆ドロップ</strong>
            <span className="upload-or">または</span>
            <span className="file-picker">ファイルを選択</span>
            <input
              id="shipmentExcel"
              aria-label="Excelファイル（.xlsx）"
              className="visually-hidden"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
            />
            <small>対応形式：.xlsx / .xls<br />1ファイルあたりの上限：10MB</small>
          </label>

          {demoMode && <p className="notice import-notice">デモ用のExcelを選び、内容を確認してから登録してください。</p>}
          {file && <p className="selected-file">選択中：<strong>{file.name}</strong></p>}
          {message && <div className={`status ${message.kind === "error" ? "error" : ""}`} role="status">{message.text}</div>}

          {preview && (
            <div className="import-preview-block">
              <div className="workspace-subheading">
                <div>
                  <span className="section-kicker">確認ステップ</span>
                  <h3>インポート結果プレビュー</h3>
                </div>
                <span className="preview-file">{preview.fileName}</span>
              </div>
              <div className="summary-grid import-summary-grid">
                <div><span className="summary-label">出荷グループ数</span><strong>{preview.accepted.length}</strong><small>件</small></div>
                <div><span className="summary-label">出荷合計</span><strong>{preview.shipmentCount}</strong><small>件</small></div>
                <div><span className="summary-label">明細行数（合計）</span><strong>{preview.detailRowCount}</strong><small>行</small></div>
                <div className="summary-warning"><span className="summary-label">注意が必要なグループ</span><strong>{preview.exceptions.length + preview.warnings.length}</strong><small>件</small></div>
              </div>

              {preview.exceptions.length > 0 && (
                <div className="status error"><strong>停止</strong>{preview.exceptions.slice(0, 10).map((item) => <div key={`${item.code}-${item.sourceRowNumber}-${item.shipmentNo}`}>行{item.sourceRowNumber ?? "-"}：{item.message}</div>)}</div>
              )}
              {preview.warnings.length > 0 && (
                <div className="status warning"><strong>注意</strong>{preview.warnings.slice(0, 10).map((item) => <div key={`${item.code}-${item.sourceRowNumber}-${item.shipmentNo}`}>行{item.sourceRowNumber ?? "-"}：{item.message}</div>)}</div>
              )}

              <div className="table-scroll import-table-scroll">
                <table className="line-table import-table">
                  <thead><tr><th>グループ名（出荷番号）</th><th>出荷件数</th><th>明細行数</th><th>状態</th><th>メッセージ</th></tr></thead>
                  <tbody>
                    {preview.accepted.slice(0, 20).map((shipment, index) => {
                      const warning = preview.warnings.find((item) => item.shipmentNo === shipment.shipmentNo);
                      const exception = preview.exceptions.find((item) => item.shipmentNo === shipment.shipmentNo);
                      const state = exception ? "停止" : warning ? "注意あり" : "正常";
                      const productSummary = shipment.productLines?.map((line) => `${line.productName} × ${line.quantity}`).join("、");
                      return (
                        <tr key={shipment.shipmentNo}>
                          <td><strong>G{index + 1}</strong> <span className="table-subtext">({shipment.shipmentNo})</span>{productSummary && <span className="table-subtext table-product-summary">{productSummary}</span>}</td>
                          <td>{shipment.packCount || 0}件</td>
                          <td>{shipment.productLines?.length ?? 0}行</td>
                          <td><span className={`state-badge state-${exception ? "error" : warning ? "warning" : "ok"}`}><span aria-hidden="true">{exception ? "■" : warning ? "▲" : "●"}</span>{state}</span></td>
                          <td>{exception?.message ?? warning?.message ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {preview.accepted.length > 20 && <p className="table-footnote">先頭20グループを表示しています。</p>}
            </div>
          )}

          <div className="workspace-actions">
            <Link className="outline-button" href="/">戻る</Link>
            <button className="outline-button" type="button" onClick={downloadErrorDetails} disabled={!preview || (preview.exceptions.length === 0 && preview.warnings.length === 0)}>⇩ エラー詳細をダウンロード</button>
            <button
              className="button primary-action import-primary-action"
              type="button"
              aria-label={preview ? "この内容で登録する" : "内容を確認する"}
              onClick={preview ? registerFile : previewFile}
              disabled={busy || !file || Boolean(registration) || Boolean(preview?.exceptions.length)}
            >
              {busy ? (preview ? "登録中…" : "確認中…") : registration ? "登録済み" : preview ? "インポート実行  ›" : "内容を確認する  ›"}
            </button>
          </div>
          {registration && <div className="registration-complete"><span aria-hidden="true">✓</span>登録番号：{registration.importRunId} / 出荷{registration.shipmentCount}件・商品明細{registration.detailCount}行<Link href="/field">登録した出荷で現場入力へ</Link></div>}
        </section>
      )}
    </div>
  );
}
