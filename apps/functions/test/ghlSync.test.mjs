import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGhlSyncPlan,
  createGhlClient,
  emailDndClearUpdate,
  executeGhlSyncPlan,
  ghlCustomFieldIds,
  ghlPipeline,
  GhlApiError,
  milestoneForStageChange,
  milestoneTaskId,
} from "../lib/ghlSync.js";

const appUrl = "https://app.example.test/";
const customer = { email: " Fan@Example.com ", firstName: "Ada", lastName: "Lovelace" };

function task(overrides = {}) {
  return {
    kind: "order_milestone",
    uid: "uid-1",
    jobId: "job-abcde12345",
    milestone: "paid",
    marketingEmailOptIn: false,
    supportMessage: null,
    supportNoteId: null,
    ...overrides,
  };
}

test("stage changes map to milestones only when the stage changes", () => {
  assert.equal(milestoneForStageChange("generating", "preview_ready"), "proof_ready");
  assert.equal(milestoneForStageChange("3d_ready", "paid"), "paid");
  assert.equal(milestoneForStageChange("accepted", "in_production"), "in_production");
  assert.equal(milestoneForStageChange("in_production", "shipped"), "shipped");
  assert.equal(milestoneForStageChange("shipped", "completed"), "delivered");
  assert.equal(milestoneForStageChange("paid", "paid"), null);
  assert.equal(milestoneForStageChange("paid", "accepted"), null);
  assert.equal(milestoneForStageChange("shipped", "refunded"), null);
  assert.equal(milestoneForStageChange(null, null), null);
});

test("milestone task IDs are deterministic per order and milestone", () => {
  assert.equal(milestoneTaskId("job1", "shipped"), "order_job1_shipped");
});

test("plans skip customers without an email", () => {
  const plan = buildGhlSyncPlan(task(), {
    customer: { email: null, firstName: null, lastName: null },
    order: null,
    publicAppUrl: appUrl,
  });
  assert.deepEqual(plan, { skip: true, reason: "no_customer_email" });
});

test("account plan only adds the opt-in tag when the customer opted in", () => {
  const context = { customer, order: null, publicAppUrl: appUrl };
  const optedOut = buildGhlSyncPlan(task({ kind: "account", jobId: null, milestone: null }), context);
  assert.deepEqual(optedOut.addTags, ["3dprintyou", "3dpy-src-app"]);
  assert.equal(optedOut.contact.email, "fan@example.com");
  assert.deepEqual(optedOut.triggerTags, []);

  const optedIn = buildGhlSyncPlan(
    task({ kind: "account", jobId: null, milestone: null, marketingEmailOptIn: true }),
    context,
  );
  assert.ok(optedIn.addTags.includes("3dpy-email-optin"));
});

test("paid plan moves the opportunity to Ordered, clears Email DND, and triggers once", () => {
  const plan = buildGhlSyncPlan(task(), { customer, order: null, publicAppUrl: appUrl });
  assert.deepEqual(plan.triggerTags, ["3dpy-paid"]);
  assert.equal(plan.opportunityStageId, ghlPipeline.orderedStageId);
  assert.equal(plan.clearEmailDnd, true);
  assert.ok(!plan.addTags.includes("3dpy-email-optin"));
  const fields = plan.contact.customFields;
  assert.equal(fields[ghlCustomFieldIds.lastOrderId], "12345");
  assert.equal(fields[ghlCustomFieldIds.lastOrderStatus], "Payment received");
  assert.equal(fields[ghlCustomFieldIds.adminLink], "https://app.example.test/admin?job=job-abcde12345");
  assert.equal(fields[ghlCustomFieldIds.orderLink], "https://app.example.test/orders/job-abcde12345");
});

test("proof-ready links to the proof page; shipped carries tracking", () => {
  const proof = buildGhlSyncPlan(task({ milestone: "proof_ready" }), {
    customer,
    order: null,
    publicAppUrl: appUrl,
  });
  assert.equal(proof.contact.customFields[ghlCustomFieldIds.orderLink], "https://app.example.test/jobs/job-abcde12345");
  assert.equal(proof.clearEmailDnd, false);
  assert.equal(proof.opportunityStageId, null);

  const shipped = buildGhlSyncPlan(task({ milestone: "shipped" }), {
    customer,
    order: { jobId: "job-abcde12345", tracking: { carrier: "UPS", number: "1Z999" } },
    publicAppUrl: appUrl,
  });
  assert.equal(shipped.contact.customFields[ghlCustomFieldIds.tracking], "UPS 1Z999");
  assert.deepEqual(shipped.triggerTags, ["3dpy-shipped"]);
});

