import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TennisAI - AIフォーム診断",
  description: "テニスプレイヤー専用AIフォーム・姿勢診断。MediaPipe骨格検出とClaude AIによるリアルタイム分析。",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
  themeColor: "#84cc16",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
