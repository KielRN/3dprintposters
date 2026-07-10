import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import {
  extractGeneratedImage,
  generateVertexImage,
} from "./aiProvider.js";
import { refreshJobCostFromFirestore } from "./figurineBuild.js";

const sceneIds = ["bookshelf", "desk", "unboxing"] as const;
export type SceneId = (typeof sceneIds)[number];

const generateScenePreviewSchema = z.object({
  jobId: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/),
  sceneId: z.enum(sceneIds),
  force: z.boolean().optional(),
});

// Hard spend bound: at most 2 Vertex renders per scene per job. `force`
// requests a re-render but never bypasses the cap.
const maxRendersPerScene = 2;

export type SceneRenderDecision = "cached" | "render" | "cap_exhausted";

export function sceneRenderDecision(
  scene: { status?: unknown; attempts?: unknown } | undefined,
  force: boolean,
): SceneRenderDecision {
  const attempts =
    typeof scene?.attempts === "number" && Number.isFinite(scene.attempts)
      ? scene.attempts
      : 0;
  const status = typeof scene?.status === "string" ? scene.status : null;
  if (status === "ready" && !force) {
    return "cached";
  }
  if (attempts >= maxRendersPerScene) {
    return "cap_exhausted";
  }
  return "render";
}

export function resolveSceneConceptPath(
  jobData: Record<string, unknown>,
): string | null {
  if (
    typeof jobData.approvedImagePath === "string" &&
    jobData.approvedImagePath
  ) {
    return jobData.approvedImagePath;
  }
  const generatedImages = Array.isArray(jobData.generatedImages)
    ? jobData.generatedImages
    : [];
  for (const entry of generatedImages) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const image = entry as { storagePath?: unknown; isPlaceholder?: unknown };
    if (image.isPlaceholder === true) {
      continue;
    }
    if (typeof image.storagePath === "string" && image.storagePath) {
      return image.storagePath;
    }
  }
  return null;
}

export function resolveSceneSignName(
  jobData: Record<string, unknown>,
): string | null {
  const baseConfig = jobData.baseConfig as
    | { sign?: { enabled?: unknown; text?: unknown } | null }
    | null
    | undefined;
  const sign = baseConfig?.sign;
  if (
    sign?.enabled === true &&
    typeof sign.text === "string" &&
    sign.text.trim()
  ) {
    return sign.text.trim();
  }
  return null;
}

// Prompt contract v2 (2026-07-10 plan, issues 2+3): printed figurine on the
// named square base at the plate's empty spot, wide framing (the v1 desk
// render zoomed the figurine to fill the frame), head-to-base no-crop clause,
// warm upper-left key, contact shadow, plate camera preserved, and the name
// as the only permitted text. Named-base language mirrors the proven
// BASE_REF/NO_TEXT_EXCEPT_NAME pattern from scripts/storyfront/generate-assets.mjs.
export function buildScenePrompt(
  sceneId: SceneId,
  signName: string | null,
  hasBaseReference: boolean,
): string {
  const spot =
    sceneId === "bookshelf"
      ? "the empty display spot on the bookshelf shelf"
      : sceneId === "desk"
        ? "the clear display spot on the desk"
        : "the empty spot on the tissue paper inside the open gift box, standing fully upright";
  const baseClause = signName
    ? hasBaseReference
      ? `The figurine stands permanently mounted on its printed display base, shown in the LAST reference image: a square, gently tapered matte warm-ivory pedestal with a raised rectangular front nameplate. Reproduce that base's exact shape and finish, but the nameplate must read "${signName}" in the same raised letters instead of the name shown in the reference. The nameplate faces the camera.`
      : `The figurine stands permanently mounted on its printed display base: a square, gently tapered matte warm-ivory pedestal with a raised rectangular front nameplate reading "${signName}" in raised letters, facing the camera.`
    : "The figurine stands on its simple square printed display base with a blank front nameplate.";
  const textRule = signName
    ? `The only text anywhere in the image is the single word "${signName}" on the figurine base's nameplate. No other letters, numbers, words, captions, labels, logos, or watermarks anywhere.`
    : "No text, captions, labels, watermarks, or logos anywhere in the image.";
  return [
    "The first image is a home interior scene plate. The second image is the character concept for a personalized 3D printed figurine.",
    `Edit the scene plate to place that character into ${spot} as a printed physical figurine: a small collectible statue about 15 cm tall with a smooth matte vinyl surface.`,
    baseClause,
    "Scale and framing are critical: keep the scene plate's exact camera position, focal length, and full field of view. The figurine is a small object in a larger scene - it must occupy no more than about one quarter of the frame's height, in believable proportion to the mug, books, and other objects around it. Do not zoom in, do not crop the plate, and do not let the figurine dominate the frame.",
    "Show the entire figurine from the top of the head to the bottom of the base, fully inside the frame - never crop any part of it.",
    "Match the scene plate's warm lighting exactly, with the key light from the upper left. Render form-revealing shading gradients across the figurine so it reads as a solid three-dimensional object, and ground it with a believable soft contact shadow where the base meets the surface.",
    "Keep everything else in the scene plate unchanged. Photorealistic home photography look.",
    textRule,
  ].join("\n");
}

