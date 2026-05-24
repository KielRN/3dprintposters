const MAX_BODY_BYTES = 1024 * 1024;

function jsonResponse(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

async function hashText(value) {
  return new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  ));
}

async function constantTimeEqualText(a, b) {
  const aHash = await hashText(a || "");
  const bHash = await hashText(b || "");
  let diff = 0;

  for (let i = 0; i < aHash.length; i += 1) {
    diff |= aHash[i] ^ bHash[i];
  }

  return diff === 0;
}

async function readJsonWithLimit(request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return { error: "payload-too-large" };
  }

  if (!request.body) {
    return { error: "missing-body" };
  }

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return { error: "payload-too-large" };
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { value: JSON.parse(new TextDecoder().decode(body)) };
  } catch {
    return { error: "invalid-json" };
  }
}

function summarizeMeshyTask(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false };
  }

  return {
    valid: true,
    id: typeof payload.id === "string" ? payload.id : null,
    type: typeof payload.type === "string" ? payload.type : null,
    status: typeof payload.status === "string" ? payload.status : null,
    progress: typeof payload.progress === "number" ? payload.progress : null,
    hasModelUrls: Boolean(payload.model_urls && typeof payload.model_urls === "object"),
    hasThumbnailUrl: typeof payload.thumbnail_url === "string",
    finishedAt: typeof payload.finished_at === "number" ? payload.finished_at : null
  };
}

function summarizeHeaders(headers) {
  const names = [];
  for (const [name] of headers) {
    names.push(name.toLowerCase());
  }
  names.sort();

  const signatureHeaderNames = names.filter((name) =>
    name.includes("signature") ||
    name.includes("secret") ||
    name.includes("webhook") ||
    name.startsWith("x-meshy")
  );

  return {
    signatureHeaderNames,
    hasSignatureLikeHeader: signatureHeaderNames.length > 0,
    hasMeshyUserIdHeader: names.includes("x-meshy-api-webhook-user-id")
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return jsonResponse({
        ok: true,
        service: "3dprintyou-meshy-webhook",
        environment: env.ENVIRONMENT || "unknown",
        webhookSecretConfigured: Boolean(env.MESHY_WEBHOOK_SECRET)
      });
    }

    if (url.pathname !== "/webhooks/meshy") {
      return jsonResponse({ ok: false, error: "not-found" }, { status: 404 });
    }

    if (request.method === "GET") {
      return jsonResponse({
        ok: true,
        service: "3dprintyou-meshy-webhook",
        expectedMethod: "POST"
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "method-not-allowed" }, {
        status: 405,
        headers: { allow: "GET, POST" }
      });
    }

    if (!env.MESHY_WEBHOOK_SECRET) {
      return jsonResponse({ ok: false, error: "webhook-secret-not-configured" }, { status: 503 });
    }

    const meshySecretHeader = request.headers.get("x-meshy-api-webhook-secret-key");
    const secretMatches = await constantTimeEqualText(meshySecretHeader, env.MESHY_WEBHOOK_SECRET);
    if (!secretMatches) {
      return jsonResponse({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return jsonResponse({ ok: false, error: "unsupported-media-type" }, { status: 415 });
    }

    const parsed = await readJsonWithLimit(request);
    if (parsed.error) {
      const status = parsed.error === "payload-too-large" ? 413 : 400;
      return jsonResponse({ ok: false, error: parsed.error }, { status });
    }

    const summary = summarizeMeshyTask(parsed.value);
    const headerSummary = summarizeHeaders(request.headers);
    ctx.waitUntil((async () => {
      console.log(JSON.stringify({
        event: "meshy.webhook.received",
        summary,
        headerSummary
      }));
    })());

    return jsonResponse({
      ok: true,
      accepted: true,
      taskId: summary.id,
      status: summary.status
    }, { status: 202 });
  }
};
