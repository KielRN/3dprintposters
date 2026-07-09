import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import {
  extractGeneratedImage,
  generateVertexImage,
} from "./aiProvider.js";
import { refreshJobCostFromFirestore } from "./figurineBuild.js";

const sceneIds = ["bookshelf", "desk"] as const;
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

// Prompt contract from implementation.md Backend B + plan.md §5a.3
// (perceptual sculpting): printed physical figurine on its base at the
// plate's empty spot, warm upper-left key, form-revealing gradients, contact
// shadow, camera slightly below figure level, match plate lighting, no text.
function buildScenePrompt(sceneId: SceneId): string {
  const spot =
    sceneId === "bookshelf"
      ? "the empty display spot on the bookshelf shelf"
      : "the clear display spot on the desk";
  return [
    "The first image is a home interior scene plate. The second image is the character concept for a personalized 3D printed figurine.",
    `Edit the scene plate to place that character into ${spot} as a printed physical figurine: a small collectible statue with a smooth matte vinyl surface, standing on its simple base.`,
    "Match the scene plate's warm lighting exactly, with the key light from the upper left. Render form-revealing shading gradients across the figurine so it reads as a solid three-dimensional object, and ground it with a believable soft contact shadow where the base meets the surface.",
    "Keep the camera angle of the plate, slightly below the figurine's head height so it reads with stature.",
    "Keep everything else in the scene plate unchanged. Photorealistic home photography look.",
    "No text, captions, labels, watermarks, or logos anywhere in the image.",
  ].join("\n");
}

function getConfiguredBucket() {
  const bucketName = process.env.APP_STORAGE_BUCKET;
  return bucketName ? getStorage().bucket(bucketName) : getStorage().bucket();
}

async function readStorageFile(storagePath: string): Promise<Buffer> {
  const [bytes] = await getConfiguredBucket().file(storagePath).download();
  return bytes;
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
        "jobId and sceneId (bookshelf or desk) are required.",
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

    const scenePreviews =
      jobData.scenePreviews && typeof jobData.scenePreviews === "object"
        ? (jobData.scenePreviews as Record<string, Record<string, unknown>>)
        : {};
    const existing = scenePreviews[sceneId];
    const decision = sceneRenderDecision(existing, force);
    if (decision === "cached") {
      return {
        jobId,
        sceneId,
        status: "ready",
        storagePath: existing?.storagePath ?? null,
        cached: true,
      };
    }
    if (decision === "cap_exhausted") {
      throw new HttpsError(
        "resource-exhausted",
        "This scene has reached its render limit for this job.",
      );
    }

    const conceptPath = resolveSceneConceptPath(jobData);
    if (!conceptPath) {
      throw new HttpsError(
        "failed-precondition",
        "The job has no concept image to place in the scene yet.",
      );
    }

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
    // SDK reads them — no storage-rules change.
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
        const model = process.env.VERTEX_IMAGE_MODEL ?? "gemini-3-pro-image";
        const vertexResponse = await generateVertexImage({
          apiKey,
          model,
          promptText: buildScenePrompt(sceneId),
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

      return { jobId, sceneId, status: "ready", storagePath, cached: false };
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
      throw new HttpsError(
        "internal",
        "The scene preview could not be rendered.",
      );
    }
  },
);
