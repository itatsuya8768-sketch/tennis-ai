// ── インパクト（ボールとラケットが接触する瞬間）検出モジュール ──
//
// パイプライン: 動画 → インパクト検出 → 打点位置推定 → （フォーム診断はAPI側で実行）
//
// Phase1: coco-ssdで person / sports ball / tennis racket を検出
//         （均等抽出ではなく、動画を実再生してrequestVideoFrameCallbackで
//          実際に来たフレームを間引かずに評価する）
// Phase2: 各フレームで ball_center と racket_center の距離を算出
// Phase3: 距離＋ボールの進行方向反転（バウンド/インパクトの兆候）をスコア化し、
//         impact_score 最大のフレームを採用する
// Phase4: 採用フレームの前後（時間オフセット）を保存し、診断AIに渡す候補とする
//
// 現状の制約（重要）：真横動画＋スケール基準（既知の長さの物体）が無いため、
// ピクセル距離を実寸cmに正確変換することはできない。本モジュールは
// 「胴体の長さ（肩→腰）」を基準とした相対値（%）で打点位置を定量化する。
// 絶対cmが必要な場合は、後述のキャリブレーション手段の導入が必要。

import type { PoseFrame } from "@/components/PoseDetector";

let modelPromise: Promise<any> | null = null;

async function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      // 重要：umbrellaパッケージ "@tensorflow/tfjs" はWebGLバックエンドを同梱しており、
      // setBackend("cpu") で明示的に切り替えても、import時の機能検出で一時的にWebGL
      // コンテキストを作成してしまう（実際にこれでMediaPipeのコンテキストが失われた）。
      // WebGLバックエンドのコードを一切バンドルしないよう、CPUバックエンドのみを
      // 個別パッケージ（tfjs-core + tfjs-backend-cpu）からimportする。
      const tf = await import("@tensorflow/tfjs-core");
      await import("@tensorflow/tfjs-backend-cpu");
      await import("@tensorflow/tfjs-converter");
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      await tf.setBackend("cpu");
      await tf.ready();
      return cocoSsd.load({ base: "lite_mobilenet_v2" });
    })();
  }
  return modelPromise;
}

export interface DetectedFrame {
  time: number; // video.currentTime
  ball: { cx: number; cy: number; score: number } | null;   // 0-1正規化
  racket: { cx: number; cy: number; score: number } | null; // 0-1正規化
}

const DETECT_W = 320, DETECT_H = 180; // 検出用は軽量サイズ（速度優先）

/**
 * 動画を実際に再生し、requestVideoFrameCallback（対応ブラウザ）で来た
 * フレームをそのまま検出にかける。均等抽出（時刻を計算してseekする方式）はしない。
 * everyNthFrame で間引き頻度を調整できる（CPU推論が重いモデル・低スペック端末向け）。
 */
export async function scanVideoForObjects(
  videoUrl: string,
  opts: { maxDurationSec?: number; everyNthFrame?: number; overallTimeoutMs?: number } = {}
): Promise<DetectedFrame[]> {
  const { maxDurationSec = 8, everyNthFrame = 2, overallTimeoutMs = 25000 } = opts;
  const model = await getModel();

  const video = document.createElement("video");
  video.src = videoUrl; video.muted = true; video.playsInline = true; video.preload = "auto";

  await new Promise<void>((res, rej) => {
    const tid = setTimeout(() => rej(new Error("video load timeout")), 12000);
    video.onloadedmetadata = () => { clearTimeout(tid); res(); };
    video.onerror = () => { clearTimeout(tid); rej(new Error("video load error")); };
  });

  const canvas = document.createElement("canvas");
  canvas.width = DETECT_W; canvas.height = DETECT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  const limit = Math.min(isFinite(video.duration) ? video.duration : maxDurationSec, maxDurationSec);
  const results: DetectedFrame[] = [];
  let frameCount = 0;
  let finished = false;

  const hasRVFC = typeof (video as any).requestVideoFrameCallback === "function";

  const pick = (preds: any[], cls: string) => {
    const items = preds.filter((p) => p.class === cls);
    if (items.length === 0) return null;
    const best = items.reduce((a: any, b: any) => (a.score > b.score ? a : b));
    const [x, y, w, h] = best.bbox;
    return { cx: (x + w / 2) / DETECT_W, cy: (y + h / 2) / DETECT_H, score: best.score };
  };

  await new Promise<void>((resolve) => {
    const finish = () => { if (!finished) { finished = true; try { video.pause(); } catch {} resolve(); } };
    const overallTid = setTimeout(finish, overallTimeoutMs);

    const handleFrame = async (mediaTime: number) => {
      if (finished) return;
      frameCount++;
      if (frameCount % everyNthFrame === 0) {
        try {
          ctx.drawImage(video, 0, 0, DETECT_W, DETECT_H);
          const preds = await model.detect(canvas);
          results.push({ time: mediaTime, ball: pick(preds, "sports ball"), racket: pick(preds, "tennis racket") });
        } catch { /* この1フレームだけ諦めて継続 */ }
      }
      if (finished) return;
      if (video.currentTime >= limit || video.ended) { clearTimeout(overallTid); finish(); return; }
      if (hasRVFC) (video as any).requestVideoFrameCallback((_now: number, meta: any) => handleFrame(meta?.mediaTime ?? video.currentTime));
    };

    video.play().then(() => {
      if (hasRVFC) {
        (video as any).requestVideoFrameCallback((_now: number, meta: any) => handleFrame(meta?.mediaTime ?? video.currentTime));
      } else {
        // requestVideoFrameCallback未対応ブラウザ向けフォールバック（精度は落ちる）
        const onTick = () => { handleFrame(video.currentTime); };
        video.addEventListener("timeupdate", onTick);
        setTimeout(() => video.removeEventListener("timeupdate", onTick), overallTimeoutMs);
      }
    }).catch(() => { clearTimeout(overallTid); finish(); });
  });

  return results;
}

