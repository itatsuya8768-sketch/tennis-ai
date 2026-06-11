"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function SignupPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSignup = async () => {
    if (password.length < 8) { setError("パスワードは8文字以上にしてください"); return; }
    setLoading(true); setError("");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setError(error.message); setLoading(false); return; }
    setDone(true);
  };

  if (done) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#f0fdf4,#f8fafc)",padding:"24px 16px"}}>
      <div style={{background:"#fff",borderRadius:24,border:"1px solid #e2e8f0",padding:"36px 32px",width:"100%",maxWidth:420,textAlign:"center"}}>
        <div style={{fontSize:56,marginBottom:16}}>📧</div>
        <div style={{fontWeight:900,fontSize:20,color:"#0f172a",marginBottom:8}}>確認メールを送信しました</div>
        <div style={{fontSize:13,color:"#64748b",lineHeight:1.7,marginBottom:24}}>{email} に確認メールを送りました。メール内のリンクをクリックして有効化してください。</div>
        <Link href="/login" style={{display:"block",padding:"12px",borderRadius:12,background:"linear-gradient(90deg,#84cc16,#22c55e)",color:"#fff",fontWeight:700,textDecoration:"none",fontSize:14,textAlign:"center"}}>ログインページへ</Link>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#f0fdf4,#f8fafc)",padding:"24px 16px"}}>
      <div style={{background:"#fff",borderRadius:24,border:"1px solid #e2e8f0",padding:"36px 32px",width:"100%",maxWidth:420,boxShadow:"0 4px 32px rgba(0,0,0,0.06)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{width:48,height:48,borderRadius:14,background:"linear-gradient(135deg,#84cc16,#22c55e)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,margin:"0 auto 12px"}}>🎾</div>
          <div style={{fontWeight:900,fontSize:22,color:"#0f172a"}}>新規登録</div>
          <div style={{fontSize:13,color:"#64748b",marginTop:4}}>無料でTennisAIを始めよう</div>
        </div>
        {error && (
          <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#991b1b",marginBottom:16}}>⚠️ {error}</div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
          <input style={{width:"100%",padding:"12px 16px",borderRadius:10,border:"2px solid #e2e8f0",fontSize:14,color:"#1e293b",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}} type="email" placeholder="メールアドレス" value={email} onChange={e => setEmail(e.target.value)} />
          <input style={{width:"100%",padding:"12px 16px",borderRadius:10,border:"2px solid #e2e8f0",fontSize:14,color:"#1e293b",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}} type="password" placeholder="パスワード（8文字以上）" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSignup()} />
        </div>
        <button style={{width:"100%",padding:"14px",borderRadius:12,background:"linear-gradient(90deg,#84cc16,#22c55e)",color:"#fff",fontWeight:900,fontSize:15,border:"none",cursor:"pointer"}} onClick={handleSignup} disabled={loading}>
          {loading ? "登録中..." : "無料で登録する"}
        </button>
        <div style={{textAlign:"center",marginTop:20,fontSize:13,color:"#64748b"}}>
          すでにアカウントをお持ちの方は <Link href="/login" style={{color:"#16a34a",fontWeight:700,textDecoration:"none"}}>ログイン</Link>
        </div>
      </div>
    </div>
  );
}


 
