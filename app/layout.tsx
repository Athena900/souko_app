import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CSロジネット 倉庫業務",
  description: "出荷・現場実績・請求候補を一元管理する業務アプリ",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
