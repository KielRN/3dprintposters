// 3DPrintYou -> GoHighLevel (GHL) contact sync, order-milestone tags, and
// order support requests (3DPrintYou PRD R9-R11).
//
// Everything in this file is pure (no Firebase imports) so it can be unit
// tested. The Firebase triggers/callables that feed it live in
// ghlSyncFunctions.ts.
//
// Design:
// - App events never call GHL inline. They write a task document to the
//   server-only `ghlSyncTasks` collection, and a retrying Firestore trigger
//   processes it. A GHL outage therefore never blocks signup or checkout, and
//   every attempt is logged on the task document.
// - GHL matches contacts on email (the TxAI sub-account has
//   allowDuplicateContact = false, PRD D20), so the contacts/upsert endpoint
//   never creates duplicates.
// - Order emails are sent by GHL workflows triggered by the milestone tags
//   below (tag triggers are not premium, PRD Q3). Each workflow removes its
//   tag when it finishes; the sync removes and re-adds the tag anyway so a
//   lingering tag from an earlier order cannot swallow the next trigger.

import { displayJobId, type PipelineStage } from "./pipeline.js";

// --- GHL asset IDs (TxAI sub-account; recorded in 3DPrintyou/GHL-build-spec.md §10)

export const ghlApiBaseUrl = "https://services.leadconnectorhq.com";
export const ghlApiVersion = "2021-07-28";
export const ghlAppBaseUrl = "https://app.gohighlevel.com";
export const ghlLocationId = "d2K8peAv7MftCHYvXMjv";

export const ghlPipeline = {
  id: "IfEr7QGaZx10t7xxYuMM",
  orderedStageId: "08467dce-570b-4f5a-aec4-554e421eab76",
} as const;

// Custom field IDs in folder `3DPrintYou`. The merge keys use double
// underscores, e.g. {{contact.3dpy__last_order_id}}.
export const ghlCustomFieldIds = {
  firebaseUid: "K7BswNYsRoXEwXxwudNc",
  lastOrderId: "WIgOqW7eoFnIR8eoTtxN",
  lastOrderStatus: "ERt4gvCHWWZuRpg7nQj0",
  adminLink: "e3Th6GobuRwe8BfCn2wC",
  // Created 2026-11-23 for R10 email links: {{contact.3dpy__order_link}},
  // {{contact.3dpy__tracking}}.
  orderLink: "InpWiV2862onCqwjGmGx",
  tracking: "CO6mvfeJvpEbUTugHqXS",
} as const;

export const ghlTags = {
  brand: "3dprintyou",
  sourceApp: "3dpy-src-app",
  emailOptIn: "3dpy-email-optin",
  supportRequest: "3dpy-support-request",
} as const;

export const ghlOrderMilestones = {
  proof_ready: { tag: "3dpy-proof-ready", statusLabel: "Proof ready" },
  paid: { tag: "3dpy-paid", statusLabel: "Payment received" },
  in_production: { tag: "3dpy-in-production", statusLabel: "In production" },
  shipped: { tag: "3dpy-shipped", statusLabel: "Shipped" },
  delivered: { tag: "3dpy-delivered", statusLabel: "Delivered" },
} as const;

export type GhlOrderMilestone = keyof typeof ghlOrderMilestones;

export function isGhlOrderMilestone(value: unknown): value is GhlOrderMilestone {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(ghlOrderMilestones, value)
  );
}

const stageMilestones: Partial<Record<PipelineStage, GhlOrderMilestone>> = {
  preview_ready: "proof_ready",
  paid: "paid",
  in_production: "in_production",
  shipped: "shipped",
  completed: "delivered",
};

/**
 * The milestone a job just reached, or null when the stage did not change or
 * the new stage has no customer email. Idempotency (one email per milestone
 * per order) is enforced by the task ID, not here.
 */
export function milestoneForStageChange(
  before: PipelineStage | null,
  after: PipelineStage | null,
): GhlOrderMilestone | null {
  if (!after || before === after) {
    return null;
  }
  return stageMilestones[after] ?? null;
}

// --- Task documents

export const ghlSyncTaskCollection = "ghlSyncTasks";
export const ghlCustomerContactCollection = "customerContacts";

export type GhlSyncTaskKind = "account" | "order_milestone" | "order_support";

export type GhlSyncTaskStatus =
  | "pending"
  | "done"
  | "skipped"
  | "failed";