export interface ImpactResult {
  time: number;
  score: number;
  ballRacketDistance: number | null;
}

/**
 * Phase2-3: ball-racket距離 + ボール進行方向の反転（バウンド/インパクトの兆候）を
 * 合成したスコアで、インパクト候補フレームを1つ選ぶ。
 */
export function scoreImpactFrames(frames: DetectedFrame[]): ImpactResult | null {
  if (frames.length < 3) return null;
  let best: ImpactResult | null = null;
  for (let i = 1; i < frames.length - 1; i++) {
    const f = frames[i];
    if (!f.ball || !f.racket) continue;
    const dist = Math.hypot(f.ball.cx - f.racket.cx, f.ball.cy - f.racket.cy);
    const proximityScore = 1 / (1 + dist * 8); // 距離が近いほど1に近づく

    let reversalScore = 0;
    const prevBall = frames[i - 1].ball, nextBall = frames[i + 1].ball;
    if (prevBall && nextBall) {
      const v1 = f.ball.cx - prevBall.cx;
      const v2 = nextBall.cx - f.ball.cx;
      if (v1 !== 0 && Math.sign(v1) !== Math.sign(v2)) reversalScore = 1;
    }

    const score = proximityScore * 0.7 + reversalScore * 0.3;
    if (!best || score > best.score) best = { time: f.time, score, ballRacketDistance: dist };
  }
  return best;
}

export interface BodyMetricsAtImpact {
  heightRatio: number | null;  // 0=腰の高さ, 1=肩の高さ（胴体長基準）。1超で肩より上、0未満で腰より下
  depthRatio: number | null;   // 肩〜腰の中心からの前後オフセット（胴体長基準、+で前方）
  elbowAngleDeg: number | null;
  torsoPixelLength: number | null;
}

/**
 * Phase5（簡易版）: インパクト時刻に最も近い骨格フレームから、打点の高さ・前後位置を
 * 「胴体の長さ（肩→腰）」基準の相対値で算出する。スケール基準が無いため絶対cmは出さない
 * （下記 estimateCmFromTorsoRatio で「参考値」として概算は可能）。
 */
