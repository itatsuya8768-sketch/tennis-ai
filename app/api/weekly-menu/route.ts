import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { AIReport } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const DEMO_EMAILS = ["i.tatsuya8768@gmail.com"];

// その週の月曜日（UTC 0:00）を返す
function weekStartUTC(d: Date): string {
  const day = d.getUTCDay(); // 0=日,1=月,...
  const diff = day === 0 ? -6 : 1 - day; // 月曜まで戻る日数
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return monday.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const isUnlimited = !!user.email && DEMO_EMAILS.includes(user.email.toLowerCase());
    let isPremium = false;
    try {
      const { data: prof } = await supabase.from("profiles").select("is_premium").eq("id", user.id).maybeSingle();
      isPremium = !!prof?.is_premium;
    } catch {}
    if (!isUnlimited && !isPremium) {
      return NextResponse.json({ error: "週次改善メニューはPremium会員限定の機能です", code: "PREMIUM_ONLY" }, { status: 402 });
    }

    const now = new Date();
    const weekStart = weekStartUTC(now);
    const weekStartDate = new Date(weekStart + "T00:00:00.000Z");
    const weekEndDate = new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 今週分の診断データを取得
    const { data: diagnoses, error: dErr } = await supabase
      .from("diagnoses")
      .select("created_at, ai_report")
      .eq("user_id", user.id)
      .gte("created_at", weekStartDate.toISOString())
      .lt("created_at", weekEndDate.toISOString())
      .order("created_at", { ascending: true });
    if (dErr) throw dErr;

    if (!diagnoses || diagnoses.length === 0) {
      return NextResponse.json({ empty: true, weekStart });
    }

    // キャッシュ済みで、診断件数が変わっていなければそれを返す
    const { data: cached } = await supabase
      .from("weekly_menus")
      .select("menu, diagnosis_count")
      .eq("user_id", user.id)
      .eq("week_start", weekStart)
      .maybeSingle();
    const isFreshFormat = (m: any) => Array.isArray(m?.menu) && m.menu.length > 0 && m.menu.every((it: any) => typeof it?.drill === "string" && it.drill.trim());
    if (cached && cached.diagnosis_count === diagnoses.length && isFreshFormat(cached.menu)) {
      return NextResponse.json({ menu: cached.menu, weekStart, diagnosisCount: diagnoses.length, cached: true });
    }

    const summaries = diagnoses.map((d, i) => {
      const r = d.ai_report as AIReport | null;
      if (!r) return `${i + 1}件目：データなし`;
      return [
        `${i + 1}件目（${d.created_at.slice(0, 10)}）`,
        r.shotCategory ? `ショット：${r.shotCategory}${r.shotType ? `（${r.shotType}）` : ""}` : "",
        `フォームスコア：${r.formScore} / フットワーク：${r.footworkScore} / 怪我リスク：${r.injuryRisk}`,
        `フォーム分析：${r.sections.formAnalysis}`,
        `打点チェック：${r.sections.impactCheck}`,
        `フットワーク：${r.sections.footwork}`,
        `怪我ケア：${r.sections.injuryCare}`,
      ].filter(Boolean).join("\n");
    }).join("\n\n");

    const prompt = `あなたはテニスコーチです。以下は同じ利用者が今週アップロードした${diagnoses.length}件のスイング診断結果です。これらを踏まえて、来週1週間で取り組むべき「フォーム改善メニュー」を作成してください。

${summaries}

【作成ルール】
- 今週の診断に共通して出てきた課題・繰り返し指摘された点を最優先で取り上げる（1件しかない場合はその内容を基にする）。
- 改善メニューは3〜4項目。怪我リスクが「中」以上の指摘があれば、必ず1項目はケア・予防に当てる。
- 推測で新しい欠点を作らない。今週の診断内容に基づく範囲で書く。
- "drill"（練習方法）は、テニススクールのコーチが実際にコート上で指示するレベルの具体的なドリルにする。必ず次の要素を盛り込むこと：
  ① 球の出し方（例：パートナーやコーチに手出ししてもらう／壁打ち／シャドースイングのみ／実戦ラリーの中で意識する、等。球出し機は一般のプレイヤーが持っていないため使わないこと）
  ② 球数・本数（例：10球×3セット、合計30球）
  ③ テンポ・スピード（例：テンポ早め／ゆっくり・確認しながら／通常スピード）
  ④ その球を打つときに意識する1点（例：「テイクバックでラケットを身体の前で止める」など、issueに対応する具体的な動き）
  良い例：「パートナーかコーチに手出しで球を出してもらい、テイクバックを身体の前で止めることだけを意識して10球×3セット。慣れたらテンポを上げて同じ動きを10球。」
  悪い例（禁止）：「テイクバックをコンパクトにすることを意識しましょう」のような抽象的な精神論だけで終わるもの、または球出し機を使う前提のドリル。
- "action"は1〜2文・80文字程度で、drillで行った練習を試合・実戦でどう活かすかの意識ポイントを書く（drillと内容を重複させない）。

必ずJSON形式のみで返してください：
{
  "summary": "今週の総括を1〜2文で",
  "menu": [
    { "title": "項目タイトル（10文字程度）", "issue": "課題（今週の診断で見えたこと）", "drill": "具体的な練習ドリル（球出し方法・球数・テンポ・意識点を含む）", "action": "実戦で活かす意識ポイント" }
  ]
}`;

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2500,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });
    const block = message.content?.[0];
    const rawText = block && block.type === "text" ? block.text : "";

    let menu: any;
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      menu = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
      if (!Array.isArray(menu.menu)) throw new Error("menu missing");
    } catch (e) {
      console.error("weekly-menu JSON parse failed. raw:", rawText);
      menu = { summary: "今週の診断結果から改善メニューを生成しました。", menu: [] };
    }

    if (menu.menu.length > 0) {
      await supabase.from("weekly_menus").upsert({
        user_id: user.id,
        week_start: weekStart,
        menu,
        diagnosis_count: diagnoses.length,
      }, { onConflict: "user_id,week_start" });
    }

    return NextResponse.json({ menu, weekStart, diagnosisCount: diagnoses.length, cached: false });
  } catch (e: any) {
    console.error("weekly-menu error:", e);
    return NextResponse.json({ error: "週次メニューの生成に失敗しました" }, { status: 500 });
  }
}
