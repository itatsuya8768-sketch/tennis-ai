import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    return NextResponse.json({ error: "missing signature/secret" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err: any) {
    console.error("webhook signature error:", err?.message);
    return NextResponse.json({ error: `signature error: ${err?.message}` }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id || session.client_reference_id || undefined;
        const customerId = (session.customer as string) || undefined;
        const subscriptionId = (session.subscription as string) || undefined;

        let periodEnd: string | null = null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const cpe = (sub as any).current_period_end;
          periodEnd = cpe ? new Date(cpe * 1000).toISOString() : null;
        }

        if (userId) {
          await admin.from("profiles").upsert(
            {
              id: userId,
              is_premium: true,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              current_period_end: periodEnd,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const active = sub.status === "active" || sub.status === "trialing";
        const cpe = (sub as any).current_period_end;
        const periodEnd = cpe ? new Date(cpe * 1000).toISOString() : null;

        const { data: prof } = await admin
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (prof?.id) {
          await admin
            .from("profiles")
            .update({
              is_premium: active,
              stripe_subscription_id: sub.id,
              current_period_end: periodEnd,
              updated_at: new Date().toISOString(),
            })
            .eq("id", prof.id);
        }
        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.error("webhook handler error:", e);
    return NextResponse.json({ error: "handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
