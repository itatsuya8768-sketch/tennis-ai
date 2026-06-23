"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import AuthButton from "@/components/AuthButton";
import PoseDetector, { type PoseDetectorHandle, type PoseMetrics, type PoseFrame } from "@/components/PoseDetector";
import ScoreBar from "@/components/ScoreBar";
import ReportCard from "@/components/ReportCard";
import AdSlot from "@/components/AdSlot";
import type { PlayerProfile, AIReport } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { findClosestBallContactFrame } from "@/lib/ballDetect";
import { scanVideoForObjects, scoreImpactFrames, captureImpactWindow, computeBodyMetricsAtImpact } from "@/lib/impactDetect";

const PAIN_AREAS = ["右肩","左肩","右肘（テニス肘）","左肘","右手首","左手首","腰（腰痛）","右膝","左膝","右足首","左足首"];
const PAIN_LEVEL_LABELS = ["","軽い違和感","やや痛む","かなり痛む","激しい痛み"];
const GRIP_SLOTS = [{key:"fore",label:"フォア"},{key:"foreSlice",label:"フォアスライス"},{key:"back",label:"バック"},{key:"backSlice",label:"バックスライス"},{key:"serve",label:"サーブ"},{key:"foreVolley",label:"フォアボレー"},{key:"backVolley",label:"バックボレー"}];
const PRO_PLAYERS_MEN = ["ロジャー・フェデラー","ノバク・ジョコビッチ","ラファエル・ナダル","アンディ・マレー","ヤニック・シナー","カルロス・アルカラス","錦織 圭"];
const PRO_PLAYERS_WOMEN = ["大坂なおみ","アリナ・サバレンカ","イガ・シフォンティク","エレーナ・リバキナ"];
const PLAYER_COUNTRY: Record<string,string> = {"ロジャー・フェデラー":"スイス","ノバク・ジョコビッチ":"セルビア","ラファエル・ナダル":"スペイン","アンディ・マレー":"イギリス","ヤニック・シナー":"イタリア","カルロス・アルカラス":"スペイン","錦織 圭":"日本","大坂なおみ":"日本","アリナ・サバレンカ":"ベラルーシ","イガ・シフォンティク":"ポーランド","エレーナ・リバキナ":"カザフスタン"};
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
  // フォロースルー区間＝コンタクト直後の短い時間だけに限定する。
  // （スイング後の構え直し・歩行などで腕を上げる動作を拾って誤判定しないため）
  const tContact = valid[ci].t;
  const win = valid.filter(g => g.t > tContact && g.t <= tContact + 0.7);
  if (win.length < 2) return { verdict:"unknown", aboveRatio:0, frames:valid.length };

  // フォロースルー中、手首が最も高く上がった点（画面yが最小）で肘との上下関係を見る
  let hi = win[0];
  for (const g of win){ if (g.wy < hi.wy) hi = g; }
  const forearm = Math.hypot(hi.wx-hi.ex, hi.wy-hi.ey) || 1;
  const aboveRatio = (hi.ey - hi.wy) / forearm; // 画面yは下向き正なので、手首が肘より上だと正
  // スムーズに振り抜けた良いフォロースルーは手首が肘よりはっきり上（手が肩〜頭の高さ）に来る。
  // 手首が肘より少し上(〜0.4)止まりは、振りが詰まった「低いフォロースルー」とみなす。
  let verdict: "high"|"low"|"unknown" = "unknown";
  if (aboveRatio > 0.9) verdict = "high";
  else if (aboveRatio < 0.4) verdict = "low";
  return { verdict, aboveRatio:Math.round(aboveRatio*100)/100, frames:valid.length };
}

function useWindowWidth() {
  const [w,setW]=useState(1200);
  useEffect(()=>{setW(window.innerWidth);const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
  return w;
}

function ToggleGroup({options,value,onChange}:{options:string[];value:string;onChange:(v:string)=>void}) {
  return <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{options.map(opt=><button key={opt} onClick={()=>onChange(opt)} style={{padding:"9px 16px",borderRadius:8,fontWeight:700,fontSize:13,border:value===opt?"2px solid #3ddc97":"2px solid #2a2d33",background:value===opt?"rgba(61,220,151,0.12)":"#1c1f24",color:value===opt?"#3ddc97":"#f5f6f7",cursor:"pointer"}}>{opt}</button>)}</div>;
}

function SectionCard({children,style={}}:{children:React.ReactNode;style?:React.CSSProperties}) {
  return <div style={{background:"#1c1f24",borderRadius:20,border:"1px solid #2a2d33",padding:"20px 18px",marginBottom:16,...style}}>{children}</div>;
}

function StepLabel({number,title}:{number:number;title:string}) {
  return <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}><div style={{width:28,height:28,borderRadius:8,flexShrink:0,background:"linear-gradient(135deg,#3ddc97,#2bc47f)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:"#fff"}}>{number}</div><span style={{fontWeight:800,fontSize:15,color:"#f5f6f7"}}>STEP {number}：{title}</span></div>;
}

function FieldLabel({children}:{children:React.ReactNode}) {
  return <div style={{fontSize:12,fontWeight:700,color:"#aeb2b8",marginBottom:8}}>{children}</div>;
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
  return <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}><div onClick={()=>ref.current?.click()} style={{width:64,height:64,borderRadius:12,border:value?"2px solid #3ddc97":"2px dashed #3a3d44",background:value?"transparent":"#1c1f24",cursor:"pointer",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>{value?<img src={value} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:20}}>📷</span>}</div><input ref={ref} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)handle(f);}}/><span style={{fontSize:10,color:"#aeb2b8",fontWeight:700,textAlign:"center"}}>{label}</span></div>;
}

