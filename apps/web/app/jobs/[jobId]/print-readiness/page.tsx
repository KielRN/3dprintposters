import { FigurinePrintReadinessReview } from "@/components/FigurinePrintReadinessReview";

type PrintReadinessPageProps = {
  params: Promise<{
    jobId: string;
  }>;
  searchParams?: Promise<{
    operator?: string | string[];
  }>;
};

export default async function PrintReadinessPage({
  params,
  searchParams,
}: PrintReadinessPageProps) {
  const { jobId } = await params;
  const query = searchParams ? await searchParams : {};
  const operatorParam = Array.isArray(query.operator)
    ? query.operator[0]
    : query.operator;
  const operatorMode = operatorParam === "1" || operatorParam === "true";

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-5 py-5 text-[var(--ink)] sm:px-7 lg:px-10">
      <div className="mx-auto w-full max-w-6xl">
        <FigurinePrintReadinessReview
          jobId={jobId}
          operatorMode={operatorMode}
        />
      </div>
    </main>
  );
}
