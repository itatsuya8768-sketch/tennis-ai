"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function PremiumPage() {
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isPremium, setIsPremium] = useState<boolean | null>(null); // null = 読み込み中
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) { setIsPremium(false); return; }
      supabase.from("profiles").select("is_premium").eq("id", u.id).maybeSingle()
        .then(({ data: p }) => setIsPremium(!!p?.is_premium));
    });
  }, []);

  const goPay = async () => {
    if (!agreed || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const d = await res.json();
      if (d.url) { window.location.href = d.url; return; }
      alert(d.error ?? "決済の開始に失敗しました");
    } catch { alert("決済の開始に失敗しました"); }
    setLoading(false);
  };

  const doCancel = async () => {
    if (canceling) return;
    setCanceling(true);
    try {
      const res = await fetch("/api/cancel-subscription", { method: "POST" });
      const d = await res.json();
      if (res.ok && d.ok) {
        alert("解約しました。Premium機能のご利用を停止しました。");
        window.location.href = "/";
        return;
      }
      alert(d.error ?? "解約に失敗しました");
    } catch { alert("解約に失敗しました"); }
    setCanceling(false);
  };

  const Wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f0fdf4,#f8fafc)", padding: "24px 16px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 20, color: "#0f172a" }}>⭐ Premiumプラン</div>
          <Link href="/" style={{ fontSize: 13, fontWeight: 700, color: "#16a34a", textDecoration: "none" }}>← 戻る</Link>
        </div>
        {children}
      </div>
    </div>
  );

  if (isPremium === null) {
    return Wrap(<div style={{ textAlign: "center", color: "#94a3b8", padding: 40 }}>読み込み中...</div>);
  }

  // ===== Premium会員：解約UI =====
  if (isPremium) {
    return Wrap(<>
      <div style={{ background: "#fff", borderRadius: 20, border: "2px solid #84cc16", padding: "24px 22px", marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
        <div style={{ fontWeight: 900, fontSize: 18, color: "#16a34a", marginBottom: 8 }}>現在 Premium 会員です</div>
        <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.8 }}>詳細診断レポートを全文ご覧いただけます。診断は月30回までご利用可能です。</div>
      </div>

      {/* 解約（小さめ） */}
      <div style={{ textAlign: "center", marginTop: 8 }}>
        {!confirmCancel ? (
          <button onClick={() => setConfirmCancel(true)} style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}>
            Premiumを解約する
          </button>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #fecaca", borderRadius: 14, padding: "16px 18px", marginTop: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>本当に解約しますか？</div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.7, marginBottom: 14 }}>「はい」を押すと、即時にPremiumが停止し、サブスクリプションも自動でキャンセルされます。</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={doCancel} disabled={canceling} style={{ flex: 1, padding: "12px", borderRadius: 10, background: canceling ? "#e2e8f0" : "#ef4444", color: canceling ? "#94a3b8" : "#fff", fontWeight: 800, fontSize: 14, border: "none", cursor: canceling ? "wait" : "pointer" }}>
                {canceling ? "処理中..." : "はい（解約する）"}
              </button>
              <button onClick={() => setConfirmCancel(false)} disabled={canceling} style={{ flex: 1, padding: "12px", borderRadius: 10, background: "#f1f5f9", color: "#475569", fontWeight: 800, fontSize: 14, border: "1px solid #e2e8f0", cursor: "pointer" }}>
                いいえ
              </button>
            </div>
          </div>
        )}
      </div>
    </>);
  }

  // ===== 非会員：申込UI（同意チェック付き） =====
  return Wrap(<>
    <div style={{ background: "linear-gradient(135deg,#1e293b,#0f172a)", borderRadius: 20, padding: "24px 22px", marginBottom: 16, border: "1px solid rgba(132,204,22,0.5)" }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginBottom: 4 }}>¥999<span style={{ fontSize: 13, color: "#94a3b8" }}> / 月（税込）</span></div>
      <div style={{ fontSize: 12, color: "#84cc16", fontWeight: 700, marginBottom: 14 }}>完全AI診断を解放</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {["✅ 詳細診断レポートを全文表示（フォーム分析）", "✅ 打点チェックの詳細", "✅ フットワーク分析の詳細", "✅ 怪我ケア・予防アドバイス", "✅ 診断回数 月30回まで"].map(f => (
          <div key={f} style={{ fontSize: 13, color: "#e2e8f0" }}>{f}</div>
        ))}
      </div>
    </div>

    <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 14, padding: "14px 16px", marginBottom: 16, fontSize: 12, color: "#92400e", lineHeight: 1.8 }}>
      ⚠️ 診断結果はAIによる推定であり、動画から得られる情報のみを利用しているため実際と相違がある場合があります。無理をすると痛みや怪我をする場合がありますのでご注意ください。詳しくは
      <Link href="/terms" style={{ color: "#b45309", fontWeight: 800 }}>利用規約</Link>
      をご確認ください。
    </div>

    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#fff", border: agreed ? "2px solid #84cc16" : "1px solid #e2e8f0", borderRadius: 14, padding: "14px 16px", marginBottom: 16, cursor: "pointer" }}>
      <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0, accentColor: "#16a34a", cursor: "pointer" }} />
      <span style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.7 }}>
        <Link href="/terms" target="_blank" style={{ color: "#16a34a", fontWeight: 800, textDecoration: "underline" }}>利用規約・プライバシーポリシー</Link>
        を読み、内容に同意しました
      </span>
    </label>

    <button onClick={goPay} disabled={!agreed || loading} style={{ width: "100%", padding: "16px", borderRadius: 14, background: (!agreed || loading) ? "#e2e8f0" : "linear-gradient(90deg,#84cc16,#22c55e)", color: (!agreed || loading) ? "#94a3b8" : "#fff", fontWeight: 900, fontSize: 15, border: "none", cursor: (!agreed || loading) ? "not-allowed" : "pointer", boxShadow: (!agreed || loading) ? "none" : "0 4px 20px rgba(132,204,22,0.4)" }}>
      {loading ? "処理中..." : agreed ? "同意して支払いへ進む" : "規約に同意するとボタンが有効になります"}
    </button>

    <div style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", marginTop: 12, lineHeight: 1.7 }}>
      決済はStripeの安全な画面で行われます。<br />いつでも解約でき、解約後はPremium機能の利用が停止します。
    </div>
  </>);
}
