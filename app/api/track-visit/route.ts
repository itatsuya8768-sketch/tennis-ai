import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// サイト訪問を記録する（誰でも・ログイン不要）。失敗しても無視する。
export async function POST(req: NextRequest) {
  try {
    let path = "/";
    try {
      const b = await req.json();
      if (b?.path) path = String(b.path).slice(0, 200);
    } catch {}
    const admin = createAdminClient();
    await admin.from("visits").insert({ path });
    return NextResponse.json({ ok: true });
  } catch {
    // 訪問記録の失敗はサービスに影響させない
    return NextResponse.json({ ok: false });
  }
}
