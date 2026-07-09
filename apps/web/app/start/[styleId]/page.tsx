import { PwaInstallButton } from "@/components/PwaInstallButton";
import { ProjectPageView } from "@/components/storyfront/ProjectPageView";
import { StepPills } from "@/components/storyfront/StepPills";
import { ClipboardList, Settings } from "lucide-react";
import Link from "next/link";

type ProjectPageProps = {
  params: Promise<{
    styleId: string;
  }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { styleId } = await params;

  return (
    <main className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 sm:px-7 lg:px-10">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
          <Link
            href="/"
            className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
          >
            3DPrintU
          </Link>
          <StepPills current={2} />
          <div className="flex items-center gap-2">
            <Link
              className="secondary-button h-10 min-h-0 shrink-0 px-3"
              href="/operator"
            >
              <ClipboardList size={16} aria-hidden="true" />
              Operator
            </Link>
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

        <div className="flex-1 pb-10">
          <ProjectPageView styleId={styleId} />
        </div>
      </section>
    </main>
  );
}
