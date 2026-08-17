import { isDemoMode } from "@/src/lib/env";

export function DemoEnvironmentBanner() {
  if (!isDemoMode()) return null;

  return (
    <div className="demo-banner" role="status">
      <span className="tag">デモ環境</span>
      <span>この画面の入力はデモ用です。実際の請求には反映されません。</span>
    </div>
  );
}
