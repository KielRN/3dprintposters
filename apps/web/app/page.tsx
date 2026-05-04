import { ReliefPreview } from "@/components/ReliefPreview";
import { UploadFlow } from "@/components/UploadFlow";

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
        </header>

        <div className="grid min-w-0 flex-1 gap-5 py-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)]">
          <UploadFlow />
          <ReliefPreview />
        </div>
      </section>
    </main>
  );
}
