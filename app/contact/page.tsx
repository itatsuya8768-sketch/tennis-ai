"use client";
import { useState } from "react";
import Link from "next/link";

// Web3Forms のアクセスキー（無料・https://web3forms.com で作成）
// ※ このキーはクライアントに出ても安全な「公開キー」です。メールアドレス本体はキーに紐づくため公開されません。
const WEB3FORMS_KEY = process.env.NEXT_PUBLIC_WEB3FORMS_KEY || "";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  const submit = async () => {
    if (!name.trim() || !message.trim()) { alert("お名前とお問い合わせ内容を入力してください"); return; }
    if (!WEB3FORMS_KEY) { alert("送信設定が未完了です。運営者にお問い合わせください。"); return; }
    setStatus("sending");
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: WEB3FORMS_KEY,
          subject: "【TennisAI】お問い合わせ",
          from_name: "TennisAI お問い合わせ",
          name,
          email: email || "（未入力）",
          message,
        }),
      });
      const d = await res.json();
      if (d.success) setStatus("done");
      else setStatus("error");
    } catch {
      setStatus("error");
    }
  };

  const input: React.CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 10, border: "2px solid #e2e8f0", fontSize: 14, color: "#1e293b", outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f0fdf4,#f8fafc)", padding: "24px 16px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 20, color: "#0f172a" }}>✉️ お問い合わせ</div>
          <Link href="/" style={{ fontSize: 13, fontWeight: 700, color: "#16a34a", textDecoration: "none" }}>← 戻る</Link>
        </div>

        {status === "done" ? (
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "32px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#0f172a", marginBottom: 8 }}>送信しました</div>
            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.8 }}>お問い合わせありがとうございます。内容を確認のうえ、必要に応じてご返信いたします。</div>
            <Link href="/" style={{ display: "inline-block", marginTop: 20, fontSize: 13, fontWeight: 700, color: "#16a34a", textDecoration: "none" }}>← トップに戻る</Link>
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "24px 22px" }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16, lineHeight: 1.7 }}>ご質問・ご要望などお気軽にどうぞ。返信が必要な場合はメールアドレスをご記入ください。</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>お名前 <span style={{ color: "#ef4444" }}>*</span></div>
                <input style={input} value={name} onChange={e => setName(e.target.value)} placeholder="山田 太郎" />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>返信先メールアドレス（任意）</div>
                <input style={input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>お問い合わせ内容 <span style={{ color: "#ef4444" }}>*</span></div>
                <textarea style={{ ...input, minHeight: 120, resize: "vertical" }} value={message} onChange={e => setMessage(e.target.value)} placeholder="お問い合わせ内容をご記入ください" />
              </div>
            </div>
            {status === "error" && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#991b1b", marginTop: 12 }}>⚠️ 送信に失敗しました。時間をおいて再度お試しください。</div>}
            <button onClick={submit} disabled={status === "sending"} style={{ width: "100%", marginTop: 16, padding: "14px", borderRadius: 12, background: status === "sending" ? "#e2e8f0" : "linear-gradient(90deg,#84cc16,#22c55e)", color: status === "sending" ? "#94a3b8" : "#fff", fontWeight: 900, fontSize: 15, border: "none", cursor: status === "sending" ? "wait" : "pointer" }}>
              {status === "sending" ? "送信中..." : "送信する"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
