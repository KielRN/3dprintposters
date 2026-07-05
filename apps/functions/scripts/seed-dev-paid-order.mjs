import { initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";

const projectId =
  process.env.GCLOUD_PROJECT ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  "gen-lang-client-0675309660";

const advancedStages = new Set([
  "accepted",
  "in_production",
  "shipped",
  "completed",
  "refunded",
]);

function usage() {
  return [
    "Usage:",
    "  npm run dev:seed-paid-order -- <jobId>",
    "  npm run dev:seed-paid-order -- <jobId> -- --dry-run",
    "  node apps/functions/scripts/seed-dev-paid-order.mjs <jobId> --dry-run",
    "",
    "Options:",
    "  --job-id <id>             Job id to seed, alternative to positional id.",
    "  --customer-name <name>    Customer name for a new dev order.",
    "  --customer-email <email>  Customer email for a new dev order.",
    "  --paint-option <option>   Paint option snapshot, e.g. painted.",
    "  --reset-stage             Reset an existing advanced fulfillment stage to paid.",
    "  --dry-run                 Print the planned write without changing Firestore.",
  ].join("\n");
}

function readArg(name) {
  const equalsPrefix = `${name}=`;
  const equalsValue = process.argv.find((arg) => arg.startsWith(equalsPrefix));
  if (equalsValue) {
    return equalsValue.slice(equalsPrefix.length);
  }

  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1]
    : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function positionalJobId() {
  const args = process.argv.slice(2);
  return (
    args.find((arg, index) => {
      if (arg.startsWith("-")) {
        return false;
      }
      const previous = args[index - 1];
      return !previous || !previous.startsWith("--");
    }) ?? null
  );
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function numberOrFallback(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nonEmptyRecord(value) {
  const candidate = record(value);
  return Object.keys(candidate).length > 0 ? candidate : null;
}

function defaultPriceSnapshot(productType, paintOption) {
  if (productType === "figurine") {
    return {
      currency: "usd",
      unitAmount: paintOption === "painted" ? 14900 : 9900,
      stripePriceId: null,
    };
  }

  return {
    currency: "usd",
    unitAmount: 6000,
    stripePriceId: null,
  };
}

async function main() {
  const jobId = readArg("--job-id") ?? positionalJobId();
  if (!jobId) {
    throw new Error(usage());
  }

  const dryRun = hasFlag("--dry-run");
  const resetStage = hasFlag("--reset-stage");
  const customerName = readArg("--customer-name") ?? "Guest Test Customer";
  const customerEmail = readArg("--customer-email");
  const requestedPaintOption = readArg("--paint-option");

  initializeApp({ projectId });

  const db = getFirestore();
  const jobRef = db.collection("jobs").doc(jobId);
  const orderRef = db.collection("orders").doc(jobId);
  const [jobSnap, orderSnap] = await Promise.all([jobRef.get(), orderRef.get()]);

  if (!jobSnap.exists) {
    throw new Error(`jobs/${jobId} does not exist in project ${projectId}.`);
  }

  const jobData = jobSnap.data() ?? {};
  const orderData = orderSnap.exists ? orderSnap.data() ?? {} : {};
  const currentFulfillment = record(orderData.fulfillment);
  const currentStage = stringOrNull(currentFulfillment.stage);

  if (
    currentStage &&
    currentStage !== "paid" &&
    advancedStages.has(currentStage) &&
    !resetStage
  ) {
    throw new Error(
      `orders/${jobId} is already in fulfillment stage "${currentStage}". ` +
        "Use --reset-stage only if you intentionally want to move it back to paid.",
    );
  }

  const productType =
    stringOrNull(orderData.productType) ??
    stringOrNull(jobData.productType) ??
    "poster";
  const paintOption =
    stringOrNull(requestedPaintOption) ??
    stringOrNull(orderData.paintOption) ??
    stringOrNull(jobData.paintOption) ??
    "";
  const priceSnapshot =
    nonEmptyRecord(orderData.priceSnapshot) ??
    defaultPriceSnapshot(productType, paintOption);

  const paidAt = FieldValue.serverTimestamp();
  const historyAt = Timestamp.now();

  const orderUpdate = {
    uid: stringOrNull(orderData.uid) ?? stringOrNull(jobData.uid),
    jobId,
    approvedImagePath:
      stringOrNull(orderData.approvedImagePath) ??
      stringOrNull(jobData.approvedImagePath),
    printFileOutputPrefix:
      stringOrNull(orderData.printFileOutputPrefix) ??
      stringOrNull(jobData.printFileOutputPrefix),
    printFileArtifacts:
      nonEmptyRecord(orderData.printFileArtifacts) ??
      nonEmptyRecord(jobData.printFileArtifacts),
    printFileAudit:
      nonEmptyRecord(orderData.printFileAudit) ??
      nonEmptyRecord(jobData.printFileAudit),
    printability:
      nonEmptyRecord(orderData.printability) ??
      nonEmptyRecord(jobData.printability),
    status: "paid",
    paymentStatus: "paid",
    fulfillmentStatus: "not_started",
    stripeCheckoutSessionId:
      stringOrNull(orderData.stripeCheckoutSessionId) ?? `dev_seed_${jobId}`,
    stripePaymentIntentId: stringOrNull(orderData.stripePaymentIntentId),
    provider: orderData.provider ?? null,
    providerOrderId: orderData.providerOrderId ?? null,
    checkoutAttempt: numberOrFallback(orderData.checkoutAttempt, 1),
    checkoutIdempotencyKey:
      stringOrNull(orderData.checkoutIdempotencyKey) ??
      `dev-seed-paid:${jobId}`,
    paintOption,
    productType,
    priceSnapshot,
    customerName:
      stringOrNull(orderData.customerName) ?? stringOrNull(customerName),
    customerEmail:
      stringOrNull(orderData.customerEmail) ?? stringOrNull(customerEmail),
    shippingAddress: record(orderData.shippingAddress).line1
      ? orderData.shippingAddress
      : null,
    fulfillment: {
      stage: "paid",
      productionSubState: null,
      acceptedAt: null,
      acceptedBy: null,
      rejection: null,
      tracking: null,
      refund: null,
      history: FieldValue.arrayUnion({
        stage: "paid",
        at: historyAt,
        by: "dev_seed_paid_order",
      }),
    },
    ...(orderSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    updatedAt: paidAt,
  };

  const jobUpdate = {
    pipelineStage: "paid",
    pipelineUpdatedAt: paidAt,
    updatedAt: paidAt,
  };

  const summary = {
    dryRun,
    target: process.env.FIRESTORE_EMULATOR_HOST
      ? `firestore-emulator:${process.env.FIRESTORE_EMULATOR_HOST}`
      : `project:${projectId}`,
    jobId,
    before: {
      jobExists: jobSnap.exists,
      orderExists: orderSnap.exists,
      jobPipelineStage: stringOrNull(jobData.pipelineStage),
      orderStatus: stringOrNull(orderData.status),
      orderPaymentStatus: stringOrNull(orderData.paymentStatus),
      orderFulfillmentStage: currentStage,
    },
    after: {
      jobPipelineStage: jobUpdate.pipelineStage,
      orderStatus: orderUpdate.status,
      orderPaymentStatus: orderUpdate.paymentStatus,
      orderFulfillmentStage: orderUpdate.fulfillment.stage,
      availablePrintConsoleTab: true,
    },
  };

  console.log(JSON.stringify(summary, null, 2));

  if (dryRun) {
    return;
  }

  const batch = db.batch();
  batch.set(orderRef, orderUpdate, { merge: true });
  batch.set(jobRef, jobUpdate, { merge: true });
  await batch.commit();

  const [updatedJobSnap, updatedOrderSnap] = await Promise.all([
    jobRef.get(),
    orderRef.get(),
  ]);
  const updatedJob = updatedJobSnap.data() ?? {};
  const updatedOrder = updatedOrderSnap.data() ?? {};

  console.log(
    JSON.stringify(
      {
        seeded: true,
        jobId,
        jobPipelineStage: updatedJob.pipelineStage ?? null,
        orderStatus: updatedOrder.status ?? null,
        orderPaymentStatus: updatedOrder.paymentStatus ?? null,
        orderFulfillmentStage: record(updatedOrder.fulfillment).stage ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
