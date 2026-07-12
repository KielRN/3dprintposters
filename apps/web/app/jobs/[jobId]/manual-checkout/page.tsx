import { ManualFigurineCheckout } from "@/components/ManualFigurineCheckout";

type ManualCheckoutPageProps = {
  params: Promise<{
    jobId: string;
  }>;
};

export default async function ManualCheckoutPage({
  params,
}: ManualCheckoutPageProps) {
  const { jobId } = await params;

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-5 py-5 text-[var(--ink)] sm:px-7 lg:px-10">
      <div className="mx-auto w-full max-w-6xl">
        <ManualFigurineCheckout jobId={jobId} />
      </div>
    </main>
  );
}
