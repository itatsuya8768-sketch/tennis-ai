import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PLAYER_PROFILES: Record<string, string> = {
  "ロジャー・フェデラー": "フォアハンド：セミウエスタン、フラット系、打点は高め・前方、フォロースルーは肩より上。バックハンド：片手打ち。特徴：全身のキネティックチェーンが完璧、骨盤の回転を最大活用。",
  "ノバク・ジョコビッチ": "フォアハンド：セミウエスタン〜ウエスタン、強烈なトップスピン。バックハンド：両手打ち、体幹の回転でパワー。特徴：柔軟性が異常に高く低いボールへの対応が世界一、骨盤を深く沈めてから回転。",
  "ラファエル・ナダル": "フォアハンド：ウエスタン、強烈なトップスピン、フォロースルーは頭の上まで。バックハンド：両手打ち。特徴：左利き特有の角度、骨盤を大きく前傾させ腰の回転でトップスピンを生み出す。",
  "アンディ・マレー": "フォアハンド：イースタン〜セミウエスタン、安定性重視。バックハンド：両手打ち、リターンが優秀。特徴：カウンターパンチャー、体幹でショットの方向を制御。",
  "ヤニック・シナー": "フォアハンド：セミウエスタン、フラット系高速ショット、打点は前方・高め。バックハンド：両手打ち、コンパクトなテイクバック。特徴：コンパクトなスイングから瞬時に骨盤を回転、爆発的な加速。",
  "カルロス・アルカラス": "フォアハンド：セミウエスタン〜ウエスタン、トップスピンとフラットを高速で打ち分け。バックハンド：両手打ち。特徴：全身バネのように使い骨盤の回転が非常に大きい、爆発的パワー。",
  "錦織 圭": "フォアハンド：セミウエスタン、高い打点からのトップスピン、エアKが代名詞。バックハンド：両手打ち。特徴：柔軟性を活かした低い体勢からの強打、ジャンプしながら骨盤を回転。",
  "大坂なおみ": "フォアハンド：ウエスタン寄り、フラット系強力ショット、打点は前方・高め。バックハンド：両手打ち、非常にパワフル。特徴：サーブとフォアの攻撃力が世界最高クラス、上半身と下半身の回転が完璧に同期。",
  "アリナ・サバレンカ": "フォアハンド：セミウエスタン〜ウエスタン、230km/h超のフラット強打。バックハンド：両手打ち。特徴：攻撃的なベースラインプレー、全身の筋力を最大限に活用。",
  "イガ・シフォンティク": "フォアハンド：セミウエスタン、強烈なトップスピン。バックハンド：両手打ち。特徴：クレーコートで圧倒的強さ、骨盤を大きく前傾させトップスピンを生み出す。",
  "エレーナ・リバキナ": "フォアハンド：セミウエスタン、フラット系、長身を活かした高い打点。バックハンド：両手打ち、コンパクトなテイクバック。特徴：長身(182cm)を活かした攻撃的なサーブ、体重移動でパワーを生み出す。",
};

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const body = await req.json();
    const profile = body.profile;
    const poseMetrics = body.poseMetrics ?? null;
    const comparePlayer: string | null = body.comparePlayer ?? null;
    const shotCategory: string | null = body.shotCategory ?? null;
    const shotType: string | null = body.shotType ?? null;
    const frames: string[] = Array.isArray(body.frames)
      ? body.frames.filter((f: unknown) => typeof f === "string" && f.length > 100)
      : [];

    const hasPain = profile.painAreas.length > 0;

    const painDesc = hasPain
      ? profile.painAreas.map((a: string) =>
          `${a}（${["","軽い違和感","やや痛む","かなり痛む","激しい痛み"][profile.painLevels[a] ?? 2]}）`
        ).join("、")
      : "なし";

    const poseDesc = poseMetrics
      ? `【骨格解析実測値】右肘:${poseMetrics.rightElbowAngle}° 左肘:${poseMetrics.leftElbowAngle}° 右膝:${poseMetrics.rightKneeAngle}°`
      : "【骨格データ】なし";

    const compareSection = comparePlayer && PLAYER_PROFILES[comparePlayer]
      ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n【比較対象：${comparePlayer}】\n${PLAYER_PROFILES[comparePlayer]}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
      : "";

    const shotSection = shotCategory
      ? `\n【診断対象ショット】\n✅ ${shotCategory}（${shotType ?? "球種未選択"}）\nこのショットに特化して診断してください。例：フォアハンドストロークのトップスピンなら体幹回転・打点前方・フォロースルー完成度を重点評価。ボレーなら面の安定・足の踏み込み・コンパクトなスイングを重点評価。サーブならトス・トロフィーポジション・プロネーションを重点評価。\n`
      : "\n【診断対象ショット】⚠️ 未選択（動画から判断してください）\n";

    const compareInstruction = comparePlayer
      ? `各診断項目の末尾に「📊 ${comparePlayer}との比較：違い・取り入れるべき点・習得難易度(易/中/難)」を1〜2文で追加。`
      : "";

    const textPrompt = `あなたは元プロテニスプレイヤーで25年以上のコーチング経験を持つ世界最高峰のテニスコーチです。
有料コーチングに値する詳細かつ一貫性のある診断を行ってください。

━━━━━━━━━━━━━━━━━━━━━━━━━━
【最重要：プレイヤーの確定情報】
✅ 利き手：${profile.handedness}（確定・変更不可）
✅ フォアハンド：${profile.forehand}${profile.forehandGrip ? `（${profile.forehandGrip}）` : ""}（確定・変更不可）
✅ バックハンド：${profile.backhand}（確定・変更不可）
✅ 現在の痛み：${painDesc}（確定・変更不可）
━━━━━━━━━━━━━━━━━━━━━━━━━━
${poseDesc}
${shotSection}
${compareSection}

【絶対に守るルール】
1. 確定情報（利き手・フォア・バック）を診断中に絶対に覆さない
2. 動画で確認できない動作は「〜の可能性があります」と表現
3. 「動画の中で」「インパクトの瞬間」「テイクバック時」「フォロースルー時」で場面を表現
4. 「画像」「1枚目」「2枚目」は絶対に使わない
5. 打点が後方の場合は肘・肩・手首への負担増加リスクを警告
6. 打点が前方なら「前方で捉えられています」と正直に評価
7. 良い点も必ず1つ以上具体的に褒める
8. 診断対象ショットに特化した評価をする
${compareInstruction}

【診断項目】各5〜7文でプロコーチとして有料級の診断をしてください：

1. formAnalysis：体幹・骨盤の使い方、肩の開きのタイミング、テイクバックからフォロースルーの流れ。${shotCategory ? `${shotCategory}（${shotType}）に必要な動作を重点評価。` : ""}★最優先改善点を末尾に記載。

2. impactCheck：動画からインパクトの瞬間を特定し打点の位置（高さ・前後）を正確に評価。ラケット面の角度、振り遅れ・振り急ぎの判定。★最優先改善点を末尾に記載。

3. footwork：足の動き、踏み込みと軸足の安定度、リカバリー。★最優先改善点を末尾に記載。

4. injuryCare：現在の痛みへの対処法、将来的なリスク、推奨ストレッチ・エクササイズを3つ具体的に。★最優先改善点を末尾に記載。

5. scores：以下の基準で算出（同じ動画なら毎回同じスコアになるよう客観的に判断）

【スコア算出基準】
- formScore：体幹・骨盤(30点) + テイクバック〜フォロースルー(30点) + 肩のタイミング(20点) + 安定性(20点)
- footworkScore：スプリットステップ(25点) + 踏み込み・軸足(25点) + 重心移動(25点) + リカバリー(25点)
- swingSpeed：動画から推定(km/h)、推定不可なら100
- impactOffset：前方ならマイナス、後方ならプラス(cm)
- elbowAngle：インパクト時の利き腕肘の角度(度)、推定不可なら130
- injuryRisk：「低」=問題なし / 「中」=軽度問題あり or 打点15cm以上後方 / 「中〜高」=痛みあり or 打点20cm以上後方 / 「高」=重大な問題あり

必ずJSON形式のみで返してください：
{
  "formAnalysis": "...",
  "impactCheck": "...",
  "footwork": "...",
  "injuryCare": "...",
  "scores": {
    "formScore": 0から100の整数,
    "footworkScore": 0から100の整数,
    "swingSpeed": 80から140の整数,
    "impactOffset": プラスなら後方マイナスなら前方のcm整数,
    "elbowAngle": インパクト時の肘の角度,
    "injuryRisk": "低" または "中" または "中〜高" または "高"
  }
}`;

    let messageContent: Anthropic.MessageParam["content"];
    if (frames.length > 0) {
      messageContent = [
        ...frames.slice(0, 8).map((frame) => ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: "image/jpeg" as const,
            data: frame,
          },
        })),
        { type: "text" as const, text: textPrompt },
      ];
    } else {
      messageContent = textPrompt;
    }

    const model = frames.length > 0 ? "claude-opus-4-5" : "claude-haiku-4-5-20251001";

    const message = await anthropic.messages.create({
      model,
      max_tokens: 2500,
      messages: [{ role: "user", content: messageContent }],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text : "";

    let sections = {
      formAnalysis: "",
      impactCheck: "",
      footwork: "",
      injuryCare: "",
    };
    let aiScores = {
      formScore:     60,
      footworkScore: 60,
      swingSpeed:    100,
      impactOffset:  0,
      elbowAngle:    130,
      injuryRisk:    hasPain ? "中" : "低" as string,
    };

    try {
      const clean = rawText.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      sections = {
        formAnalysis: parsed.formAnalysis ?? "",
        impactCheck:  parsed.impactCheck  ?? "",
        footwork:     parsed.footwork     ?? "",
        injuryCare:   parsed.injuryCare   ?? "",
      };
      if (parsed.scores) {
        aiScores = {
          formScore:     Number(parsed.scores.formScore)     || aiScores.formScore,
          footworkScore: Number(parsed.scores.footworkScore) || aiScores.footworkScore,
          swingSpeed:    Number(parsed.scores.swingSpeed)    || aiScores.swingSpeed,
          impactOffset:  Number(parsed.scores.impactOffset)  ?? aiScores.impactOffset,
          elbowAngle:    Number(parsed.scores.elbowAngle)    || aiScores.elbowAngle,
          injuryRisk:    parsed.scores.injuryRisk            || aiScores.injuryRisk,
        };
      }
      if (aiScores.impactOffset >= 20 && aiScores.injuryRisk === "低") {
        aiScores.injuryRisk = "中";
      }
    } catch {
      sections = {
        formAnalysis: rawText,
        impactCheck:  "解析完了。",
        footwork:     "フットワーク解析完了。",
        injuryCare:   hasPain
          ? "痛みのある部位への負担を減らすフォーム修正が必要です。"
          : "現在のフォームを継続すると肘・肩への負担が蓄積する可能性があります。",
      };
    }

    const elbowAngle = poseMetrics?.rightElbowAngle || aiScores.elbowAngle;
    const report = {
      formScore:     aiScores.formScore,
      injuryRisk:    aiScores.injuryRisk,
      swingSpeed:    aiScores.swingSpeed,
      elbowAngle,
      footworkScore: aiScores.footworkScore,
      takebackDepth: 0,
      impactOffset:  aiScores.impactOffset,
      sections,
      comparePlayer,
      shotCategory,
      shotType,
    };

    await supabase.from("diagnoses").insert({
      user_id:       user.id,
      handedness:    profile.handedness,
      forehand:      profile.forehand,
      forehand_grip: profile.forehandGrip ?? null,
      backhand:      profile.backhand,
      pain_areas:    profile.painAreas,
      pain_levels:   profile.painLevels,
      ai_report:     report,
      ai_text:       Object.values(sections).join("\n\n"),
    });

    return NextResponse.json({ report });

  } catch (err) {
    console.error("Analyze error:", err);
    return NextResponse.json({ error: "診断中にエラーが発生しました" }, { status: 500 });
  }
}
