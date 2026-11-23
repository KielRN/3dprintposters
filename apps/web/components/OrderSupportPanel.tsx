"use client";

import type { FirebaseCoreClients } from "@/lib/firebaseCore";
import { callableErrorMessage } from "@/lib/callableRetry";
import { AlertCircle, CheckCircle2, LifeBuoy, Loader2, Mail } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { useState } from "react";

const supportEmail = "support@3dprintyou.com";
const maxMessageLength = 2000;

// 3DPrintYou PRD R11: "Contact support about this order". The message lands on
// the admin Support job and in the customer's GHL contact (tagged
// 3dpy-support-request, which alerts Elliott). The email link is the fallback.
export function OrderSupportPanel({
  firebaseClients,
  orderId,
  displayOrderId,
}: {
  firebaseClients: FirebaseCoreClients | null;
  orderId: string;
  displayOrderId: string;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const subject = `Order ${displayOrderId}`;
  const mailto = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}`;
  const trimmed = message.trim();

  async function submit() {
    if (!firebaseClients || !trimmed) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const request = httpsCallable<
        { jobId: string; message: string },
        { ok: boolean }
      >(firebaseClients.functions, "requestOrderSupport");
      await request({ jobId: orderId, message: trimmed });
      setSent(true);
      setMessage("");
    } catch (submitError) {
      setError(
        callableErrorMessage(
          submitError,
          "Your message did not send. Please email us instead.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className="rounded-lg border border-black/10 bg-white p-4"
      aria-labelledby="order-support-title"
    >
      <div className="flex items-center gap-2">
        <LifeBuoy className="text-[var(--teal)]" size={20} aria-hidden="true" />
        <h2 id="order-support-title" className="text-lg font-semibold">
          Contact support about this order
        </h2>
      </div>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Order {displayOrderId} is attached automatically. We reply by email
        within one business day.
      </p>

      {sent ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--teal)]/30 bg-[var(--teal)]/10 px-3 py-2 text-sm font-semibold text-[var(--teal)]">
          <CheckCircle2 className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
          Thanks, we got your message. Watch your inbox for our reply.
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          <label className="sr-only" htmlFor="order-support-message">
            Your message
          </label>
          <textarea
            id="order-support-message"
            className="text-input min-h-28 resize-y py-2"
            maxLength={maxMessageLength}
            placeholder="How can we help with this order?"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="button-primary-compact"
              disabled={busy || !trimmed || !firebaseClients}
              onClick={() => void submit()}
            >
              {busy ? (
                <Loader2 className="animate-spin" size={16} aria-hidden="true" />
              ) : null}
              Send message
            </button>
            <a
              className="inline-flex items-center gap-1 text-sm font-semibold underline"
              href={mailto}
            >
              <Mail size={15} aria-hidden="true" />
              Or email {supportEmail}
            </a>
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-[var(--coral)]">
          <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </article>
  );
}
