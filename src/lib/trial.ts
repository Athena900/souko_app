import { isDemoMode } from "@/src/lib/env";

export type TrialStatus =
  | { kind: "not_trial"; writeAllowed: true; endsAt: null }
  | { kind: "active"; writeAllowed: true; endsAt: Date }
  | { kind: "expired"; writeAllowed: false; endsAt: Date }
  | { kind: "misconfigured"; writeAllowed: false; endsAt: null };

function parseEndAt(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * 試用環境だけは終了日時を必須にする。
 * 環境変数が欠けているときも書込み不可にし、試用データが無期限に増える事故を防ぐ。
 */
export function getTrialStatus(now = new Date()): TrialStatus {
  if (process.env.APP_ENV !== "trial") return { kind: "not_trial", writeAllowed: true, endsAt: null };

  const endsAt = parseEndAt(process.env.TRIAL_END_AT);
  if (!endsAt) return { kind: "misconfigured", writeAllowed: false, endsAt: null };
  if (now.getTime() >= endsAt.getTime()) return { kind: "expired", writeAllowed: false, endsAt };
  return { kind: "active", writeAllowed: true, endsAt };
}

export function isTrialMode(): boolean {
  return isDemoMode() && process.env.APP_ENV === "trial";
}

export function trialWriteDisabledMessage(status = getTrialStatus()): string | null {
  if (status.kind === "expired") return "試用期間が終了したため、新しい入力は保存できません";
  if (status.kind === "misconfigured") return "試用期間の設定を確認中のため、新しい入力は保存できません";
  return null;
}
