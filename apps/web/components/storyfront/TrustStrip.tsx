import { Lock, ShieldCheck } from "lucide-react";

// True claims only: the made-to-order inspection line reuses the landing
// trust copy; Stripe secures every checkout. No invented reviews or counters.
export function TrustStrip() {
  return (
    <footer className="mt-4 border-t border-[var(--line)] py-6">
      <div className="flex flex-col gap-3 text-sm font-semibold text-[var(--muted)] sm:flex-row sm:items-center sm:gap-8">
        <span className="inline-flex items-center gap-2">
          <ShieldCheck size={16} aria-hidden="true" />
          Every order is made to order and inspected before it ships.
        </span>
        <span className="inline-flex items-center gap-2">
          <Lock size={16} aria-hidden="true" />
          Stripe-secured checkout.
        </span>
      </div>
    </footer>
  );
}
