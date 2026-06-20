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

  const MetricCard = ({ label, value, sub, accent }: { label: string; value: number; sub?: string; accent: string }) => (
    <div style={{ background: "#f8fafc", borderRadius: 10, padding: "16px" }}>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 500, color: "#0f172a", fontFamily: "'SF Mono','Menlo',monospace" }}>{value.toLocaleString()}</div>
      {sub && <div style={{ fontSize: 12, color: accent, marginTop: 4 }}>{sub}</div>}
    </div>
  );

  const BarRow = ({ label, value, max, color }: { label: string; value: number; max: number; color: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <div style={{ width: 44, fontSize: 12, color: "#64748b", flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 4, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
      <div style={{ width: 56, fontSize: 12, color: "#0f172a", textAlign: "right", fontFamily: "'SF Mono','Menlo',monospace" }}>{value.toLocaleString()}</div>
    </div>
  );

  const conversionRate = stats && stats.visits.total > 0
    ? Math.round((stats.diagnoses.total / stats.visits.total) * 1000) / 10
    : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif" }}>
      <header style={{ background: "#ffffff", borderBottom: "1px solid #e2e8f0", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ fontWeight: 500, fontSize: 14, color: "#0f172a" }}>管理ダッシュボード</div>
        <Link href="/" style={{ fontSize: 12, color: "#475569", textDecoration: "none", padding: "6px 12px", borderRadius: 6, border: "1px solid #e2e8f0" }}>← 診断に戻る</Link>
      </header>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontSize: 18, fontWeight: 500, color: "#0f172a", marginBottom: 2 }}>サイト統計</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>訪問数・診断回数を確認できます（運営者専用）</p>

        {loading && <div style={{ textAlign: "center", padding: 48, color: "#94a3b8" }}>読み込み中...</div>}

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 16, textAlign: "center", color: "#991b1b", fontSize: 13 }}>
            {error}
          </div>
        )}

        {stats && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
              <MetricCard label="累計訪問数" value={stats.visits.total} sub={`今日 ${stats.visits.today.toLocaleString()}`} accent="#3b82f6" />
              <MetricCard label="累計診断回数" value={stats.diagnoses.total} sub={`今日 ${stats.diagnoses.today.toLocaleString()}`} accent="#16a34a" />
              <MetricCard label="ユニークユーザー" value={stats.uniqueUsers} accent="#a855f7" />
              <MetricCard label="訪問→診断 転換率" value={conversionRate} sub="%" accent="#0f6e56" />
            </div>

            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px", marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>訪問数の推移（今日 / 今月 / 累計）</div>
              <BarRow label="今日" value={stats.visits.today} max={stats.visits.total} color="#3b82f6" />
              <BarRow label="今月" value={stats.visits.month} max={stats.visits.total} color="#60a5fa" />
              <BarRow label="累計" value={stats.visits.total} max={stats.visits.total} color="#bfdbfe" />
            </div>

            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>診断回数の推移（今日 / 今月 / 累計）</div>
              <BarRow label="今日" value={stats.diagnoses.today} max={stats.diagnoses.total} color="#16a34a" />
              <BarRow label="今月" value={stats.diagnoses.month} max={stats.diagnoses.total} color="#4ade80" />
              <BarRow label="累計" value={stats.diagnoses.total} max={stats.diagnoses.total} color="#bbf7d0" />
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
