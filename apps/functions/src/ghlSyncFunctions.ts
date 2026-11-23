// Firebase triggers and callables for the 3DPrintYou -> GHL sync
// (3DPrintYou PRD R9-R11). The pure planning/HTTP logic lives in ghlSync.ts.

import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { requireSignedInAccount } from "./authRoles.js";
import { isCustomerDeletedJob } from "./customerJobs.js";
import {
  accountTaskId,
  buildGhlSyncPlan,
  createGhlClient,
  executeGhlSyncPlan,
  ghlContactUrl,
  ghlCustomerContactCollection,
  ghlSyncMaxRetryAgeMs,
  ghlSyncTaskCollection,
  GhlApiError,
  milestoneForStageChange,
  milestoneTaskId,
  normalizeEmail,
  opportunityName,
  splitName,
  supportTaskId,
  type GhlCustomerInfo,
  type GhlSyncTask,
} from "./ghlSync.js";
import { derivePipelineStage } from "./pipeline.js";

export const supportEmailAddress = "support@3dprintyou.com";

const ghlSecrets = ["GHL_API_TOKEN", "PUBLIC_APP_URL"];

type LooseRecord = Record<string, unknown>;

function record(value: unknown): LooseRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}

/** Writes a task once; a second write with the same ID is a no-op. */
export async function queueGhlSyncTask(
  taskId: string,
  task: GhlSyncTask,
): Promise<boolean> {
  try {
    await getFirestore()
      .collection(ghlSyncTaskCollection)
      .doc(taskId)
      .create({
        ...task,
        status: "pending",
        attempts: 0,
        lastError: null,
        triggerSent: false,
        ghlContactId: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    return true;
  } catch (error) {
    if (isAlreadyExists(error)) {
      return false;
    }
    throw error;
  }
}

// --- R10: order milestones

export const onJobStageQueueGhlSync = onDocumentWritten(
  { document: "jobs/{jobId}", retry: true },
  async (event) => {
    const before = event.data?.before.data() as LooseRecord | undefined;
    const after = event.data?.after.data() as LooseRecord | undefined;
    if (!after || isCustomerDeletedJob(after)) {
      return;
    }
    const uid = str(after.uid);
    if (!uid) {
      return;
    }
    const milestone = milestoneForStageChange(
      before ? derivePipelineStage({ job: before }) : null,
      derivePipelineStage({ job: after }),
    );
    if (!milestone) {
      return;
    }
    const jobId = event.params.jobId;
    const queued = await queueGhlSyncTask(milestoneTaskId(jobId, milestone), {
      kind: "order_milestone",
      uid,
      jobId,
      milestone,
      marketingEmailOptIn: false,
      supportMessage: null,
      supportNoteId: null,
    });
    logger.info("ghl sync milestone", { jobId, milestone, queued });
  },
);

// --- Task processor (R9 retry + logging)

async function loadCustomer(input: {
  uid: string;
  orderData: LooseRecord | null;
}): Promise<GhlCustomerInfo> {
  let authEmail: string | null = null;
  let displayName: string | null = null;
  try {
    const user = await getAuth().getUser(input.uid);
    authEmail = normalizeEmail(user.email);
    displayName = str(user.displayName);
  } catch (error) {
    logger.warn("ghl sync could not read auth user", {
      uid: input.uid,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  // The account email is the contact identity; checkout's email is only a
  // fallback for guest (anonymous) checkouts.
  const email = authEmail ?? normalizeEmail(input.orderData?.customerEmail);
  const name = splitName(str(input.orderData?.customerName) ?? displayName);
  return { email, ...name };
}

function trackingFromOrder(orderData: LooseRecord | null) {
  const tracking = record(record(orderData?.fulfillment).tracking);
  const number = str(tracking.number);
  return number ? { carrier: str(tracking.carrier), number } : null;
}

export const processGhlSyncTask = onDocumentCreated(
  {
    document: `${ghlSyncTaskCollection}/{taskId}`,
    secrets: ghlSecrets,
    retry: true,
    timeoutSeconds: 120,
  },
  async (event) => {
    const db = getFirestore();
    const taskRef = db.collection(ghlSyncTaskCollection).doc(event.params.taskId);
    const taskSnap = await taskRef.get();
    const taskData = taskSnap.data() as LooseRecord | undefined;
    if (!taskData || taskData.status !== "pending") {
      return;
    }
    const task = taskData as unknown as GhlSyncTask & {
      attempts?: number;
      triggerSent?: boolean;
    };
    const attempt = (typeof task.attempts === "number" ? task.attempts : 0) + 1;
    const logContext = { taskId: taskRef.id, kind: task.kind, attempt };

    const finish = async (
      status: "done" | "skipped" | "failed",
      fields: LooseRecord = {},
    ) => {
      await taskRef.set(
        {
          status,
          attempts: attempt,
          ...fields,
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    };

    const token = process.env.GHL_API_TOKEN?.trim();
    if (!token) {
      logger.warn("ghl sync skipped: GHL_API_TOKEN not configured", logContext);
      await finish("skipped", { lastError: "ghl_not_configured" });
      return;
    }

    try {
      const orderData = task.jobId
        ? ((
            await db.collection("orders").doc(task.jobId).get()
          ).data() as LooseRecord | undefined) ?? null
        : null;
      const customer = await loadCustomer({ uid: task.uid, orderData });
      const plan = buildGhlSyncPlan(task, {
        customer,
        order: task.jobId
          ? { jobId: task.jobId, tracking: trackingFromOrder(orderData) }
          : null,
        publicAppUrl: process.env.PUBLIC_APP_URL?.trim() || null,
      });
      if ("skip" in plan) {
        logger.info("ghl sync skipped", { ...logContext, reason: plan.reason });
        await finish("skipped", { lastError: plan.reason });
        return;
      }

      const contactRef = db
        .collection(ghlCustomerContactCollection)
        .doc(task.uid);
      const result = await executeGhlSyncPlan({
        client: createGhlClient({ token }),
        plan,
        progress: { triggerSent: task.triggerSent === true },
        opportunityName: opportunityName(plan.contact),
        onContactId: async (contactId) => {
          await contactRef.set(
            {
              uid: task.uid,
              email: plan.contact.email,
              ghlContactId: contactId,
              ghlSyncedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        },
        onTriggerSent: async () => {
          await taskRef.set(
            { triggerSent: true, updatedAt: FieldValue.serverTimestamp() },
            { merge: true },
          );
        },
      });
      logger.info("ghl sync done", {
        ...logContext,
        contactId: result.contactId,
        triggerTags: plan.triggerTags,
        emailDndCleared: result.emailDndCleared,
      });
      await finish("done", {
        ghlContactId: result.contactId,
        emailDndCleared: result.emailDndCleared,
        lastError: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = error instanceof GhlApiError ? error.retryable : true;
      const eventTime = Date.parse(event.time);
      const expired =
        Number.isFinite(eventTime) &&
        Date.now() - eventTime > ghlSyncMaxRetryAgeMs;
      if (!retryable || expired) {
        logger.error("ghl sync failed", { ...logContext, message, expired });
        await finish("failed", { lastError: message.slice(0, 1000) });
        return;
      }
      logger.warn("ghl sync attempt failed; retrying", {
        ...logContext,
        message,
      });
      await taskRef.set(
        {
          attempts: attempt,
          lastError: message.slice(0, 1000),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      // Throwing makes Cloud Functions redeliver the event (retry: true).
      throw error;
    }
  },
);

// --- R9: account creation + marketing consent

const syncCustomerContactSchema = z.object({
  marketingEmailOptIn: z.boolean().optional(),
});

export const syncCustomerContact = onCall(async (request) => {
  const principal = requireSignedInAccount(request);
  const parsed = syncCustomerContactSchema.safeParse(request.data ?? {});
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Invalid contact sync request.");
  }
  const optIn = parsed.data.marketingEmailOptIn === true;
  const email = normalizeEmail(principal.email);
  if (!email) {
    return { queued: false };
  }

  await getFirestore()
    .collection(ghlCustomerContactCollection)
    .doc(principal.uid)
    .set(
      {
        uid: principal.uid,
        email,
        ...(optIn
          ? {
              marketingEmailOptIn: true,
              marketingEmailConsentAt: FieldValue.serverTimestamp(),
              marketingEmailConsentSource: "app_account_create",
            }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  const queued = await queueGhlSyncTask(
    `${accountTaskId(principal.uid)}_${optIn ? "optin" : "basic"}`,
    {
      kind: "account",
      uid: principal.uid,
      jobId: null,
      milestone: null,
      marketingEmailOptIn: optIn,
      supportMessage: null,
      supportNoteId: null,
    },
  );
  return { queued };
});

// --- R11: "Contact support about this order"

const requestOrderSupportSchema = z.object({
  jobId: z.string().trim().min(1).max(128),
  message: z.string().trim().min(1).max(2000),
});

const supportRequestCooldownMs = 60 * 1000;

export const requestOrderSupport = onCall(async (request) => {
  const principal = requireSignedInAccount(request);
  const parsed = requestOrderSupportSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError(
      "invalid-argument",
      "Write a message of up to 2,000 characters.",
    );
  }
  const { jobId, message } = parsed.data;
  const db = getFirestore();
  const jobRef = db.collection("jobs").doc(jobId);
  const noteRef = jobRef.collection("supportNotes").doc();
  const preview = `Customer: ${message}`.slice(0, 160);

  await db.runTransaction(async (tx) => {
    const jobSnap = await tx.get(jobRef);
    const jobData = jobSnap.data() as LooseRecord | undefined;
    if (!jobSnap.exists || !jobData || jobData.uid !== principal.uid) {
      throw new HttpsError("not-found", "Order not found for this account.");
    }
    const last = jobData.customerSupportLastRequestAt;
    if (
      last instanceof Timestamp &&
      Date.now() - last.toMillis() < supportRequestCooldownMs
    ) {
      throw new HttpsError(
        "resource-exhausted",
        "We just received your message. Please wait a minute before sending another.",
      );
    }
    tx.set(noteRef, {
      body: `Customer message: ${message}`,
      statusChange: "open",
      source: "customer",
      createdAt: FieldValue.serverTimestamp(),
      createdByUid: principal.uid,
      createdByEmail: principal.email,
    });
    tx.set(
      jobRef,
      {
        customerSupportLastRequestAt: FieldValue.serverTimestamp(),
        supportSummary: {
          status: "open",
          noteCount: FieldValue.increment(1),
          lastNoteAt: FieldValue.serverTimestamp(),
          lastNoteByUid: principal.uid,
          lastNoteByEmail: principal.email,
          lastNotePreview: preview,
          updatedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  await queueGhlSyncTask(supportTaskId(jobId, noteRef.id), {
    kind: "order_support",
    uid: principal.uid,
    jobId,
    milestone: null,
    marketingEmailOptIn: false,
    supportMessage: message,
    supportNoteId: noteRef.id,
  });

  return { ok: true, supportEmail: supportEmailAddress };
});

// --- Admin: link from the Support job to the GHL contact

export async function ghlContactLinkForUid(
  uid: unknown,
): Promise<string | null> {
  const id = str(uid);
  if (!id) {
    return null;
  }
  const snap = await getFirestore()
    .collection(ghlCustomerContactCollection)
    .doc(id)
    .get();
  return ghlContactUrl(str(snap.data()?.ghlContactId));
}
