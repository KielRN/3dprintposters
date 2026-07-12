import { initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

const projectId =
  process.env.GCLOUD_PROJECT ??
  process.env.GOOGLE_CLOUD_PROJECT ??
  "gen-lang-client-0675309660";

function usage() {
  return [
    "Usage:",
    "  node apps/functions/scripts/repair-stale-generation-jobs.mjs <jobId> [jobId...]",
    "  node apps/functions/scripts/repair-stale-generation-jobs.mjs --dry-run <jobId> [jobId...]",
    "",
    "Only explicit figurine jobs with status=generating are eligible.",
  ].join("\n");
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function jobIds() {
  return process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("-"));
}

function publicMessage() {
  return "Your hero is ready for personal studio review. Our team will evaluate your photo, style, and production path before creation.";
}

async function main() {
  const ids = jobIds();
  if (ids.length === 0) {
    throw new Error(usage());
  }

  const dryRun = hasFlag("--dry-run");
  initializeApp({ projectId });
  const db = getFirestore();

  for (const jobId of ids) {
    const jobRef = db.collection("jobs").doc(jobId);
    const snap = await jobRef.get();
    const data = snap.data();
    if (!snap.exists || !data) {
      console.log(JSON.stringify({ jobId, action: "skip", reason: "missing" }));
      continue;
    }
    if (data.productType !== "figurine" || data.status !== "generating") {
      console.log(
        JSON.stringify({
          jobId,
          action: "skip",
          reason: "state_mismatch",
          productType: data.productType ?? null,
          status: data.status ?? null,
        }),
      );
      continue;
    }

    const update = {
      status: "failed",
      error: {
        message:
          "Generation repair moved the job to personal studio review after worker preflight exit.",
        stage: "generation_recovery",
      },
      aiGeneration: {
        status: "failed",
        failedAt: FieldValue.serverTimestamp(),
        failureCode: "worker_memory_exhausted_during_image_preflight",
      },
      generationState: {
        state: "failed",
        stage: "manual_repair",
        lastProgressAt: FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp(),
        failureCode: "worker_memory_exhausted_during_image_preflight",
        publicMessage: publicMessage(),
      },
      readinessStatus: "personal_studio_review",
      manualCheckoutEligibility: {
        eligible: true,
        reason: "personal_studio_review",
      },
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (dryRun) {
      console.log(JSON.stringify({ jobId, action: "would_repair" }));
      continue;
    }
    await jobRef.set(update, { merge: true });
    console.log(JSON.stringify({ jobId, action: "repaired" }));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