function hasDefinitiveConcept(
  data: Record<string, unknown> | undefined,
): boolean {
  if (!data) {
    return false;
  }
  if (typeof data.approvedImagePath === "string" && data.approvedImagePath) {
    return true;
  }
  const images = Array.isArray(data.generatedImages)
    ? data.generatedImages
    : [];
  const real = images.filter((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    const image = entry as { storagePath?: unknown; isPlaceholder?: unknown };
    return (
      image.isPlaceholder !== true &&
      typeof image.storagePath === "string" &&
      Boolean(image.storagePath)
    );
  });
  return data.status === "preview_ready" && real.length === 1;
}

// Pre-generation contract (2026-07-10 plan, issues 4+5): fire every missing
// scene exactly once, on the write where a figurine job's concept first
// becomes definitive. Single-concept styles hit this when createGenerationJob
// finishes (the work the "Create my figurine" click started); multi-proof
// styles hit it at approval. Later writes never re-fire - the customer
// callable + force flag stay the only re-render path, under the same cap.
export function scenePregenTargets(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): SceneId[] {
  if (!after || after.productType !== "figurine") {
    return [];
  }
  if (!hasDefinitiveConcept(after) || hasDefinitiveConcept(before)) {
    return [];
  }
  const previews =
    after.scenePreviews && typeof after.scenePreviews === "object"
      ? (after.scenePreviews as Record<string, unknown>)
      : {};
  return sceneIds.filter((sceneId) => !previews[sceneId]);
}

function getConfiguredBucket() {
  const bucketName = process.env.APP_STORAGE_BUCKET;
  return bucketName ? getStorage().bucket(bucketName) : getStorage().bucket();
}

async function readStorageFile(storagePath: string): Promise<Buffer> {
  const [bytes] = await getConfiguredBucket().file(storagePath).download();
  return bytes;
}

type SceneRunnerOutcome =
  | { outcome: "ready"; storagePath: string; cached: boolean }
  | { outcome: "cached"; storagePath: string | null }
  | { outcome: "cap_exhausted" }
  | { outcome: "no_concept" }
  | { outcome: "failed"; message: string };

