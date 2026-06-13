"use client";
import { useState } from "react";
import Link from "next/link";

export default function PremiumPage() {
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const goPay = async () => {
    if (!agreed || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const d = await res.json();
      if (d.url) { window.location.href = d.url; return; }
      alert(d.error ?? "決済の開始に失敗しました");
    } catch {
      alert("決済の開始に失敗しました");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f0fdf4,#f8fafc)", padding: "24px 16px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 20, color: "#0f172a" }}>⭐ Premiumプラン</div>
          <Link href="/" style={{ fontSize: 13, fontWeight: 700, color: "#16a34a", textDecoration: "none" }}>← 戻る</Link>
        </div>

        {/* プラン概要 */}
        <div style={{ background: "linear-gradient(135deg,#1e293b,#0f172a)", borderRadius: 20, padding: "24px 22px", marginBottom: 16, border: "1px solid rgba(132,204,22,0.5)" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginBottom: 4 }}>¥999<span style={{ fontSize: 13, color: "#94a3b8" }}> / 月（税込）</span></div>
          <div style={{ fontSize: 12, color: "#84cc16", fontWeight: 700, marginBottom: 14 }}>完全AI診断を解放</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {["✅ 詳細診断レポートを全文表示（フォーム分析）", "✅ 打点チェックの詳細", "✅ フットワーク分析の詳細", "✅ 怪我ケア・予防アドバイス", "✅ 診断回数 月30回まで"].map(f => (
              <div key={f} style={{ fontSize: 13, color: "#e2e8f0" }}>{f}</div>
            ))}
          </div>
        </div>

        {/* 注意 */}
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 14, padding: "14px 16px", marginBottom: 16, fontSize: 12, color: "#92400e", lineHeight: 1.8 }}>
          ⚠️ 診断結果はAIによる推定であり、動画から得られる情報のみを利用しているため実際と相違がある場合があります。無理をすると痛みや怪我をする場合がありますのでご注意ください。詳しくは
          <Link href="/terms" style={{ color: "#b45309", fontWeight: 800 }}>利用規約</Link>
          をご確認ください。
        </div>

        {/* 同意チェック */}
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#fff", border: agreed ? "2px solid #84cc16" : "1px solid #e2e8f0", borderRadius: 14, padding: "14px 16px", marginBottom: 16, cursor: "pointer" }}>
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0, accentColor: "#16a34a", cursor: "pointer" }} />
          <span style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.7 }}>
            <Link href="/terms" target="_blank" style={{ color: "#16a34a", fontWeight: 800, textDecoration: "underline" }}>利用規約・プライバシーポリシー</Link>
            を読み、内容に同意しました
          </span>
        </label>

        {/* 支払いボタン */}
        <button
          onClick={goPay}
          disabled={!agreed || loading}
          style={{
            width: "100%", padding: "16px", borderRadius: 14,
            background: (!agreed || loading) ? "#e2e8f0" : "linear-gradient(90deg,#84cc16,#22c55e)",
            color: (!agreed || loading) ? "#94a3b8" : "#fff",
            fontWeight: 900, fontSize: 15, border: "none",
            cursor: (!agreed || loading) ? "not-allowed" : "pointer",
            boxShadow: (!agreed || loading) ? "none" : "0 4px 20px rgba(132,204,22,0.4)",
          }}
        >
          {loading ? "処理中..." : agreed ? "同意して支払いへ進む" : "規約に同意するとボタンが有効になります"}
        </button>

        <div style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", marginTop: 12, lineHeight: 1.7 }}>
          決済はStripeの安全な画面で行われます。<br />いつでも解約でき、解約後は次回更新日以降の課金が停止します。
        </div>
      </div>
    </div>
  );
}
