import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// 統計を見られるのは運営者のみ
const OWNER_EMAILS = ["i.tatsuya8768@gmail.com"];

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (!user.email || !OWNER_EMAILS.includes(user.email.toLowerCase())) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }

    const admin = createAdminClient();
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

    // テーブルが未作成でもエラーにせず 0 を返す
    const countOf = async (table: string, sinceIso?: string) => {
      try {
        let q = admin.from(table).select("*", { count: "exact", head: true });
        if (sinceIso) q = q.gte("created_at", sinceIso);
        const { count } = await q;
        return count ?? 0;
      } catch {
        return 0;
      }
    };

    const [visitsTotal, visitsMonth, visitsToday, diagTotal, diagMonth, diagToday] = await Promise.all([
      countOf("visits"),
      countOf("visits", monthStart),
      countOf("visits", dayStart),
      countOf("diagnoses"),
      countOf("diagnoses", monthStart),
      countOf("diagnoses", dayStart),
    ]);

    // 診断したユニークユーザー数
    let uniqueUsers = 0;
    try {
      const { data } = await admin.from("diagnoses").select("user_id").limit(10000);
      uniqueUsers = new Set((data ?? []).map((r: any) => r.user_id)).size;
    } catch {}

    return NextResponse.json({
      visits: { total: visitsTotal, month: visitsMonth, today: visitsToday },
      diagnoses: { total: diagTotal, month: diagMonth, today: diagToday },
      uniqueUsers,
    });
  } catch (e: any) {
    console.error("stats error:", e);
    return NextResponse.json({ error: "統計の取得に失敗しました" }, { status: 500 });
  }
}
