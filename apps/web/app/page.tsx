import { PwaInstallButton } from "@/components/PwaInstallButton";
import { UploadFlow } from "@/components/UploadFlow";
import { Settings } from "lucide-react";
import Link from "next/link";

const steps = ["Upload", "Generate", "Relief", "Checkout"];

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--page-bg)] text-[var(--ink)]">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 sm:px-7 lg:px-10">
        <header className="flex items-center justify-between gap-4 border-b border-black/10 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              3D Print Posters
            </p>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
              Photo to printed relief
            </h1>
          </div>
          <nav className="hidden items-center gap-2 md:flex" aria-label="Order steps">
            {steps.map((step, index) => (
              <span className="step-pill" key={step}>
                {index + 1}. {step}
              </span>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              className="secondary-button h-10 min-h-0 shrink-0 px-3"
              href="/admin"
            >
              <Settings size={16} aria-hidden="true" />
              Admin
            </Link>
            <PwaInstallButton />
          </div>
        </header>

        <div className="mx-auto grid w-full max-w-3xl min-w-0 flex-1 py-5">
          <UploadFlow />
        </div>
      </section>
    </main>
  );
}
