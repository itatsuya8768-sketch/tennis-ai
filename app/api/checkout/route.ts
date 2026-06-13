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

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      return NextResponse.json({ error: "価格(STRIPE_PRICE_ID)が設定されていません" }, { status: 500 });
    }

    const stripe = getStripe();
    const admin = createAdminClient();
    const origin = req.headers.get("origin") || new URL(req.url).origin;

    // 既存のStripe顧客IDを取得、無ければ作成
    const { data: prof } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    let customerId: string | undefined = prof?.stripe_customer_id ?? undefined;
    if (customerId) {
      // 保存済みの顧客IDが現在のモード/アカウントに存在するか確認
      // （テスト→本番の切替などで無効になることがある → 無効なら作り直す）
      try {
        const existing = await stripe.customers.retrieve(customerId);
        if ((existing as any).deleted) customerId = undefined;
      } catch {
        customerId = undefined;
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin
        .from("profiles")
        .upsert({ id: user.id, stripe_customer_id: customerId }, { onConflict: "id" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("checkout error:", e);
    return NextResponse.json(
      { error: `決済の開始に失敗しました: ${e?.message ?? e}` },
      { status: 500 }
    );
  }
}