test("support plan writes a note with the order and admin link", () => {
  const plan = buildGhlSyncPlan(
    task({ kind: "order_support", milestone: null, supportMessage: "Where is my hero?" }),
    { customer, order: null, publicAppUrl: appUrl },
  );
  assert.deepEqual(plan.triggerTags, ["3dpy-support-request"]);
  assert.match(plan.note, /order 12345/);
  assert.match(plan.note, /Where is my hero\?/);
  assert.match(plan.note, /admin\?job=job-abcde12345/);
});

test("Email DND clear keeps other channels blocked", () => {
  assert.equal(emailDndClearUpdate({ dnd: false, dndSettings: {} }), null);
  assert.equal(emailDndClearUpdate({ dndSettings: { Email: { status: "inactive" } } }), null);

  const global = emailDndClearUpdate({ dnd: true, dndSettings: {} });
  assert.equal(global.dnd, false);
  assert.equal(global.dndSettings.Email.status, "inactive");
  assert.equal(global.dndSettings.SMS.status, "active");
  assert.equal(global.dndSettings.Call.status, "active");

  const emailOnly = emailDndClearUpdate({
    dnd: false,
    dndSettings: { Email: { status: "active" }, SMS: { status: "inactive" } },
  });
  assert.equal(emailOnly.dnd, undefined);
  assert.equal(emailOnly.dndSettings.Email.status, "inactive");
  assert.equal(emailOnly.dndSettings.SMS.status, "inactive");
});

function fakeFetch(responses = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const path = url.replace("https://services.leadconnectorhq.com", "");
    calls.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : null });
    const key = `${init.method} ${path}`;
    const response = responses[key] ?? { status: 200, body: {} };
    return {
      ok: response.status < 400,
      status: response.status,
      text: async () => JSON.stringify(response.body),
    };
  };
  return { calls, fetchImpl };
}

test("executing a paid plan runs the trigger tag last and only once", async () => {
  const { calls, fetchImpl } = fakeFetch({
    "POST /contacts/upsert": { status: 200, body: { contact: { id: "c1" } } },
    "GET /contacts/c1": { status: 200, body: { contact: { dnd: true, dndSettings: {} } } },
  });
  const plan = buildGhlSyncPlan(task(), { customer, order: null, publicAppUrl: appUrl });
  let triggerSent = 0;
  const result = await executeGhlSyncPlan({
    client: createGhlClient({ token: "t", fetchImpl }),
    plan,
    progress: { triggerSent: false },
    opportunityName: "Ada Lovelace – 3DPrintYou",
    onTriggerSent: async () => {
      triggerSent += 1;
    },
  });
  assert.equal(result.contactId, "c1");
  assert.equal(result.emailDndCleared, true);
  assert.equal(triggerSent, 1);
  const sequence = calls.map((call) => `${call.method} ${call.path}`);
  assert.deepEqual(sequence, [
    "POST /contacts/upsert",
    "POST /contacts/c1/tags",
    "POST /opportunities/upsert",
    "GET /contacts/c1",
    "PUT /contacts/c1",
    "DELETE /contacts/c1/tags",
    "POST /contacts/c1/tags",
  ]);
  assert.deepEqual(calls.at(-1).body, { tags: ["3dpy-paid"] });
  assert.equal(calls[0].body.tags, undefined, "upsert must not replace existing tags");

  const retry = fakeFetch({
    "POST /contacts/upsert": { status: 200, body: { contact: { id: "c1" } } },
    "GET /contacts/c1": { status: 200, body: { contact: { dnd: false } } },
  });
  await executeGhlSyncPlan({
    client: createGhlClient({ token: "t", fetchImpl: retry.fetchImpl }),
    plan,
    progress: { triggerSent: true },
    opportunityName: "x",
  });
  assert.ok(!retry.calls.some((call) => call.method === "DELETE"));
});

test("GHL errors are retryable only for 429 and 5xx", async () => {
  for (const [status, retryable] of [[429, true], [503, true], [400, false], [401, false]]) {
    const { fetchImpl } = fakeFetch({ "POST /contacts/upsert": { status, body: { message: "x" } } });
    const client = createGhlClient({ token: "t", fetchImpl });
    await assert.rejects(
      client.upsertContact({ email: "a@b.co", firstName: null, lastName: null, customFields: {} }),
      (error) => error instanceof GhlApiError && error.retryable === retryable,
    );
  }
});
