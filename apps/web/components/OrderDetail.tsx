"use client";

import { getFirebaseClients } from "@/lib/firebase";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  PackageCheck,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";

type OrderDocument = {
  uid: string;
  jobId: string;
  approvedImagePath?: string | null;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  stripeCheckoutSessionId?: string | null;
  provider?: string | null;
  providerOrderId?: string | null;
  priceSnapshot?: {
    currency?: string;
    unitAmount?: number;
    stripePriceId?: string | null;
  };
};

function formatMoney(unitAmount?: number, currency?: string) {
  if (!unitAmount || !currency) {
    return "Pending";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(unitAmount / 100);
}

function readableStatus(status: string) {
  return status.replaceAll("_", " ");
}

export function OrderDetail({ orderId }: { orderId: string }) {
  const firebaseClients = useMemo(() => getFirebaseClients(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(firebaseClients));
  const [order, setOrder] = useState<OrderDocument | null>(null);
  const [orderLoading, setOrderLoading] = useState(Boolean(firebaseClients));
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!firebaseClients) {
      setAuthLoading(false);
      setOrderLoading(false);
      return;
    }

    return onAuthStateChanged(firebaseClients.auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
    });
  }, [firebaseClients]);

  useEffect(() => {
    const checkoutStatus = new URLSearchParams(window.location.search).get(
      "checkout",
    );
    if (checkoutStatus === "success") {
      setNotice("Checkout completed. Payment confirmation can take a moment.");
    }
  }, []);

  useEffect(() => {
    if (!firebaseClients || !user) {
      return;
    }

    setOrderLoading(true);
    setError("");

    return onSnapshot(
      doc(firebaseClients.firestore, "orders", orderId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setOrder(null);
          setError("Order not found for this signed-in account.");
          setOrderLoading(false);
          return;
        }

        setOrder(snapshot.data() as OrderDocument);
        setOrderLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError.message);
        setOrderLoading(false);
      },
    );
  }, [firebaseClients, orderId, user]);

  return (
    <section className="panel min-w-0 rounded-lg p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            className="inline-flex items-center gap-2 text-sm font-bold text-[var(--muted)]"
            href={order?.jobId ? `/jobs/${order.jobId}` : "/start"}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {order?.jobId ? "Back to proof" : "New order"}
          </Link>
          <h1 className="display mt-3 text-2xl sm:text-3xl">
            Order status
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Track payment, proof, and fulfillment state for this poster order.
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--teal)] text-white">
          <PackageCheck size={22} aria-hidden="true" />
        </div>
      </div>

      {!firebaseClients ? (
        <p className="mt-5 rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-sm font-semibold text-[var(--coral)]">
          Add Firebase web env values in{" "}
          <code className="break-all">apps/web/.env.local</code>.
        </p>
      ) : null}

      {notice ? (
        <p className="mt-5 flex items-start gap-2 rounded-lg border border-[var(--teal)]/30 bg-[var(--teal)]/10 px-3 py-2 text-sm font-semibold text-[var(--teal)]">
          <CheckCircle2
            className="mt-0.5 shrink-0"
            size={16}
            aria-hidden="true"
          />
          {notice}
        </p>
      ) : null}

      {error ? (
        <p className="mt-5 flex items-start gap-2 rounded-lg border border-[var(--coral)]/30 bg-[var(--coral)]/10 px-3 py-2 text-sm font-semibold text-[var(--coral)]">
          <AlertCircle
            className="mt-0.5 shrink-0"
            size={16}
            aria-hidden="true"
          />
          {error}
        </p>
      ) : null}

      {authLoading || orderLoading ? (
        <div className="mt-8 flex min-h-60 items-center justify-center gap-3 rounded-lg border border-black/10 bg-white text-sm font-bold text-[var(--muted)]">
          <RefreshCw className="animate-spin" size={18} aria-hidden="true" />
          Loading order
        </div>
      ) : null}

      {!authLoading && !user ? (
        <div className="mt-8 rounded-lg border border-black/10 bg-white p-5">
          <p className="font-bold">Sign in to view this order.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Use the same account that created checkout.
          </p>
        </div>
      ) : null}

      {order ? (
        <div className="mt-8 grid gap-4">
          <div className="grid gap-4 rounded-lg border border-black/10 bg-black/[0.025] p-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-[var(--muted)]">Order</p>
              <strong className="break-all">{orderId}</strong>
            </div>
            <div>
              <p className="text-[var(--muted)]">Job</p>
              <Link
                className="font-bold underline"
                href={`/jobs/${order.jobId}`}
              >
                {order.jobId}
              </Link>
            </div>
            <div>
              <p className="text-[var(--muted)]">Total</p>
              <strong>
                {formatMoney(
                  order.priceSnapshot?.unitAmount,
                  order.priceSnapshot?.currency,
                )}
              </strong>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-lg border border-black/10 bg-white p-4">
              <Clock3
                className="text-[var(--gold)]"
                size={22}
                aria-hidden="true"
              />
              <h2 className="mt-3 text-lg font-semibold">Payment</h2>
              <p className="mt-1 text-sm font-bold capitalize">
                {readableStatus(order.paymentStatus)}
              </p>
            </article>
            <article className="rounded-lg border border-black/10 bg-white p-4">
              <CheckCircle2
                className="text-[var(--teal)]"
                size={22}
                aria-hidden="true"
              />
              <h2 className="mt-3 text-lg font-semibold">Proof</h2>
              <p className="mt-1 text-sm font-bold">
                {order.approvedImagePath ? "Approved" : "Not approved"}
              </p>
            </article>
            <article className="rounded-lg border border-black/10 bg-white p-4">
              <PackageCheck
                className="text-[var(--coral)]"
                size={22}
                aria-hidden="true"
              />
              <h2 className="mt-3 text-lg font-semibold">Fulfillment</h2>
              <p className="mt-1 text-sm font-bold capitalize">
                {readableStatus(order.fulfillmentStatus)}
              </p>
            </article>
          </div>
        </div>
      ) : null}
    </section>
  );
}

