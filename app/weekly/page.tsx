"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type MenuItem = { title: string; issue: string; drill: string; action: string };
type WeeklyMenu = { summary: string; menu: MenuItem[] };

export default function WeeklyPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [premiumOnly, setPremiumOnly] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [data, setData] = useState<{ menu: WeeklyMenu; weekStart: string; diagnosisCount: number } | null>(null);

  useEffect(() => {
    fetch("/api/weekly-menu")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          if (d.code === "PREMIUM_ONLY") { setPremiumOnly(true); return; }
          throw new Error(d.error ?? "取得に失敗しました");
        }
        if (d.empty) { setEmpty(true); return; }
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#0b0d10", fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif" }}>
      <header style={{ background: "rgba(20,22,26,0.92)", WebkitBackdropFilter: "blur(12px)", backdropFilter: "blur(12px)", borderBottom: "1px solid #2a2d33", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, position: "sticky", top: 0, zIndex: 100 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#3ddc97,#2bc47f)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎾</div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 13, color: "#f5f6f7", lineHeight: 1.1 }}>TennisAI365Coach</div>
            <div style={{ fontSize: 9, color: "#3ddc97", fontWeight: 700 }}>FORM ANALYZER</div>
          </div>
        </Link>
        <Link href="/" style={{ fontSize: 12, fontWeight: 700, color: "#aeb2b8", textDecoration: "none", padding: "7px 14px", borderRadius: 8, border: "1px solid #2a2d33", background: "#1c1f24" }}>← 診断に戻る</Link>
      </header>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontSize: 18, fontWeight: 500, color: "#f5f6f7", marginBottom: 2 }}>今週の改善メニュー</h1>
        <p style={{ fontSize: 13, color: "#aeb2b8", marginBottom: 20 }}>今週アップロードした診断結果から、来週取り組む改善メニューを提案します（Premium限定）</p>

        {loading && <div style={{ textAlign: "center", padding: 48, color: "#8b8f97" }}>読み込み中...</div>}

        {!loading && premiumOnly && (
          <div style={{ background: "#1c1f24", border: "1px solid rgba(61,220,151,0.5)", borderRadius: 16, padding: "24px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f5f6f7", marginBottom: 8 }}>週次改善メニューはPremium限定です</div>
            <div style={{ fontSize: 12, color: "#aeb2b8", marginBottom: 16 }}>Premiumに登録すると、毎週の診断結果からAIが改善メニューを自動で作成します</div>
            <Link href="/premium" style={{ display: "inline-block", padding: "12px 28px", borderRadius: 12, background: "linear-gradient(90deg,#3ddc97,#2bc47f)", color: "#0b0d10", fontWeight: 900, fontSize: 14, textDecoration: "none" }}>Premiumに登録する</Link>
          </div>
        )}

        {!loading && empty && (
          <div style={{ background: "#1c1f24", border: "1px solid #2a2d33", borderRadius: 16, padding: "32px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f5f6f7", marginBottom: 8 }}>今週はまだ診断データがありません</div>
            <div style={{ fontSize: 12, color: "#aeb2b8", marginBottom: 16 }}>動画を1本アップロードして診断すると、その内容から今週の改善メニューを作成します</div>
            <Link href="/" style={{ display: "inline-block", padding: "10px 24px", borderRadius: 10, background: "#2a2d33", color: "#f5f6f7", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>診断する</Link>
          </div>
        )}

        {error && (
          <div style={{ background: "rgba(255,107,107,0.12)", border: "1px solid #2a2d33", borderRadius: 10, padding: 16, textAlign: "center", color: "#ff9b9b", fontSize: 13 }}>{error}</div>
        )}

        {data && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 99, background: "rgba(78,161,255,0.15)", color: "#4ea1ff", fontWeight: 700 }}>週開始：{data.weekStart}</span>
              <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 99, background: "rgba(61,220,151,0.12)", color: "#3ddc97", fontWeight: 700 }}>今週の診断 {data.diagnosisCount}件</span>
            </div>

            <div style={{ background: "#1c1f24", border: "1px solid #2a2d33", borderRadius: 16, padding: "18px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "#4ea1ff", fontWeight: 700, marginBottom: 8 }}>今週の総括</div>
              <div style={{ fontSize: 13, color: "#f5f6f7", lineHeight: 1.8 }}>{data.menu.summary}</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {data.menu.menu.map((item, i) => (
                <div key={i} style={{ background: "#1c1f24", border: "1px solid #2a2d33", borderRadius: 16, padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(61,220,151,0.15)", color: "#3ddc97", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#f5f6f7" }}>{item.title}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#8b8f97", marginBottom: 8 }}>課題：{item.issue}</div>
                  <div style={{ background: "#14161a", border: "1px solid #2a2d33", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: "#3ddc97", fontWeight: 700, marginBottom: 4 }}>🎾 練習ドリル</div>
                    <div style={{ fontSize: 13, color: "#f5f6f7", lineHeight: 1.7 }}>{item.drill}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "#8b8f97", lineHeight: 1.7 }}>実戦で意識：{item.action}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
