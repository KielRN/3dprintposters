import { readFile, stat } from "node:fs/promises";

import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const defaultSourcePath =
  "C:\\Users\\Eliud\\Desktop\\Styles\\SheRa-ChatGPTv4 Christina.png";
const storagePath =
  "admin/workflow-style-references/chibi_female/shera-christina-template.png";
const bucketName =
  process.env.APP_STORAGE_BUCKET ??
  "gen-lang-client-0675309660.firebasestorage.app";

const templateFaceSwapFemaleCollectiblePrompt = [
  "Template face swap-female (single concept). The first image is the approved female heroic fantasy style template character. The second image is the customer photo.",
  "Edit the first image so the character's facial identity becomes the person from the second image: face, head shape, skin tone, hair or baldness, facial hair, glasses, and expression cues come from the customer photo while staying rendered as a full-body collectible action figure.",
  "Preserve the template's pose, body proportions, costume language, colors, studio background, and head-to-feet framing, but make the result read as a safe toy reference rather than a photorealistic adult person.",
  "Use smooth toy material across the face, skin, hair, armor, boots, cape, props, and costume surfaces. Avoid realistic skin texture, pores, glossy human skin, sensual styling, fragile fabric realism, or emphasis on exposed body detail.",
  "Keep the whole character visible head to feet with clean margins. Keep props and costume details simplified, toy-like, and suitable for a collectible figure concept.",
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
      id: "shera-christina-template",
      label: "SheRa Christina",
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
      referenceImages: [
        chibiFemaleStyle.referenceImages[0],
        ...(Array.isArray(existing.referenceImages)
          ? existing.referenceImages.filter(
              (image) => image?.storagePath !== storagePath,
            )
          : []),
      ].slice(0, 4),
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
    projectId: process.env.GCLOUD_PROJECT ?? "gen-lang-client-0675309660",
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
          imageId: "shera-christina-template",
          originalFileName: "SheRa-ChatGPTv4 Christina.png",
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
