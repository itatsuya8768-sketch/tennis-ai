"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setLoading(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError("メールアドレスまたはパスワードが間違っています"); setLoading(false); return; }
    router.push("/");
    router.refresh();
  };

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#f0fdf4,#f8fafc)",padding:"24px 16px"}}>
      <div style={{background:"#fff",borderRadius:24,border:"1px solid #e2e8f0",padding:"36px 32px",width:"100%",maxWidth:420,boxShadow:"0 4px 32px rgba(0,0,0,0.06)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{width:48,height:48,borderRadius:14,background:"linear-gradient(135deg,#84cc16,#22c55e)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,margin:"0 auto 12px"}}>🎾</div>
          <div style={{fontWeight:900,fontSize:19,color:"#0f172a"}}>TennisAI365Coach</div>
          <div style={{fontSize:13,color:"#64748b",marginTop:4}}>ログインしてフォーム診断を始めよう</div>
        </div>
        {error && (
          <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#991b1b",marginBottom:16}}>⚠️ {error}</div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
          <input style={{width:"100%",padding:"12px 16px",borderRadius:10,border:"2px solid #e2e8f0",fontSize:14,color:"#1e293b",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}} type="email" placeholder="メールアドレス" value={email} onChange={e => setEmail(e.target.value)} />
          <input style={{width:"100%",padding:"12px 16px",borderRadius:10,border:"2px solid #e2e8f0",fontSize:14,color:"#1e293b",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}} type="password" placeholder="パスワード" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
        </div>
        <button style={{width:"100%",padding:"14px",borderRadius:12,background:"linear-gradient(90deg,#84cc16,#22c55e)",color:"#fff",fontWeight:900,fontSize:15,border:"none",cursor:"pointer",boxShadow:"0 4px 16px rgba(132,204,22,0.35)"}} onClick={handleLogin} disabled={loading}>
          {loading ? "ログイン中..." : "ログイン"}
        </button>
        <div style={{textAlign:"center",marginTop:20,fontSize:13,color:"#64748b"}}>
          アカウントをお持ちでない方は <Link href="/signup" style={{color:"#16a34a",fontWeight:700,textDecoration:"none"}}>新規登録</Link>
        </div>
        <Link href="/signup" style={{display:"block",textAlign:"center",marginTop:12,padding:"12px",borderRadius:12,border:"2px solid #84cc16",color:"#16a34a",fontWeight:800,fontSize:14,textDecoration:"none"}}>📧 メールとパスワードだけで簡単登録</Link>
      </div>
    </div>
  );
}
