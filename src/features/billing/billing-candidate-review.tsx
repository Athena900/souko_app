"use client";

import { useEffect, useState } from "react";
import type { BillingCandidateReviewStatus, BillingCalculation } from "@/src/domain/types";

interface BillingScope {
  clientId: string;
  siteId: string;
}

interface FieldWorkSummary {
  id: string;
  shipmentNo: string;
  workDate: string;
  packCount: number;
  status: string;
  createdAt: string;
  demo: boolean;
}

interface BillingCandidate {
  id: string;
  fieldWorkRecordId: string;
  shipmentNo: string;
  workDate: string;
  calculation: BillingCalculation;
  status: BillingCandidateReviewStatus;
  reviewedAt?: string;
  reviewNote?: string;
  demo: boolean;
  persisted: boolean;
}

function yen(value: number): string {
  return `${new Intl.NumberFormat("ja-JP").format(value)}円`;
}

function statusLabel(status: BillingCandidateReviewStatus): string {
  switch (status) {
    case "ready": return "計算済み・未確認";
    case "review_required": return "要確認";
    case "approved": return "確認済み";
    case "rejected": return "差し戻し";
  }
}

export function BillingCandidateReview({ scope }: { scope: BillingScope | null }) {
  const [records, setRecords] = useState<FieldWorkSummary[]>([]);
  const [loadState, setLoadState] = useState<{ scopeKey: string; error: string | null }>({ scopeKey: "", error: null });
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [candidate, setCandidate] = useState<BillingCandidate | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error" | "warning"; text: string } | null>(null);

  const clientId = scope?.clientId;
  const siteId = scope?.siteId;
  const scopeKey = clientId && siteId ? JSON.stringify([clientId, siteId]) : "";
  const loading = Boolean(scopeKey && loadState.scopeKey !== scopeKey);
  const loadError = loadState.scopeKey === scopeKey ? loadState.error : null;
  const visibleRecords = loadState.scopeKey === scopeKey ? records : [];

  useEffect(() => {
    if (!clientId || !siteId) return;
    const controller = new AbortController();
    let active = true;
    const requestScopeKey = scopeKey;
    const query = new URLSearchParams({ clientId, siteId, limit: "100" });
    fetch(`/api/field-records?${query.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as { records?: FieldWorkSummary[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "現場記録を読み込めませんでした");
        return body.records ?? [];
      })
      .then((nextRecords) => {
        if (!active) return;
        setRecords(nextRecords);
        setLoadState({ scopeKey: requestScopeKey, error: null });
        setSelectedRecordId((current) => (nextRecords.some((record) => record.id === current) ? current : nextRecords[0]?.id ?? ""));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!active) return;
        setRecords([]);
        setLoadState({ scopeKey: requestScopeKey, error: error instanceof Error ? error.message : "現場記録を読み込めませんでした" });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [clientId, siteId, scopeKey]);

  if (!scope) {
    return (
      <section className="panel" aria-labelledby="billing-access-title">
        <h2 id="billing-access-title">請求候補を利用できません</h2>
        <p className="notice">事務担当者・責任者の所属を確認してください。</p>
      </section>
    );
  }

  const activeScope = scope;

  async function calculateCandidate() {
    if (!selectedRecordId) {
      setMessage({ kind: "error", text: "確認する現場記録を選択してください" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/billing-candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: activeScope.clientId,
          siteId: activeScope.siteId,
          fieldWorkRecordId: selectedRecordId,
          recalculate: candidate?.status === "approved" || candidate?.status === "rejected",
        }),
      });
      const body = (await response.json()) as BillingCandidate & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "請求候補を計算できませんでした");
      setCandidate(body);
      setReviewNote("");
      setMessage({ kind: body.calculation.warnings.length ? "warning" : "success", text: body.calculation.warnings.length ? "計算しました。警告を確認してください" : "請求候補を計算しました" });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "請求候補を計算できませんでした" });
    } finally {
      setBusy(false);
    }
  }

  async function reviewCandidate(status: "approved" | "rejected") {
    if (!candidate) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/billing-candidates/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: activeScope.clientId, siteId: activeScope.siteId, candidateId: candidate.id, status, note: reviewNote || undefined }),
      });
      const body = (await response.json()) as BillingCandidate & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "確認結果を保存できませんでした");
      setCandidate(body);
      setMessage({ kind: "success", text: status === "approved" ? "請求候補を確認済みにしました" : "請求候補を差し戻しました" });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "確認結果を保存できませんでした" });
    } finally {
      setBusy(false);
    }
  }

  const selectedRecord = visibleRecords.find((record) => record.id === selectedRecordId);
  const canReview = Boolean(candidate?.persisted && candidate.status !== "approved" && candidate.status !== "rejected");

  return (
    <div className="two-column">
      <section className="panel billing-list-panel" aria-labelledby="billing-record-title">
        <h2 id="billing-record-title">確認対象の現場記録</h2>
        <p className="muted">現場で保存された記録を選び、承認済み単価から請求候補を計算します。</p>
        <div className="field">
          <label htmlFor="billingRecord">請求候補の対象</label>
          <select id="billingRecord" value={selectedRecordId} onChange={(event) => { setSelectedRecordId(event.target.value); setCandidate(null); setMessage(null); }} disabled={loading || visibleRecords.length === 0}>
            <option value="">現場記録を選択してください</option>
            {visibleRecords.map((record) => <option key={record.id} value={record.id}>{record.shipmentNo}（{record.workDate}・箱{record.packCount}）</option>)}
          </select>
        </div>
        {loading ? <p className="muted">現場記録を読み込み中…</p> : loadError ? <p className="notice">{loadError}</p> : visibleRecords.length === 0 ? <p className="notice">現場記録がありません。先に現場入力を保存してください。</p> : selectedRecord ? <p className="muted">選択中：{selectedRecord.shipmentNo} / {selectedRecord.workDate}</p> : null}
        <button className="button" type="button" onClick={calculateCandidate} disabled={busy || loading || !selectedRecordId}>{candidate?.status === "approved" || candidate?.status === "rejected" ? "請求候補を再計算" : "請求候補を計算"}</button>
        {message && <div className={`status ${message.kind === "error" ? "error" : message.kind === "warning" ? "warning" : ""}`} role="status">{message.text}</div>}
      </section>

      <section className="panel billing-result-panel" aria-labelledby="billing-result-title">
        <h2 id="billing-result-title">請求候補</h2>
        {!candidate ? <p className="muted">対象を選び、「請求候補を計算」を押してください。</p> : <>
          <div className="inline-row"><div><span className="summary-label">状態</span><strong className="status-text">{statusLabel(candidate.status)}</strong></div><div><span className="summary-label">出荷番号</span><strong>{candidate.shipmentNo}</strong></div></div>
          <div className="summary-grid billing-summary-grid"><div><span className="summary-label">小計</span><strong>{yen(candidate.calculation.subtotalYen)}</strong></div><div><span className="summary-label">消費税</span><strong>{yen(candidate.calculation.taxYen)}</strong></div><div className="total-card"><span className="summary-label">税込合計</span><strong>{yen(candidate.calculation.totalYen)}</strong></div></div>
          {candidate.calculation.warnings.length > 0 && <div className="status warning"><strong>確認が必要</strong>{candidate.calculation.warnings.map((warning) => <div key={warning}>{warning}</div>)}</div>}
          <div className="table-scroll"><table className="line-table"><thead><tr><th>明細</th><th>数量</th><th>単価</th><th>金額</th></tr></thead><tbody>{candidate.calculation.lines.map((line, index) => <tr key={`${index}-${line.workCode}-${line.priceRuleId}`}><td>{line.description}</td><td>{line.quantity}</td><td>{yen(line.unitPriceYen)}</td><td>{yen(line.totalYen)}</td></tr>)}</tbody></table></div>
          {candidate.persisted ? <><div className="field" style={{ marginTop: 16 }}><label htmlFor="reviewNote">確認メモ（警告がある場合は必須）</label><textarea id="reviewNote" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="例：数量を作業表と確認済み" /></div><div className="actions"><button className="button" type="button" onClick={() => reviewCandidate("approved")} disabled={busy || !canReview}>確認済みにする</button><button className="button secondary" type="button" onClick={() => reviewCandidate("rejected")} disabled={busy || !canReview}>差し戻す</button></div></> : <p className="notice">この候補は保存されていないため、確認結果を保存できません。</p>}
        </>}
      </section>
    </div>
  );
}
