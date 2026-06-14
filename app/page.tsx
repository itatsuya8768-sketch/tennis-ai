"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import AuthButton from "@/components/AuthButton";
import PoseDetector, { type PoseDetectorHandle, type PoseMetrics, type PoseFrame } from "@/components/PoseDetector";
import ScoreBar from "@/components/ScoreBar";
import ReportCard from "@/components/ReportCard";
import type { PlayerProfile, AIReport } from "@/types";
import { createClient } from "@/lib/supabase/client";

const PAIN_AREAS = ["右肩","左肩","右肘（テニス肘）","左肘","右手首","左手首","腰（腰痛）","右膝","左膝","右足首","左足首"];
const PAIN_LEVEL_LABELS = ["","軽い違和感","やや痛む","かなり痛む","激しい痛み"];
const GRIP_SLOTS = [{key:"fore",label:"フォア"},{key:"foreSlice",label:"フォアスライス"},{key:"back",label:"バック"},{key:"backSlice",label:"バックスライス"},{key:"serve",label:"サーブ"},{key:"foreVolley",label:"フォアボレー"},{key:"backVolley",label:"バックボレー"}];
const PRO_PLAYERS_MEN = ["ロジャー・フェデラー","ノバク・ジョコビッチ","ラファエル・ナダル","アンディ・マレー","ヤニック・シナー","カルロス・アルカラス","錦織 圭"];
const PRO_PLAYERS_WOMEN = ["大坂なおみ","アリナ・サバレンカ","イガ・シフォンティク","エレーナ・リバキナ"];
const PLAYER_FLAGS: Record<string,string> = {"ロジャー・フェデラー":"🇨🇭","ノバク・ジョコビッチ":"🇷🇸","ラファエル・ナダル":"🇪🇸","アンディ・マレー":"🇬🇧","ヤニック・シナー":"🇮🇹","カルロス・アルカラス":"🇪🇸","錦織 圭":"🇯🇵","大坂なおみ":"🇯🇵","アリナ・サバレンカ":"🇧🇾","イガ・シフォンティク":"🇵🇱","エレーナ・リバキナ":"🇰🇿"};
const SHOT_MENU: Record<string,string[]> = {"フォアハンドストローク":["トップスピン","フラット","スライス"],"バックハンドストローク":["トップスピン","フラット","スライス"],"フォアボレー":["ハイボレー","ミドルボレー","ローボレー","ハーフボレー","ドロップボレー"],"バックボレー":["ハイボレー","ミドルボレー","ローボレー","ハーフボレー","ドロップボレー"],"サーブ":["フラットサーブ","スライスサーブ","スピンサーブ（キック）"],"スマッシュ":["通常スマッシュ","ジャンプスマッシュ"],"アプローチショット":["トップスピン","スライス"]};
const SHOT_CATEGORIES = Object.keys(SHOT_MENU);

// ── テイクバック客観解析 ──
// スイング全体の骨格時系列から「ラケットを一番引いたフレーム」を特定し、
// 推定ラケットヘッド（肘→手首の延長）が肩のラインより後方かを計算する。
export interface TakebackAnalysis {
  verdict: "over" | "compact" | "unknown";
  beyondRatio: number;   // 肩幅に対する、ラケットヘッドが肩より外側へ出た量
  shoulderLabel: string; // "左肩" / "右肩"
  frames: number;
}
function analyzeTakeback(series: PoseFrame[], handedness: string): TakebackAnalysis {
  const RIGHT = handedness !== "左利き";
  const ELBOW = RIGHT ? 14 : 13;   // 利き腕の肘
  const WRIST = RIGHT ? 16 : 15;   // 利き腕の手首

  // 有効フレーム（利き腕＋胴体が見えている）を抽出し、推定ラケットヘッドと胴体基準点を計算。
  // 真横アングルでは左右の肩が重なるため「肩幅」は使えない。
  // 代わりに「肩→腰の胴体長」をスケールに、ラケットヘッドが肩（胴体ライン）より
  // 前後方向にどれだけ後ろへ出ているかで判定する。
  type F = { t:number; headX:number; shX:number; torso:number };
  const valid: F[] = [];
  for (const f of series) {
    const v = f.vis, p = f.pts;
    const shoulders = [11,12].filter(i=>p[i]&&(v[i]??0)>=0.25);
    const hips      = [23,24].filter(i=>p[i]&&(v[i]??0)>=0.25);
    if (!p[ELBOW]||!p[WRIST]||(v[ELBOW]??0)<0.35||(v[WRIST]??0)<0.35) continue;
    if (shoulders.length===0||hips.length===0) continue;
    const headX = p[WRIST][0] + (p[WRIST][0]-p[ELBOW][0]); // 手首から前腕方向へ延長＝ラケットヘッド推定
    const shX = shoulders.reduce((s,i)=>s+p[i][0],0)/shoulders.length;
    const shY = shoulders.reduce((s,i)=>s+p[i][1],0)/shoulders.length;
    const hipX = hips.reduce((s,i)=>s+p[i][0],0)/hips.length;
    const hipY = hips.reduce((s,i)=>s+p[i][1],0)/hips.length;
    const torso = Math.hypot(shX-hipX, shY-hipY);
    if (torso < 20) continue; // 胴体が小さすぎる＝検出不良
    valid.push({ t:f.t, headX, shX, torso });
  }
  if (valid.length < 5) return { verdict:"unknown", beyondRatio:0, shoulderLabel:"", frames:valid.length };

  // スイング中、ラケットヘッドが肩から水平に最も離れたフレーム＝テイクバック最深。
  // ネット方向（前後の符号）の推定は動画により反転して誤判定の原因になるため使わず、
  // 「肩からの水平距離の大きさ」を胴体長で正規化した値で判定する（符号に依存しない）。
  let deep = valid[0];
  for (const f of valid){ if (Math.abs(f.headX-f.shX) > Math.abs(deep.headX-deep.shX)) deep = f; }

  const behind = Math.abs(deep.headX - deep.shX); // 肩からラケットヘッドまでの水平距離
  const beyondRatio = behind / deep.torso;        // 胴体長で正規化
  const shoulderLabel = "肩";

  let verdict: "over"|"compact"|"unknown" = "unknown";
  if (beyondRatio > 0.55) verdict = "over";         // ラケットヘッドが肩から大きく離れている＝引きすぎ
  else if (beyondRatio < 0.30) verdict = "compact"; // 肩の近くに収まっている＝コンパクト
  return { verdict, beyondRatio:Math.round(beyondRatio*100)/100, shoulderLabel, frames:valid.length };
}

