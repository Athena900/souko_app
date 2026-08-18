import type { Metadata } from "next";
import "./globals.css";
import { SupabaseBrowserProvider } from "@/src/features/auth/supabase-browser-provider";
import { getSupabasePublicEnv } from "@/src/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CSロジネット 倉庫業務",
  description: "出荷・現場実績・請求候補を一元管理する業務アプリ",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let supabaseBrowserConfig = null;
  try {
    supabaseBrowserConfig = getSupabasePublicEnv();
  } catch {
    // 共有メモリデモなど、Supabaseを使わない環境ではnullのまま描画する。
  }

  return (
    <html lang="ja">
      <body><SupabaseBrowserProvider config={supabaseBrowserConfig}>{children}</SupabaseBrowserProvider></body>
    </html>
  );
}
