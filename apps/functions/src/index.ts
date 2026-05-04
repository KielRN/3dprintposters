import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { z } from "zod";

initializeApp();

const db = getFirestore();
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

const createJobSchema = z.object({
  sourceImagePath: z.string().min(1),
  selectedStyle: z.string().min(1)
});

const checkoutSchema = z.object({
  jobId: z.string().min(1)
});

type CheckoutSessionWebhookObject = {
  metadata?: Record<string, string> | null;
  payment_intent?: string | null | object;
};

export const createGenerationJob = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in before creating a poster.");
  }

  const parsed = createJobSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "sourceImagePath and selectedStyle are required.");
  }

  const jobRef = db.collection("jobs").doc();
  await jobRef.set({
    uid: request.auth.uid,
    status: "created",
    sourceImagePath: parsed.data.sourceImagePath,
    selectedStyle: parsed.data.selectedStyle,
    generatedImages: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  return {
    jobId: jobRef.id,
    status: "created"
  };
});

export const createCheckoutSession = onCall(
  {
    secrets: [stripeSecretKey]
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in before checkout.");
    }

    const parsed = checkoutSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "jobId is required.");
    }

    const jobSnap = await db.collection("jobs").doc(parsed.data.jobId).get();
    if (!jobSnap.exists || jobSnap.data()?.uid !== request.auth.uid) {
      throw new HttpsError("not-found", "Job not found.");
    }

    const orderRef = db.collection("orders").doc();
    const stripe = new Stripe(stripeSecretKey.value());
    const appUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:3000";
    const posterPriceId = process.env.STRIPE_POSTER_PRICE_ID;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${appUrl}/orders/${orderRef.id}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/jobs/${parsed.data.jobId}?checkout=cancelled`,
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
        uid: request.auth.uid,
        jobId: parsed.data.jobId,
        orderId: orderRef.id
      }
    });

    await orderRef.set({
      uid: request.auth.uid,
      jobId: parsed.data.jobId,
      status: "checkout_created",
      paymentStatus: "pending",
      fulfillmentStatus: "not_started",
      stripeCheckoutSessionId: session.id,
      provider: null,
      providerOrderId: null,
      priceSnapshot: {
        currency: "usd",
        unitAmount: 6000,
        stripePriceId: posterPriceId ?? null
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    return {
      orderId: orderRef.id,
      checkoutUrl: session.url
    };
  }
);

export const stripeWebhook = onRequest(
  {
    secrets: [stripeSecretKey, stripeWebhookSecret]
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method not allowed");
      return;
    }

    const signature = request.header("stripe-signature");
    if (!signature) {
      response.status(400).send("Missing Stripe signature");
      return;
    }

    const stripe = new Stripe(stripeSecretKey.value());
    let event: ReturnType<typeof stripe.webhooks.constructEvent>;

    try {
      event = stripe.webhooks.constructEvent(
        request.rawBody,
        signature,
        stripeWebhookSecret.value()
      );
    } catch (error) {
      response.status(400).send(`Webhook signature verification failed: ${String(error)}`);
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as CheckoutSessionWebhookObject;
      const orderId = session.metadata?.orderId;

      if (orderId) {
        await db.collection("orders").doc(orderId).set(
          {
            status: "paid",
            paymentStatus: "paid",
            stripePaymentIntentId:
              typeof session.payment_intent === "string" ? session.payment_intent : null,
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as CheckoutSessionWebhookObject;
      const orderId = session.metadata?.orderId;

      if (orderId) {
        await db.collection("orders").doc(orderId).set(
          {
            status: "checkout_expired",
            paymentStatus: "expired",
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }
    }

    response.json({ received: true });
  }
);
