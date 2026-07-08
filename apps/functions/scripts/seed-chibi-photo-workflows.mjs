import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

// Renames the template-face-swap chibi pair to "Chibi heroic fantasy male/
// female" and adds the photo-driven "Chibi male/female" styles: no reference
// template, generated_options proofs (Vertex cleans up the customer photo —
// identity, own clothing, standardized pose) feeding Meshy Creative Lab.

const chibiPrompt = (subjectLine) =>
  [
    "Fully stylized chibi character, never photorealistic: oversized head about one third of the total height, compact rounded body, large expressive eyes, a simplified friendly face that keeps the subject clearly recognizable, chunky simplified hands and shoes, smooth vinyl-toy surfaces, and broad clean color regions.",
    subjectLine,
    "Keep the subject's own hairstyle, glasses if present, and real clothing from the photo, simplified into clean toy-like shapes with tidy color regions.",
    "The proof must read as a finished stylized character illustration, not a photo of a person.",
  ].join(" ");

const newStyles = [
  {
    id: "chibi_photo_male",
    label: "Chibi male",
    productType: "figurine",
    proofMode: "generated_options",
    generationWorkflow: "creative_lab_figure",
    prompt: chibiPrompt(
      "The subject is male; keep his facial hair if present and masculine proportions.",
    ),
    enabled: true,
    referenceImages: [],
  },
  {
    id: "chibi_photo_female",
    label: "Chibi female",
    productType: "figurine",
    proofMode: "generated_options",
    generationWorkflow: "creative_lab_figure",
    prompt: chibiPrompt("The subject is female; keep feminine proportions."),
    enabled: true,
    referenceImages: [],
  },
];

const renames = [
  { id: "chibi_figure", label: "Chibi heroic fantasy male" },
  { id: "chibi_female", label: "Chibi heroic fantasy female" },
];

function hasFlag(name) {
  return process.argv.includes(name);
}

function applyChanges(config) {
  let styles = Array.isArray(config.styles) ? [...config.styles] : [];

  for (const rename of renames) {
    styles = styles.map((style) =>
      style?.id === rename.id ? { ...style, label: rename.label } : style,
    );
  }

  for (const newStyle of newStyles) {
    const existingIndex = styles.findIndex((style) => style?.id === newStyle.id);
    if (existingIndex >= 0) {
      const existing = styles[existingIndex] ?? {};
      styles[existingIndex] = {
        ...existing,
        ...newStyle,
        enabled: existing.enabled === false ? false : true,
      };
      continue;
    }

    // Keep the photo-driven pair together, right after the renamed chibi pair.
    const chibiFemaleIndex = styles.findIndex(
      (style) => style?.id === "chibi_female",
    );
    const previousNewStyleIndex = styles.findIndex(
      (style) => style?.id === "chibi_photo_male",
    );
    const insertIndex =
      previousNewStyleIndex >= 0
        ? previousNewStyleIndex + 1
        : chibiFemaleIndex >= 0
          ? chibiFemaleIndex + 1
          : styles.length;
    styles.splice(insertIndex, 0, newStyle);
  }

  return {
    ...config,
    visibleStyleCount: styles.filter((style) => style?.enabled !== false).length,
    styles,
  };
}

async function main() {
  const dryRun = hasFlag("--dry-run");

  initializeApp({
    projectId: process.env.GCLOUD_PROJECT ?? "gen-lang-client-0675309660",
  });

  const db = getFirestore();
  const docRef = db.collection("adminConfig").doc("figurineWorkflow");
  const snapshot = await docRef.get();
  const currentConfig = snapshot.exists ? snapshot.data() ?? {} : {};
  const nextConfig = applyChanges(currentConfig);

  console.log(
    JSON.stringify(
      {
        dryRun,
        existingDoc: snapshot.exists,
        visibleStyleCount: nextConfig.visibleStyleCount,
        styles: nextConfig.styles.map((style) => ({
          id: style.id,
          label: style.label,
          enabled: style.enabled,
        })),
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    console.log("Dry run only. Re-run without --dry-run to save.");
    return;
  }

  await docRef.set(
    {
      ...nextConfig,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: "seed-chibi-photo-workflows",
    },
    { merge: true },
  );

  console.log("Chibi photo workflows saved and chibi styles renamed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
