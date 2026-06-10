"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!mounted) return (
    <div style={{ width: 80, height: 32 }} />
  );

  if (!user) return (
    <Link href="/login" style={{
      padding: "8px 18px", borderRadius: 99,
      background: "linear-gradient(90deg,#84cc16,#22c55e)",
      color: "#fff", fontWeight: 800, fontSize: 12, textDecoration: "none",
      boxShadow: "0 2px 12px rgba(132,204,22,0.4)",
    }}>
      ログイン / 登録
    </Link>
  );

  const supabase = createClient();
  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

      <button onClick={signOut} style={{
        padding: "7px 14px", borderRadius: 8, border: "1px solid #e2e8f0",
        background: "#f8fafc", color: "#64748b", fontSize: 12,
        fontWeight: 700, cursor: "pointer",
      }}>ログアウト</button>
    </div>
  );
}

