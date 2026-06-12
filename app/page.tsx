"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import AuthButton from "@/components/AuthButton";
import PoseDetector, { type PoseDetectorHandle, type PoseMetrics } from "@/components/PoseDetector";
import ScoreBar from "@/components/ScoreBar";
import ReportCard from "@/components/ReportCard";
import type { PlayerProfile, AIReport } from "@/types";

const PAIN_AREAS = ["右肩","左肩","右肘（テニス肘）","左肘","右手首","左手首","腰（腰痛）","右膝","左膝","右足首","左足首"];
const PAIN_LEVEL_LABELS = ["","軽い違和感","やや痛む","かなり痛む","激しい痛み"];
const GRIP_SLOTS = [{key:"fore",label:"フォア"},{key:"foreSlice",label:"フォアスライス"},{key:"back",label:"バック"},{key:"backSlice",label:"バックスライス"},{key:"serve",label:"サーブ"},{key:"foreVolley",label:"フォアボレー"},{key:"backVolley",label:"バックボレー"}];
const PRO_PLAYERS_MEN = ["ロジャー・フェデラー","ノバク・ジョコビッチ","ラファエル・ナダル","アンディ・マレー","ヤニック・シナー","カルロス・アルカラス","錦織 圭"];
const PRO_PLAYERS_WOMEN = ["大坂なおみ","アリナ・サバレンカ","イガ・シフォンティク","エレーナ・リバキナ"];
const PLAYER_FLAGS: Record<string,string> = {"ロジャー・フェデラー":"🇨🇭","ノバク・ジョコビッチ":"🇷🇸","ラファエル・ナダル":"🇪🇸","アンディ・マレー":"🇬🇧","ヤニック・シナー":"🇮🇹","カルロス・アルカラス":"🇪🇸","錦織 圭":"🇯🇵","大坂なおみ":"🇯🇵","アリナ・サバレンカ":"🇧🇾","イガ・シフォンティク":"🇵🇱","エレーナ・リバキナ":"🇰🇿"};
const SHOT_MENU: Record<string,string[]> = {"フォアハンドストローク":["トップスピン","フラット","スライス"],"バックハンドストローク":["トップスピン","フラット","スライス"],"フォアボレー":["ハイボレー","ミドルボレー","ローボレー","ハーフボレー","ドロップボレー"],"バックボレー":["ハイボレー","ミドルボレー","ローボレー","ハーフボレー","ドロップボレー"],"サーブ":["フラットサーブ","スライスサーブ","スピンサーブ（キック）"],"スマッシュ":["通常スマッシュ","ジャンプスマッシュ"],"アプローチショット":["トップスピン","スライス"]};
const SHOT_CATEGORIES = Object.keys(SHOT_MENU);

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

