"use client";
import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";

export interface PoseMetrics {
  leftElbowAngle:  number;
  rightElbowAngle: number;
  leftKneeAngle:   number;
  rightKneeAngle:  number;
  spineAngle:      number;
  landmarksRaw:    number[][];
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>;
  onMetrics?: (m: PoseMetrics) => void;
  active: boolean;
}

export interface PoseFrame {
  t:   number;       // video.currentTime
  pts: number[][];   // landmark pixel coords [x,y,z]
  vis: number[];     // visibility per landmark
}

export interface PoseDetectorHandle {
  getLatestMetrics: () => PoseMetrics | null;
  getSeries: () => PoseFrame[];
  clearSeries: () => void;
  /** 動画を指定時刻にコマ送りして各コマで骨格検出する（確実な方式）。集まったフレーム数を返す。 */
  captureSeries: (times: number[]) => Promise<number>;
  /** MediaPipeのWebGLコンテキストを解放する（他のGPU処理との競合を避けるため）。 */
  closePose: () => Promise<void>;
}

function angleBetween(a: number[], b: number[], c: number[]) {
  const ab = [a[0] - b[0], a[1] - b[1]];
  const cb = [c[0] - b[0], c[1] - b[1]];
  const dot = ab[0] * cb[0] + ab[1] * cb[1];
  const magAB = Math.hypot(...ab);
  const magCB = Math.hypot(...cb);
  if (magAB === 0 || magCB === 0) return 0;
  return Math.round((Math.acos(Math.max(-1, Math.min(1, dot / (magAB * magCB)))) * 180) / Math.PI);
}

const PoseDetector = forwardRef<PoseDetectorHandle, Props>(
  ({ videoRef, onMetrics, active }, ref) => {
    const canvasRef  = useRef<HTMLCanvasElement>(null);
    const poseRef    = useRef<any>(null);
    const latestRef  = useRef<PoseMetrics | null>(null);
    const seriesRef  = useRef<PoseFrame[]>([]);

    const readyRef = useRef<Promise<any> | null>(null);

    const onResults = useCallback((results: any) => {
      const canvas = canvasRef.current;
      const video  = videoRef.current;
      if (!canvas || !video) return;

      canvas.width  = video.videoWidth  || video.clientWidth;
      canvas.height = video.videoHeight || video.clientHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!results.poseLandmarks) return;

      const lm = results.poseLandmarks as { x: number; y: number; z: number; visibility?: number }[];
      const pts = lm.map(p => [p.x * canvas.width, p.y * canvas.height, p.z]);

      // ── 骨格ワイヤーフレーム描画 ──
      const connections: [number, number][] = [
        [11,12],[11,13],[13,15],[12,14],[14,16],
        [11,23],[12,24],[23,24],[23,25],[24,26],[25,27],[26,28],
      ];

      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth   = 3;
      connections.forEach(([a, b]) => {
        if (!pts[a] || !pts[b]) return;
        ctx.beginPath();
        ctx.moveTo(pts[a][0], pts[a][1]);
        ctx.lineTo(pts[b][0], pts[b][1]);
        ctx.stroke();
      });

      // 関節点
      const keyPoints = [11,12,13,14,15,16,23,24,25,26,27,28];
      keyPoints.forEach(i => {
        if (!pts[i]) return;
        ctx.beginPath();
        ctx.arc(pts[i][0], pts[i][1], 6, 0, Math.PI * 2);
        ctx.fillStyle = lm[i].visibility && lm[i].visibility! > 0.5 ? "#84cc16" : "#f59e0b";
        ctx.fill();
      });

      // ── 角度計測 ──
      const metrics: PoseMetrics = {
        rightElbowAngle: pts[12] && pts[14] && pts[16] ? angleBetween(pts[12], pts[14], pts[16]) : 0,
        leftElbowAngle:  pts[11] && pts[13] && pts[15] ? angleBetween(pts[11], pts[13], pts[15]) : 0,
        rightKneeAngle:  pts[24] && pts[26] && pts[28] ? angleBetween(pts[24], pts[26], pts[28]) : 0,
        leftKneeAngle:   pts[23] && pts[25] && pts[27] ? angleBetween(pts[23], pts[25], pts[27]) : 0,
        spineAngle:      pts[11] && pts[23] ? angleBetween(
          [pts[11][0], pts[11][1] - 50], pts[11], pts[23]
        ) : 0,
        landmarksRaw: pts,
      };

      latestRef.current = metrics;
      onMetrics?.(metrics);

      // ── スイング全体の座標を時系列で記録（テイクバック最深フレーム解析用）──
      if (seriesRef.current.length < 900) {
        seriesRef.current.push({
          t:   video.currentTime,
          pts: pts.map(p => [p[0], p[1], p[2]]),
          vis: lm.map(p => p.visibility ?? 0),
        });
      }
    }, [videoRef, onMetrics]);

    // Pose インスタンスを1度だけ生成（読み込み完了を待てる）
    const ensurePose = useCallback(async () => {
      if (poseRef.current) return poseRef.current;
      if (!readyRef.current) {
        readyRef.current = (async () => {
          const { Pose } = await import("@mediapipe/pose");
          const pose = new Pose({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
          });
          pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: false,
            enableSegmentation: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
          pose.onResults(onResults);
          poseRef.current = pose;
          return pose;
        })();
      }
      return readyRef.current;
    }, [onResults]);

    // 動画をコマ送りして各コマで骨格検出（再生タイミングに依存しない確実な方式）
    const captureSeries = useCallback(async (times: number[]) => {
      const video = videoRef.current;
      if (!video) return 0;
      let pose: any;
      try { pose = await ensurePose(); } catch (e) { console.warn("pose load failed", e); return 0; }
      try { video.pause(); } catch {}
      for (const t of times) {
        try {
          await new Promise<void>((res) => {
            let done = false;
            const finish = () => { if (done) return; done = true; video.removeEventListener("seeked", onSeeked); res(); };
            const onSeeked = () => finish();
            video.addEventListener("seeked", onSeeked);
            try { video.currentTime = t; } catch { finish(); }
            setTimeout(finish, 700);
          });
          await new Promise(r => setTimeout(r, 30)); // フレーム描画待ち
          await pose.send({ image: video });
        } catch { /* このコマはスキップ */ }
      }
      return seriesRef.current.length;
    }, [videoRef, ensurePose]);

    useImperativeHandle(ref, () => ({
      getLatestMetrics: () => latestRef.current,
      getSeries: () => seriesRef.current,
      clearSeries: () => { seriesRef.current = []; },
      captureSeries,
      // MediaPipeが保持しているWebGLコンテキストを明示的に解放する。
      // 骨格データはもう取得済みで、これ以降の処理（TensorFlow.js等）がGPUを
      // 使う場合にコンテキストを取り合って失われるのを防ぐために呼ぶ。
      // 次回 ensurePose() が呼ばれた時点で自動的に再生成される。
      closePose: async () => {
        try { await poseRef.current?.close?.(); } catch {}
        poseRef.current = null;
        readyRef.current = null;
      },
    }), [captureSeries]);

    // active になったら骨格モデルを先読みしておく（実際の検出はコマ送りで行う）
    useEffect(() => {
      if (!active) return;
      ensurePose().catch(e => console.warn("MediaPipe preload error:", e));
    }, [active, ensurePose]);

    return (
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          pointerEvents: "none",
        }}
      />
    );
  }
);

PoseDetector.displayName = "PoseDetector";
export default PoseDetector;