// ── フォロースルー客観解析 ──
// スイング後半（インパクト後）で、利き手（手首）が肘より上まで上がっているかを計算する。
// スムーズに振れていれば手は肘より上に抜ける。垂直方向の比較なので前後の向きに依存しない。
export interface FollowThroughAnalysis {
  verdict: "high" | "low" | "unknown"; // high=手が肘より上（スムーズ）/ low=肘より下のまま
  aboveRatio: number;                  // 前腕長に対する、手首が肘より上に出た量
  frames: number;
}
function analyzeFollowThrough(series: PoseFrame[], handedness: string): FollowThroughAnalysis {
  const RIGHT = handedness !== "左利き";
  const ELBOW = RIGHT ? 14 : 13;
  const WRIST = RIGHT ? 16 : 15;
  type G = { t:number; wx:number; wy:number; ex:number; ey:number };
  const valid: G[] = [];
  for (const f of series) {
    const v = f.vis, p = f.pts;
    if (!p[ELBOW]||!p[WRIST]||(v[ELBOW]??0)<0.35||(v[WRIST]??0)<0.35) continue;
    valid.push({ t:f.t, wx:p[WRIST][0], wy:p[WRIST][1], ex:p[ELBOW][0], ey:p[ELBOW][1] });
  }
  if (valid.length < 6) return { verdict:"unknown", aboveRatio:0, frames:valid.length };

  // コンタクト＝手首が水平に最高速のフレーム。それ以降をフォロースルー区間とする。
  let ci = 0, ms = -1;
  for (let i=1;i<valid.length;i++){
    const dt = Math.max(0.001, valid[i].t - valid[i-1].t);
    const sp = Math.abs(valid[i].wx - valid[i-1].wx)/dt;
    if (sp>ms){ms=sp;ci=i;}
  }
  const win = valid.slice(Math.min(ci+1, valid.length-1));
  if (win.length < 2) return { verdict:"unknown", aboveRatio:0, frames:valid.length };

  // フォロースルー中、手首が最も高く上がった点（画面yが最小）で肘との上下関係を見る
  let hi = win[0];
  for (const g of win){ if (g.wy < hi.wy) hi = g; }
  const forearm = Math.hypot(hi.wx-hi.ex, hi.wy-hi.ey) || 1;
  const aboveRatio = (hi.ey - hi.wy) / forearm; // 画面yは下向き正なので、手首が肘より上だと正
  let verdict: "high"|"low"|"unknown" = "unknown";
  if (aboveRatio > 0.2) verdict = "high";
  else if (aboveRatio < -0.1) verdict = "low";
  return { verdict, aboveRatio:Math.round(aboveRatio*100)/100, frames:valid.length };
}

function useWindowWidth() {
  const [w,setW]=useState(1200);
  useEffect(()=>{setW(window.innerWidth);const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
  return w;
}

function ToggleGroup({options,value,onChange}:{options:string[];value:string;onChange:(v:string)=>void}) {
  return <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{options.map(opt=><button key={opt} onClick={()=>onChange(opt)} style={{padding:"9px 16px",borderRadius:8,fontWeight:700,fontSize:13,border:value===opt?"2px solid #84cc16":"2px solid #e2e8f0",background:value===opt?"#f0fdf4":"#fff",color:value===opt?"#16a34a":"#64748b",cursor:"pointer"}}>{opt}</button>)}</div>;
}

function SectionCard({children,style={}}:{children:React.ReactNode;style?:React.CSSProperties}) {
  return <div style={{background:"#fff",borderRadius:20,border:"1px solid #e2e8f0",padding:"20px 18px",marginBottom:16,...style}}>{children}</div>;
}

function StepLabel({number,title}:{number:number;title:string}) {
  return <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}><div style={{width:28,height:28,borderRadius:8,flexShrink:0,background:"linear-gradient(135deg,#84cc16,#22c55e)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:"#fff"}}>{number}</div><span style={{fontWeight:800,fontSize:15,color:"#0f172a"}}>STEP {number}：{title}</span></div>;
}

function FieldLabel({children}:{children:React.ReactNode}) {
  return <div style={{fontSize:12,fontWeight:700,color:"#64748b",marginBottom:8}}>{children}</div>;
}

function GripUploader({label,value,onChange}:{label:string;value:string|null;onChange:(v:string)=>void}) {
  const ref=useRef<HTMLInputElement>(null);
  const handle=(f:File)=>{
    const url=URL.createObjectURL(f);
    const img=new window.Image();
    img.onload=()=>{
      const max=512;let w=img.width,h=img.height;
      if(w>h){if(w>max){h=Math.round(h*max/w);w=max;}}else{if(h>max){w=Math.round(w*max/h);h=max;}}
      const c=document.createElement("canvas");c.width=w;c.height=h;
      const ctx=c.getContext("2d");if(ctx)ctx.drawImage(img,0,0,w,h);
      onChange(c.toDataURL("image/jpeg",0.8));
      URL.revokeObjectURL(url);
    };
    img.src=url;
  };
  return <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}><div onClick={()=>ref.current?.click()} style={{width:64,height:64,borderRadius:12,border:value?"2px solid #84cc16":"2px dashed #cbd5e1",background:value?"transparent":"#f8fafc",cursor:"pointer",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>{value?<img src={value} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:20}}>📷</span>}</div><input ref={ref} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)handle(f);}}/><span style={{fontSize:10,color:"#64748b",fontWeight:700,textAlign:"center"}}>{label}</span></div>;
}

function LoadingOverlay({hasFrames}:{hasFrames:boolean}) {
  const [step,setStep]=useState(0);
  const steps=hasFrames?["🎬 動画を解析中...","🦴 骨格を検出中...","📐 関節角度・打点を計測中...","🔍 フォームを詳細解析中...","📋 診断レポートを生成中..."]:["🦴 骨格を検出中...","📐 関節角度を計算中...","🔍 フォームを解析中...","📋 診断レポートを生成中..."];
  useEffect(()=>{let i=0;const iv=setInterval(()=>{i++;setStep(i);if(i>=steps.length)clearInterval(iv);},900);return()=>clearInterval(iv);},[]);
  return <div style={{background:"#fff",borderRadius:20,border:"1px solid #e2e8f0",padding:"40px 24px",marginBottom:16,display:"flex",flexDirection:"column",alignItems:"center",gap:20}}><div style={{position:"relative",width:90,height:90}}><svg viewBox="0 0 90 90" style={{position:"absolute",inset:0,width:"100%",height:"100%"}}><circle cx="45" cy="45" r="40" fill="none" stroke="#e2e8f0" strokeWidth="3"/><circle cx="45" cy="45" r="40" fill="none" stroke="#84cc16" strokeWidth="4" strokeDasharray="251" strokeLinecap="round" style={{animation:"dashSpin 2s linear infinite",transformOrigin:"45px 45px"}}/></svg><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>🎾</div></div><div style={{width:"100%",maxWidth:300,display:"flex",flexDirection:"column",gap:10}}>{steps.map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,opacity:i<=step?1:0.3,transition:"opacity 0.4s"}}><div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,background:i<step?"#84cc16":i===step?"#bef264":"#e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:900}}>{i<step?"✓":i+1}</div><span style={{fontSize:13,color:i<=step?"#1e293b":"#94a3b8",fontWeight:500}}>{s}</span></div>)}</div>;</div>
}

