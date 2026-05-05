import { JobDetail } from "@/components/JobDetail";

type JobPageProps = {
  params: Promise<{
    jobId: string;
  }>;
};

export default async function JobPage({ params }: JobPageProps) {
  const { jobId } = await params;

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-5 py-5 text-[var(--ink)] sm:px-7 lg:px-10">
      <div className="mx-auto w-full max-w-5xl">
        <JobDetail jobId={jobId} />
      </div>
    </main>
  );
}
