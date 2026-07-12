import { PwaInstallButton } from "@/components/PwaInstallButton";
import { ComicBanner } from "@/components/storyfront/ComicBanner";
import { StartAccountPanel } from "@/components/storyfront/StartAccountPanel";
import { StepPills } from "@/components/storyfront/StepPills";
import { StoryfrontAccountNav } from "@/components/storyfront/StoryfrontAccountNav";
import { StyleCardGrid } from "@/components/storyfront/StyleCardGrid";
import { TrustStrip } from "@/components/storyfront/TrustStrip";
import Link from "next/link";

type AuthIntent = "sign-in" | "create";

type StartPageProps = {
  searchParams?: Promise<{
    auth?: string;
  }>;
};

export default async function StartPage({ searchParams }: StartPageProps) {
  const resolvedSearchParams = await searchParams;
  const authIntent: AuthIntent | undefined =
    resolvedSearchParams?.auth === "create"
      ? "create"
      : resolvedSearchParams?.auth === "sign-in"
        ? "sign-in"
        : undefined;

  return (
    <main className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 sm:px-7 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
          <Link
            href="/"
            className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
          >
            3DPrintYou
          </Link>
          <StepPills current={1} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StoryfrontAccountNav
              className="flex flex-wrap items-center justify-end gap-2"
              signInHref="/start?auth=sign-in"
              createHref="/start?auth=create"
              signInClassName="inline-flex h-9 shrink-0 items-center rounded-lg px-3 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--clay)]/70"
              createClassName="inline-flex h-9 shrink-0 items-center rounded-lg bg-[var(--ember)] px-3.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--terracotta)]"
            />
            <PwaInstallButton />
          </div>
        </header>

        <div className="flex-1 pt-6">
          {authIntent ? <StartAccountPanel authIntent={authIntent} /> : null}
          <ComicBanner variant="full" />
          <StyleCardGrid />
        </div>

        <TrustStrip />
      </section>
    </main>
  );
}
