import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { z } from "zod";

import { createPosterAiProvider } from "./aiProvider.js";

initializeApp();

const db = getFirestore();
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const jobIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/);

const createJobSchema = z.object({
  jobId: jobIdSchema,
  sourceImagePath: z.string().min(1),
  selectedStyle: z.string().min(1),
});

const checkoutSchema = z.object({
  jobId: jobIdSchema,
});

const approveGeneratedImageSchema = z.object({
  jobId: jobIdSchema,
  imagePath: z.string().min(1),
});

type CheckoutSessionWebhookObject = {
  metadata?: Record<string, string> | null;
  payment_intent?: string | null | object;
};

type GeneratedImage = {
  storagePath?: string;
};

function buildGenerationError(error: unknown) {
  return {
    message:
      error instanceof Error
        ? error.message
        : "Poster generation did not complete.",
    stage: "ai_generation",
  };
}

export const createGenerationJob = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Sign in before creating a poster.",
    );
  }

  const parsed = createJobSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError(
      "invalid-argument",
      "jobId, sourceImagePath, and selectedStyle are required.",
    );
  }

  const expectedUploadPrefix = `uploads/${request.auth.uid}/${parsed.data.jobId}/`;
  const allowedImagePath = /\.(jpe?g|png)$/i.test(parsed.data.sourceImagePath);
  if (
    !parsed.data.sourceImagePath.startsWith(expectedUploadPrefix) ||
    !allowedImagePath
  ) {
    throw new HttpsError(
      "permission-denied",
      "Source image must be an uploaded JPG or PNG under the signed-in user path.",
    );
  }

  const jobRef = db.collection("jobs").doc(parsed.data.jobId);
  const existingJob = await jobRef.get();
  if (existingJob.exists) {
    const existingJobData = existingJob.data();
    const isSameUpload =
      existingJobData?.uid === request.auth.uid &&
      existingJobData.sourceImagePath === parsed.data.sourceImagePath &&
      existingJobData.selectedStyle === parsed.data.selectedStyle;

    if (isSameUpload) {
      return {
        jobId: jobRef.id,
        status:
          typeof existingJobData.status === "string"
            ? existingJobData.status
            : "unknown",
        idempotent: true,
      };
    }

    throw new HttpsError("already-exists", "A different job uses this id.");
  }

  await jobRef.set({
    uid: request.auth.uid,
    status: "generating",
    sourceImagePath: parsed.data.sourceImagePath,
    selectedStyle: parsed.data.selectedStyle,
    generatedImages: [],
    approvedImagePath: null,
    aiGeneration: {
      provider: null,
      status: "queued",
      startedAt: FieldValue.serverTimestamp(),
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  try {
    const aiProvider = createPosterAiProvider();
    const generation = await aiProvider.generatePosterConcept({
      jobId: jobRef.id,
      uid: request.auth.uid,
      sourceImagePath: parsed.data.sourceImagePath,
      selectedStyle: parsed.data.selectedStyle,
    });
    const proofStoragePath =
      generation.status === "stubbed"
        ? parsed.data.sourceImagePath
        : generation.generatedImagePaths[0];

    if (!proofStoragePath) {
      throw new Error("AI provider returned no generated proof image path.");
    }

    await jobRef.set(
      {
        status: "preview_ready",
        generatedImages: [
          {
            id: "preview-1",
            label:
              generation.status === "stubbed"
                ? "Source photo proof"
                : "Generated poster proof",
            storagePath: proofStoragePath,
            status: "ready",
            isPlaceholder: generation.status === "stubbed",
          },
        ],
        aiGeneration: {
          provider: generation.provider,
          status: generation.status,
          generatedImagePaths: generation.generatedImagePaths,
          metadata: generation.metadata,
          completedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return {
      jobId: jobRef.id,
      status: "preview_ready",
    };
  } catch (error) {
    await jobRef.set(
      {
        status: "failed",
        error: buildGenerationError(error),
        aiGeneration: {
          status: "failed",
          failedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    throw new HttpsError(
      "internal",
      "Poster generation failed before a proof was ready.",
    );
  }
});

export const approveGeneratedImage = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Sign in before approving a proof.",
    );
  }

  const parsed = approveGeneratedImageSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError(
      "invalid-argument",
      "jobId and imagePath are required.",
    );
  }

  const jobRef = db.collection("jobs").doc(parsed.data.jobId);
  const jobSnap = await jobRef.get();
  const jobData = jobSnap.data();

  if (!jobSnap.exists || jobData?.uid !== request.auth.uid) {
    throw new HttpsError("not-found", "Job not found.");
  }

  const generatedImages = Array.isArray(jobData.generatedImages)
    ? (jobData.generatedImages as GeneratedImage[])
    : [];
  const canApproveImage = generatedImages.some(
    (image) => image.storagePath === parsed.data.imagePath,
  );

  if (!canApproveImage) {
    throw new HttpsError(
      "permission-denied",
      "The approved proof must belong to this job.",
    );
  }

  await jobRef.set(
    {
      status: "approved",
      approvedImagePath: parsed.data.imagePath,
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    jobId: jobRef.id,
    status: "approved",
    approvedImagePath: parsed.data.imagePath,
  };
});

export const createCheckoutSession = onCall(
  {
    secrets: [stripeSecretKey],
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
    const jobData = jobSnap.data();
    if (!jobSnap.exists || jobData?.uid !== request.auth.uid) {
      throw new HttpsError("not-found", "Job not found.");
    }

    if (jobData.status !== "approved" || !jobData.approvedImagePath) {
      throw new HttpsError(
        "failed-precondition",
        "Approve a generated proof before checkout.",
      );
    }

    const orderRef = db.collection("orders").doc(parsed.data.jobId);
    const existingOrder = await orderRef.get();
    const existingOrderData = existingOrder.data();
    if (
      existingOrder.exists &&
      (existingOrderData?.uid !== request.auth.uid ||
        existingOrderData.jobId !== parsed.data.jobId)
    ) {
      throw new HttpsError("already-exists", "A different order uses this id.");
    }

    if (
      existingOrderData?.status === "paid" ||
      existingOrderData?.paymentStatus === "paid"
    ) {
      throw new HttpsError(
        "failed-precondition",
        "This poster order has already been paid.",
      );
    }

    const stripe = new Stripe(stripeSecretKey.value());
    const appUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:3000";
    const posterPriceId = process.env.STRIPE_POSTER_PRICE_ID;
    const previousCheckoutAttempt =
      typeof existingOrderData?.checkoutAttempt === "number"
        ? existingOrderData.checkoutAttempt
        : 0;
    const startingAfterExpiredCheckout =
      existingOrderData?.status === "checkout_expired" ||
      existingOrderData?.paymentStatus === "expired";
    const checkoutAttempt =
      existingOrder.exists && startingAfterExpiredCheckout
        ? previousCheckoutAttempt + 1
        : Math.max(previousCheckoutAttempt, 1);
    const checkoutIdempotencyKey = [
      "checkout",
      request.auth.uid,
      parsed.data.jobId,
      String(jobData.approvedImagePath),
      checkoutAttempt,
    ].join(":");

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        success_url: `${appUrl}/orders/${orderRef.id}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/jobs/${parsed.data.jobId}?checkout=cancelled`,
        shipping_address_collection: {
          allowed_countries: ["US", "CA"],
        },
        line_items: posterPriceId
          ? [
              {
                quantity: 1,
                price: posterPriceId,
              },
            ]
          : [
              {
                quantity: 1,
                price_data: {
                  currency: "usd",
                  unit_amount: 6000,
                  product_data: {
                    name: "Custom 3D Print Poster",
                    description: "5in x 7in physical relief poster",
                  },
                },
              },
            ],
        metadata: {
          uid: request.auth.uid,
          jobId: parsed.data.jobId,
          orderId: orderRef.id,
        },
      },
      {
        idempotencyKey: checkoutIdempotencyKey,
      },
    );

    await orderRef.set(
      {
        uid: request.auth.uid,
        jobId: parsed.data.jobId,
        approvedImagePath: jobData.approvedImagePath,
        status: "checkout_created",
        paymentStatus: "pending",
        fulfillmentStatus: "not_started",
        stripeCheckoutSessionId: session.id,
        provider: null,
        providerOrderId: null,
        checkoutAttempt,
        checkoutIdempotencyKey,
        priceSnapshot: {
          currency: "usd",
          unitAmount: 6000,
          stripePriceId: posterPriceId ?? null,
        },
        ...(existingOrder.exists
          ? {}
          : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return {
      orderId: orderRef.id,
      checkoutUrl: session.url,
    };
  },
);

export const stripeWebhook = onRequest(
  {
    secrets: [stripeSecretKey, stripeWebhookSecret],
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
        stripeWebhookSecret.value(),
      );
    } catch (error) {
      response
        .status(400)
        .send(`Webhook signature verification failed: ${String(error)}`);
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as CheckoutSessionWebhookObject;
      const orderId = session.metadata?.orderId;

      if (orderId) {
        await db
          .collection("orders")
          .doc(orderId)
          .set(
            {
              status: "paid",
              paymentStatus: "paid",
              stripePaymentIntentId:
                typeof session.payment_intent === "string"
                  ? session.payment_intent
                  : null,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
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
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
    }

    response.json({ received: true });
  },
);