function LoadingOverlay({hasFrames,showAd}:{hasFrames:boolean;showAd:boolean}) {
  const [step,setStep]=useState(0);
  const steps=hasFrames?["🎬 動画を解析中...","🦴 骨格を検出中...","📐 関節角度・打点を計測中...","🔍 フォームを詳細解析中...","📋 診断レポートを生成中..."]:["🦴 骨格を検出中...","📐 関節角度を計算中...","🔍 フォームを解析中...","📋 診断レポートを生成中..."];
  useEffect(()=>{let i=0;const iv=setInterval(()=>{i++;setStep(i);if(i>=steps.length)clearInterval(iv);},900);return()=>clearInterval(iv);},[]);
  return <div style={{background:"#1c1f24",borderRadius:20,border:"1px solid #2a2d33",padding:"40px 24px",marginBottom:16,display:"flex",flexDirection:"column",alignItems:"center",gap:20}}><div style={{position:"relative",width:90,height:90}}><svg viewBox="0 0 90 90" style={{position:"absolute",inset:0,width:"100%",height:"100%"}}><circle cx="45" cy="45" r="40" fill="none" stroke="#2a2d33" strokeWidth="3"/><circle cx="45" cy="45" r="40" fill="none" stroke="#3ddc97" strokeWidth="4" strokeDasharray="251" strokeLinecap="round" style={{animation:"dashSpin 2s linear infinite",transformOrigin:"45px 45px"}}/></svg><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>🎾</div></div><div style={{width:"100%",maxWidth:300,display:"flex",flexDirection:"column",gap:10}}>{steps.map((s,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,opacity:i<=step?1:0.3,transition:"opacity 0.4s"}}><div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,background:i<step?"#3ddc97":i===step?"#7ee9b8":"#2a2d33",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:900}}>{i<step?"✓":i+1}</div><span style={{fontSize:13,color:i<=step?"#f5f6f7":"#8b8f97",fontWeight:500}}>{s}</span></div>)}</div>{showAd&&<AdSlot/>}</div>
}

function SiteBanner() {
  return <a href="https://tennis-site.vercel.app/" target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:12,textDecoration:"none",background:"rgba(61,220,151,0.1)",border:"1px solid rgba(61,220,151,0.3)",borderRadius:16,padding:"14px 16px",marginBottom:16}}>
    <div style={{fontSize:26,flexShrink:0}}>🎾</div>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontWeight:800,fontSize:13,color:"#3ddc97"}}>テニスのお役立ち情報サイト</div>
      <div style={{fontSize:11,color:"#aeb2b8",marginTop:2}}>おすすめ用品・上達情報をチェック →</div>
    </div>
    <div style={{fontSize:18,color:"#3ddc97",flexShrink:0}}>↗</div>
  </a>;
}

