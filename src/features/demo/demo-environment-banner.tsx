import { isDemoMode, usesSupabaseStorage } from "@/src/lib/env";
import { getTrialStatus, isTrialMode, trialWriteDisabledMessage } from "@/src/lib/trial";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(value);
}

export function DemoEnvironmentBanner() {
  if (!isDemoMode()) return null;
  const trial = getTrialStatus();
  const trialMessage = trialWriteDisabledMessage(trial);

  return (
    <div className="demo-banner" role="status">
      <span className="tag">{isTrialMode() ? "試用版" : "デモ環境"}</span>
      <span>{isTrialMode()
        ? trialMessage ?? `試用版です。入力は保存されますが、正式な請求には反映されません。${trial.endsAt ? `利用期限：${formatDate(trial.endsAt)}` : ""}`
        : "この画面の入力はデモ用です。実際の請求には反映されません。"}</span>
      {usesSupabaseStorage() && <a href="/login">ログイン</a>}
    </div>
  );
}