export type GhlSyncTask = {
  kind: GhlSyncTaskKind;
  uid: string;
  jobId: string | null;
  milestone: GhlOrderMilestone | null;
  marketingEmailOptIn: boolean;
  supportMessage: string | null;
  supportNoteId: string | null;
};

export function accountTaskId(uid: string): string {
  return `account_${uid}`;
}

export function milestoneTaskId(jobId: string, milestone: GhlOrderMilestone) {
  return `order_${jobId}_${milestone}`;
}

export function supportTaskId(jobId: string, noteId: string) {
  return `support_${jobId}_${noteId}`;
}

// Retry window for the Firestore trigger. Past this age a still-failing task
// is marked failed instead of being retried again.
export const ghlSyncMaxRetryAgeMs = 24 * 60 * 60 * 1000;

// --- Building the sync plan

export type GhlCustomerInfo = {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type GhlOrderInfo = {
  jobId: string;
  tracking: { carrier: string | null; number: string | null } | null;
};

export type GhlSyncContext = {
  customer: GhlCustomerInfo;
  order: GhlOrderInfo | null;
  publicAppUrl: string | null;
};

export type GhlSyncPlan = {
  contact: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    customFields: Record<string, string>;
  };
  // Tags added once (brand/source/consent). Never removed by the app.
  addTags: string[];
  // Workflow trigger tags: removed and re-added as the very last step.
  triggerTags: string[];
  note: string | null;
  opportunityStageId: string | null;
  clearEmailDnd: boolean;
};

export type GhlSyncSkip = { skip: true; reason: string };