// Shared by the customer callable and the concept-ready trigger. Never throws
// for render-path failures - callers translate outcomes to their own surface
// (HttpsError for the callable, a warning log for the trigger).
export async function renderScenePreviewForJob(input: {
  jobRef: FirebaseFirestore.DocumentReference;
  jobData: Record<string, unknown>;
  jobId: string;
  sceneId: SceneId;
  force: boolean;
}): Promise<SceneRunnerOutcome> {
  const { jobRef, jobData, jobId, sceneId, force } = input;
  const scenePreviews =
    jobData.scenePreviews && typeof jobData.scenePreviews === "object"
      ? (jobData.scenePreviews as Record<string, Record<string, unknown>>)
      : {};
  const existing = scenePreviews[sceneId];
  const decision = sceneRenderDecision(existing, force);
  if (decision === "cached") {
    return {
      outcome: "cached",
      storagePath:
        typeof existing?.storagePath === "string" ? existing.storagePath : null,
    };
  }
  if (decision === "cap_exhausted") {
    return { outcome: "cap_exhausted" };
  }

  const conceptPath = resolveSceneConceptPath(jobData);
  if (!conceptPath) {
    return { outcome: "no_concept" };
  }
  const signName = resolveSceneSignName(jobData);

  const fixtureMode = process.env.SCENE_PREVIEW_MODE === "fixture";
  // Count the attempt before rendering so a crashed render still counts
  // toward the spend cap.
  await jobRef.set(
    {
      scenePreviews: {
        [sceneId]: {
          status: "pending",
          attempts: FieldValue.increment(1),
          ...(fixtureMode ? { mode: "fixture" } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  // Scene plates are seeded by the storyfront asset pipeline
  // (scripts/storyfront/generate-assets.mjs upload-plates). Only the admin
  // SDK reads them - no storage-rules change.
  const platePath = `admin/scene-plates/${sceneId}.png`;
  try {
    const plateBytes = await readStorageFile(platePath);

    let renderedBytes: Buffer;
    let outputMimeType: string;
    if (fixtureMode) {
      // Fixture mode copies the plate as the "render" so emulator flows
      // never call Vertex.
      renderedBytes = plateBytes;
      outputMimeType = "image/png";
    } else {
      const apiKey = process.env.VERTEX_API_KEY;
      if (!apiKey) {
        throw new Error("VERTEX_API_KEY is required for scene previews.");
      }
      const conceptBytes = await readStorageFile(conceptPath);
      // Base reference render (seeded by scripts/storyfront/upload-base-ref.mjs).
      // Missing reference degrades to the text-only base clause, never fails
      // the render - the scene stays garnish.
      const baseRefBytes = signName
        ? await readStorageFile("admin/scene-plates/base-square.png").catch(
            () => null,
          )
        : null;
      const model = process.env.VERTEX_IMAGE_MODEL ?? "gemini-3-pro-image";
      const vertexResponse = await generateVertexImage({
        apiKey,
        model,
        promptText: buildScenePrompt(sceneId, signName, Boolean(baseRefBytes)),
        sourceImageBuffer: plateBytes,
        sourceMimeType: "image/png",
        referenceImages: [
          {
            id: "figurine-concept",
            mimeType: conceptPath.toLowerCase().endsWith(".png")
              ? "image/png"
              : "image/jpeg",
            imageBuffer: conceptBytes,
          },
          ...(baseRefBytes
            ? [
                {
                  id: "figurine-base",
                  mimeType: "image/png" as const,
                  imageBuffer: baseRefBytes,
                },
              ]
            : []),
        ],
      });
      const generatedImage = extractGeneratedImage(vertexResponse);
      renderedBytes = Buffer.from(generatedImage.data, "base64");
      outputMimeType = generatedImage.mimeType ?? "image/png";
    }

    // Contract path (implementation.md Backend B): owner-readable under the
    // existing storage rules.
    const storagePath = `generated/${jobData.uid}/${jobId}/scene-${sceneId}.png`;
    await getConfiguredBucket()
      .file(storagePath)
      .save(renderedBytes, {
        resumable: false,
        metadata: {
          contentType: outputMimeType,
          cacheControl: "private, max-age=3600",
          metadata: {
            jobId,
            uid: String(jobData.uid),
            sceneId,
            kind: "scene-preview",
            ...(fixtureMode ? { fixtureMode: "true" } : {}),
          },
        },
      });

    await jobRef.set(
      {
        scenePreviews: {
          [sceneId]: {
            status: "ready",
            storagePath,
            error: null,
            ...(fixtureMode ? { mode: "fixture" } : {}),
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await refreshJobCostFromFirestore(jobRef, "scene_preview_completed");

    return { outcome: "ready", storagePath, cached: false };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Scene render failed.";
    console.warn("scene preview render failed", {
      jobId,
      sceneId,
      error: message,
    });
    await jobRef.set(
      {
        scenePreviews: {
          [sceneId]: {
            status: "failed",
            error: message.slice(0, 300),
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await refreshJobCostFromFirestore(jobRef, "scene_preview_failed");
    return { outcome: "failed", message };
  }
}

// Page-4 "in your home" scene render (plan.md page 4, implementation.md
// Backend B). The render is garnish: failures mark scenePreviews[sceneId]
// failed and never affect checkout eligibility.
export const generateScenePreview = onCall(
  {
    secrets: ["APP_STORAGE_BUCKET", "VERTEX_API_KEY", "VERTEX_IMAGE_MODEL"],
    timeoutSeconds: 120,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in first.");
    }
    const parsed = generateScenePreviewSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError(
        "invalid-argument",
        "jobId and sceneId (bookshelf, desk, or unboxing) are required.",
      );
    }
    const { jobId, sceneId } = parsed.data;
    const force = parsed.data.force === true;

    const db = getFirestore();
    const jobRef = db.collection("jobs").doc(jobId);
    const jobSnap = await jobRef.get();
    const jobData = jobSnap.data();
    if (!jobSnap.exists || !jobData || jobData.uid !== request.auth.uid) {
      throw new HttpsError("not-found", "Job not found.");
    }

    const result = await renderScenePreviewForJob({
      jobRef,
      jobData,
      jobId,
      sceneId,
      force,
    });
    switch (result.outcome) {
      case "cached":
        return {
          jobId,
          sceneId,
          status: "ready",
          storagePath: result.storagePath,
          cached: true,
        };
      case "ready":
        return {
          jobId,
          sceneId,
          status: "ready",
          storagePath: result.storagePath,
          cached: false,
        };
      case "cap_exhausted":
        throw new HttpsError(
          "resource-exhausted",
          "This scene has reached its render limit for this job.",
        );
      case "no_concept":
        throw new HttpsError(
          "failed-precondition",
          "The job has no concept image to place in the scene yet.",
        );
      case "failed":
        throw new HttpsError(
          "internal",
          "The scene preview could not be rendered.",
        );
    }

    const exhaustive: never = result;
    return exhaustive;

  },
);

export const onJobConceptReadyRenderScenes = onDocumentWritten(
  {
    document: "jobs/{jobId}",
    secrets: ["APP_STORAGE_BUCKET", "VERTEX_API_KEY", "VERTEX_IMAGE_MODEL"],
    timeoutSeconds: 540,
    retry: false,
  },
  async (event) => {
    const before = event.data?.before.exists
      ? event.data.before.data()
      : undefined;
    const after = event.data?.after.exists
      ? event.data.after.data()
      : undefined;
    const targets = scenePregenTargets(before, after);
    if (targets.length === 0 || !after) {
      return;
    }

    const jobRef = getFirestore().collection("jobs").doc(event.params.jobId);
    // Serial on purpose: three concurrent Vertex edits per job invite 429s,
    // and each pass re-reads state so previous attempts are respected.
    for (const sceneId of targets) {
      const jobSnap = await jobRef.get();
      const jobData = jobSnap.data();
      if (!jobSnap.exists || !jobData) {
        return;
      }
      const result = await renderScenePreviewForJob({
        jobRef,
        jobData,
        jobId: event.params.jobId,
        sceneId,
        force: false,
      });
      if (result.outcome === "failed") {
        console.warn("scene pregen render failed", {
          jobId: event.params.jobId,
          sceneId,
          message: result.message,
        });
      }
    }
  },
);
