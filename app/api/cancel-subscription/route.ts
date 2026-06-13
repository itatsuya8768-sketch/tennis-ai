import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: prof } = await admin
      .from("profiles")
      .select("stripe_subscription_id")
      .eq("id", user.id)
      .maybeSingle();

    const subId = prof?.stripe_subscription_id as string | undefined;
    if (subId) {
      try {
        const stripe = getStripe();
        await stripe.subscriptions.cancel(subId); // 即時解約
      } catch (e) {
        console.error("subscription cancel error:", e);
        // 既にサブスクが存在しない等は無視して、フラグだけ落とす
      }
    }

    const { error } = await admin
      .from("profiles")
      .update({
        is_premium: false,
        stripe_subscription_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("cancel error:", e);
    return NextResponse.json({ error: "解約処理に失敗しました" }, { status: 500 });
  }
}