function GripUploader({label}:{label:string}) {
  const [preview,setPreview]=useState<string|null>(null);
  const ref=useRef<HTMLInputElement>(null);
  return <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}><div onClick={()=>ref.current?.click()} style={{width:64,height:64,borderRadius:12,border:preview?"2px solid #84cc16":"2px dashed #cbd5e1",background:preview?"transparent":"#f8fafc",cursor:"pointer",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>{preview?<img src={preview} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:20}}>📷</span>}</div><input ref={ref} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)setPreview(URL.createObjectURL(f));}}/><span style={{fontSize:10,color:"#64748b",fontWeight:700,textAlign:"center"}}>{label}</span></div>;
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
        const dur=video.duration;
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
  const [painAreas,setPainAreas]=useState<string[]>([]);
  const [painLevels,setPainLevels]=useState<Record<string,number>>({});
  const [videoFile,setVideoFile]=useState<File|null>(null);
  const [videoUrl,setVideoUrl]=useState<string|null>(null);
  const [hasFrames,setHasFrames]=useState(false);
  const [videoDuration,setVideoDuration]=useState<number|null>(null);
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
  const hasPain=painAreas.length>0;

  const togglePain=(area:string)=>{setPainAreas(prev=>{if(prev.includes(area)){setPainLevels(lv=>{const n={...lv};delete n[area];return n;});return prev.filter(a=>a!==area);}setPainLevels(lv=>({...lv,[area]:2}));return [...prev,area];});};

  const handleDrop=useCallback((e:React.DragEvent|React.ChangeEvent<HTMLInputElement>)=>{
    if("preventDefault" in e)e.preventDefault();
    const f=("dataTransfer" in e)?e.dataTransfer?.files?.[0]:(e.target as HTMLInputElement).files?.[0];
    if(!f)return;
    const url=URL.createObjectURL(f);
    setVideoFile(f);setVideoUrl(url);setHasFrames(true);setPoseActive(false);setVideoDuration(null);
    const tmp=document.createElement("video");tmp.src=url;tmp.onloadedmetadata=()=>setVideoDuration(tmp.duration);
  },[]);

  const handleStart=async()=>{
    if(!videoFile){alert("まず動画をアップロードしてください");return;}
    setStatus("loading");if(isMobile)setActiveTab("result");
    let frames:string[]=[];let metrics:PoseMetrics|null=null;
    if(videoUrl){try{frames=await extractFrames(videoUrl,videoDuration??0);}catch(e){console.warn("extractFrames error",e);}}
    if(videoRef.current){videoRef.current.currentTime=0;setPoseActive(true);await new Promise(r=>setTimeout(r,2500));metrics=poseRef.current?.getLatestMetrics()??null;setPoseActive(false);setPoseMetrics(metrics);}
    try{
      const profile:PlayerProfile={handedness,forehand,forehandGrip:forehand==="両手打ち"?forehandGrip:undefined,backhand,painAreas,painLevels:painLevels as Record<string,1|2|3|4>};
      const res=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({profile,poseMetrics:metrics,frames,comparePlayer,shotCategory,shotType})});
      if(!res.ok){const d=await res.json();throw new Error(d.error??"診断に失敗しました");}
      const d=await res.json();setReport(d.report);setStatus("done");
    }catch(e:any){setErrMsg(e.message??"エラーが発生しました");setStatus("error");}
  };

  const goPremium=async()=>{
    try{
      const res=await fetch("/api/checkout",{method:"POST"});
      const d=await res.json();
      if(d.url){window.location.href=d.url;}
      else{alert(d.error??"決済の開始に失敗しました");}
    }catch{alert("決済の開始に失敗しました");}
  };

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
              <div><FieldLabel>フォアハンド</FieldLabel><ToggleGroup options={["片手打ち","両手打ち"]} value={forehand} onChange={v=>setForehand(v as any)}/>{forehand==="両手打ち"&&<div style={{marginTop:10,padding:"12px 14px",borderRadius:12,background:"#f0fdf4",border:"1px solid #bbf7d0"}}><div style={{fontSize:11,fontWeight:700,color:"#15803d",marginBottom:8}}>↳ 両手フォアの握り方</div><ToggleGroup options={["順手（利き手が上）","逆手（非利き手が上）"]} value={forehandGrip} onChange={v=>setForehandGrip(v as any)}/></div>}</div>
              <div><FieldLabel>バックハンド</FieldLabel><ToggleGroup options={["片手打ち","両手打ち"]} value={backhand} onChange={v=>setBackhand(v as any)}/></div>
            </div>
          </SectionCard>

          {/* STEP 2 */}
          <SectionCard>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14,gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:28,height:28,borderRadius:8,flexShrink:0,background:"linear-gradient(135deg,#84cc16,#22c55e)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:"#fff"}}>2</div><span style={{fontWeight:800,fontSize:15,color:"#0f172a"}}>STEP 2：グリップ写真</span></div>
              <span style={{fontSize:10,padding:"3px 8px",borderRadius:99,background:"#fef3c7",color:"#d97706",fontWeight:700,flexShrink:0}}>🔑 AI自動判定</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:14}}>{GRIP_SLOTS.map(s=><GripUploader key={s.key} label={s.label}/>)}</div>
            <div style={{background:"#fef9c3",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#78350f",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
              <span>🔑 グリップ自動判定はPremiumで利用可能</span>
              <button style={{padding:"4px 12px",borderRadius:99,background:"#f59e0b",color:"#fff",fontWeight:700,border:"none",cursor:"pointer",fontSize:11,flexShrink:0}}>登録 →</button>
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
            <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#1d4ed8",marginBottom:12,fontWeight:500}}>💡 <strong>10秒以内</strong>の動画で最高精度になります。1ショットだけを撮影してください。</div>
            {videoDuration!==null&&videoDuration<=10&&<div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#15803d",fontWeight:600,marginBottom:8}}>✅ {Math.round(videoDuration)}秒の動画 - 最高精度で診断できます！</div>}
            {videoDuration!==null&&videoDuration>10&&videoDuration<=20&&<div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#854d0e",fontWeight:600,marginBottom:8}}>⚠️ {Math.round(videoDuration)}秒の動画 - 10秒以内に比べると精度がやや落ちる場合があります</div>}
            {videoDuration!==null&&videoDuration>20&&<div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:"8px 14px",fontSize:12,color:"#991b1b",fontWeight:600,marginBottom:8}}>❌ {Math.round(videoDuration)}秒 - 長すぎます。10秒以内で撮り直すことを強く推奨します。</div>}
            <div onDragOver={e=>e.preventDefault()} onDrop={handleDrop} onClick={()=>fileRef.current?.click()} style={{border:videoFile?"2px solid #84cc16":"2px dashed #cbd5e1",borderRadius:14,padding:"28px 16px",marginBottom:16,background:videoFile?"#f0fdf4":"#f8fafc",display:"flex",flexDirection:"column",alignItems:"center",gap:8,cursor:"pointer",textAlign:"center"}}>
              {videoFile?<><span style={{fontSize:36}}>🎬</span><span style={{fontSize:13,fontWeight:700,color:"#16a34a",wordBreak:"break-all"}}>{videoFile.name}</span><span style={{fontSize:11,color:"#84cc16"}}>✓ アップロード完了</span></>:<><span style={{fontSize:42}}>📹</span><span style={{fontSize:13,fontWeight:700,color:"#475569"}}>{isMobile?"タップして動画を選択":"動画をドラッグ＆ドロップ"}<br/><span style={{color:"#84cc16"}}>{isMobile?"":"または クリックして選択"}</span></span><span style={{fontSize:11,color:"#94a3b8"}}>MP4 / MOV / AVI • 最大500MB</span></>}
            </div>
            <input ref={fileRef} type="file" accept="video/*" style={{display:"none"}} onChange={handleDrop as any}/>
            <button onClick={handleStart} disabled={status==="loading"} style={{width:"100%",padding:"17px",borderRadius:14,background:status==="loading"?"#e2e8f0":"linear-gradient(90deg,#84cc16,#22c55e)",color:status==="loading"?"#94a3b8":"#fff",fontWeight:900,fontSize:16,border:"none",cursor:status==="loading"?"not-allowed":"pointer",boxShadow:status==="loading"?"none":"0 4px 20px rgba(132,204,22,0.4)",letterSpacing:"0.03em"}}>
              {status==="loading"?"⏳ AI解析中...":"🤖 AI精密診断を開始する"}
            </button>
          </SectionCard>
        </div>}

        {showRight&&<div style={{minWidth:0}}>
          {/* 動画プレビュー */}
          <div style={{background:"#0f172a",borderRadius:20,overflow:"hidden",position:"relative",marginBottom:16,aspectRatio:"16/9",display:"flex",alignItems:"center",justifyContent:"center"}}>
            {videoUrl?<><video ref={videoRef} src={videoUrl} style={{width:"100%",height:"100%",objectFit:"contain",display:"block"}} controls muted playsInline/><PoseDetector ref={poseRef} videoRef={videoRef} active={poseActive} onMetrics={setPoseMetrics}/></>:<div style={{textAlign:"center",color:"#475569",padding:16}}><svg width="160" height="100" viewBox="0 0 160 100" style={{display:"block",margin:"0 auto 12px"}}><circle cx="80" cy="12" r="8" fill="#84cc16" opacity="0.7"/><line x1="80" y1="20" x2="80" y2="48" stroke="#84cc16" strokeWidth="2.5"/><line x1="80" y1="34" x2="48" y2="58" stroke="#84cc16" strokeWidth="2.5"/><line x1="80" y1="34" x2="112" y2="58" stroke="#84cc16" strokeWidth="2.5"/><line x1="80" y1="48" x2="62" y2="88" stroke="#84cc16" strokeWidth="2.5"/><line x1="80" y1="48" x2="98" y2="88" stroke="#84cc16" strokeWidth="2.5"/>{([[48,58],[112,58],[62,88],[98,88],[80,48]] as [number,number][]).map(([x,y],i)=><circle key={i} cx={x} cy={y} r={4} fill="#22c55e" opacity="0.8"/>)}</svg><div style={{fontSize:13,fontWeight:700}}>骨格ワイヤーフレーム</div><div style={{fontSize:11,marginTop:4,color:"#334155"}}>動画をアップロードすると関節ポイントが表示されます</div></div>}
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

                        {/* 詳細診断レポート：冒頭1/3無料＋続きはPremium */}
            <div style={{background:"#fff",border:"2px solid #84cc16",borderRadius:20,padding:"20px 18px",marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div style={{fontWeight:800,fontSize:15,color:"#0f172a"}}>📋 詳細診断レポート</div>
                <span style={{fontSize:11,padding:"4px 12px",borderRadius:99,background:"#fef3c7",color:"#d97706",fontWeight:700}}>続きはPremium</span>
              </div>
              <div style={{background:"#f8fafc",borderRadius:10,padding:"12px 14px",fontSize:13,color:"#1e293b",lineHeight:1.9,marginBottom:14,whiteSpace:"pre-wrap",display:"-webkit-box",WebkitLineClamp:5,WebkitBoxOrient:"vertical",overflow:"hidden"}}>
                {report.sections.formAnalysis}
              </div>
              <div style={{textAlign:"center",padding:"16px 14px",background:"linear-gradient(135deg,#fef9c3,#fff7ed)",borderRadius:12,border:"1px solid #fde047"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#92400e",marginBottom:10}}>🔒 この続きと詳細アドバイスをすべて読む</div>
                <div style={{fontSize:11,color:"#78350f",marginBottom:12,lineHeight:1.6}}>
                  • フォーム改善の具体的ドリル<br/>
                  • 打点・フットワークの詳細分析<br/>
                  • 怪我予防エクササイズ3選<br/>
                  • 週次スコア推移グラフ
                </div>
                <button onClick={goPremium} style={{width:"100%",padding:"14px",borderRadius:12,background:"linear-gradient(90deg,#84cc16,#22c55e)",color:"#fff",fontWeight:900,fontSize:14,border:"none",cursor:"pointer",boxShadow:"0 4px 16px rgba(132,204,22,0.4)"}}>
                  続きを読む → Premiumプランへ ¥999/月
                </button>

              </div>
            </div>
            {/* Premium CTA */}
            <div style={{background:"linear-gradient(135deg,#1e293b,#0f172a)",borderRadius:20,padding:"24px 20px",border:"1px solid rgba(132,204,22,0.5)",display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
              <div style={{fontSize:isMobile?17:19,fontWeight:900,color:"#fff",textAlign:"center",lineHeight:1.5}}>🔑 プレミアムプランで<br/><span style={{color:"#84cc16"}}>完全AI診断</span>を解放する</div>
              <div style={{display:"flex",flexDirection:"column",gap:7,width:"100%"}}>{["✅ 詳細フォーム解析アドバイス","✅ 打点・フットワーク改善提案","✅ 怪我に合わせた代替フォーム提案","✅ 週次スコア推移グラフ","✅ プロ選手との詳細比較"].map(f=><div key={f} style={{fontSize:12,color:"#94a3b8"}}>{f}</div>)}</div>
              <button onClick={goPremium} style={{width:"100%",padding:"16px",borderRadius:12,background:"linear-gradient(90deg,#84cc16,#22c55e)",color:"#fff",fontWeight:900,fontSize:15,border:"none",cursor:"pointer",boxShadow:"0 4px 20px rgba(132,204,22,0.4)"}}>Stripeで今すぐ登録 ¥999/月</button>
              
            </div>
          </div>}
        </div>}
      </div>
    </div>
  );
}






