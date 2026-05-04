import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";

const checkoutRequestSchema = z.object({
  jobId: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    return NextResponse.json(
      {
        error: "Stripe is not configured yet. Add STRIPE_SECRET_KEY to apps/web/.env.local."
      },
      { status: 503 }
    );
  }

  const parsed = checkoutRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  const origin = process.env.PUBLIC_APP_URL ?? request.nextUrl.origin;
  const stripe = new Stripe(stripeSecretKey);
  const posterPriceId = process.env.STRIPE_POSTER_PRICE_ID;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?checkout=cancelled`,
    shipping_address_collection: {
      allowed_countries: ["US", "CA"]
    },
    line_items: posterPriceId
      ? [
          {
            quantity: 1,
            price: posterPriceId
          }
        ]
      : [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: 6000,
              product_data: {
                name: "Custom 3D Print Poster",
                description: "5in x 7in physical relief poster"
              }
            }
          }
        ],
    metadata: {
      jobId: parsed.data.jobId
    }
  });

  return NextResponse.json({ url: session.url });
}
