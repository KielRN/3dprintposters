import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

// Renames the template-face-swap chibi pair to "Chibi heroic fantasy male/
// female" and adds the photo-driven "Chibi male/female" styles: no reference
// template. Their generated_options proofs use proofRendering
// "realistic_person" — Vertex renders a clean realistic full-body person
// (identity + own clothing, gray studio background, confident pose; the
// scaffold lives in buildFigurineProofPrompt) and Meshy Creative Lab's
// prototype phase does all chibi stylization downstream.

const newStyles = [
  {
    id: "chibi_photo_male",
    label: "Chibi male",
    productType: "figurine",
    proofMode: "generated_options",
    proofRendering: "realistic_person",
    generationWorkflow: "creative_lab_figure",
    prompt:
      "The subject is male; preserve his facial hair (beard, mustache, stubble, or clean-shaven) exactly as in the photo.",
    enabled: true,
    referenceImages: [],
  },
  {
    id: "chibi_photo_female",
    label: "Chibi female",
    productType: "figurine",
    proofMode: "generated_options",
    proofRendering: "realistic_person",
    generationWorkflow: "creative_lab_figure",
    prompt:
      "The subject is female; preserve her hairstyle and hair length exactly as in the photo.",
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
