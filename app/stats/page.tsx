"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Stats = {
  visits: { total: number; month: number; today: number };
  diagnoses: { total: number; month: number; today: number };
  uniqueUsers: number;
};

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error ?? "取得に失敗しました");
        }
        return r.json();
      })
      .then((d) => setStats(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const Card = ({ title, total, month, today, color }: { title: string; total: number; month: number; today: number; color: string }) => (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "20px 22px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#64748b", marginBottom: 10 }}>{title}</div>
      <div style={{ fontSize: 40, fontWeight: 900, color, lineHeight: 1 }}>{total.toLocaleString()}</div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>累計</div>
      <div style={{ display: "flex", gap: 16, marginTop: 14, borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: "#1e293b" }}>{month.toLocaleString()}</div><div style={{ fontSize: 10, color: "#94a3b8" }}>今月</div></div>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: "#1e293b" }}>{today.toLocaleString()}</div><div style={{ fontSize: 10, color: "#94a3b8" }}>今日</div></div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f0fdf4,#f8fafc)", fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif" }}>
      <header style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid #e2e8f0", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ fontWeight: 900, fontSize: 15, color: "#0f172a" }}>📊 管理ダッシュボード</div>
        <Link href="/" style={{ fontSize: 12, fontWeight: 700, color: "#475569", textDecoration: "none", padding: "7px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc" }}>← 診断に戻る</Link>
      </header>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", marginBottom: 4 }}>サイト統計</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>訪問数・診断回数を確認できます（運営者専用）</p>

        {loading && <div style={{ textAlign: "center", padding: 48, color: "#94a3b8", fontWeight: 700 }}>⏳ 読み込み中...</div>}

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 14, padding: 20, textAlign: "center", color: "#991b1b" }}>
            ⚠️ {error}
          </div>
        )}

        {stats && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <Card title="🌐 サイト訪問数" total={stats.visits.total} month={stats.visits.month} today={stats.visits.today} color="#3b82f6" />
              <Card title="🎾 診断回数" total={stats.diagnoses.total} month={stats.diagnoses.month} today={stats.diagnoses.today} color="#16a34a" />
            </div>
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "20px 22px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#64748b", marginBottom: 10 }}>👥 診断したユーザー数（ユニーク）</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: "#a855f7", lineHeight: 1 }}>{stats.uniqueUsers.toLocaleString()}</div>
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 14, lineHeight: 1.7 }}>
              ※ 訪問数はブラウザのセッション単位でカウントします（同じ人が何度も開いても1セッション1回）。<br />
              ※ 集計はUTC基準です。
            </div>
          </>
        )}
      </div>
    </div>
  );
}
