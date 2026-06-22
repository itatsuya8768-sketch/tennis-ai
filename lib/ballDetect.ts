// ブラウザ内でテニスボール（COCOデータセットの "sports ball" クラス）を検出し、
// 手首の位置と最も近づいた画像＝インパクトに最も近いと推定される画像を選ぶ。
// 本物のYOLOではなく、変換不要でブラウザにそのまま読み込める軽量モデル
// （TensorFlow.js公式の coco-ssd, MobileNetベース）を使う。検出クラスは同じく
// COCOの "sports ball" を使うため、目的（ボール検出）としては十分。
let modelPromise: Promise<any> | null = null;

async function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      // MediaPipe（骨格検出）がWebGLコンテキストを保持し続けているため、TensorFlow.jsも
      // WebGLバックエンドを使うとGPUコンテキストを取り合い、片方が失われて骨格検出まで
      // 壊れてしまう。CPUバックエンドに固定してGPUリソースを共有しないようにする。
      await tf.setBackend("cpu");
      await tf.ready();
      return cocoSsd.load({ base: "lite_mobilenet_v2" });
    })();
  }
  return modelPromise;
}

function loadImage(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/jpeg;base64,${base64}`;
  });
}

export interface BallBox { x: number; y: number; w: number; h: number; score: number; }

// frames は560x315のJPEG(base64・data:プレフィックス無し)を想定。
async function detectBalls(frames: string[]): Promise<(BallBox | null)[]> {
  const model = await getModel();
  const out: (BallBox | null)[] = [];
  for (const f of frames) {
    try {
      const img = await loadImage(f);
      const preds = await model.detect(img);
      const balls = preds.filter((p: any) => p.class === "sports ball");
      if (balls.length === 0) { out.push(null); continue; }
      const best = balls.reduce((a: any, b: any) => (a.score > b.score ? a : b));
      const [x, y, w, h] = best.bbox;
      out.push({ x, y, w, h, score: best.score });
    } catch {
      out.push(null);
    }
  }
  return out;
}

export interface WristPoint { time: number; x: number; y: number; videoW: number; videoH: number; }

// frames・frameTimes（同じ並び順）と、骨格データから取った手首の時系列位置（元動画の解像度基準）を渡し、
// 「手首とボールの検出位置が画像内で最も近い」フレームのインデックスを返す。
// 検出できなければ null（呼び出し側は従来通りフレーム全体を均等に渡すだけにする）。
export async function findClosestBallContactFrame(
  frames: string[],
  frameTimes: number[],
  wristSeries: WristPoint[]
): Promise<number | null> {
  if (frames.length === 0 || wristSeries.length === 0) return null;
  // CPUバックエンド（WebGLを使わない）は1枚あたりの推論が遅いため、枚数が多い場合は
  // 間引いて検出し、全体としてタイムアウトしにくくする。
  const MAX_CHECK = 15;
  const step = Math.max(1, Math.ceil(frames.length / MAX_CHECK));
  const indices: number[] = [];
  for (let i = 0; i < frames.length; i += step) indices.push(i);
  const sampledFrames = indices.map(i => frames[i]);
  const balls = await detectBalls(sampledFrames);
  let bestIdx: number | null = null;
  let bestDist = Infinity;
  for (let s = 0; s < indices.length; s++) {
    const i = indices[s];
    const ball = balls[s];
    if (!ball) continue;
    const t = frameTimes[i];
    // 一番時刻が近い手首座標を使う
    let nearest = wristSeries[0];
    let nd = Math.abs(wristSeries[0].time - t);
    for (const w of wristSeries) {
      const d = Math.abs(w.time - t);
      if (d < nd) { nd = d; nearest = w; }
    }
    // 560x315キャンバス座標 と 元動画解像度座標 をそれぞれ0-1に正規化して比較
    const ballCx = (ball.x + ball.w / 2) / 560;
    const ballCy = (ball.y + ball.h / 2) / 315;
    const wristX = nearest.x / nearest.videoW;
    const wristY = nearest.y / nearest.videoH;
    const dist = Math.hypot(ballCx - wristX, ballCy - wristY);
    if (dist < bestDist) { bestDist = dist; bestIdx = i; }
  }
  return bestIdx;
}
