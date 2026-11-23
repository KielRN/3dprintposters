import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const defaultSourcePath = path.join(
  repoRoot,
  "apps",
  "functions",
  "assets",
  "workflow-style-references",
  "chibi_female",
  "chibi-heroic-fantasy-female-v3.png",
);
const storagePath =
  "admin/workflow-style-references/chibi_female/chibi-heroic-fantasy-female-v3.png";
const bucketName =
  process.env.APP_STORAGE_BUCKET ??
  "app-3dprintyou.firebasestorage.app";

const templateFaceSwapFemaleCollectiblePrompt = [
  "Template face swap for one Chibi heroic fantasy female concept. The first image is the approved V3 style template character. The second image is the customer photo.",
  "Change only the character's facial identity to the person in the customer photo: preserve recognizable facial features, head shape, skin tone, glasses or facial hair if present, and expression cues, all rendered in the template's friendly chibi toy style. Keep the approved heroine's hairstyle silhouette and styling.",
  "Preserve the approved V3 design exactly: royal-blue cape; plain blue diamond-shaped chest emblem; plain white skirt with no gold vertical lines or decorative striping; and only the gold belt around the skirt.",
  "Preserve the upright sword and its exact design: swept crescent-like gold guard, blue diamond accent, blue grip, and subtle blade engraving. Keep the same hand grip, upright angle, pose, costume, boots, and accessories.",
  "Preserve the template's oversized-head chibi proportions, compact full body, large friendly eyes, smooth vinyl-toy materials, broad clean color regions, studio lighting, white background treatment, and full-body head-to-feet framing with clear margins.",
  "Do not add a base, pedestal, platform, stand, plaque, nameplate, sign, ground disk, scenery, freestanding text, or watermark. Do not redesign, simplify, recolor, or repaint anything outside the customer's facial identity.",
  "Output only the edited image.",
].join("\n");

const chibiFemaleStyle = {
  id: "chibi_female",
  label: "Chibi heroic fantasy female",
  productType: "figurine",
  proofMode: "template_face_swap",
  generationWorkflow: "creative_lab_figure",
  prompt: templateFaceSwapFemaleCollectiblePrompt,
  enabled: true,
  referenceImages: [
    {
      id: "chibi-heroic-fantasy-female-v3",
      label: "Chibi heroic fantasy female V3",
      storagePath,
      mimeType: "image/png",
      enabled: true,
    },
  ],
};

function hasFlag(name) {
  return process.argv.includes(name);
}

function valueAfterFlag(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1]
    : fallback;
}

function upsertChibiFemaleStyle(config) {
  const styles = Array.isArray(config.styles) ? [...config.styles] : [];
  const existingIndex = styles.findIndex(
    (style) => style?.id === chibiFemaleStyle.id,
  );

  if (existingIndex >= 0) {
    const existing = styles[existingIndex] ?? {};
    styles[existingIndex] = {
      ...existing,
      ...chibiFemaleStyle,
      enabled: existing.enabled === false ? false : true,
      referenceImages: chibiFemaleStyle.referenceImages,
    };
  } else {
    const chibiIndex = styles.findIndex(
      (style) => style?.id === "chibi_figure",
    );
    const insertIndex =
      chibiIndex >= 0 ? chibiIndex + 1 : Math.min(2, styles.length);
    styles.splice(insertIndex, 0, chibiFemaleStyle);
  }

  return {
    ...config,
    visibleStyleCount: styles.filter((style) => style?.enabled !== false)
      .length,
    styles,
  };
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const sourcePath = valueAfterFlag("--source", defaultSourcePath);
  const fileStats = await stat(sourcePath);
  if (fileStats.size > 5 * 1024 * 1024) {
    throw new Error(`Reference image is larger than 5 MB: ${sourcePath}`);
  }

  initializeApp({
    projectId: process.env.GCLOUD_PROJECT ?? "app-3dprintyou",
    storageBucket: bucketName,
  });

  const db = getFirestore();
  const docRef = db.collection("adminConfig").doc("figurineWorkflow");
  const snapshot = await docRef.get();
  const currentConfig = snapshot.exists ? (snapshot.data() ?? {}) : {};
  const nextConfig = upsertChibiFemaleStyle(currentConfig);

  console.log(
    JSON.stringify(
      {
        dryRun,
        sourcePath,
        bucketName,
        storagePath,
        styleId: chibiFemaleStyle.id,
        existingDoc: snapshot.exists,
        visibleStyleCount: nextConfig.visibleStyleCount,
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    console.log("Dry run only. Re-run without --dry-run to upload and save.");
    return;
  }

  const imageBytes = await readFile(sourcePath);
  await getStorage()
    .bucket(bucketName)
    .file(storagePath)
    .save(imageBytes, {
      resumable: false,
      metadata: {
        contentType: "image/png",
        cacheControl: "private, max-age=3600",
        metadata: {
          styleId: chibiFemaleStyle.id,
          imageId: "chibi-heroic-fantasy-female-v3",
          originalFileName: "chibi-heroic-fantasy-female-v3.png",
          workflow: "figurine-style-reference",
        },
      },
    });

  await docRef.set(
    {
      ...nextConfig,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: "seed-chibi-female-workflow",
    },
    { merge: true },
  );

  console.log(
    "Chibi female workflow reference image uploaded and config saved.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