export function computeBodyMetricsAtImpact(
  series: PoseFrame[],
  impactTime: number,
  handedness: string
): BodyMetricsAtImpact {
  if (series.length === 0) return { heightRatio: null, depthRatio: null, elbowAngleDeg: null, torsoPixelLength: null };
  let nearest = series[0], nd = Math.abs(series[0].t - impactTime);
  for (const f of series) {
    const d = Math.abs(f.t - impactTime);
    if (d < nd) { nd = d; nearest = f; }
  }
  const RIGHT = handedness !== "左利き";
  const SHOULDER = RIGHT ? 12 : 11, HIP = RIGHT ? 24 : 23, ELBOW = RIGHT ? 14 : 13, WRIST = RIGHT ? 16 : 15;
  const p = nearest.pts, v = nearest.vis;
  const ok = (i: number) => p[i] && (v[i] ?? 0) >= 0.3;
  if (!ok(SHOULDER) || !ok(HIP) || !ok(WRIST)) {
    return { heightRatio: null, depthRatio: null, elbowAngleDeg: null, torsoPixelLength: null };
  }
  const torso = Math.hypot(p[SHOULDER][0] - p[HIP][0], p[SHOULDER][1] - p[HIP][1]);
  if (torso < 5) return { heightRatio: null, depthRatio: null, elbowAngleDeg: null, torsoPixelLength: null };

  // 高さ：腰=0, 肩=1（画面yは下向き正なので腰y - 手首y を腰y - 肩y で正規化）
  const heightRatio = (p[HIP][1] - p[WRIST][1]) / (p[HIP][1] - p[SHOULDER][1]);
  // 前後：肩と腰の中点を基準に、手首のx方向オフセットを胴体長で正規化
  const midX = (p[SHOULDER][0] + p[HIP][0]) / 2;
  const depthRatio = (p[WRIST][0] - midX) / torso;

  let elbowAngleDeg: number | null = null;
  if (ok(SHOULDER) && ok(ELBOW) && ok(WRIST)) {
    const a = p[SHOULDER], b = p[ELBOW], c = p[WRIST];
    const ab = [a[0] - b[0], a[1] - b[1]], cb = [c[0] - b[0], c[1] - b[1]];
    const dot = ab[0] * cb[0] + ab[1] * cb[1];
    const magAB = Math.hypot(ab[0], ab[1]), magCB = Math.hypot(cb[0], cb[1]);
    if (magAB > 0 && magCB > 0) {
      elbowAngleDeg = Math.round((Math.acos(Math.max(-1, Math.min(1, dot / (magAB * magCB)))) * 180) / Math.PI);
    }
  }

  return { heightRatio: Math.round(heightRatio * 100) / 100, depthRatio: Math.round(depthRatio * 100) / 100, elbowAngleDeg, torsoPixelLength: Math.round(torso) };
}

/**
 * 参考値としてcm換算する場合のヘルパー。日本人成人の肩〜腰（胴体長）の平均的な目安
 * 45cmを基準にした概算であり、実測キャリブレーションではない。診断文に使う場合は
 * 必ず「目安」「推定」と明示すること。
 */
export function estimateCmFromTorsoRatio(ratio: number, assumedTorsoCm = 45): number {
  return Math.round(ratio * assumedTorsoCm);
}

/**
 * Phase4: インパクト候補時刻の前後（offsetsSec、例 [-0.17,-0.1,0,0.1,0.17]）を
 * 高画質で個別にキャプチャする。診断AIに渡す最終的な画像セットになる。
 */
export async function captureImpactWindow(
  videoUrl: string,
  impactTime: number,
  offsetsSec: number[],
  size: { w: number; h: number } = { w: 560, h: 315 },
  quality = 0.7
): Promise<string[]> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.src = videoUrl; video.muted = true; video.playsInline = true; video.preload = "metadata";
    const results: string[] = [];

    const captureAt = (time: number): Promise<string | null> => {
      return new Promise((res) => {
        const tid = setTimeout(() => res(null), 4000);
        let drawn = false;
        const draw = () => {
          if (drawn) return; drawn = true;
          clearTimeout(tid);
          try {
            const c = document.createElement("canvas"); c.width = size.w; c.height = size.h;
            const ctx = c.getContext("2d"); if (!ctx) { res(null); return; }
            ctx.drawImage(video, 0, 0, size.w, size.h);
            const b64 = c.toDataURL("image/jpeg", quality).split(",")[1];
            res(b64 && b64.length > 500 ? b64 : null);
          } catch { res(null); }
        };
        video.onseeked = () => {
          const rvfc = (video as any).requestVideoFrameCallback;
          if (typeof rvfc === "function") (video as any).requestVideoFrameCallback(draw);
          setTimeout(draw, 150);
        };
        video.currentTime = Math.max(0, time);
      });
    };

    const run = async () => {
      try {
        await new Promise<void>((res, rej) => {
          const tid = setTimeout(() => rej(new Error("timeout")), 12000);
          video.onloadedmetadata = () => { clearTimeout(tid); res(); };
          video.onerror = () => { clearTimeout(tid); rej(new Error("error")); };
        });
        const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : impactTime + 1;
        for (const off of offsetsSec) {
          const t = Math.max(0, Math.min(dur - 0.02, impactTime + off));
          const b64 = await captureAt(t);
          if (b64) results.push(b64);
        }
        resolve(results);
      } catch { resolve(results); }
    };
    run(); setTimeout(() => resolve(results), 30000);
  });
}