export function splitName(fullName: string | null | undefined): {
  firstName: string | null;
  lastName: string | null;
} {
  const trimmed = typeof fullName === "string" ? fullName.trim() : "";
  if (!trimmed) {
    return { firstName: null, lastName: null };
  }
  const parts = trimmed.split(/\s+/);
  const firstName = parts.shift() ?? null;
  return { firstName, lastName: parts.length ? parts.join(" ") : null };
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function trimUrl(base: string | null): string | null {
  const value = base?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

export function adminJobUrl(publicAppUrl: string | null, jobId: string) {
  const base = trimUrl(publicAppUrl);
  return base ? `${base}/admin?job=${encodeURIComponent(jobId)}` : null;
}

export function customerOrderUrl(publicAppUrl: string | null, jobId: string) {
  const base = trimUrl(publicAppUrl);
  return base ? `${base}/orders/${encodeURIComponent(jobId)}` : null;
}

export function customerProofUrl(publicAppUrl: string | null, jobId: string) {
  const base = trimUrl(publicAppUrl);
  return base ? `${base}/jobs/${encodeURIComponent(jobId)}` : null;
}

export function ghlContactUrl(contactId: string | null | undefined) {
  return contactId
    ? `${ghlAppBaseUrl}/v2/location/${ghlLocationId}/contacts/detail/${encodeURIComponent(contactId)}`
    : null;
}

export function formatTracking(
  tracking: GhlOrderInfo["tracking"],
): string | null {
  if (!tracking?.number) {
    return null;
  }
  return tracking.carrier
    ? `${tracking.carrier} ${tracking.number}`
    : tracking.number;
}

function orderFields(input: {
  uid: string;
  jobId: string;
  statusLabel: string | null;
  milestone: GhlOrderMilestone | null;
  context: GhlSyncContext;
}): Record<string, string> {
  const fields: Record<string, string> = {
    [ghlCustomFieldIds.firebaseUid]: input.uid,
    [ghlCustomFieldIds.lastOrderId]: displayJobId(input.jobId),
  };
  if (input.statusLabel) {
    fields[ghlCustomFieldIds.lastOrderStatus] = input.statusLabel;
  }
  const adminLink = adminJobUrl(input.context.publicAppUrl, input.jobId);
  if (adminLink) {
    fields[ghlCustomFieldIds.adminLink] = adminLink;
  }
  // Before payment the customer link is the proof page; afterwards it is the
  // order-status page.
  const customerLink =
    input.milestone === "proof_ready"
      ? customerProofUrl(input.context.publicAppUrl, input.jobId)
      : customerOrderUrl(input.context.publicAppUrl, input.jobId);
  if (customerLink) {
    fields[ghlCustomFieldIds.orderLink] = customerLink;
  }
  const tracking = formatTracking(input.context.order?.tracking ?? null);
  if (tracking) {
    fields[ghlCustomFieldIds.tracking] = tracking;
  }
  return fields;
}

export function buildGhlSyncPlan(
  task: GhlSyncTask,
  context: GhlSyncContext,
): GhlSyncPlan | GhlSyncSkip {
  const email = normalizeEmail(context.customer.email);
  if (!email) {
    return { skip: true, reason: "no_customer_email" };
  }

  const contact = {
    email,
    firstName: context.customer.firstName,
    lastName: context.customer.lastName,
    customFields: { [ghlCustomFieldIds.firebaseUid]: task.uid } as Record<
      string,
      string
    >,
  };
  const addTags: string[] = [ghlTags.brand, ghlTags.sourceApp];

  if (task.kind === "account") {
    if (task.marketingEmailOptIn) {
      addTags.push(ghlTags.emailOptIn);
    }
    return {
      contact,
      addTags,
      triggerTags: [],
      note: null,
      opportunityStageId: null,
      clearEmailDnd: false,
    };
  }

  if (!task.jobId) {
    return { skip: true, reason: "missing_job_id" };
  }

  if (task.kind === "order_milestone") {
    if (!isGhlOrderMilestone(task.milestone)) {
      return { skip: true, reason: "unknown_milestone" };
    }
    const milestone = ghlOrderMilestones[task.milestone];
    contact.customFields = orderFields({
      uid: task.uid,
      jobId: task.jobId,
      statusLabel: milestone.statusLabel,
      milestone: task.milestone,
      context,
    });
    const isPaid = task.milestone === "paid";
    return {
      contact,
      addTags,
      triggerTags: [milestone.tag],
      note: null,
      // PRD D23: an order moves the opportunity to Ordered and clears Email
      // DND (the `unsubscribed` tag is left alone, so marketing stays off).
      opportunityStageId: isPaid ? ghlPipeline.orderedStageId : null,
      clearEmailDnd: isPaid,
    };
  }

  if (task.kind === "order_support") {
    const message = task.supportMessage?.trim();
    if (!message) {
      return { skip: true, reason: "empty_support_message" };
    }
    contact.customFields = orderFields({
      uid: task.uid,
      jobId: task.jobId,
      statusLabel: null,
      milestone: null,
      context,
    });
    const adminLink = adminJobUrl(context.publicAppUrl, task.jobId);
    const note = [
      `3DPrintYou support request about order ${displayJobId(task.jobId)} (job ${task.jobId}):`,
      "",
      message,
      ...(adminLink ? ["", `Admin job: ${adminLink}`] : []),
    ].join("\n");
    return {
      contact,
      addTags,
      triggerTags: [ghlTags.supportRequest],
      note,
      opportunityStageId: null,
      clearEmailDnd: false,
    };
  }

  return { skip: true, reason: "unknown_task_kind" };
}

// --- DND handling (PRD D23)

const dndChannels = ["SMS", "Email", "GMB", "Call", "WhatsApp", "FB"] as const;

type DndChannelSetting = { status?: string; message?: string; code?: string };

/**
 * The contact update that turns Email DND off while leaving every other
 * channel exactly as it was. Returns null when Email is already allowed.
 * When the global `dnd` flag is on, GHL treats every channel as blocked, so
 * the update turns the flag off and marks each other channel active
 * explicitly to preserve them.
 */
export function emailDndClearUpdate(contact: {
  dnd?: unknown;
  dndSettings?: unknown;
}): { dnd?: boolean; dndSettings: Record<string, DndChannelSetting> } | null {
  const settings =
    contact.dndSettings && typeof contact.dndSettings === "object"
      ? (contact.dndSettings as Record<string, DndChannelSetting>)
      : {};
  const globalDnd = contact.dnd === true;
  const emailBlocked = globalDnd || settings.Email?.status === "active";
  if (!emailBlocked) {
    return null;
  }
  const next: Record<string, DndChannelSetting> = {};
  for (const channel of dndChannels) {
    if (channel === "Email") {
      next.Email = { status: "inactive" };
    } else if (globalDnd) {
      next[channel] = { ...(settings[channel] ?? {}), status: "active" };
    } else if (settings[channel]) {
      next[channel] = settings[channel];
    }
  }
  return globalDnd ? { dnd: false, dndSettings: next } : { dndSettings: next };
}

// --- HTTP client

export class GhlApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GhlApiError";
  }
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export type GhlClient = {
  upsertContact(input: GhlSyncPlan["contact"]): Promise<string>;
  getContact(contactId: string): Promise<Record<string, unknown>>;
  updateContact(contactId: string, body: Record<string, unknown>): Promise<void>;
  addTags(contactId: string, tags: string[]): Promise<void>;
  removeTags(contactId: string, tags: string[]): Promise<void>;
  addNote(contactId: string, body: string): Promise<void>;
  upsertOpportunity(input: {
    contactId: string;
    pipelineStageId: string;
    name: string;
  }): Promise<void>;
};

export function createGhlClient(input: {
  token: string;
  fetchImpl?: FetchLike;
}): GhlClient {
  const fetchImpl: FetchLike =
    input.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);

  async function call(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await fetchImpl(`${ghlApiBaseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${input.token}`,
          Version: ghlApiVersion,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      throw new GhlApiError(
        `GHL ${method} ${path} network error: ${error instanceof Error ? error.message : String(error)}`,
        null,
        true,
      );
    }
    const text = await response.text();
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new GhlApiError(
        `GHL ${method} ${path} failed with ${response.status}: ${text.slice(0, 300)}`,
        response.status,
        retryable,
      );
    }
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  return {
    async upsertContact(contact) {
      const result = await call("POST", "/contacts/upsert", {
        locationId: ghlLocationId,
        email: contact.email,
        ...(contact.firstName ? { firstName: contact.firstName } : {}),
        ...(contact.lastName ? { lastName: contact.lastName } : {}),
        source: "3DPrintYou app",
        customFields: Object.entries(contact.customFields).map(
          ([id, value]) => ({ id, field_value: value }),
        ),
      });
      const created = result.contact as { id?: unknown } | undefined;
      if (typeof created?.id !== "string" || !created.id) {
        throw new GhlApiError(
          "GHL contact upsert returned no contact id.",
          null,
          true,
        );
      }
      return created.id;
    },
    async getContact(contactId) {
      const result = await call(
        "GET",
        `/contacts/${encodeURIComponent(contactId)}`,
      );
      return (result.contact as Record<string, unknown> | undefined) ?? {};
    },
    async updateContact(contactId, body) {
      await call("PUT", `/contacts/${encodeURIComponent(contactId)}`, body);
    },
    async addTags(contactId, tags) {
      if (tags.length) {
        await call("POST", `/contacts/${encodeURIComponent(contactId)}/tags`, {
          tags,
        });
      }
    },
    async removeTags(contactId, tags) {
      if (tags.length) {
        await call(
          "DELETE",
          `/contacts/${encodeURIComponent(contactId)}/tags`,
          { tags },
        );
      }
    },
    async addNote(contactId, body) {
      await call("POST", `/contacts/${encodeURIComponent(contactId)}/notes`, {
        body,
      });
    },
    async upsertOpportunity(opportunity) {
      await call("POST", "/opportunities/upsert", {
        locationId: ghlLocationId,
        pipelineId: ghlPipeline.id,
        pipelineStageId: opportunity.pipelineStageId,
        contactId: opportunity.contactId,
        name: opportunity.name,
        status: "open",
      });
    },
  };
}

