import { ProjectPageView } from "@/components/storyfront/ProjectPageView";
import { StepPills } from "@/components/storyfront/StepPills";
import Link from "next/link";

type AuthIntent = "sign-in" | "create";

type ProjectPageProps = {
  params: Promise<{
    styleId: string;
  }>;
  searchParams?: Promise<{
    auth?: string;
  }>;
};

export default async function ProjectPage({
  params,
  searchParams,
}: ProjectPageProps) {
  const { styleId } = await params;
  const resolvedSearchParams = await searchParams;
  const initialAuthMode: AuthIntent | undefined =
    resolvedSearchParams?.auth === "create"
      ? "create"
      : resolvedSearchParams?.auth === "sign-in"
        ? "sign-in"
        : undefined;

  return (
    <main className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 sm:px-7 lg:px-10">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
          <Link
            href="/"
            className="display text-xl tracking-tight text-[var(--ember)] transition-colors hover:text-[var(--ink)]"
          >
            3DPrintYou
          </Link>
          <StepPills current={2} styleId={styleId} />
        </header>

        <div className="flex-1 pb-10">
          <ProjectPageView initialAuthMode={initialAuthMode} styleId={styleId} />
        </div>
      </section>
    </main>
  );
}