async function extractFrames(videoUrl:string,duration:number):Promise<{frames:string[];times:number[]}> {
  return new Promise((resolve)=>{
    const video=document.createElement("video");
    video.src=videoUrl;video.muted=true;video.playsInline=true;video.preload="metadata";
    const results:string[]=[];
    const resultTimes:number[]=[];
    const captureAt=(time:number):Promise<string|null>=>{
      return new Promise((res)=>{
        const tid=setTimeout(()=>res(null),4000);
        const draw=()=>{
          clearTimeout(tid);
          try{const c=document.createElement("canvas");c.width=560;c.height=315;const ctx=c.getContext("2d");if(!ctx){res(null);return;}ctx.drawImage(video,0,0,560,315);const b64=c.toDataURL("image/jpeg",0.6).split(",")[1];res(b64&&b64.length>500?b64:null);}catch{res(null);}
        };
        let drawn=false;
        const drawOnce=()=>{if(!drawn){drawn=true;draw();}};
        video.onseeked=()=>{
          // seeked直後はデコードが追いついておらず、1つ前のフレームが描画されることがある。
          // 対応ブラウザでは requestVideoFrameCallback で「実際に表示用に準備できた瞬間」まで待つが、
          // シーク後に発火しない実装もあるため、短いフォールバックで必ず描画を確定させる。
          const rvfc=(video as any).requestVideoFrameCallback;
          if(typeof rvfc==="function"){(video as any).requestVideoFrameCallback(drawOnce);}
          setTimeout(drawOnce,150);
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
        if(!dur||!isFinite(dur)||dur<0.1){resolve({frames:[],times:[]});return;}
        // 骨格トラッキングはスイングが速いほど（ブレが大きいほど）信頼度が落ちやすく、
        // 「動きが活発な区間」の検出がまさに接触の瞬間付近で外れるリスクがあるため、
        // 区間を絞らず動画全体（最大10秒）をシンプルに高密度で均等抽出する。
        const times:number[]=[];
        const scanRange=Math.min(dur,10);
        const start=Math.min(0.3,scanRange*0.05);const end=Math.max(start,scanRange-0.1);
        // 枚数を増やすほどリクエストのペイロードが大きくなり、サーバー側の上限に
        // 引っかかって失敗するリスクがあるため、上限を抑える（画質も下げて対応）。
        const FRAME_COUNT=Math.max(14,Math.min(18,Math.round(scanRange/0.3)));
        for(let i=0;i<FRAME_COUNT;i++){const t=start+(end-start)*(i/(FRAME_COUNT-1));times.push(Math.max(0,Math.min(t,dur-0.05)));}
        for(const t of times){const b64=await captureAt(t);if(b64){results.push(b64);resultTimes.push(t);}}
        console.log(`フレーム抽出結果: ${results.length}枚`);
        resolve({frames:results,times:resultTimes});
      }catch(e){console.warn("extractFrames:",e);resolve({frames:[],times:[]});}
    };
    // フレーム数を増やした分、全体の安全タイムアウトも枚数に応じて延ばす
    // （1枚あたり最大4秒・全枚数を捌くのに必要な時間＋余裕を確保）。
    run();setTimeout(()=>resolve({frames:results,times:resultTimes}),90000);
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
  const [debugFrames,setDebugFrames]=useState<string[]>([]); // AIに送った実際のフレーム（確認用）
  const [debugBestIndex,setDebugBestIndex]=useState<number|null>(null); // ボール検出で選ばれたインデックス
  const [debugBallStatus,setDebugBallStatus]=useState<string>(""); // ボール検出の状況（画面表示用）
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
  // サイト訪問を記録（1セッション1回のみ）
  useEffect(()=>{try{if(!sessionStorage.getItem("visited")){sessionStorage.setItem("visited","1");fetch("/api/track-visit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({path:"/"})}).catch(()=>{});}}catch{}},[]);

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
    let series:PoseFrame[]=[];
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
      try{
        series=poseRef.current?.getSeries?.()??[];
        takeback=analyzeTakeback(series,handedness);
        followThrough=analyzeFollowThrough(series,handedness);
        console.log("[takeback]",takeback,"[followThrough]",followThrough,"series",series.length);
      }catch(e:any){console.warn("pose analysis error",e);}
    }
    let frameTimes:number[]=[];
    if(videoUrl){try{const ex=await extractFrames(videoUrl,videoDuration??0);frames=ex.frames;frameTimes=ex.times;}catch(e){console.warn("extractFrames error",e);}}
    setDebugFrames(frames);setDebugBestIndex(null);
    // ── インパクト検出パイプライン（動画→インパクト検出→打点位置推定） ──
    // 既存の「ボール×手首の最近接フレーム」方式から、person/ball/racketを実フレームレートで
    // 走査し、ball-racket距離＋ボール進行方向の反転を合成スコア化する方式に発展させたもの。
    // iPhone Chromeで深刻な不具合（WebGL競合・ペイロード超過）を起こした経緯があるため、
    // 十分なテストが済むまでは管理者アカウント（無制限プラン）のみに限定する。
    const IMPACT_DETECT_ENABLED=usage?.plan==="unlimited";
    let impactWindowFrames:string[]=[];
    let impactMetrics:{heightRatio:number|null;depthRatio:number|null;elbowAngleDeg:number|null}|null=null;
    if(IMPACT_DETECT_ENABLED&&videoUrl&&series.length>0){
      // MediaPipeのGLコンテキストを解放してから検出する（GPUリソースの競合防止）。
      // 骨格データ（series）は既に取得済みなので、ここで閉じても支障はない。
      try{await poseRef.current?.closePose?.();}catch{}
      setDebugBallStatus("インパクト検出中…");
      try{
        const detected=await Promise.race([
          scanVideoForObjects(videoUrl,{maxDurationSec:Math.min(videoDuration??8,8),everyNthFrame:2}),
          new Promise<[]>(res=>setTimeout(()=>res([]),35000)),
        ]);
        const impact=scoreImpactFrames(detected);
        if(impact){
          impactWindowFrames=await captureImpactWindow(videoUrl,impact.time,[-0.17,-0.08,0,0.08,0.17]);
          const m=computeBodyMetricsAtImpact(series,impact.time,handedness);
          impactMetrics={heightRatio:m.heightRatio,depthRatio:m.depthRatio,elbowAngleDeg:m.elbowAngleDeg};
          setDebugBallStatus(`成功（インパクト候補 t=${impact.time.toFixed(2)}s, score=${impact.score.toFixed(2)}, 検出フレーム数=${detected.length}）`);
        }else{
          setDebugBallStatus(`失敗：インパクト候補なし（検出フレーム数=${detected.length}）`);
        }
      }catch(e){console.warn("impact detect error",e);setDebugBallStatus(`失敗：エラー（${e instanceof Error?e.message:String(e)}）`);}
    }
    setDebugFrames(impactWindowFrames.length>0?impactWindowFrames:frames);
    let bestContactFrameIndex:number|null=null; // 旧方式（互換のため残置。新方式が有効な間は使わない）
    try{
      const profile:PlayerProfile={handedness,forehand,forehandGrip:forehand==="両手打ち"?forehandGrip:undefined,backhand,foreVolley,backVolley,painAreas,painLevels:painLevels as Record<string,1|2|3|4>};
      const grips=GRIP_SLOTS.filter(s=>gripPhotos[s.key]).map(s=>({label:s.label,data:(gripPhotos[s.key]||"").split(",")[1]})).filter(g=>g.data);
      const sendFrames=impactWindowFrames.length>0?impactWindowFrames:frames;
      const res=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({profile,poseMetrics:metrics,takeback,followThrough,frames:sendFrames,bestContactFrameIndex,impactMetrics,grips,comparePlayer,shotCategory,shotType})});
      // サーバーがJSON以外（サイズ上限超過時のエラーページ等）を返すことがあるため、
      // res.json() で分かりにくいSyntaxErrorになる前に判定して分かりやすいメッセージにする。
      const contentType=res.headers.get("content-type")??"";
      if(!contentType.includes("application/json")){
        const text=await res.text().catch(()=>"");
        throw new Error(`サーバーから予期しない応答がありました（ステータス${res.status}）。動画のサイズが大きすぎる可能性があります。動画を短く・軽くして再度お試しください。${text?`\n詳細: ${text.slice(0,200)}`:""}`);
      }
      if(!res.ok){const d=await res.json();throw new Error(d.error??"診断に失敗しました");}
      const d=await res.json();setReport(d.report);setStatus("done");fetchUsage();
    }catch(e:any){
      const detail=`${e?.name??"Error"}: ${e?.message??String(e)}${e?.stack?`\n${String(e.stack).split("\n").slice(0,4).join("\n")}`:""}`;
      console.error("handleStart error:",e);
      setErrMsg(detail);setStatus("error");
    }
  };

  const goPremium=()=>{window.location.href="/premium";};

  const showLeft=!isMobile||activeTab==="input";
  const showRight=!isMobile||activeTab==="result";

  return (
    <div style={{minHeight:"100vh",background:"#0b0d10",fontFamily:"'Noto Sans JP','Hiragino Sans','Helvetica Neue',sans-serif",overflowX:"hidden"}}>
      <header style={{background:"rgba(20,22,26,0.92)",WebkitBackdropFilter:"blur(12px)",backdropFilter:"blur(12px)",borderBottom:"1px solid #2a2d33",padding:"0 16px",display:"flex",alignItems:"center",justifyContent:"space-between",height:56,position:"sticky",top:0,zIndex:200}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#3ddc97,#2bc47f)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🎾</div>
          <div><div style={{fontWeight:900,fontSize:13,color:"#f5f6f7",lineHeight:1.1}}>TennisAI365Coach</div><div style={{fontSize:9,color:"#3ddc97",fontWeight:700,letterSpacing:"0.1em"}}>FORM ANALYZER</div></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <Link href="/history" style={{fontSize:isMobile?11:12,fontWeight:700,color:"#aeb2b8",textDecoration:"none",padding:isMobile?"7px 8px":"7px 14px",borderRadius:8,border:"1px solid #2a2d33",background:"#1c1f24",whiteSpace:"nowrap"}}>📋 履歴</Link>
          {(isPremium||usage?.plan==="unlimited")&&<Link href="/weekly" style={{fontSize:isMobile?11:12,fontWeight:700,color:"#aeb2b8",textDecoration:"none",padding:isMobile?"7px 8px":"7px 14px",borderRadius:8,border:"1px solid #2a2d33",background:"#1c1f24",whiteSpace:"nowrap"}}>🗓️ {isMobile?"週次":"週次メニュー"}</Link>}
          {usage?.plan==="unlimited"&&<Link href="/stats" style={{fontSize:isMobile?11:12,fontWeight:700,color:"#aeb2b8",textDecoration:"none",padding:isMobile?"7px 8px":"7px 14px",borderRadius:8,border:"1px solid #2a2d33",background:"#1c1f24",whiteSpace:"nowrap"}}>📊 統計</Link>}
          <AuthButton/>
        </div>
      </header>

      {isMobile&&<div style={{display:"flex",background:"#1c1f24",borderBottom:"1px solid #2a2d33",position:"sticky",top:56,zIndex:100}}>{[{id:"input",label:"📋 入力フォーム"},{id:"result",label:"🤖 診断レポート"}].map(tab=><button key={tab.id} onClick={()=>setActiveTab(tab.id as any)} style={{flex:1,padding:"14px 8px",border:"none",background:"transparent",cursor:"pointer",fontWeight:activeTab===tab.id?800:500,fontSize:13,color:activeTab===tab.id?"#3ddc97":"#f5f6f7",borderBottom:activeTab===tab.id?"3px solid #3ddc97":"3px solid transparent"}}>{tab.label}</button>)}</div>}

      <div style={{maxWidth:1200,margin:"0 auto",padding:isMobile?"16px 12px":"24px 20px",display:isMobile?"block":"grid",gridTemplateColumns:"1fr 1fr",gap:24,width:"100%",boxSizing:"border-box"}}>

        {showLeft&&<div style={{minWidth:0}}>
          {/* STEP 1 */}
          <SectionCard>
            <StepLabel number={1} title="基本スタイル"/>
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div><FieldLabel>利き手</FieldLabel><ToggleGroup options={["右利き","左利き"]} value={handedness} onChange={v=>setHandedness(v as any)}/></div>
              <div><FieldLabel>フォアハンドストローク</FieldLabel><ToggleGroup options={["片手打ち","両手打ち"]} value={forehand} onChange={v=>setForehand(v as any)}/>{forehand==="両手打ち"&&<div style={{marginTop:10,padding:"12px 14px",borderRadius:12,background:"rgba(61,220,151,0.12)",border:"1px solid rgba(61,220,151,0.3)"}}><div style={{fontSize:11,fontWeight:700,color:"#3ddc97",marginBottom:8}}>↳ 両手フォアの握り方</div><ToggleGroup options={["順手（利き手が上）","逆手（非利き手が上）"]} value={forehandGrip} onChange={v=>setForehandGrip(v as any)}/></div>}</div>
              <div><FieldLabel>バックハンドストローク</FieldLabel><ToggleGroup options={["片手打ち","両手打ち"]} value={backhand} onChange={v=>setBackhand(v as any)}/></div>
              <div><FieldLabel>フォアハンドボレー</FieldLabel><ToggleGroup options={["片手打ち","両手打ち"]} value={foreVolley} onChange={v=>setForeVolley(v as any)}/></div>
              <div><FieldLabel>バックハンドボレー</FieldLabel><ToggleGroup options={["片手打ち","両手打ち"]} value={backVolley} onChange={v=>setBackVolley(v as any)}/></div>
            </div>
          </SectionCard>

          {/* STEP 2 */}
          <SectionCard>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14,gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:28,height:28,borderRadius:8,flexShrink:0,background:"linear-gradient(135deg,#3ddc97,#2bc47f)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:"#fff"}}>2</div><span style={{fontWeight:800,fontSize:15,color:"#f5f6f7"}}>STEP 2：グリップ写真</span></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:14}}>{GRIP_SLOTS.map(s=><GripUploader key={s.key} label={s.label} value={gripPhotos[s.key]??null} onChange={v=>setGripPhotos(p=>({...p,[s.key]:v}))}/>)}</div>
            <div style={{background:"rgba(78,161,255,0.12)",border:"1px solid rgba(78,161,255,0.3)",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#4ea1ff",fontWeight:500}}>
              📷 グリップ写真があるとより精度が上がります
            </div>
          </SectionCard>

          {/* STEP 3 */}
          <SectionCard>
            <StepLabel number={3} title="怪我・痛みの事前入力 ⚠️"/>
            <FieldLabel>痛みや違和感がある部位（複数選択可）</FieldLabel>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:14}}>{PAIN_AREAS.map(area=>{const checked=painAreas.includes(area);return<button key={area} onClick={()=>togglePain(area)} style={{padding:"10px 12px",borderRadius:10,cursor:"pointer",border:checked?"2px solid #ff6b6b":"2px solid #2a2d33",background:checked?"rgba(255,107,107,0.12)":"#1c1f24",color:checked?"#ff9b9b":"#f5f6f7",fontWeight:checked?700:500,fontSize:12,textAlign:"left",display:"flex",alignItems:"center",gap:7}}><span style={{width:16,height:16,borderRadius:4,flexShrink:0,border:checked?"2px solid #ff6b6b":"2px solid #3a3d44",background:checked?"#ff6b6b":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff",fontWeight:900}}>{checked?"✓":""}</span>{area}</button>;})}</div>
            {hasPain?<div style={{background:"rgba(255,107,107,0.12)",border:"1px solid #fecaca",borderRadius:12,padding:"14px 16px",display:"flex",flexDirection:"column",gap:14}}><div style={{fontSize:12,fontWeight:700,color:"#ff9b9b"}}>各部位の痛みの度合い</div>{painAreas.map(area=><div key={area}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:600,color:"#ff9b9b",marginBottom:6}}><span>🔴 {area}</span><span style={{color:"#ff6b6b"}}>{PAIN_LEVEL_LABELS[painLevels[area]??2]}</span></div><input type="range" min={1} max={4} value={painLevels[area]??2} onChange={e=>setPainLevels(lv=>({...lv,[area]:Number(e.target.value)}))} style={{width:"100%",accentColor:"#ff6b6b"}}/><div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#ff9b9b",marginTop:2}}><span>軽い違和感</span><span>激しい痛み</span></div></div>)}</div>:<div style={{padding:"10px 14px",borderRadius:10,background:"rgba(61,220,151,0.12)",border:"1px solid rgba(61,220,151,0.3)",fontSize:12,color:"#3ddc97",fontWeight:500}}>✅ 現在、痛み・違和感はありません</div>}
          </SectionCard>

          {/* STEP 4：プロ選手比較 */}
          <SectionCard>
            <StepLabel number={4} title="プロ選手と比較する（任意）"/>
            <div style={{fontSize:12,color:"#aeb2b8",marginBottom:12}}>選手を選ぶと、そのフォームと比較した診断が追加されます（任意）</div>
            <div style={{display:"flex",gap:6,marginBottom:10}}><span style={{fontSize:12,fontWeight:700,color:"#aeb2b8",padding:"6px 14px",borderRadius:99,background:"#1c1f24"}}>🎾 男子</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              {PRO_PLAYERS_MEN.map(player=>{const selected=comparePlayer===player;return<button key={player} onClick={(e)=>{e.stopPropagation();setComparePlayer(selected?null:player);}} style={{padding:"10px 12px",borderRadius:12,cursor:"pointer",border:selected?"2px solid #3ddc97":"2px solid #2a2d33",background:selected?"rgba(61,220,151,0.12)":"#1c1f24",display:"flex",alignItems:"center",gap:8,transition:"all 0.15s"}}><span style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2}}><span style={{fontSize:11,fontWeight:selected?800:500,color:selected?"#3ddc97":"#f5f6f7",textAlign:"left",lineHeight:1.3}}>{player}</span><span style={{fontSize:9,fontWeight:700,color:"#4ea1ff",background:"rgba(78,161,255,0.15)",padding:"1px 6px",borderRadius:99}}>{PLAYER_COUNTRY[player]}</span></span>{selected&&<span style={{marginLeft:"auto",fontSize:12,color:"#3ddc97"}}>✓</span>}</button>;})}
            </div>
            <div style={{display:"flex",gap:6,marginBottom:10}}><span style={{fontSize:12,fontWeight:700,color:"#aeb2b8",padding:"6px 14px",borderRadius:99,background:"#1c1f24"}}>🎾 女子</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              {PRO_PLAYERS_WOMEN.map(player=>{const selected=comparePlayer===player;return<button key={player} onClick={(e)=>{e.stopPropagation();setComparePlayer(selected?null:player);}} style={{padding:"10px 12px",borderRadius:12,cursor:"pointer",border:selected?"2px solid #3ddc97":"2px solid #2a2d33",background:selected?"rgba(61,220,151,0.12)":"#1c1f24",display:"flex",alignItems:"center",gap:8,transition:"all 0.15s"}}><span style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2}}><span style={{fontSize:11,fontWeight:selected?800:500,color:selected?"#3ddc97":"#f5f6f7",textAlign:"left",lineHeight:1.3}}>{player}</span><span style={{fontSize:9,fontWeight:700,color:"#4ea1ff",background:"rgba(78,161,255,0.15)",padding:"1px 6px",borderRadius:99}}>{PLAYER_COUNTRY[player]}</span></span>{selected&&<span style={{marginLeft:"auto",fontSize:12,color:"#3ddc97"}}>✓</span>}</button>;})}
            </div>
            {comparePlayer?<div style={{padding:"8px 12px",borderRadius:10,background:"rgba(61,220,151,0.12)",border:"1px solid rgba(61,220,151,0.3)",fontSize:12,color:"#3ddc97",fontWeight:600}}>✅ {comparePlayer}と比較して診断します</div>:<div style={{padding:"8px 12px",borderRadius:10,background:"#1c1f24",border:"1px solid #2a2d33",fontSize:11,color:"#8b8f97"}}>選手を選ばない場合は通常診断のみ行います</div>}
          </SectionCard>

          {/* STEP 5：ショット選択 */}
          <SectionCard>
            <StepLabel number={5} title="診断したいショットを選択"/>
            <FieldLabel>ショットの種類</FieldLabel>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:14}}>
              {SHOT_CATEGORIES.map(cat=>{const selected=shotCategory===cat;return<button key={cat} onClick={(e)=>{e.stopPropagation();setShotCategory(selected?null:cat);setShotType(null);}} style={{padding:"10px 12px",borderRadius:10,cursor:"pointer",border:selected?"2px solid #3ddc97":"2px solid #2a2d33",background:selected?"rgba(61,220,151,0.12)":"#1c1f24",color:selected?"#3ddc97":"#f5f6f7",fontWeight:selected?700:500,fontSize:12,textAlign:"center"}}>{cat}</button>;})}
            </div>
            {shotCategory&&<div style={{marginBottom:12}}><FieldLabel>球種・スタイル</FieldLabel><div style={{display:"flex",flexWrap:"wrap",gap:7}}>{SHOT_MENU[shotCategory].map(type=>{const selected=shotType===type;return<button key={type} onClick={(e)=>{e.stopPropagation();setShotType(selected?null:type);}} style={{padding:"8px 14px",borderRadius:99,cursor:"pointer",border:selected?"2px solid #3ddc97":"2px solid #2a2d33",background:selected?"rgba(61,220,151,0.12)":"#1c1f24",color:selected?"#3ddc97":"#f5f6f7",fontWeight:selected?700:500,fontSize:12}}>{type}</button>;})}</div></div>}
            {shotCategory&&shotType?<div style={{padding:"8px 12px",borderRadius:10,background:"rgba(61,220,151,0.12)",border:"1px solid rgba(61,220,151,0.3)",fontSize:12,color:"#3ddc97",fontWeight:600}}>✅ {shotCategory}（{shotType}）を診断します</div>:<div style={{padding:"8px 12px",borderRadius:10,background:"rgba(255,184,78,0.12)",border:"1px solid rgba(255,184,78,0.3)",fontSize:11,color:"#ffb84e",fontWeight:500}}>⚠️ ショットと球種を選択すると診断精度が大幅に上がります</div>}
          </SectionCard>

          {/* STEP 6：動画アップロード */}
          <SectionCard>
            <StepLabel number={6} title="スイング動画をアップロード"/>
            <div style={{background:"rgba(78,161,255,0.12)",border:"1px solid rgba(78,161,255,0.3)",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#4ea1ff",marginBottom:12,fontWeight:500}}>💡 <strong>5秒以内</strong>の動画で最高精度になります。1ショットだけを撮影してください。</div>
            {videoDuration!==null&&videoDuration<=5&&<div style={{background:"rgba(61,220,151,0.12)",border:"1px solid rgba(61,220,151,0.3)",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#3ddc97",fontWeight:600,marginBottom:8}}>✅ {Math.round(videoDuration)}秒の動画 - 最高精度で診断できます！</div>}
            {videoDuration!==null&&videoDuration>5&&videoDuration<=10&&<div style={{background:"rgba(255,184,78,0.12)",border:"1px solid rgba(255,184,78,0.4)",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#ffb84e",fontWeight:600,marginBottom:8}}>⚠️ {Math.round(videoDuration)}秒の動画 - 5秒以内に比べると精度がやや落ちる場合があります</div>}
            {videoDuration!==null&&videoDuration>10&&<div style={{background:"rgba(255,107,107,0.12)",border:"1px solid #fecaca",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#ff9b9b",fontWeight:600,marginBottom:8}}>❌ {Math.round(videoDuration)}秒 - 長すぎます。5秒以内で撮り直すことを強く推奨します。</div>}
            <div onDragOver={e=>e.preventDefault()} onDrop={handleDrop} onClick={()=>fileRef.current?.click()} style={{border:videoFile?"2px solid #3ddc97":"2px dashed #3a3d44",borderRadius:14,padding:"28px 16px",marginBottom:16,background:videoFile?"rgba(61,220,151,0.12)":"#1c1f24",display:"flex",flexDirection:"column",alignItems:"center",gap:8,cursor:"pointer",textAlign:"center"}}>
              {videoFile?<><span style={{fontSize:36}}>🎬</span><span style={{fontSize:13,fontWeight:700,color:"#3ddc97",wordBreak:"break-all"}}>{videoFile.name}</span><span style={{fontSize:11,color:"#3ddc97"}}>✓ アップロード完了</span></>:<><span style={{fontSize:42}}>📹</span><span style={{fontSize:13,fontWeight:700,color:"#aeb2b8"}}>{isMobile?"タップして動画を選択":"動画をドラッグ＆ドロップ"}<br/><span style={{color:"#3ddc97"}}>{isMobile?"":"または クリックして選択"}</span></span><span style={{fontSize:11,color:"#8b8f97"}}>MP4 / MOV / AVI • 最大500MB</span></>}
            </div>
            <input ref={fileRef} type="file" accept="video/*,video/quicktime,.mov,.mp4" style={{display:"none"}} onChange={handleDrop as any}/>
            {videoErr&&<div style={{background:"rgba(255,107,107,0.12)",border:"1px solid #fecaca",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#ff9b9b",marginBottom:12,fontWeight:600,lineHeight:1.7}}>⚠️ この動画はブラウザで再生できませんでした（iPhoneのHEVC形式などの可能性）。<br/><strong>MP4形式</strong>で撮影・変換してお試しください。iPhoneは「設定 ▸ カメラ ▸ フォーマット ▸ <strong>互換性優先</strong>」にすると改善します。</div>}
            <button onClick={handleStart} disabled={status==="loading"} style={{width:"100%",padding:"17px",borderRadius:14,background:status==="loading"?"#2a2d33":"linear-gradient(90deg,#3ddc97,#2bc47f)",color:status==="loading"?"#8b8f97":"#fff",fontWeight:900,fontSize:16,border:"none",cursor:status==="loading"?"not-allowed":"pointer",boxShadow:status==="loading"?"none":"0 4px 20px rgba(61,220,151,0.4)",letterSpacing:"0.03em"}}>
              {status==="loading"?"⏳ AI解析中...":"🤖 AI精密診断を開始する"}
            </button>
            {usage && <div style={{textAlign:"center",marginTop:10,fontSize:12,fontWeight:700,color:usage.plan==="unlimited"?"#3ddc97":(usage.remaining===0?"#ff6b6b":"#aeb2b8")}}>{usage.plan==="unlimited"?"✨ 無制限でご利用いただけます":usage.plan==="premium"?`今月あと ${usage.remaining} 回です（月${usage.limit}回）`:usage.remaining===0?`無料診断（全${usage.limit}回）を使い切りました。続けるにはPremiumへ`:`無料診断 残り ${usage.remaining} 回（全${usage.limit}回）`}</div>}
          </SectionCard>
          <SiteBanner/>
        </div>}

        {showRight&&<div style={{minWidth:0}}>
          {/* 動画プレビュー */}
          <div style={{background:"#0f172a",borderRadius:20,overflow:"hidden",position:"relative",marginBottom:16,aspectRatio:"16/9",display:"flex",alignItems:"center",justifyContent:"center"}}>
            {videoUrl?<><video ref={videoRef} src={videoUrl} onError={()=>setVideoErr(true)} onLoadedData={()=>setVideoErr(false)} style={{width:"100%",height:"100%",objectFit:"contain",display:"block"}} controls muted playsInline/><PoseDetector ref={poseRef} videoRef={videoRef} active={poseActive} onMetrics={setPoseMetrics}/></>:<div style={{textAlign:"center",color:"#aeb2b8",padding:16}}><svg width="160" height="100" viewBox="0 0 160 100" style={{display:"block",margin:"0 auto 12px"}}><circle cx="80" cy="12" r="8" fill="#3ddc97" opacity="0.7"/><line x1="80" y1="20" x2="80" y2="48" stroke="#3ddc97" strokeWidth="2.5"/><line x1="80" y1="34" x2="48" y2="58" stroke="#3ddc97" strokeWidth="2.5"/><line x1="80" y1="34" x2="112" y2="58" stroke="#3ddc97" strokeWidth="2.5"/><line x1="80" y1="48" x2="62" y2="88" stroke="#3ddc97" strokeWidth="2.5"/><line x1="80" y1="48" x2="98" y2="88" stroke="#3ddc97" strokeWidth="2.5"/>{([[48,58],[112,58],[62,88],[98,88],[80,48]] as [number,number][]).map(([x,y],i)=><circle key={i} cx={x} cy={y} r={4} fill="#2bc47f" opacity="0.8"/>)}</svg><div style={{fontSize:13,fontWeight:700}}>骨格ワイヤーフレーム</div><div style={{fontSize:11,marginTop:4,color:"#8b8f97"}}>動画をアップロードすると関節ポイントが表示されます</div></div>}
            <div style={{position:"absolute",top:10,left:10,background:"rgba(61,220,151,0.15)",WebkitBackdropFilter:"blur(8px)",backdropFilter:"blur(8px)",border:"1px solid rgba(61,220,151,0.4)",borderRadius:8,padding:"4px 10px",fontSize:10,color:"#3ddc97",fontWeight:700}}>{poseActive?"🔴 LIVE 骨格検出中":"📡 MediaPipe Pose Detection"}</div>
            {poseMetrics&&poseActive&&<div style={{position:"absolute",bottom:10,right:10,background:"rgba(15,23,42,0.85)",borderRadius:10,padding:"8px 12px",fontSize:10,color:"#fff",lineHeight:1.8}}><div>右肘：{poseMetrics.rightElbowAngle}°</div><div>左肘：{poseMetrics.leftElbowAngle}°</div><div>右膝：{poseMetrics.rightKneeAngle}°</div></div>}
          </div>

          {status==="idle"&&<SectionCard style={{textAlign:"center",padding:"40px 24px"}}><div style={{fontSize:44,marginBottom:12}}>🎾</div><div style={{fontSize:15,fontWeight:700,color:"#aeb2b8"}}>診断レポートがここに表示されます</div><div style={{fontSize:12,color:"#8b8f97",marginTop:6,lineHeight:1.6}}>{isMobile?"「入力フォーム」タブで入力して診断を開始してください":"左のフォームに入力して「AI精密診断を開始する」を押してください"}</div></SectionCard>}

          {status==="loading"&&<><LoadingOverlay hasFrames={hasFrames} showAd={!isPremium&&usage?.plan!=="unlimited"}/><SiteBanner/></>}

          {status==="error"&&<SectionCard style={{textAlign:"center",padding:"32px 24px"}}><div style={{fontSize:40,marginBottom:12}}>⚠️</div><div style={{fontSize:14,fontWeight:700,color:"#ff6b6b",marginBottom:8}}>診断中にエラーが発生しました</div><div style={{fontSize:11,color:"#aeb2b8",marginBottom:16,whiteSpace:"pre-wrap",textAlign:"left",fontFamily:"monospace",background:"#14161a",borderRadius:8,padding:"10px 12px",overflowX:"auto"}}>{errMsg}</div><button onClick={()=>setStatus("idle")} style={{padding:"10px 24px",borderRadius:10,background:"#1c1f24",border:"1px solid #2a2d33",color:"#aeb2b8",fontWeight:700,cursor:"pointer"}}>もう一度試す</button></SectionCard>}

          {status==="done"&&report&&<div>
            {/* デバッグ用：AIに実際に送ったフレームを確認できるようにする（一時的） */}
            {debugFrames.length>0&&<details style={{background:"#1c1f24",border:"1px solid #2a2d33",borderRadius:16,padding:"12px 16px",marginBottom:16}}>
              <summary style={{cursor:"pointer",fontSize:12,fontWeight:700,color:"#aeb2b8"}}>🔍 AIに送ったフレームを確認（{debugFrames.length}枚・デバッグ用）{debugBestIndex!==null&&" ※緑枠＝ボール検出によるインパクト候補"}</summary>
              {debugBallStatus&&<div style={{fontSize:11,color:"#4ea1ff",marginTop:8}}>ボール検出：{debugBallStatus}</div>}
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:10}}>
                {debugFrames.map((f,i)=><img key={i} src={`data:image/jpeg;base64,${f}`} alt={`frame ${i+1}`} style={{width:90,height:51,objectFit:"cover",borderRadius:6,border:i===debugBestIndex?"3px solid #3ddc97":"1px solid #2a2d33"}}/>)}
              </div>
            </details>}
            {/* KPIバー（無料・Premium共通） */}
            <div style={{background:"#1c1f24",border:"1px solid #2a2d33",borderRadius:20,padding:"20px 16px",marginBottom:16,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[{label:"フォームスコア",value:`${report.formScore}`,unit:"pt",color:"#3ddc97"},{label:"怪我リスク",value:report.injuryRisk,unit:"",color:hasPain?"#ffb84e":"#2bc47f"},{label:"スイング速度",value:`${report.swingSpeed}`,unit:"km/h",color:"#4ea1ff"}].map(k=><div key={k.label} style={{textAlign:"center"}}><div style={{fontSize:isMobile?18:22,fontWeight:900,color:k.color,lineHeight:1}}>{k.value}<span style={{fontSize:10}}>{k.unit}</span></div><div style={{fontSize:9,color:"#8b8f97",marginTop:4}}>{k.label}</div></div>)}
            </div>

            <div style={{fontSize:10,color:"#8b8f97",textAlign:"center",marginTop:-8,marginBottom:16}}>※ スコア・速度・角度などの数値はAIによる推定値です</div>

            {/* 前回との比較（同じショットの前回診断がある場合のみ） */}
            {report.progress && report.progress.trim() && <div style={{background:"linear-gradient(135deg,rgba(78,161,255,0.12),rgba(61,220,151,0.12))",border:"2px solid #93c5fd",borderRadius:16,padding:"16px 18px",marginBottom:12}}>
              <div style={{fontWeight:800,fontSize:14,color:"#4ea1ff",marginBottom:8}}>📈 前回との比較</div>
              <div style={{fontSize:13,color:"#f5f6f7",lineHeight:1.9,whiteSpace:"pre-wrap"}}>{report.progress}</div>
            </div>}

            {/* プロ選手類似率 */}
            {report.proSimilarity && report.proSimilarity.length>0 && <div style={{background:"#1c1f24",border:"1px solid #2a2d33",borderRadius:16,padding:"16px 18px",marginBottom:12}}>
              <div style={{fontWeight:800,fontSize:14,color:"#f5f6f7",marginBottom:4}}>🎾 プロ選手フォーム類似率</div>
              <div style={{fontSize:11,color:"#8b8f97",marginBottom:12}}>{shotCategory?`${shotCategory}${shotType?`（${shotType}）`:""}のフォーム特徴をAIが比較`:"フォーム特徴をAIが比較"}</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {report.proSimilarity.map((p,i)=>{
                  const barColor=i===0?"#3ddc97":i===1?"#4ea1ff":"#ffb84e";
                  return <div key={p.player} style={{display:"flex",flexDirection:"column",gap:5}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:600,color:"#aeb2b8"}}>
                      <span>{p.player}</span>
                      <span style={{color:barColor,fontWeight:800}}>{p.percent}%</span>
                    </div>
                    <div style={{height:7,borderRadius:99,background:"#2a2d33"}}><div style={{height:"100%",borderRadius:99,background:barColor,width:`${Math.min(p.percent,100)}%`,transition:"width 1.2s cubic-bezier(0.4,0,0.2,1)"}}/></div>
                  </div>;
                })}
              </div>
            </div>}

            {/* スコア詳細（無料） */}
            <div style={{background:"#1c1f24",border:"1px solid #2a2d33",borderRadius:16,padding:"16px 18px",marginBottom:12}}>
              <div style={{fontWeight:800,fontSize:14,color:"#f5f6f7",marginBottom:12}}>📊 スコア詳細（AI推定）</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <ScoreBar label="フォームスコア総合" value={report.formScore} color="#3ddc97"/>
                <ScoreBar label="フットワーク安定度" value={report.footworkScore} color="#2bc47f"/>
                <ScoreBar label="インパクト時の肘角度" value={report.elbowAngle} max={180} color="#4ea1ff" unit="°"/>
              </div>
              {shotCategory&&<div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:"rgba(61,220,151,0.12)",fontSize:11,color:"#3ddc97",fontWeight:600}}>🎾 {shotCategory}{shotType?`（${shotType}）`:""}の診断結果</div>}
            </div>

            {/* 入力サマリー */}
            <div style={{background:"#1c1f24",border:"1px solid #2a2d33",borderRadius:14,padding:"12px 14px",marginBottom:12,display:"flex",flexWrap:"wrap",gap:6}}>
              {[handedness,`フォア：${forehand}${forehand==="両手打ち"?`（${forehandGrip}）`:""}`,`バック：${backhand}`].map(t=><span key={t} style={{fontSize:11,padding:"4px 10px",borderRadius:99,background:"rgba(78,161,255,0.15)",color:"#4ea1ff",fontWeight:700}}>{t}</span>)}
              {painAreas.map(a=><span key={a} style={{fontSize:11,padding:"4px 10px",borderRadius:99,background:"rgba(255,107,107,0.15)",color:"#ff9b9b",fontWeight:700}}>🔴 {a}：{PAIN_LEVEL_LABELS[painLevels[a]??2]}</span>)}
            </div>

            {/* 詳細診断レポート：無料・Premiumとも全文＋全セクション（無料はお試し1回） */}
            <div style={{background:"#1c1f24",border:"2px solid #3ddc97",borderRadius:20,padding:"20px 18px",marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div style={{fontWeight:800,fontSize:15,color:"#f5f6f7"}}>📋 詳細診断レポート</div>
                {isPremium
                  ? <span style={{fontSize:11,padding:"4px 12px",borderRadius:99,background:"rgba(61,220,151,0.15)",color:"#3ddc97",fontWeight:700}}>✓ Premium</span>
                  : <span style={{fontSize:11,padding:"4px 12px",borderRadius:99,background:"rgba(255,184,78,0.15)",color:"#ffb84e",fontWeight:700}}>無料お試し</span>}
              </div>
              {[{t:"🎾 フォーム分析",x:report.sections.formAnalysis},{t:"🎯 打点チェック",x:report.sections.impactCheck},{t:"👟 フットワーク",x:report.sections.footwork},{t:"🩹 怪我ケア・予防",x:report.sections.injuryCare}]
                .filter(s=>s.x&&s.x.trim())
                .map(s=>(
                  <div key={s.t} style={{marginBottom:14}}>
                    <div style={{fontWeight:800,fontSize:13,color:"#3ddc97",marginBottom:6}}>{s.t}</div>
                    <div style={{background:"#1c1f24",borderRadius:10,padding:"12px 14px",fontSize:13,color:"#f5f6f7",lineHeight:1.9,whiteSpace:"pre-wrap"}}>{s.x}</div>
                  </div>
                ))}
            </div>
            {/* Premium CTA（無料会員のみ表示） */}
            {!isPremium && <div style={{background:"#1c1f24",borderRadius:20,padding:"24px 20px",border:"1px solid rgba(61,220,151,0.5)",display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
              <div style={{fontSize:isMobile?17:19,fontWeight:900,color:"#fff",textAlign:"center",lineHeight:1.5}}>🎾 もっと診断するなら<br/><span style={{color:"#3ddc97"}}>Premiumプラン</span></div>
              <div style={{display:"flex",flexDirection:"column",gap:7,width:"100%"}}>{["✅ 毎月30回まで診断し放題","✅ フォーム・打点・フットワーク・怪我ケアの全診断","✅ プロ選手との詳細比較","✅ いつでも解約OK"].map(f=><div key={f} style={{fontSize:12,color:"#8b8f97"}}>{f}</div>)}</div>
              <button onClick={goPremium} style={{width:"100%",padding:"16px",borderRadius:12,background:"linear-gradient(90deg,#3ddc97,#2bc47f)",color:"#fff",fontWeight:900,fontSize:15,border:"none",cursor:"pointer",boxShadow:"0 4px 20px rgba(61,220,151,0.4)"}}>Stripeで今すぐ登録 ¥999/月</button>
            </div>}
          </div>}
        </div>}
      </div>
      <footer style={{maxWidth:1200,margin:"0 auto",padding:"4px 20px 16px",textAlign:"right"}}>
        <div style={{fontSize:11,color:"#3a3d44"}}>
          <Link href="/terms" style={{color:"#3a3d44",textDecoration:"none"}}>利用規約・プライバシーポリシー</Link>
          <span style={{margin:"0 8px"}}>｜</span>
          <Link href="/contact" style={{color:"#3a3d44",textDecoration:"none"}}>お問い合わせ</Link>
        </div>
      </footer>
    </div>
  );
}