// --- Executing a plan

export type GhlPlanProgress = {
  // Set once the workflow trigger tags were added, so a retry after that
  // point never re-triggers the workflow (one email per milestone).
  triggerSent: boolean;
};

export async function executeGhlSyncPlan(input: {
  client: GhlClient;
  plan: GhlSyncPlan;
  progress: GhlPlanProgress;
  opportunityName: string;
  onContactId?: (contactId: string) => Promise<void>;
  onTriggerSent?: () => Promise<void>;
}): Promise<{ contactId: string; emailDndCleared: boolean }> {
  const { client, plan } = input;
  const contactId = await client.upsertContact(plan.contact);
  await input.onContactId?.(contactId);

  await client.addTags(contactId, plan.addTags);

  if (plan.opportunityStageId) {
    await client.upsertOpportunity({
      contactId,
      pipelineStageId: plan.opportunityStageId,
      name: input.opportunityName,
    });
  }

  let emailDndCleared = false;
  if (plan.clearEmailDnd) {
    const update = emailDndClearUpdate(await client.getContact(contactId));
    if (update) {
      await client.updateContact(contactId, update);
      emailDndCleared = true;
    }
  }

  if (plan.note && !input.progress.triggerSent) {
    await client.addNote(contactId, plan.note);
  }

  if (plan.triggerTags.length && !input.progress.triggerSent) {
    await client.removeTags(contactId, plan.triggerTags);
    await client.addTags(contactId, plan.triggerTags);
    await input.onTriggerSent?.();
  }

  return { contactId, emailDndCleared };
}

export function opportunityName(input: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const name = [input.firstName, input.lastName].filter(Boolean).join(" ");
  return `${name || input.email} – 3DPrintYou`;
}