async function extractFrames(videoUrl:string,duration:number):Promise<string[]> {
  return new Promise((resolve)=>{
    const video=document.createElement("video");
    video.src=videoUrl;video.muted=true;video.playsInline=true;video.preload="metadata";
    const results:string[]=[];
    const captureAt=(time:number):Promise<string|null>=>{
      return new Promise((res)=>{
        const tid=setTimeout(()=>res(null),4000);
        video.onseeked=()=>{
          clearTimeout(tid);
          try{const c=document.createElement("canvas");c.width=720;c.height=404;const ctx=c.getContext("2d");if(!ctx){res(null);return;}ctx.drawImage(video,0,0,720,404);const b64=c.toDataURL("image/jpeg",0.85).split(",")[1];res(b64&&b64.length>500?b64:null);}catch{res(null);}
        };
        video.currentTime=time;
      });
    };
    const run=async()=>{
      try{
        await new Promise<void>((res,rej)=>{const tid=setTimeout(()=>rej(new Error("timeout")),12000);video.onloadedmetadata=()=>{clearTimeout(tid);res();};video.onerror=()=>{clearTimeout(tid);rej(new Error("error"));};});
        let dur=video.duration;
        if(!isFinite(dur)||dur<=0){
          // 一部のMOV/MP4は duration が Infinity になる → 強制シークで実測
          dur=await new Promise<number>((res)=>{
            const to=setTimeout(()=>res(0),3000);
            const onDur=()=>{
              if(isFinite(video.duration)&&video.duration>0){
                clearTimeout(to);video.removeEventListener("durationchange",onDur);
                video.currentTime=0;res(video.duration);
              }
            };
            video.addEventListener("durationchange",onDur);
            try{video.currentTime=1e7;}catch{clearTimeout(to);res(0);}
          });
        }
        if(!dur||!isFinite(dur)||dur<0.1){resolve([]);return;}
        const scanRange=Math.min(dur,10);const times:number[]=[];
        const FRAME_COUNT=12;
        const start=Math.min(0.3,scanRange*0.05);const end=Math.max(start,scanRange-0.1);
        for(let i=0;i<FRAME_COUNT;i++){const t=start+(end-start)*(i/(FRAME_COUNT-1));times.push(Math.max(0,Math.min(t,dur-0.05)));}
        for(const t of times){const b64=await captureAt(t);if(b64)results.push(b64);}
        console.log(`フレーム抽出結果: ${results.length}枚`);
        resolve(results);
      }catch(e){console.warn("extractFrames:",e);resolve([]);}
    };
    run();setTimeout(()=>resolve(results),30000);
  });
}

