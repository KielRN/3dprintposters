import { readFile, stat } from "node:fs/promises";

import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const defaultSourcePath = "C:\\Users\\Eliud\\Desktop\\Styles\\Heroic Male.png";
const storagePath =
  "admin/workflow-style-references/heroic_fantasy_male/heroic-male-template.png";
const bucketName =
  process.env.APP_STORAGE_BUCKET ?? "gen-lang-client-0675309660.firebasestorage.app";

const defaultTemplateFaceSwapPrompt = [
  "Face swap task. The first image is the approved style template character. The second image is the customer photo.",
  "Edit the first image so the character's facial identity becomes the person from the second image: face, head shape, skin tone, hair or baldness, facial hair, glasses, and expression cues come from the customer photo while staying rendered in the template's art style.",
  "Preserve everything else in the template exactly: pose, body proportions, costume, props with their exact grip and angle, colors, materials, lighting, background treatment, and framing.",
  "Preserve every costume and surface detail at full sharpness; do not soften, simplify, or repaint anything outside the swapped face and head.",
  "The result must read as the same stylized character artwork with a new identity, never as a photorealistic person.",
  "Output only the edited image.",
].join("\n");

const heroicStyle = {
  id: "heroic_fantasy_male",
  label: "Heroic fantasy male",
  productType: "figurine",
  proofMode: "template_face_swap",
  generationWorkflow: "direct_multi_image_to_3d",
  provider: "hi3d",
  providerModel: "hitem3dv2.1",
  prompt: defaultTemplateFaceSwapPrompt,
  enabled: true,
  referenceImages: [
    {
      id: "heroic-male-template",
      label: "Heroic Male",
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
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function upsertHeroicStyle(config) {
  const styles = Array.isArray(config.styles) ? [...config.styles] : [];
  const existingIndex = styles.findIndex((style) => style?.id === heroicStyle.id);

  if (existingIndex >= 0) {
    const existing = styles[existingIndex] ?? {};
    styles[existingIndex] = {
      ...existing,
      ...heroicStyle,
      enabled: existing.enabled === false ? false : true,
      referenceImages: [
        heroicStyle.referenceImages[0],
        ...(Array.isArray(existing.referenceImages)
          ? existing.referenceImages.filter(
              (image) => image?.storagePath !== storagePath,
            )
          : []),
      ].slice(0, 4),
    };
  } else {
    const chibiIndex = styles.findIndex((style) => style?.id === "chibi_figure");
    const insertIndex = chibiIndex >= 0 ? chibiIndex + 1 : Math.min(2, styles.length);
    styles.splice(insertIndex, 0, heroicStyle);
  }

  return {
    ...config,
    visibleStyleCount: styles.filter((style) => style?.enabled !== false).length,
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
    projectId: process.env.GCLOUD_PROJECT ?? "gen-lang-client-0675309660",
    storageBucket: bucketName,
  });

  const db = getFirestore();
  const docRef = db.collection("adminConfig").doc("figurineWorkflow");
  const snapshot = await docRef.get();
  const currentConfig = snapshot.exists ? snapshot.data() ?? {} : {};
  const nextConfig = upsertHeroicStyle(currentConfig);

  console.log(
    JSON.stringify(
      {
        dryRun,
        sourcePath,
        bucketName,
        storagePath,
        styleId: heroicStyle.id,
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
  await getStorage().bucket(bucketName).file(storagePath).save(imageBytes, {
    resumable: false,
    metadata: {
      contentType: "image/png",
      cacheControl: "private, max-age=3600",
      metadata: {
        styleId: heroicStyle.id,
        imageId: "heroic-male-template",
        originalFileName: "Heroic Male.png",
        workflow: "figurine-style-reference",
      },
    },
  });

  await docRef.set(
    {
      ...nextConfig,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: "seed-heroic-workflow",
    },
    { merge: true },
  );

  console.log("Heroic workflow reference image uploaded and config saved.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
