import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

// 決済完了後の保険：Webhookが届かなくても、Stripeを直接照会して is_premium を確定させる
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const stripe = getStripe();
    const admin = createAdminClient();

    // 顧客IDをprofiles → 無ければemailでStripeから探す
    const { data: prof } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    let customerId: string | undefined = prof?.stripe_customer_id ?? undefined;
    if (!customerId && user.email) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      customerId = customers.data[0]?.id;
    }
    if (!customerId) {
      return NextResponse.json({ is_premium: false });
    }

    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
    const active = subs.data.find((s) => s.status === "active" || s.status === "trialing");
    const isPremium = !!active;
    const cpe = active ? (active as any).current_period_end : null;

    const { error } = await admin.from("profiles").upsert(
      {
        id: user.id,
        is_premium: isPremium,
        stripe_customer_id: customerId,
        stripe_subscription_id: active?.id ?? null,
        current_period_end: cpe ? new Date(cpe * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) {
      console.error("premium sync DB error:", error);
      return NextResponse.json(
        { error: `DB更新に失敗: ${error.message}`, is_premium: isPremium },
        { status: 500 }
      );
    }

    return NextResponse.json({ is_premium: isPremium });
  } catch (e: any) {
    console.error("premium sync error:", e);
    return NextResponse.json({ error: `同期に失敗: ${e?.message ?? e}` }, { status: 500 });
  }
}