export default function HomePage() {
  const windowWidth=useWindowWidth();
  const isMobile=windowWidth<768;
  const [handedness,setHandedness]=useState<PlayerProfile["handedness"]>("右利き");
  const [forehand,setForehand]=useState<PlayerProfile["forehand"]>("片手打ち");
  const [forehandGrip,setForehandGrip]=useState<NonNullable<PlayerProfile["forehandGrip"]>>("順手（利き手が上）");
  const [backhand,setBackhand]=useState<PlayerProfile["backhand"]>("両手打ち");
  const [foreVolley,setForeVolley]=useState<"片手打ち"|"両手打ち">("片手打ち");
  const [backVolley,setBackVolley]=useState<"片手打ち"|"両手打ち">("片手打ち");
  const [painAreas,setPainAreas]=useState<string[]>([]);
  const [painLevels,setPainLevels]=useState<Record<string,number>>({});
  const [videoFile,setVideoFile]=useState<File|null>(null);
  const [videoUrl,setVideoUrl]=useState<string|null>(null);
  const [hasFrames,setHasFrames]=useState(false);
  const [videoDuration,setVideoDuration]=useState<number|null>(null);
  const [videoErr,setVideoErr]=useState(false);
  const [gripPhotos,setGripPhotos]=useState<Record<string,string>>({});
  const [comparePlayer,setComparePlayer]=useState<string|null>(null);
  const [shotCategory,setShotCategory]=useState<string|null>(null);
  const [shotType,setShotType]=useState<string|null>(null);
  const videoRef=useRef<HTMLVideoElement>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  const poseRef=useRef<PoseDetectorHandle>(null);
  const [poseActive,setPoseActive]=useState(false);
  const [poseMetrics,setPoseMetrics]=useState<PoseMetrics|null>(null);
  const [status,setStatus]=useState<"idle"|"loading"|"done"|"error">("idle");
  const [report,setReport]=useState<AIReport|null>(null);
  const [errMsg,setErrMsg]=useState("");
  const [activeTab,setActiveTab]=useState<"input"|"result">("input");
  const [isPremium,setIsPremium]=useState(false);
  const [usage,setUsage]=useState<{plan:string;remaining:number|null;limit:number|null}|null>(null);
  const hasPain=painAreas.length>0;

  // ログイン中ユーザーのPremium状態を取得（会員なら詳細レポート全文を解放）
  useEffect(()=>{
    const supabase=createClient();
    supabase.auth.getUser().then(({data})=>{
      const u=data.user;
      if(!u){setIsPremium(false);return;}
      supabase.from("profiles").select("is_premium").eq("id",u.id).maybeSingle().then(({data:p})=>setIsPremium(!!p?.is_premium));
    });
  },[]);

  const fetchUsage=()=>{fetch("/api/usage").then(r=>r.json()).then(d=>{if(!d.error)setUsage(d);}).catch(()=>{});};
  useEffect(()=>{fetchUsage();},[]); // eslint-disable-line react-hooks/exhaustive-deps

  // 決済から戻ってきたら Premium 状態を同期（Webhookの保険）
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    if(params.get("checkout")==="success"){
      fetch("/api/premium/sync",{method:"POST"}).catch(()=>{}).finally(()=>{
        window.history.replaceState({},"",window.location.pathname);
        window.location.reload();
      });
    }
  },[]);

  // 入力内容をブラウザに保存し、次回（ログイン後も）自動で復元する
  useEffect(()=>{
    try{
      const s=JSON.parse(localStorage.getItem("tennisai_inputs")||"{}");
      if(s.handedness)setHandedness(s.handedness);
      if(s.forehand)setForehand(s.forehand);
      if(s.forehandGrip)setForehandGrip(s.forehandGrip);
      if(s.backhand)setBackhand(s.backhand);
      if(s.foreVolley)setForeVolley(s.foreVolley);
      if(s.backVolley)setBackVolley(s.backVolley);
      if(Array.isArray(s.painAreas))setPainAreas(s.painAreas);
      if(s.painLevels&&typeof s.painLevels==="object")setPainLevels(s.painLevels);
      if("comparePlayer" in s)setComparePlayer(s.comparePlayer);
      if("shotCategory" in s)setShotCategory(s.shotCategory);
      if("shotType" in s)setShotType(s.shotType);
    }catch{}
  },[]);
  useEffect(()=>{
    try{
      localStorage.setItem("tennisai_inputs",JSON.stringify({handedness,forehand,forehandGrip,backhand,foreVolley,backVolley,painAreas,painLevels,comparePlayer,shotCategory,shotType}));
    }catch{}
  },[handedness,forehand,forehandGrip,backhand,foreVolley,backVolley,painAreas,painLevels,comparePlayer,shotCategory,shotType]);

  const togglePain=(area:string)=>{setPainAreas(prev=>{if(prev.includes(area)){setPainLevels(lv=>{const n={...lv};delete n[area];return n;});return prev.filter(a=>a!==area);}setPainLevels(lv=>({...lv,[area]:2}));return [...prev,area];});};

  const handleDrop=useCallback((e:React.DragEvent|React.ChangeEvent<HTMLInputElement>)=>{
    if("preventDefault" in e)e.preventDefault();
    const f=("dataTransfer" in e)?e.dataTransfer?.files?.[0]:(e.target as HTMLInputElement).files?.[0];
    if(!f)return;
    const url=URL.createObjectURL(f);
    setVideoFile(f);setVideoUrl(url);setHasFrames(true);setPoseActive(false);setVideoDuration(null);setVideoErr(false);
    const tmp=document.createElement("video");tmp.preload="metadata";tmp.muted=true;tmp.src=url;
    tmp.onloadedmetadata=()=>{
      if(isFinite(tmp.duration)&&tmp.duration>0){setVideoDuration(tmp.duration);return;}
      const onDur=()=>{if(isFinite(tmp.duration)&&tmp.duration>0){tmp.removeEventListener("durationchange",onDur);setVideoDuration(tmp.duration);}};
      tmp.addEventListener("durationchange",onDur);
      try{tmp.currentTime=1e7;}catch{}
    };
  },[]);

  const handleStart=async()=>{
    if(!videoFile){alert("まず動画をアップロードしてください");return;}
    setStatus("loading");if(isMobile)setActiveTab("result");
    let frames:string[]=[];let metrics:PoseMetrics|null=null;let takeback:TakebackAnalysis|null=null;let followThrough:FollowThroughAnalysis|null=null;
    if(videoUrl){try{frames=await extractFrames(videoUrl,videoDuration??0);}catch(e){console.warn("extractFrames error",e);}}
    if(videoRef.current){
      const v=videoRef.current;
      try{poseRef.current?.clearSeries?.();}catch{}
      try{v.pause();v.muted=true;}catch{}
      setPoseActive(true); // モデル先読み＆オーバーレイ表示
      // 動画を等間隔でコマ送りして各コマで骨格検出（再生に依存しない確実な方式）
      const dur=isFinite(v.duration)&&v.duration>0?Math.min(v.duration,10):4;
      const N=48;
      const times=Array.from({length:N},(_,i)=>+( (dur*0.98)*i/(N-1) ).toFixed(3));
      let n=0;
      try{n=await poseRef.current?.captureSeries?.(times)??0;}catch(e){console.warn("captureSeries error",e);}
      try{v.currentTime=0;}catch{}
      setPoseActive(false);
      metrics=poseRef.current?.getLatestMetrics()??null;setPoseMetrics(metrics);
      try{const series=poseRef.current?.getSeries?.()??[];takeback=analyzeTakeback(series,handedness);followThrough=analyzeFollowThrough(series,handedness);console.log("[takeback]",takeback,"[followThrough]",followThrough,"series",series.length);}catch(e:any){console.warn("pose analysis error",e);}
    }
    try{
      const profile:PlayerProfile={handedness,forehand,forehandGrip:forehand==="両手打ち"?forehandGrip:undefined,backhand,foreVolley,backVolley,painAreas,painLevels:painLevels as Record<string,1|2|3|4>};
      const grips=GRIP_SLOTS.filter(s=>gripPhotos[s.key]).map(s=>({label:s.label,data:(gripPhotos[s.key]||"").split(",")[1]})).filter(g=>g.data);
      const res=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({profile,poseMetrics:metrics,takeback,followThrough,frames,grips,comparePlayer,shotCategory,shotType})});
      if(!res.ok){const d=await res.json();throw new Error(d.error??"診断に失敗しました");}
      const d=await res.json();setReport(d.report);setStatus("done");fetchUsage();
    }catch(e:any){setErrMsg(e.message??"エラーが発生しました");setStatus("error");}
  };

  const goPremium=()=>{window.location.href="/premium";};

  const showLeft=!isMobile||activeTab==="input";
  const showRight=!isMobile||activeTab==="result";

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#f0fdf4 0%,#f8fafc 50%,#f0f9ff 100%)",fontFamily:"'Noto Sans JP','Hiragino Sans','Helvetica Neue',sans-serif",overflowX:"hidden"}}>
      <header style={{background:"rgba(255,255,255,0.92)",WebkitBackdropFilter:"blur(12px)",backdropFilter:"blur(12px)",borderBottom:"1px solid #e2e8f0",padding:"0 16px",display:"flex",alignItems:"center",justifyContent:"space-between",height:56,position:"sticky",top:0,zIndex:200}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#84cc16,#22c55e)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🎾</div>
          <div><div style={{fontWeight:900,fontSize:15,color:"#0f172a",lineHeight:1}}>TennisAI</div><div style={{fontSize:9,color:"#84cc16",fontWeight:700,letterSpacing:"0.1em"}}>FORM ANALYZER</div></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {!isMobile&&<Link href="/history" style={{fontSize:12,fontWeight:700,color:"#475569",textDecoration:"none",padding:"7px 14px",borderRadius:8,border:"1px solid #e2e8f0",background:"#f8fafc"}}>📋 履歴</Link>}
          <AuthButton/>
        </div>
      </header>

      {isMobile&&<div style={{display:"flex",background:"#fff",borderBottom:"1px solid #e2e8f0",position:"sticky",top:56,zIndex:100}}>{[{id:"input",label:"📋 入力フォーム"},{id:"result",label:"🤖 診断レポート"}].map(tab=><button key={tab.id} onClick={()=>setActiveTab(tab.id as any)} style={{flex:1,padding:"14px 8px",border:"none",background:"transparent",cursor:"pointer",fontWeight:activeTab===tab.id?800:500,fontSize:13,color:activeTab===tab.id?"#16a34a":"#64748b",borderBottom:activeTab===tab.id?"3px solid #84cc16":"3px solid transparent"}}>{tab.label}</button>)}</div>}

      <div style={{maxWidth:1200,margin:"0 auto",padding:isMobile?"16px 12px":"24px 20px",display:isMobile?"block":"grid",gridTemplateColumns:"1fr 1fr",gap:24,width:"100%",boxSizing:"border-box"}}>

        {showLeft&&<div style={{minWidth:0}}>
          {/* STEP 1 */}
          <SectionCard>
            <StepLabel number={1} title="基本スタイル"/>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div><FieldLabel>利き手</FieldLabel><ToggleGroup options={["右利き","左利き"]} value={handedness} onChange={v=>setHandedness(v as any)}/></div>
              <div><FieldLabel>フォアハンドストローク</FieldLabel><ToggleGroup options={["片手打ち","両手打ち"]} value={forehand} onChange={v=>setForehand(v as any)}/>{forehand==="両手打ち"&&<div style={{marginTop:10,padding:"12px 14px",borderRadius:12,background:"#f0fdf4",border:"1px solid #bbf7d0"}}><div style={{fontSize:11,fontWeight:700,color:"#15803d",marginBottom:8}}>↳ 両手フォアの握り方</div><ToggleGroup options={["順手（利き手が上）","逆手（非利き手が上）"]} value={forehandGrip} onChange={v=>setForehandGrip(v as any)}/></div>}</div>
              <div><FieldLabel>バックハンドストローク</FieldLabel><ToggleGroup options={["片手打ち","両手打ち"]} value={backhand} onChange={v=>setBackhand(v as any)}/></div>
              <div><FieldLabel>フォアハンドボレー</FieldLabel><ToggleGroup options={["片手打ち","両手打ち"]} value={foreVolley} onChange={v=>setForeVolley(v as any)}/></div>
              <div><FieldLabel>バックハンドボレー</FieldLabel><ToggleGroup options={["片手打ち","両手打ち"]} value={backVolley} onChange={v=>setBackVolley(v as any)}/></div>
            </div>
          </SectionCard>

          {/* STEP 2 */}
          <SectionCard>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14,gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:28,height:28,borderRadius:8,flexShrink:0,background:"linear-gradient(135deg,#84cc16,#22c55e)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:"#fff"}}>2</div><span style={{fontWeight:800,fontSize:15,color:"#0f172a"}}>STEP 2：グリップ写真</span></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:14}}>{GRIP_SLOTS.map(s=><GripUploader key={s.key} label={s.label} value={gripPhotos[s.key]??null} onChange={v=>setGripPhotos(p=>({...p,[s.key]:v}))}/>)}</div>
            <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#1d4ed8",fontWeight:500}}>
              📷 グリップ写真があるとより精度が上がります
            </div>
          </SectionCard>

          {/* STEP 3 */}
          <SectionCard>
            <StepLabel number={3} title="怪我・痛みの事前入力 ⚠️"/>
            <FieldLabel>痛みや違和感がある部位（複数選択可）</FieldLabel>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:14}}>{PAIN_AREAS.map(area=>{const checked=painAreas.includes(area);return<button key={area} onClick={()=>togglePain(area)} style={{padding:"10px 12px",borderRadius:10,cursor:"pointer",border:checked?"2px solid #ef4444":"2px solid #e2e8f0",background:checked?"#fef2f2":"#f8fafc",color:checked?"#991b1b":"#475569",fontWeight:checked?700:500,fontSize:12,textAlign:"left",display:"flex",alignItems:"center",gap:7}}><span style={{width:16,height:16,borderRadius:4,flexShrink:0,border:checked?"2px solid #ef4444":"2px solid #cbd5e1",background:checked?"#ef4444":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:900}}>{checked?"✓":""}</span>{area}</button>;})}</div>
            {hasPain?<div style={{background:"#fff5f5",border:"1px solid #fecaca",borderRadius:12,padding:"14px 16px",display:"flex",flexDirection:"column",gap:14}}><div style={{fontSize:12,fontWeight:700,color:"#991b1b"}}>各部位の痛みの度合い</div>{painAreas.map(area=><div key={area}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:600,color:"#7f1d1d",marginBottom:6}}><span>🔴 {area}</span><span style={{color:"#ef4444"}}>{PAIN_LEVEL_LABELS[painLevels[area]??2]}</span></div><input type="range" min={1} max={4} value={painLevels[area]??2} onChange={e=>setPainLevels(lv=>({...lv,[area]:Number(e.target.value)}))} style={{width:"100%",accentColor:"#ef4444"}}/><div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#fca5a5",marginTop:2}}><span>軽い違和感</span><span>激しい痛み</span></div></div>)}</div>:<div style={{padding:"10px 14px",borderRadius:10,background:"#f0fdf4",border:"1px solid #bbf7d0",fontSize:12,color:"#15803d",fontWeight:500}}>✅ 現在、痛み・違和感はありません</div>}
          </SectionCard>

          {/* STEP 4：プロ選手比較 */}
          <SectionCard>
            <StepLabel number={4} title="プロ選手と比較する（任意）"/>
            <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>選手を選ぶと、そのフォームと比較した診断が追加されます（任意）</div>
            <div style={{display:"flex",gap:6,marginBottom:10}}><span style={{fontSize:12,fontWeight:700,color:"#475569",padding:"6px 14px",borderRadius:99,background:"#f1f5f9"}}>🎾 男子</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              {PRO_PLAYERS_MEN.map(player=>{const selected=comparePlayer===player;return<button key={player} onClick={(e)=>{e.stopPropagation();setComparePlayer(selected?null:player);}} style={{padding:"10px 12px",borderRadius:12,cursor:"pointer",border:selected?"2px solid #84cc16":"2px solid #e2e8f0",background:selected?"#f0fdf4":"#f8fafc",display:"flex",alignItems:"center",gap:8,transition:"all 0.15s"}}><span style={{fontSize:16}}>{PLAYER_FLAGS[player]}</span><span style={{fontSize:11,fontWeight:selected?800:500,color:selected?"#16a34a":"#475569",textAlign:"left",lineHeight:1.3}}>{player}</span>{selected&&<span style={{marginLeft:"auto",fontSize:12,color:"#16a34a"}}>✓</span>}</button>;})}
            </div>
            <div style={{display:"flex",gap:6,marginBottom:10}}><span style={{fontSize:12,fontWeight:700,color:"#475569",padding:"6px 14px",borderRadius:99,background:"#f1f5f9"}}>🎾 女子</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              {PRO_PLAYERS_WOMEN.map(player=>{const selected=comparePlayer===player;return<button key={player} onClick={(e)=>{e.stopPropagation();setComparePlayer(selected?null:player);}} style={{padding:"10px 12px",borderRadius:12,cursor:"pointer",border:selected?"2px solid #84cc16":"2px solid #e2e8f0",background:selected?"#f0fdf4":"#f8fafc",display:"flex",alignItems:"center",gap:8,transition:"all 0.15s"}}><span style={{fontSize:16}}>{PLAYER_FLAGS[player]}</span><span style={{fontSize:11,fontWeight:selected?800:500,color:selected?"#16a34a":"#475569",textAlign:"left",lineHeight:1.3}}>{player}</span>{selected&&<span style={{marginLeft:"auto",fontSize:12,color:"#16a34a"}}>✓</span>}</button>;})}
            </div>
            {comparePlayer?<div style={{padding:"8px 12px",borderRadius:10,background:"#f0fdf4",border:"1px solid #bbf7d0",fontSize:12,color:"#15803d",fontWeight:600}}>✅ {comparePlayer}と比較して診断します</div>:<div style={{padding:"8px 12px",borderRadius:10,background:"#f8fafc",border:"1px solid #e2e8f0",fontSize:11,color:"#94a3b8"}}>選手を選ばない場合は通常診断のみ行います</div>}
          </SectionCard>

          {/* STEP 5：ショット選択 */}
          <SectionCard>
            <StepLabel number={5} title="診断したいショットを選択"/>
            <FieldLabel>ショットの種類</FieldLabel>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:14}}>
              {SHOT_CATEGORIES.map(cat=>{const selected=shotCategory===cat;return<button key={cat} onClick={(e)=>{e.stopPropagation();setShotCategory(selected?null:cat);setShotType(null);}} style={{padding:"10px 12px",borderRadius:10,cursor:"pointer",border:selected?"2px solid #84cc16":"2px solid #e2e8f0",background:selected?"#f0fdf4":"#f8fafc",color:selected?"#16a34a":"#475569",fontWeight:selected?700:500,fontSize:12,textAlign:"center"}}>{cat}</button>;})}
            </div>
            {shotCategory&&<div style={{marginBottom:12}}><FieldLabel>球種・スタイル</FieldLabel><div style={{display:"flex",flexWrap:"wrap",gap:7}}>{SHOT_MENU[shotCategory].map(type=>{const selected=shotType===type;return<button key={type} onClick={(e)=>{e.stopPropagation();setShotType(selected?null:type);}} style={{padding:"8px 14px",borderRadius:99,cursor:"pointer",border:selected?"2px solid #84cc16":"2px solid #e2e8f0",background:selected?"#f0fdf4":"#f8fafc",color:selected?"#16a34a":"#475569",fontWeight:selected?700:500,fontSize:12}}>{type}</button>;})}</div></div>}
            {shotCategory&&shotType?<div style={{padding:"8px 12px",borderRadius:10,background:"#f0fdf4",border:"1px solid #bbf7d0",fontSize:12,color:"#15803d",fontWeight:600}}>✅ {shotCategory}（{shotType}）を診断します</div>:<div style={{padding:"8px 12px",borderRadius:10,background:"#fff7ed",border:"1px solid #fed7aa",fontSize:11,color:"#c2410c",fontWeight:500}}>⚠️ ショットと球種を選択すると診断精度が大幅に上がります</div>}
          </SectionCard>

          {/* STEP 6：動画アップロード */}
          <SectionCard>
            <StepLabel number={6} title="スイング動画をアップロード"/>
            <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#1d4ed8",marginBottom:12,fontWeight:500}}>💡 <strong>5秒以内</strong>の動画で最高精度になります。1ショットだけを撮影してください。</div>
            {videoDuration!==null&&videoDuration<=5&&<div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#15803d",fontWeight:600,marginBottom:8}}>✅ {Math.round(videoDuration)}秒の動画 - 最高精度で診断できます！</div>}
            {videoDuration!==null&&videoDuration>5&&videoDuration<=10&&<div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#854d0e",fontWeight:600,marginBottom:8}}>⚠️ {Math.round(videoDuration)}秒の動画 - 5秒以内に比べると精度がやや落ちる場合があります</div>}
            {videoDuration!==null&&videoDuration>10&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#991b1b",fontWeight:600,marginBottom:8}}>❌ {Math.round(videoDuration)}秒 - 長すぎます。5秒以内で撮り直すことを強く推奨します。</div>}
            <div onDragOver={e=>e.preventDefault()} onDrop={handleDrop} onClick={()=>fileRef.current?.click()} style={{border:videoFile?"2px solid #84cc16":"2px dashed #cbd5e1",borderRadius:14,padding:"28px 16px",marginBottom:16,background:videoFile?"#f0fdf4":"#f8fafc",display:"flex",flexDirection:"column",alignItems:"center",gap:8,cursor:"pointer",textAlign:"center"}}>
              {videoFile?<><span style={{fontSize:36}}>🎬</span><span style={{fontSize:13,fontWeight:700,color:"#16a34a",wordBreak:"break-all"}}>{videoFile.name}</span><span style={{fontSize:11,color:"#84cc16"}}>✓ アップロード完了</span></>:<><span style={{fontSize:42}}>📹</span><span style={{fontSize:13,fontWeight:700,color:"#475569"}}>{isMobile?"タップして動画を選択":"動画をドラッグ＆ドロップ"}<br/><span style={{color:"#84cc16"}}>{isMobile?"":"または クリックして選択"}</span></span><span style={{fontSize:11,color:"#94a3b8"}}>MP4 / MOV / AVI • 最大500MB</span></>}
            </div>
            <input ref={fileRef} type="file" accept="video/*,video/quicktime,.mov,.mp4" style={{display:"none"}} onChange={handleDrop as any}/>
            {videoErr&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#991b1b",marginBottom:12,fontWeight:600,lineHeight:1.7}}>⚠️ この動画はブラウザで再生できませんでした（iPhoneのHEVC形式などの可能性）。<br/><strong>MP4形式</strong>で撮影・変換してお試しください。iPhoneは「設定 ▸ カメラ ▸ フォーマット ▸ <strong>互換性優先</strong>」にすると改善します。</div>}
            <button onClick={handleStart} disabled={status==="loading"} style={{width:"100%",padding:"17px",borderRadius:14,background:status==="loading"?"#e2e8f0":"linear-gradient(90deg,#84cc16,#22c55e)",color:status==="loading"?"#94a3b8":"#fff",fontWeight:900,fontSize:16,border:"none",cursor:status==="loading"?"not-allowed":"pointer",boxShadow:status==="loading"?"none":"0 4px 20px rgba(132,204,22,0.4)",letterSpacing:"0.03em"}}>
              {status==="loading"?"⏳ AI解析中...":"🤖 AI精密診断を開始する"}
            </button>
            {usage && <div style={{textAlign:"center",marginTop:10,fontSize:12,fontWeight:700,color:usage.plan==="unlimited"?"#16a34a":(usage.remaining===0?"#ef4444":"#475569")}}>{usage.plan==="unlimited"?"✨ 無制限でご利用いただけます":usage.plan==="premium"?`今月あと ${usage.remaining} 回です（月${usage.limit}回）`:`無料診断 残り ${usage.remaining} 回です（全${usage.limit}回）`}</div>}
          </SectionCard>
        </div>}

        {showRight&&<div style={{minWidth:0}}>
          {/* 動画プレビュー */}
          <div style={{background:"#0f172a",borderRadius:20,overflow:"hidden",position:"relative",marginBottom:16,aspectRatio:"16/9",display:"flex",alignItems:"center",justifyContent:"center"}}>
            {videoUrl?<><video ref={videoRef} src={videoUrl} onError={()=>setVideoErr(true)} onLoadedData={()=>setVideoErr(false)} style={{width:"100%",height:"100%",objectFit:"contain",display:"block"}} controls muted playsInline/><PoseDetector ref={poseRef} videoRef={videoRef} active={poseActive} onMetrics={setPoseMetrics}/></>:<div style={{textAlign:"center",color:"#475569",padding:16}}><svg width="160" height="100" viewBox="0 0 160 100" style={{display:"block",margin:"0 auto 12px"}}><circle cx="80" cy="12" r="8" fill="#84cc16" opacity="0.7"/><line x1="80" y1="20" x2="80" y2="48" stroke="#84cc16" strokeWidth="2.5"/><line x1="80" y1="34" x2="48" y2="58" stroke="#84cc16" strokeWidth="2.5"/><line x1="80" y1="34" x2="112" y2="58" stroke="#84cc16" strokeWidth="2.5"/><line x1="80" y1="48" x2="62" y2="88" stroke="#84cc16" strokeWidth="2.5"/><line x1="80" y1="48" x2="98" y2="88" stroke="#84cc16" strokeWidth="2.5"/>{([[48,58],[112,58],[62,88],[98,88],[80,48]] as [number,number][]).map(([x,y],i)=><circle key={i} cx={x} cy={y} r={4} fill="#22c55e" opacity="0.8"/>)}</svg><div style={{fontSize:13,fontWeight:700}}>骨格ワイヤーフレーム</div><div style={{fontSize:11,marginTop:4,color:"#334155"}}>動画をアップロードすると関節ポイントが表示されます</div></div>}
            <div style={{position:"absolute",top:10,left:10,background:"rgba(132,204,22,0.15)",WebkitBackdropFilter:"blur(8px)",backdropFilter:"blur(8px)",border:"1px solid rgba(132,204,22,0.4)",borderRadius:8,padding:"4px 10px",fontSize:10,color:"#84cc16",fontWeight:700}}>{poseActive?"🔴 LIVE 骨格検出中":"📡 MediaPipe Pose Detection"}</div>
            {poseMetrics&&poseActive&&<div style={{position:"absolute",bottom:10,right:10,background:"rgba(15,23,42,0.85)",borderRadius:10,padding:"8px 12px",fontSize:10,color:"#fff",lineHeight:1.8}}><div>右肘：{poseMetrics.rightElbowAngle}°</div><div>左肘：{poseMetrics.leftElbowAngle}°</div><div>右膝：{poseMetrics.rightKneeAngle}°</div></div>}
          </div>

          {status==="idle"&&<SectionCard style={{textAlign:"center",padding:"40px 24px"}}><div style={{fontSize:44,marginBottom:12}}>🎾</div><div style={{fontSize:15,fontWeight:700,color:"#64748b"}}>診断レポートがここに表示されます</div><div style={{fontSize:12,color:"#94a3b8",marginTop:6,lineHeight:1.6}}>{isMobile?"「入力フォーム」タブで入力して診断を開始してください":"左のフォームに入力して「AI精密診断を開始する」を押してください"}</div></SectionCard>}

          {status==="loading"&&<LoadingOverlay hasFrames={hasFrames}/>}

          {status==="error"&&<SectionCard style={{textAlign:"center",padding:"32px 24px"}}><div style={{fontSize:40,marginBottom:12}}>⚠️</div><div style={{fontSize:14,fontWeight:700,color:"#ef4444",marginBottom:8}}>診断中にエラーが発生しました</div><div style={{fontSize:12,color:"#64748b",marginBottom:16}}>{errMsg}</div><button onClick={()=>setStatus("idle")} style={{padding:"10px 24px",borderRadius:10,background:"#f1f5f9",border:"1px solid #e2e8f0",color:"#475569",fontWeight:700,cursor:"pointer"}}>もう一度試す</button></SectionCard>}

          {status==="done"&&report&&<div>
            {/* KPIバー（無料・Premium共通） */}
            <div style={{background:"linear-gradient(135deg,#0f172a,#1e293b)",borderRadius:20,padding:"20px 16px",marginBottom:16,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[{label:"フォームスコア",value:`${report.formScore}`,unit:"pt",color:"#84cc16"},{label:"怪我リスク",value:report.injuryRisk,unit:"",color:hasPain?"#f59e0b":"#22c55e"},{label:"スイング速度",value:`${report.swingSpeed}`,unit:"km/h",color:"#38bdf8"}].map(k=><div key={k.label} style={{textAlign:"center"}}><div style={{fontSize:isMobile?18:22,fontWeight:900,color:k.color,lineHeight:1}}>{k.value}<span style={{fontSize:10}}>{k.unit}</span></div><div style={{fontSize:9,color:"#94a3b8",marginTop:4}}>{k.label}</div></div>)}
            </div>

            <div style={{fontSize:10,color:"#94a3b8",textAlign:"center",marginTop:-8,marginBottom:16}}>※ スコア・速度・角度などの数値はAIによる推定値です</div>

            {/* スコア詳細（無料） */}
            <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:16,padding:"16px 18px",marginBottom:12}}>
              <div style={{fontWeight:800,fontSize:14,color:"#0f172a",marginBottom:12}}>📊 スコア詳細（AI推定）</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <ScoreBar label="フォームスコア総合" value={report.formScore} color="#84cc16"/>
                <ScoreBar label="フットワーク安定度" value={report.footworkScore} color="#22c55e"/>
                <ScoreBar label="インパクト時の肘角度" value={report.elbowAngle} max={180} color="#38bdf8" unit="°"/>
              </div>
              {shotCategory&&<div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:"#f0fdf4",fontSize:11,color:"#15803d",fontWeight:600}}>🎾 {shotCategory}{shotType?`（${shotType}）`:""}の診断結果</div>}
            </div>

            {/* 入力サマリー */}
            <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:14,padding:"12px 14px",marginBottom:12,display:"flex",flexWrap:"wrap",gap:6}}>
              {[handedness,`フォア：${forehand}${forehand==="両手打ち"?`（${forehandGrip}）`:""}`,`バック：${backhand}`].map(t=><span key={t} style={{fontSize:11,padding:"4px 10px",borderRadius:99,background:"#e0f2fe",color:"#0369a1",fontWeight:700}}>{t}</span>)}
              {painAreas.map(a=><span key={a} style={{fontSize:11,padding:"4px 10px",borderRadius:99,background:"#fee2e2",color:"#991b1b",fontWeight:700}}>🔴 {a}：{PAIN_LEVEL_LABELS[painLevels[a]??2]}</span>)}
            </div>

            {/* 詳細診断レポート：Premiumは全文＋全セクション、無料は冒頭＋CTA */}
            <div style={{background:"#fff",border:"2px solid #84cc16",borderRadius:20,padding:"20px 18px",marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div style={{fontWeight:800,fontSize:15,color:"#0f172a"}}>📋 詳細診断レポート</div>
                {isPremium
                  ? <span style={{fontSize:11,padding:"4px 12px",borderRadius:99,background:"#dcfce7",color:"#16a34a",fontWeight:700}}>✓ Premium</span>
                  : <span style={{fontSize:11,padding:"4px 12px",borderRadius:99,background:"#fef3c7",color:"#d97706",fontWeight:700}}>続きはPremium</span>}
              </div>
              {isPremium ? (
                [{t:"🎾 フォーム分析",x:report.sections.formAnalysis},{t:"🎯 打点チェック",x:report.sections.impactCheck},{t:"👟 フットワーク",x:report.sections.footwork},{t:"🩹 怪我ケア・予防",x:report.sections.injuryCare}]
                  .filter(s=>s.x&&s.x.trim())
                  .map(s=>(
                    <div key={s.t} style={{marginBottom:14}}>
                      <div style={{fontWeight:800,fontSize:13,color:"#16a34a",marginBottom:6}}>{s.t}</div>
                      <div style={{background:"#f8fafc",borderRadius:10,padding:"12px 14px",fontSize:13,color:"#1e293b",lineHeight:1.9,whiteSpace:"pre-wrap"}}>{s.x}</div>
                    </div>
                  ))
              ) : (<>
                <div style={{background:"#f8fafc",borderRadius:10,padding:"12px 14px",fontSize:13,color:"#1e293b",lineHeight:1.9,marginBottom:14,whiteSpace:"pre-wrap",display:"-webkit-box",WebkitLineClamp:5,WebkitBoxOrient:"vertical",overflow:"hidden"}}>
                  {report.sections.formAnalysis}
                </div>
                <button onClick={goPremium} style={{width:"100%",padding:"14px",borderRadius:12,background:"linear-gradient(90deg,#84cc16,#22c55e)",color:"#fff",fontWeight:900,fontSize:14,border:"none",cursor:"pointer",boxShadow:"0 4px 16px rgba(132,204,22,0.4)"}}>🔒 Premiumで全文＋打点・フットワーク・怪我ケアを見る</button>
              </>)}
            </div>
            {/* Premium CTA（無料会員のみ表示） */}
            {!isPremium && <div style={{background:"linear-gradient(135deg,#1e293b,#0f172a)",borderRadius:20,padding:"24px 20px",border:"1px solid rgba(132,204,22,0.5)",display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
              <div style={{fontSize:isMobile?17:19,fontWeight:900,color:"#fff",textAlign:"center",lineHeight:1.5}}>🔑 プレミアムプランで<br/><span style={{color:"#84cc16"}}>完全AI診断</span>を解放する</div>
              <div style={{display:"flex",flexDirection:"column",gap:7,width:"100%"}}>{["✅ 詳細フォーム解析アドバイス","✅ 打点・フットワーク改善提案","✅ 怪我に合わせた代替フォーム提案","✅ プロ選手との詳細比較"].map(f=><div key={f} style={{fontSize:12,color:"#94a3b8"}}>{f}</div>)}</div>
              <button onClick={goPremium} style={{width:"100%",padding:"16px",borderRadius:12,background:"linear-gradient(90deg,#84cc16,#22c55e)",color:"#fff",fontWeight:900,fontSize:15,border:"none",cursor:"pointer",boxShadow:"0 4px 20px rgba(132,204,22,0.4)"}}>Stripeで今すぐ登録 ¥999/月</button>
            </div>}
          </div>}
        </div>}
      </div>
      <footer style={{maxWidth:1200,margin:"0 auto",padding:"4px 20px 16px",textAlign:"right"}}>
        <div style={{fontSize:11,color:"#cbd5e1"}}>
          <Link href="/terms" style={{color:"#cbd5e1",textDecoration:"none"}}>利用規約・プライバシーポリシー</Link>
          <span style={{margin:"0 8px"}}>｜</span>
          <Link href="/contact" style={{color:"#cbd5e1",textDecoration:"none"}}>お問い合わせ</Link>
        </div>
      </footer>
    </div>
  );
}






