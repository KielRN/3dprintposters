import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="bg-[var(--ink)] text-[var(--cream)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:px-10">
        <Link href="/" className="display text-2xl tracking-tight">
          3DPrintYou
        </Link>
        <nav className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm font-semibold">
          <Link href="/start?auth=create#account" className="text-[var(--cream)]/80 hover:text-[var(--cream)]">
            Start
          </Link>
          <Link href="/privacy" className="text-[var(--cream)]/80 hover:text-[var(--cream)]">
            Privacy
          </Link>
          <Link href="/terms" className="text-[var(--cream)]/80 hover:text-[var(--cream)]">
            Terms
          </Link>
          <Link href="/contact" className="text-[var(--cream)]/80 hover:text-[var(--cream)]">
            Contact
          </Link>
        </nav>
        <p className="text-sm text-[var(--cream)]/60">
          &copy; {new Date().getFullYear()} 3DPrintYou
        </p>
      </div>
    </footer>
  );
}

