"use client";

import { callableErrorMessage } from "@/lib/callableRetry";
import type { FirebaseClients } from "@/lib/firebase";
import Image from "next/image";
import Link from "next/link";
import { AlertCircle, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import manifest from "../../public/storyfront/manifest.json";
import { JobCard } from "./JobCard";
import { thumbnailPath, type JobCardSource } from "./jobPresentation";

type ManifestEntry = { w: number; h: number; alt: string };
const emptyHero = (manifest as Record<string, ManifestEntry>)[
  "empty/first-hero.webp"
];

type ListedJob = { id: string; data: JobCardSource };
type DeleteOwnJobResult = { jobId: string; deleted: boolean };

type MyFigurinesListProps = {
  user: User | null;
  authLoading: boolean;
  firebaseClients: FirebaseClients | null;
};

const nonDeletablePipelineStages = new Set([
  "paid",
  "accepted",
  "in_production",
  "shipped",
  "completed",
  "rejected_by_operator",
  "refunded",
]);

function isVisibleCustomerJob(job: JobCardSource) {
  return job.customerDeleted !== true && job.customerDeletedAt == null;
}

function canDeleteFromHeroGrid(job: JobCardSource) {
  return (
    !nonDeletablePipelineStages.has(job.pipelineStage ?? "") &&
    job.status !== "checkout_created"
  );
}

// "Your heroes": the customer's previous generations, newest first, all
// styles in one list. Owner reads are allowed by rules and covered by the
// uid+updatedAt composite index. Deletion goes through an owner-checked
// callable so clients never get broad job write access.
export function MyFigurinesList({
  user,
  authLoading,
  firebaseClients,
}: MyFigurinesListProps) {
  const [jobs, setJobs] = useState<ListedJob[] | null>(null);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>(
    {},
  );
  const [listError, setListError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseClients || !user) {
      setJobs(null);
      return;
    }

    const jobsQuery = query(
      collection(firebaseClients.firestore, "jobs"),
      where("uid", "==", user.uid),
      orderBy("updatedAt", "desc"),
      limit(24),
    );

    return onSnapshot(
      jobsQuery,
      (snapshot) => {
        setJobs(
          snapshot.docs
            .map((docSnapshot) => ({
              id: docSnapshot.id,
              data: docSnapshot.data() as JobCardSource,
            }))
            .filter((job) => isVisibleCustomerJob(job.data)),
        );
        setListError("");
      },
      (snapshotError) => {
        setListError(snapshotError.message);
        setJobs([]);
      },
    );
  }, [firebaseClients, user]);

  useEffect(() => {
    if (!firebaseClients || !jobs?.length) {
      return;
    }

    let cancelled = false;
    const paths = Array.from(
      new Set(
        jobs
          .map((job) => thumbnailPath(job.data))
          .filter((path): path is string => Boolean(path)),
      ),
    );

    // Batched, rendered as they arrive; a failed URL leaves that card on the
    // clay placeholder instead of a broken img.
    void Promise.all(
      paths.map(async (path) => {
        try {
          const url = await getDownloadURL(ref(firebaseClients.storage, path));
          if (!cancelled) {
            setThumbnailUrls((current) =>
              current[path] ? current : { ...current, [path]: url },
            );
          }
        } catch {
          // placeholder tile covers this path
        }
      }),
    );

    return () => {
      cancelled = true;
    };
  }, [firebaseClients, jobs]);

  async function deleteJob(jobId: string, job: JobCardSource) {
    if (!firebaseClients || deletingJobId) {
      return;
    }

    const styleLabel =
      job.selectedStyleLabel ?? job.selectedStyle ?? "this hero";
    if (
      !window.confirm(
        `Delete ${styleLabel} from Your heroes? This removes it from the grid.`,
      )
    ) {
      return;
    }

    setDeleteError("");
    setDeletingJobId(jobId);
    try {
      const deleteOwnJob = httpsCallable<
        { jobId: string },
        DeleteOwnJobResult
      >(firebaseClients.functions, "deleteOwnJob", { timeout: 30_000 });
      await deleteOwnJob({ jobId });
      setJobs((currentJobs) =>
        currentJobs?.filter((listedJob) => listedJob.id !== jobId) ?? null,
      );
    } catch (error) {
      setDeleteError(callableErrorMessage(error, "This hero did not delete."));
    } finally {
      setDeletingJobId(null);
    }
  }

  if (authLoading) {
    return null;
  }

  if (!user || !firebaseClients) {
    return (
      <section className="panel rounded-xl p-5">
        <h2 className="display text-2xl">Your heroes live on your account.</h2>
        <p className="mt-2 max-w-[48ch] text-sm text-[var(--muted)]">
          Sign in above and your figurines will be waiting here whenever you
          come back.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="display text-2xl sm:text-3xl">
        Your heroes ({jobs?.length ?? 0})
      </h2>

      {listError ? (
        <p className="mt-4 flex items-start gap-2 text-sm font-semibold text-[var(--coral)]">
          <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
          {listError}
        </p>
      ) : null}
      {deleteError ? (
        <p className="mt-4 flex items-start gap-2 text-sm font-semibold text-[var(--coral)]">
          <AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
          {deleteError}
        </p>
      ) : null}

      {jobs === null ? (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              className="skeleton-shimmer aspect-square rounded-xl"
              key={index}
            />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="panel mt-5 flex flex-col items-center gap-4 rounded-xl p-8 text-center sm:flex-row sm:text-left">
          {emptyHero ? (
            <Image
              src="/storyfront/empty/first-hero.webp"
              width={emptyHero.w}
              height={emptyHero.h}
              alt={emptyHero.alt}
              className="w-40 shrink-0"
              loading="lazy"
            />
          ) : null}
          <div>
            <p className="display text-2xl">Your first hero starts here.</p>
            <p className="mt-2 max-w-[42ch] text-sm text-[var(--muted)]">
              Upload a photo above and watch someone you love become a
              figurine.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Link
            className="field-shell flex aspect-square flex-col items-center justify-center gap-2 rounded-xl text-sm font-bold text-[var(--moss)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ember)]"
            href="/start"
          >
            <Plus size={22} aria-hidden="true" />
            Start another
          </Link>
          {jobs.map((job) => {
            const path = thumbnailPath(job.data);
            const styleLabel =
              job.data.selectedStyleLabel ??
              job.data.selectedStyle ??
              "Figurine";
            return (
              <JobCard
                jobId={job.id}
                job={job.data}
                thumbnailUrl={path ? (thumbnailUrls[path] ?? null) : null}
                styleLabel={styleLabel}
                deleting={deletingJobId === job.id}
                onDelete={
                  canDeleteFromHeroGrid(job.data)
                    ? () => void deleteJob(job.id, job.data)
                    : undefined
                }
                key={job.id}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

