"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { DiagnosisRecord } from "@/types";

const RISK_COLOR: Record<string, string> = {
  "低": "#22c55e", "中": "#f59e0b", "中〜高": "#f97316", "高": "#ef4444",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

export default function HistoryPage() {
  const [records, setRecords] = useState<DiagnosisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [selected, setSelected] = useState<DiagnosisRecord | null>(null);
  const [shotFilter, setShotFilter] = useState<string>("all");

  const shotOf = (rec: DiagnosisRecord) => rec.ai_report?.shotCategory || "その他・未選択";
  // 履歴に存在するショット種類を出現順で抽出
  const shotCategories = Array.from(new Set(records.map(shotOf)));
  const filtered = shotFilter === "all" ? records : records.filter(r => shotOf(r) === shotFilter);

  useEffect(() => {
    fetch("/api/history")
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setRecords(d.diagnoses ?? []);
      })
      .catch(() => setError("取得中にエラーが発生しました"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#f0fdf4,#f8fafc)", fontFamily:"'Noto Sans JP','Hiragino Sans',sans-serif" }}>

      {/* ヘッダー */}
      <header style={{ background:"rgba(255,255,255,0.92)", backdropFilter:"blur(12px)", borderBottom:"1px solid #e2e8f0", padding:"0 16px", display:"flex", alignItems:"center", justifyContent:"space-between", height:56, position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Link href="/" style={{ display:"flex", alignItems:"center", gap:10, textDecoration:"none" }}>
            <div style={{ width:34, height:34, borderRadius:10, background:"linear-gradient(135deg,#84cc16,#22c55e)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🎾</div>
            <div>
              <div style={{ fontWeight:900, fontSize:13, color:"#0f172a", lineHeight:1.1 }}>TennisAI365Coach</div>
              <div style={{ fontSize:9, color:"#84cc16", fontWeight:700 }}>FORM ANALYZER</div>
            </div>
          </Link>
        </div>
        <Link href="/" style={{ fontSize:12, fontWeight:700, color:"#475569", textDecoration:"none", padding:"7px 14px", borderRadius:8, border:"1px solid #e2e8f0", background:"#f8fafc" }}>
          ← 診断に戻る
        </Link>
      </header>

      <div style={{ maxWidth:800, margin:"0 auto", padding:"24px 16px" }}>
        <h1 style={{ fontSize:22, fontWeight:900, color:"#0f172a", marginBottom:4 }}>📋 診断履歴</h1>
        <p style={{ fontSize:13, color:"#64748b", marginBottom:24 }}>過去の診断レポートを確認できます</p>

        {loading && (
          <div style={{ textAlign:"center", padding:"48px", color:"#94a3b8" }}>
            <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
            <div style={{ fontWeight:700 }}>読み込み中...</div>
          </div>
        )}

        {error && (
          <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:14, padding:"20px", textAlign:"center", color:"#991b1b" }}>
            ⚠️ {error}
            {error.includes("認証") && (
              <div style={{ marginTop:12 }}>
                <Link href="/login" style={{ padding:"8px 20px", borderRadius:8, background:"#ef4444", color:"#fff", fontWeight:700, textDecoration:"none", fontSize:13 }}>ログインする</Link>
              </div>
            )}
          </div>
        )}

        {!loading && !error && records.length === 0 && (
          <div style={{ background:"#fff", borderRadius:20, border:"1px solid #e2e8f0", padding:"48px 24px", textAlign:"center" }}>
            <div style={{ fontSize:48, marginBottom:16 }}>🎾</div>
            <div style={{ fontSize:16, fontWeight:700, color:"#64748b", marginBottom:8 }}>まだ診断履歴がありません</div>
            <div style={{ fontSize:13, color:"#94a3b8", marginBottom:24 }}>最初のAI診断を始めましょう！</div>
            <Link href="/" style={{ padding:"12px 28px", borderRadius:12, background:"linear-gradient(90deg,#84cc16,#22c55e)", color:"#fff", fontWeight:700, textDecoration:"none", fontSize:14 }}>診断を始める →</Link>
          </div>
        )}

        {/* ショット別フィルター */}
        {!loading && !error && records.length > 0 && shotCategories.length > 1 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 }}>
            {["all", ...shotCategories].map(cat => {
              const active = shotFilter === cat;
              const count = cat === "all" ? records.length : records.filter(r => shotOf(r) === cat).length;
              return (
                <button key={cat} onClick={() => setShotFilter(cat)}
                  style={{ padding:"7px 14px", borderRadius:99, fontSize:12, fontWeight:700, cursor:"pointer",
                    border: active ? "2px solid #84cc16" : "1px solid #e2e8f0",
                    background: active ? "#f0fdf4" : "#fff",
                    color: active ? "#16a34a" : "#64748b" }}>
                  {cat === "all" ? "すべて" : cat}（{count}）
                </button>
              );
            })}
          </div>
        )}

        {/* 履歴リスト */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {filtered.map(rec => (
            <div key={rec.id} onClick={() => setSelected(selected?.id === rec.id ? null : rec)}
              style={{ background:"#fff", borderRadius:16, border: selected?.id===rec.id ? "2px solid #84cc16" : "1px solid #e2e8f0", padding:"16px 20px", cursor:"pointer", transition:"all 0.15s" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12, color:"#94a3b8", marginBottom:4 }}>{formatDate(rec.created_at)}</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {rec.ai_report?.shotCategory && (
                      <span style={{ fontSize:11, padding:"3px 9px", borderRadius:99, background:"#fef3c7", color:"#b45309", fontWeight:700 }}>
                        🎾 {rec.ai_report.shotCategory}{rec.ai_report.shotType ? `（${rec.ai_report.shotType}）` : ""}
                      </span>
                    )}
                    <span style={{ fontSize:11, padding:"3px 9px", borderRadius:99, background:"#e0f2fe", color:"#0369a1", fontWeight:700 }}>{rec.handedness}</span>
                    <span style={{ fontSize:11, padding:"3px 9px", borderRadius:99, background:"#f0fdf4", color:"#15803d", fontWeight:700 }}>フォア {rec.forehand}</span>
                    <span style={{ fontSize:11, padding:"3px 9px", borderRadius:99, background:"#f0fdf4", color:"#15803d", fontWeight:700 }}>バック {rec.backhand}</span>
                    {(rec.pain_areas ?? []).length > 0 && (
                      <span style={{ fontSize:11, padding:"3px 9px", borderRadius:99, background:"#fee2e2", color:"#991b1b", fontWeight:700 }}>
                        🔴 {rec.pain_areas.length}部位
                      </span>
                    )}
                  </div>
                </div>
                {rec.ai_report && (
                  <div style={{ textAlign:"center", flexShrink:0 }}>
                    <div style={{ fontSize:24, fontWeight:900, color:"#84cc16", lineHeight:1 }}>{rec.ai_report.formScore}</div>
                    <div style={{ fontSize:9, color:"#94a3b8" }}>スコア</div>
                    <div style={{ marginTop:4, fontSize:11, fontWeight:700, color: RISK_COLOR[rec.ai_report.injuryRisk] ?? "#64748b" }}>
                      リスク：{rec.ai_report.injuryRisk}
                    </div>
                  </div>
                )}
              </div>

              {/* 展開詳細 */}
              {selected?.id === rec.id && rec.ai_report && (
                <div style={{ marginTop:16, borderTop:"1px solid #f1f5f9", paddingTop:16, animation:"fadeIn 0.3s ease" }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
                    {[
                      { label:"フォームスコア", value:`${rec.ai_report.formScore}pt`,    color:"#84cc16" },
                      { label:"スイング速度",   value:`${rec.ai_report.swingSpeed}km/h`, color:"#38bdf8" },
                      { label:"怪我リスク",     value:rec.ai_report.injuryRisk,          color: RISK_COLOR[rec.ai_report.injuryRisk] },
                    ].map(k => (
                      <div key={k.label} style={{ background:"#f8fafc", borderRadius:10, padding:"10px 12px", textAlign:"center" }}>
                        <div style={{ fontSize:16, fontWeight:900, color:k.color }}>{k.value}</div>
                        <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>{k.label}</div>
                      </div>
                    ))}
                  </div>
                  {rec.ai_report.progress && rec.ai_report.progress.trim() && (
                    <div style={{ background:"linear-gradient(135deg,#eff6ff,#f0fdf4)", border:"1px solid #93c5fd", borderRadius:10, padding:"12px 14px", marginBottom:10 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#1d4ed8", marginBottom:6 }}>📈 前回との比較</div>
                      <div style={{ fontSize:12, color:"#1e293b", lineHeight:1.7 }}>{rec.ai_report.progress}</div>
                    </div>
                  )}
                  {rec.ai_report.sections && (
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {[
                        { label:"📐 フォーム解析",   text: rec.ai_report.sections.formAnalysis },
                        { label:"🎯 打点チェック",   text: rec.ai_report.sections.impactCheck },
                        { label:"👣 フットワーク",   text: rec.ai_report.sections.footwork },
                        ...(rec.pain_areas?.length > 0 ? [{ label:"🏥 怪我への配慮", text: rec.ai_report.sections.injuryCare }] : []),
                      ].map(s => (
                        <div key={s.label} style={{ background:"#f8fafc", borderRadius:10, padding:"12px 14px" }}>
                          <div style={{ fontSize:12, fontWeight:700, color:"#475569", marginBottom:6 }}>{s.label}</div>
                          <div style={{ fontSize:12, color:"#64748b", lineHeight:1.7 }}>{s.text}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
