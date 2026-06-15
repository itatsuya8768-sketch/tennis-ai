import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const FREE_LIMIT = 1;
    const PREMIUM_MONTHLY_LIMIT = 30;
    const DEMO_EMAILS = ["i.tatsuya8768@gmail.com"];
    if (user.email && DEMO_EMAILS.includes(user.email.toLowerCase())) {
      return NextResponse.json({ plan: "unlimited", remaining: null, limit: null, used: 0 });
    }

    let isPremium = false;
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("is_premium")
        .eq("id", user.id)
        .maybeSingle();
      isPremium = !!prof?.is_premium;
    } catch {}

    if (isPremium) {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const { count } = await supabase
        .from("diagnoses")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", monthStart);
      const used = count ?? 0;
      return NextResponse.json({ plan: "premium", used, limit: PREMIUM_MONTHLY_LIMIT, remaining: Math.max(0, PREMIUM_MONTHLY_LIMIT - used) });
    }

    const { count } = await supabase
      .from("diagnoses")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    const used = count ?? 0;
    return NextResponse.json({ plan: "free", used, limit: FREE_LIMIT, remaining: Math.max(0, FREE_LIMIT - used) });
  } catch (e: any) {
    console.error("usage error:", e);
    return NextResponse.json({ error: "利用状況の取得に失敗しました" }, { status: 500 });
  }
}
