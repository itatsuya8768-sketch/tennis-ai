import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

// 一時的に無効化中：WebGLコンテキストが奪われる不具合の原因切り分けのため、
// AdSenseスクリプト（Googleの自動広告がページをスキャンする際にCanvas/WebGLを
// 使う可能性がある）を一旦外して検証する。
const ADSENSE_CLIENT = undefined as string | undefined; // process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

export const metadata: Metadata = {
  title: "TennisAI365Coach - AIフォーム診断",
  description: "テニスプレイヤー専用AIフォーム・姿勢診断。MediaPipe骨格検出とClaude AIによるリアルタイム分析。",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
  themeColor: "#0b0d10",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {ADSENSE_CLIENT && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
