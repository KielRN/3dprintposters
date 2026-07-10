// Storyfront asset generator — chat 2 of the 2026-07-09 storyfront revamp.
//
// Generates the 16 marketing images for apps/web/public/storyfront/ with the
// same Vertex/Gemini connection shape as apps/functions/src/aiProvider.ts
// (gemini-3-pro-image, template reference image first, 2K interactions route),
// pulling the live style templates from Storage so style cards match what
// customers actually receive.
//
// Usage (from repo root):
//   node scripts/storyfront/generate-assets.mjs refs            # resolve + download live style templates
//   node scripts/storyfront/generate-assets.mjs generate        # generate missing raw PNGs to .tmp/storyfront-raw/
//   node scripts/storyfront/generate-assets.mjs generate --only card-chibi_female,panel-transform --force
//   node scripts/storyfront/generate-assets.mjs sheet           # build .tmp/storyfront-raw/contact-sheet.html
//   node scripts/storyfront/generate-assets.mjs status
//   --- after Elliot approves the contact sheet ---
//   node scripts/storyfront/generate-assets.mjs convert         # WebP + manifest.json into apps/web/public/storyfront/
//   node scripts/storyfront/generate-assets.mjs upload-plates   # PNG masters to Storage admin/scene-plates/
//
// Secrets: reads VERTEX_API_KEY (fallback GOOGLE_API_KEY/GEMINI_API_KEY) from
// the process env, apps/functions/.env, apps/functions/.secret.local, or the
// root .env. The value is held in memory only and never printed or logged.

import { mkdir, readFile, writeFile, appendFile, access, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rawDir = path.join(repoRoot, ".tmp", "storyfront-raw");
const refsDir = path.join(rawDir, "refs");
const refsIndexPath = path.join(refsDir, "index.json");
const publicDir = path.join(repoRoot, "apps", "web", "public", "storyfront");
const logPath = path.join(
  repoRoot,
  ".tmp",
  "pm-plans",
  "2026-07-09-storyfront-revamp",
  "assets-log.md",
);

const model = process.env.VERTEX_IMAGE_MODEL ?? "gemini-3-pro-image";
const interactionsBaseUrl =
  process.env.GEMINI_INTERACTIONS_BASE_URL ??
  "https://generativelanguage.googleapis.com/v1beta/interactions";
const vertexExpressBaseUrl = (
  process.env.VERTEX_EXPRESS_BASE_URL ?? "https://aiplatform.googleapis.com/v1"
).replace(/\/$/, "");
const projectId = process.env.GCLOUD_PROJECT ?? "gen-lang-client-0675309660";
const bucketName =
  process.env.APP_STORAGE_BUCKET ?? "gen-lang-client-0675309660.firebasestorage.app";
const minSecondsBetweenRequests = 10;
const referenceByteLimit = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Prompt building blocks (assets.md global art direction)
// ---------------------------------------------------------------------------

const PALETTE =
  "Color palette: the 3DPrintU warm brand system — warm cream #f5f1ea background fields, deep warm ink #1a1714 for line work and the darkest accents, ember orange #e8552e and terracotta #c2410c for energy and warm accents, soft clay #e8dfd3 for surfaces, muted moss green #3f6b4c as a quiet supporting accent, and muted gold #b07a1e only sparingly. Never use primary-color superhero yellow/cyan/blue schemes for backgrounds or effects.";

const NO_TEXT =
  "Absolutely no text anywhere in the image: no letters, no numbers, no words, no captions, no labels, no speech bubbles, no onomatopoeia, no logos, no watermarks, no signatures.";

const NO_CROP =
  "Show the entire character from the top of the head to the bottom of the feet, fully inside the frame, with clear margin above the head and below the feet. Do not crop any part of the body.";

const FORM_LIGHT =
  "Lighting: a soft warm key light from the upper left, a gentle cooler rim light separating the silhouette from the background, smooth shading gradients that emphasize three-dimensional volume, and a single soft contact shadow grounding the subject. Never flat frontal lighting.";

const PHOTOREAL =
  "This must read as a real photograph taken in a real home on a full-frame camera with a 35mm prime lens: true-to-life materials, natural small imperfections (wood grain variation, slightly uneven wall paint, faint dust in light), physically accurate soft shadows and bounce light, believable depth of field, and gentle photographic grain. Absolutely not a 3D render, not CGI, not an illustration, nothing waxy or airbrushed — an authentic photograph.";

const NO_TEXT_EXCEPT_NAME =
  'The only text anywhere in the image is the single word "Christina" in raised letters on the figurine base\'s nameplate. No other letters, numbers, words, captions, labels, logos, watermarks, or signatures anywhere.';

const NAVY_CAPE =
  "Recolor directive: every costume element that is red in the reference image — especially the cape and its lining — must be deep navy blue (around #22304f) instead: same fabric, same gold trim, same shading and material response, just navy blue in place of red. No red anywhere on the character.";

const BASE_REF =
  'The figurine stands permanently mounted on its printed display base, shown in the LAST reference image: a square, gently tapered pedestal with a raised rectangular front nameplate reading "Christina" in raised letters. Reproduce the base\'s exact shape and the exact nameplate text from that reference. The base is matte warm ivory, part of the printed product, and the nameplate faces the camera.';

const CARD_BG =
  "Background: a clean, soft gradient studio field blending warm cream #f5f1ea into soft clay #e8dfd3, with a subtle halftone dot texture fading in from one corner only. No environment, no furniture, no props, no busy background.";

const CARD_COMPO =
  "Composition: a wide landscape banner. The full character stands in the left third of the frame, and the right two thirds stay a clean empty background field. Keep the entire character and their shadow fully inside the left half of the frame with generous margins.";

const PANEL_SAFE =
  "Composition: keep the main subject and every important detail inside the central 80% of the frame; the outer edges may be slightly cropped when displayed.";

const CAM_HERO =
  "Camera: positioned slightly below the character's chest height, looking gently upward, so the character reads with stature and presence.";

const CAM_FRIEND = "Camera: straight on at friendly eye level with the character.";

const fidelity = (what) =>
  `The attached reference image is the official product style template. Recreate exactly the same ${what}: same face, same hair, same costume and outfit with every detail, same colors, same materials, same proportions, same art style, and the same rendering finish. Do not redesign, simplify, or reinterpret the character in any way.`;

const joinPrompt = (...parts) => parts.filter(Boolean).join("\n");

// ---------------------------------------------------------------------------
// The 16 image specs (assets.md file tables)
// ---------------------------------------------------------------------------
// aspect: what we ask the model for (nearest supported ratio at 2K);
// target w/h and crop position drive the WebP conversion step.

const specs = [
  // --- Style cards — 1600x820, WebP ~82, <=150 KB -------------------------
  {
    id: "card-chibi_female",
    outPath: "cards/chibi_female.webp",
    w: 1600,
    h: 820,
    aspect: "21:9",
    crop: "west",
    budgetKB: 150,
    // Elliot-approved production chibi concept (2026-07-10 storyfront fixes,
    // issue 1): the card recreates real style output, not the live template.
    styleRef: null,
    extraRefs: [
      {
        path: path.join(rawDir, "refs-provided", "chibi-heroic-female-concept.png"),
        label: "concept",
      },
    ],
    kind: "card",
    prompts: [
      joinPrompt(
        "The attached reference image is the official product output for this style: a chibi heroic fantasy heroine figurine. Recreate exactly the same character: same face, same hair, same armor and outfit with every detail, same colors, same materials, and the same chibi proportions — oversized head about one third of the total height, compact rounded body, large expressive eyes, chunky simplified hands and boots, smooth vinyl-toy surfaces with a matte collectible finish. Do not redesign her, do not make her realistic, and do not change her proportions.",
        "Render her standing in a proud, warm, confident pose with a friendly smile, as a clean collectible chibi figurine render.",
        CARD_COMPO,
        NO_CROP,
        CAM_FRIEND,
        CARD_BG,
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
      joinPrompt(
        "Recreate the chibi heroic fantasy heroine figurine from the reference image exactly — identical character, outfit, colors, and vinyl-toy chibi proportions (oversized head, compact rounded body).",
        "Pose: standing tall and friendly, warm smile.",
        CARD_COMPO,
        NO_CROP,
        CAM_FRIEND,
        CARD_BG,
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
    ],
    alt: "Chibi heroic fantasy heroine figurine with an oversized head and fantasy armor, standing full body on a warm cream studio field",
  },
  {
    id: "card-chibi_figure",
    outPath: "cards/chibi_figure.webp",
    w: 1600,
    h: 820,
    aspect: "21:9",
    crop: "west",
    budgetKB: 150,
    // Elliot-approved production chibi concept (2026-07-10 storyfront fixes,
    // issue 1): the card recreates real style output, not the live template.
    styleRef: null,
    extraRefs: [
      {
        path: path.join(rawDir, "refs-provided", "chibi-heroic-male-concept.jpg"),
        label: "concept",
      },
    ],
    kind: "card",
    prompts: [
      joinPrompt(
        "The attached reference image is the official product output for this style: a chibi heroic fantasy hero figurine. Recreate exactly the same character: same face, same hair and beard, same armor with every detail, same sword, same colors, same materials, and the same chibi proportions — oversized head about one third of the total height, compact rounded muscular body, large expressive eyes, chunky simplified hands and boots, smooth vinyl-toy surfaces with a matte collectible finish. Do not redesign him, do not make him realistic, and do not change his proportions.",
        "Render him standing in a relaxed, proud, friendly pose with his sword lowered at rest, as a clean collectible chibi figurine render.",
        CARD_COMPO,
        NO_CROP,
        CAM_FRIEND,
        CARD_BG,
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
      joinPrompt(
        "Recreate the chibi heroic fantasy hero figurine from the reference image exactly — identical character, armor, sword, colors, and vinyl-toy chibi proportions (oversized head, compact rounded body).",
        "Pose: standing tall and confident with a warm expression, sword at rest.",
        CARD_COMPO,
        NO_CROP,
        CAM_FRIEND,
        CARD_BG,
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
    ],
    alt: "Chibi heroic fantasy male hero figurine with an oversized head, armor, and sword, standing full body on a warm cream studio field",
  },
  {
    id: "card-chibi_photo_male",
    outPath: "cards/chibi_photo_male.webp",
    w: 1600,
    h: 820,
    aspect: "21:9",
    crop: "west",
    budgetKB: 150,
    styleRef: null,
    kind: "card",
    prompts: [
      joinPrompt(
        "Create a full-body chibi figurine character of a completely fictional adult man who does not resemble any real person: short warm brown hair, a friendly open smile, light stubble, wearing a casual moss-green henley shirt, dark jeans, and clean simple sneakers.",
        "Style: a smooth vinyl-toy chibi collectible — oversized head, compact rounded body, simplified expressive face, clean silhouette, broad smooth color regions, and a matte toy finish.",
        CARD_COMPO,
        NO_CROP,
        CAM_FRIEND,
        CARD_BG,
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
      joinPrompt(
        "Create a full-body chibi vinyl-toy character of an invented, generic friendly adult man (a fictional illustration, not a real person): tidy brown hair, warm smile, moss-green casual shirt, dark trousers, simple shoes.",
        "Style: smooth collectible chibi toy with an oversized head, rounded simplified body, and matte finish.",
        CARD_COMPO,
        NO_CROP,
        CAM_FRIEND,
        CARD_BG,
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
    ],
    alt: "Friendly chibi figurine of a man in casual clothes standing full body on a warm cream studio field",
  },
  {
    id: "card-chibi_photo_female",
    outPath: "cards/chibi_photo_female.webp",
    w: 1600,
    h: 820,
    aspect: "21:9",
    crop: "west",
    budgetKB: 150,
    styleRef: null,
    kind: "card",
    prompts: [
      joinPrompt(
        "Create a full-body chibi figurine character of a completely fictional adult woman who does not resemble any real person: shoulder-length dark wavy hair, a warm cheerful smile, wearing a terracotta cardigan over a cream top, blue jeans, and simple flat shoes.",
        "Style: a smooth vinyl-toy chibi collectible — oversized head, compact rounded body, simplified expressive face, clean silhouette, broad smooth color regions, and a matte toy finish.",
        "Background colors strictly warm cream #f5f1ea blending into soft clay #e8dfd3 only — absolutely no pink, rose, salmon, or magenta tones anywhere in the background.",
        CARD_COMPO,
        NO_CROP,
        CAM_FRIEND,
        CARD_BG,
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
      joinPrompt(
        "Create a full-body chibi vinyl-toy character of an invented, generic friendly adult woman (a fictional illustration, not a real person): wavy dark hair, warm smile, terracotta cardigan, cream top, jeans, flat shoes.",
        "Style: smooth collectible chibi toy with an oversized head, rounded simplified body, and matte finish.",
        "Background strictly warm cream #f5f1ea into soft clay #e8dfd3 — no pink, rose, or salmon tones.",
        CARD_COMPO,
        NO_CROP,
        CAM_FRIEND,
        CARD_BG,
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
    ],
    alt: "Friendly chibi figurine of a woman in a terracotta cardigan standing full body on a warm cream studio field",
  },
  {
    id: "card-heroic_fantasy_male",
    outPath: "cards/heroic_fantasy_male.webp",
    w: 1600,
    h: 820,
    aspect: "21:9",
    crop: "west",
    budgetKB: 150,
    styleRef: "heroic_fantasy_male",
    kind: "card",
    prompts: [
      joinPrompt(
        fidelity("heroic fantasy male warrior character"),
        "Render him standing in a grounded, noble heroic stance.",
        "Render in exactly the same smooth, sculpted, photorealistic 3D figurine render style as the reference image — a physical collectible figure with soft studio shading. Absolutely not a comic illustration: no ink outlines, no cel shading, no line art, no flat 2D drawing.",
        CARD_COMPO,
        NO_CROP,
        CAM_HERO,
        CARD_BG,
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
      joinPrompt(
        fidelity("collectible fantasy warrior figure"),
        "Pose: standing tall and noble, weight settled, calm powerful expression.",
        "Same smooth sculpted 3D figurine render finish as the reference — never a comic illustration, no ink outlines, no cel shading.",
        CARD_COMPO,
        NO_CROP,
        CAM_HERO,
        CARD_BG,
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
    ],
    alt: "Heroic fantasy male warrior figurine concept standing full body on a warm cream studio field",
  },
  {
    id: "card-heroic_fantasy_female",
    outPath: "cards/heroic_fantasy_female.webp",
    w: 1600,
    h: 820,
    aspect: "21:9",
    crop: "west",
    budgetKB: 150,
    styleRef: "heroic_fantasy_female",
    kind: "card",
    prompts: [
      joinPrompt(
        fidelity("heroic fantasy female warrior character"),
        "Render her standing in a grounded, noble heroic stance, as clean stylized character art.",
        NAVY_CAPE,
        CARD_COMPO,
        NO_CROP,
        CAM_HERO,
        CARD_BG,
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
      joinPrompt(
        fidelity("collectible fantasy heroine warrior figure"),
        "Pose: standing tall and noble, weight settled, calm powerful expression.",
        NAVY_CAPE,
        CARD_COMPO,
        NO_CROP,
        CAM_HERO,
        CARD_BG,
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
    ],
    alt: "Heroic fantasy female warrior figurine concept standing full body on a warm cream studio field",
  },
  {
    id: "card-creative_lab_figure",
    outPath: "cards/creative_lab_figure.webp",
    w: 1600,
    h: 820,
    aspect: "21:9",
    crop: "west",
    budgetKB: 150,
    styleRef: "creative_lab_figure",
    kind: "card",
    prompts: [
      joinPrompt(
        fidelity("costumed hero character"),
        "Render him standing in a strong, confident hero stance, as clean stylized character art.",
        "The template's chest emblem contains letters: replace those letters with a simple abstract starburst shape in the same emblem colors, so the costume reads the same but carries no lettering.",
        CARD_COMPO,
        NO_CROP,
        CAM_HERO,
        CARD_BG,
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
      joinPrompt(
        fidelity("stylized collectible costumed hero figure"),
        "Pose: standing tall with squared shoulders and a calm, confident expression.",
        "Replace any letters on the chest emblem with a simple abstract starburst shape in the same emblem colors; the costume must carry no lettering.",
        CARD_COMPO,
        NO_CROP,
        CAM_HERO,
        CARD_BG,
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
    ],
    alt: "Super hero male figurine concept standing full body on a warm cream studio field",
  },
  {
    id: "card-super_hero_figure_female",
    outPath: "cards/super_hero_figure_female.webp",
    w: 1600,
    h: 820,
    aspect: "21:9",
    crop: "west",
    budgetKB: 150,
    styleRef: "super_hero_figure_female",
    extraRefs: [
      {
        path: "E:\\PROJECTS\\AI Filmmaker\\projects\\dragon-blade\\characters\\rayna\\identity-source\\victoria-front-2.png",
        label: "identity",
      },
    ],
    kind: "card",
    prompts: [
      joinPrompt(
        "The first reference image is the official style template for this product: a costumed heroine in a deep red suit with black gloves, black belt, and black boots, standing with arms confidently crossed.",
        "The second reference image is the identity reference: a woman with long, wavy brunette hair.",
        "Render the SAME costumed heroine from the template — same suit design, same black gloves, belt, and boots, same arms-crossed pose, same smooth stylized 3D character art style and proportions — but give her the identity of the woman from the second image: her facial features, her long wavy brunette hair, her warm expression, translated into the template's stylized art style. Do not keep the template character's face or short bob hairstyle, and do not make her photorealistic.",
        "Recolor directive: the suit that is deep red in the template must be deep navy blue (around #22304f) instead — same fabric, same shading and material response. Gloves, belt, and boots stay black; the chest starburst emblem stays warm gold and ember. No red anywhere on the character.",
        "The template's chest emblem contains letters: replace those letters with a simple abstract starburst shape in the same emblem colors, so the costume reads the same but carries no lettering.",
        CARD_COMPO,
        NO_CROP,
        CAM_HERO,
        CARD_BG,
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
      joinPrompt(
        "Reference 1 is a style template of a costumed heroine figure in a red suit with arms crossed; reference 2 is an identity photo of a woman with long wavy brunette hair.",
        "Create the same stylized collectible heroine figure from reference 1 — identical suit design recolored deep navy blue (around #22304f) instead of red, black gloves and boots, arms-crossed pose, same art style — carrying the face and long wavy brunette hair of the woman in reference 2, stylized to match the figure's art style. No red anywhere on the character; the chest starburst stays warm gold.",
        "Replace any letters on the chest emblem with a simple abstract starburst shape in the same emblem colors; the costume must carry no lettering.",
        CARD_COMPO,
        NO_CROP,
        CAM_HERO,
        CARD_BG,
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
    ],
    alt: "Super hero female figurine concept with long brunette hair, in a navy blue suit with arms crossed, full body on a warm cream studio field",
  },

  // --- Comic hero panels — 1200x1200, WebP ~82, <=300 KB ------------------
  {
    id: "panel-photo",
    outPath: "hero/panel-photo.webp",
    w: 1200,
    h: 1200,
    aspect: "1:1",
    crop: "centre",
    budgetKB: 300,
    styleRef: null,
    kind: "panel",
    prompts: [
      joinPrompt(
        "A warm, intimate real photograph in golden late-afternoon window light: a wooden picture frame stands gently angled on a warm oak sideboard, close to the camera, large in the composition.",
        "Inside the frame, clearly visible and luminous: a candid printed snapshot of a completely fictional woman in her thirties mid-laugh — head tilted back a little, eyes bright with genuine joy, cozy knit sweater, warm home light inside the snapshot. She is an invented person who does not resemble any real individual. The photo paper catches a soft gloss from the window light.",
        "Beside the frame: a small terracotta pot with a green plant, softly out of focus. Warm cream wall behind with a soft falling shadow; a few dust motes glow in the light beam from the upper left.",
        "Mood: deeply loved, warm, alive — the photo someone passes and smiles at every single day.",
        PHOTOREAL,
        PANEL_SAFE,
        FORM_LIGHT,
        NO_TEXT,
      ),
      joinPrompt(
        "A close, warm real photograph of a wooden picture frame on a sunlit oak sideboard in golden window light, holding a bright candid snapshot of an invented, fictional woman laughing joyfully in a knit sweater. Small potted plant in soft focus beside it, warm cream wall, cozy loved mood.",
        PHOTOREAL,
        PANEL_SAFE,
        FORM_LIGHT,
        NO_TEXT,
      ),
    ],
    alt: "A framed photo of a joyfully laughing woman on a sunlit oak sideboard, golden window light",
  },
  {
    id: "panel-transform",
    outPath: "hero/panel-transform.webp",
    w: 1200,
    h: 1200,
    aspect: "1:1",
    crop: "centre",
    budgetKB: 300,
    styleRef: "chibi_female",
    kind: "panel",
    prompts: [
      joinPrompt(
        fidelity("heroic fantasy heroine character"),
        "Scene: the heroine mid-transformation power-up — a dynamic heroic pose, hair and outfit lifted by rising energy, surrounded by a radiant burst of ember orange and muted gold comic energy, with bold ink burst shapes and halftone dot rays exploding outward behind her.",
        NAVY_CAPE,
        NO_CROP,
        PANEL_SAFE,
        "Camera: slightly below her chest height, looking gently upward, so she reads powerful and triumphant.",
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
      joinPrompt(
        fidelity("stylized collectible fantasy heroine figure"),
        "Scene: the heroine in a triumphant dynamic pose inside a warm radiating comic energy burst of ember orange and gold, halftone rays behind her.",
        NAVY_CAPE,
        NO_CROP,
        PANEL_SAFE,
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
    ],
    alt: "The heroine mid-transformation in a radiant ember and gold comic energy burst",
  },
  {
    id: "panel-figurine",
    outPath: "hero/panel-figurine.webp",
    w: 1200,
    h: 1200,
    aspect: "1:1",
    crop: "centre",
    budgetKB: 300,
    styleRef: "chibi_female",
    extraRefs: [
      {
        path: "E:\\PROJECTS\\3DPrintPosters\\.tmp\\storyfront-raw\\base\\base-view-az000.png",
        label: "base",
      },
    ],
    kind: "panel",
    prompts: [
      joinPrompt(
        "A real product photograph: the character from the FIRST reference image as a physical hand-finished 3D-printed figurine, about 15 cm tall, standing on a warm wooden shelf in a cozy home.",
        "The figurine keeps the exact same character design, costume, and proportions as the first reference, rendered as a real printed and painted object: matte, slightly satin surface, subtle paint layering, hand-finished quality.",
        NAVY_CAPE,
        BASE_REF,
        "Setting: soft window light from the upper left, warm blurred home background with hints of books and a plant, shallow depth of field, soft contact shadow under the base.",
        "The entire figurine and its base are visible, from the top of the head to the bottom of the base, nothing cropped.",
        PHOTOREAL,
        PANEL_SAFE,
        FORM_LIGHT,
        NO_TEXT_EXCEPT_NAME,
      ),
      joinPrompt(
        "A real, cozy product photo of a small hand-painted 3D-printed collectible figurine of the character from the first reference image, mounted on its printed square base with the raised nameplate reading \"Christina\" exactly as in the last reference image, standing on a wooden home shelf in soft warm window light, blurred domestic background.",
        NAVY_CAPE,
        "The whole figurine and base are in frame.",
        PHOTOREAL,
        PANEL_SAFE,
        FORM_LIGHT,
        NO_TEXT_EXCEPT_NAME,
      ),
    ],
    alt: "A 3D-printed figurine of the heroine on its printed base with a Christina nameplate, standing on a wooden home shelf in soft window light",
  },
  {
    id: "panel-gift",
    outPath: "hero/panel-gift.webp",
    w: 1200,
    h: 1200,
    aspect: "1:1",
    crop: "centre",
    budgetKB: 300,
    styleRef: "chibi_female",
    extraRefs: [
      {
        path: "E:\\PROJECTS\\3DPrintPosters\\.tmp\\storyfront-raw\\base\\base-view-az000.png",
        label: "base",
      },
    ],
    kind: "panel",
    prompts: [
      joinPrompt(
        "A real photograph of a warm gift-giving moment: exactly two hands — the left hand and right hand of one person, anatomically correct — holding a shallow open kraft-paper gift box with soft tissue paper.",
        "Standing upright in the box is the character from the FIRST reference image as a physical hand-finished 3D-printed figurine, about 15 cm tall, matte painted surface, exact same character design as that reference.",
        NAVY_CAPE,
        BASE_REF,
        "The shallow box leaves the figurine fully visible from the top of her head down to the bottom of the base — nothing hidden, nothing cropped.",
        "Setting: warm cozy home light from the upper left, soft clay and cream tones, shallow depth of field, quiet emotional mood.",
        PHOTOREAL,
        PANEL_SAFE,
        FORM_LIGHT,
        NO_TEXT_EXCEPT_NAME,
      ),
      joinPrompt(
        "A real warm photo of exactly two hands (one person's left and right hands) offering a shallow open gift box with tissue paper; standing in it, fully visible from head to the bottom of its printed base with the raised \"Christina\" nameplate exactly as in the last reference image, is a small hand-painted 3D-printed figurine of the character from the first reference image. Warm home light, cream and clay tones.",
        NAVY_CAPE,
        PHOTOREAL,
        PANEL_SAFE,
        FORM_LIGHT,
        NO_TEXT_EXCEPT_NAME,
      ),
    ],
    alt: "Two hands presenting an open gift box with the heroine figurine standing inside on its Christina-nameplate base",
  },

  // --- Supporting art ------------------------------------------------------
  {
    id: "empty-first-hero",
    outPath: "empty/first-hero.webp",
    w: 900,
    h: 900,
    aspect: "1:1",
    crop: "centre",
    budgetKB: 200,
    styleRef: "chibi_female",
    kind: "support",
    prompts: [
      joinPrompt(
        fidelity("heroic fantasy heroine character"),
        "Pose: waving warmly at the viewer with one raised hand, the other hand beckoning in a friendly welcoming gesture, cheerful open expression.",
        NAVY_CAPE,
        NO_CROP,
        CAM_FRIEND,
        "Background: a very clean, minimal warm cream #f5f1ea field with the faintest clay-toned vignette. Nothing else in the scene.",
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
      joinPrompt(
        fidelity("stylized collectible fantasy heroine figure"),
        "Pose: friendly wave toward the viewer, welcoming smile.",
        NAVY_CAPE,
        NO_CROP,
        CAM_FRIEND,
        "Background: minimal warm cream field.",
        PALETTE,
        FORM_LIGHT,
        NO_TEXT,
      ),
    ],
    alt: "The heroine waving a friendly welcome on a clean warm cream background",
  },
  {
    id: "epilogue-shelf",
    outPath: "epilogue/shelf.webp",
    w: 1600,
    h: 900,
    aspect: "16:9",
    crop: "centre",
    budgetKB: 300,
    styleRef: "chibi_female",
    extraRefs: [
      {
        path: "E:\\PROJECTS\\3DPrintPosters\\.tmp\\storyfront-raw\\base\\base-view-az000.png",
        label: "base",
      },
    ],
    kind: "support",
    prompts: [
      joinPrompt(
        "A real photograph of a warm home interior: a wooden family shelf holding a few framed photos, a small green plant in a ceramic pot, and — standing proudly among them — the character from the FIRST reference image as a physical hand-finished 3D-printed figurine, about 15 cm tall, matte painted surface, exact same character design as that reference.",
        NAVY_CAPE,
        BASE_REF,
        "The framed photos are angled away or softly out of focus so their contents stay indistinct — no readable faces and no readable lettering in them.",
        "Mood: every hero deserves a shelf — warm, loved, domestic. Soft window light from the upper left, gentle shadows, cream and clay and warm wood tones.",
        "The entire figurine and its base are visible.",
        PHOTOREAL,
        FORM_LIGHT,
        NO_TEXT_EXCEPT_NAME,
      ),
      joinPrompt(
        "A real cozy photo of a shelf in a warm home: framed pictures softly out of focus, a small plant, and a hand-painted 3D-printed figurine of the character from the first reference image standing among them on its printed square base with the raised \"Christina\" nameplate exactly as in the last reference image. Warm window light, wood and cream tones, whole figurine and base in frame.",
        NAVY_CAPE,
        PHOTOREAL,
        FORM_LIGHT,
        NO_TEXT_EXCEPT_NAME,
      ),
    ],
    alt: "A warm family shelf with framed photos, a plant, and the heroine figurine on its Christina-nameplate base standing among them",
  },

  // --- Scene plates — 1600x1200 + PNG masters to Storage -------------------
  {
    id: "scene-bookshelf-plate",
    outPath: "scenes/bookshelf-plate.webp",
    w: 1600,
    h: 1200,
    aspect: "4:3",
    crop: "centre",
    budgetKB: 350,
    styleRef: null,
    kind: "plate",
    storagePlatePath: "admin/scene-plates/bookshelf.png",
    prompts: [
      joinPrompt(
        "A real photograph of a wooden bookshelf in a lived-in home, one shelf filling most of the frame at its natural height.",
        "On the shelf: a group of hardcover books leaning together on the left with completely plain cloth spines — no titles and no lettering of any kind on the books — a small framed picture angled away so its contents are indistinct, a small green plant in a ceramic pot, and a ceramic mug — everyday objects that give a clear sense of scale.",
        "Center-right on the shelf: a clearly EMPTY open spot of bare warm wood, softly lit, obviously waiting for a small collectible about 15 cm tall. Nothing stands there — leave that spot completely empty.",
        "No figurine, no people, no animals, and no readable text anywhere in the image.",
        "Camera: positioned slightly below the level of the empty shelf spot, looking gently upward at it.",
        "Lighting: warm key light from the upper left, believable soft shadows falling across the shelf wood, cozy domestic evening warmth, cream and clay and warm wood tones.",
        PHOTOREAL,
        NO_TEXT,
      ),
      joinPrompt(
        "A real photo of a cozy wooden bookshelf in a lived-in home, books grouped to the left with plain unlettered spines, small plant and ceramic mug for scale, a framed picture angled away with indistinct contents, and one clearly empty stretch of bare shelf wood center-right, softly spot-lit and waiting.",
        "No people, no figurines, no readable text anywhere, not even on book spines. Camera slightly below shelf level looking gently up. Warm key light from the upper left with soft believable shadows.",
        PHOTOREAL,
        NO_TEXT,
      ),
    ],
    alt: "A warm wooden bookshelf with books, a plant, and a framed photo, with an empty softly lit spot center-right",
  },
  {
    id: "scene-desk-plate",
    outPath: "scenes/desk-plate.webp",
    w: 1600,
    h: 1200,
    aspect: "4:3",
    crop: "centre",
    budgetKB: 350,
    styleRef: null,
    kind: "plate",
    storagePlatePath: "admin/scene-plates/desk.png",
    prompts: [
      joinPrompt(
        "A real photograph of a cozy home desk corner: the closed edge of a laptop just entering the frame on the left, a closed notebook, a ceramic mug, and a warm desk lamp glowing from the upper left.",
        "Near the lamp: a clearly EMPTY open spot on the wooden desk surface, softly pooled in warm lamp light, obviously waiting for a small collectible about 15 cm tall. Nothing stands there — leave that spot completely empty.",
        "No people, no figurine, no screens with visible content, and no readable text anywhere in the image.",
        "Camera: positioned slightly below the level of the empty desk spot, looking gently upward at it.",
        "Lighting: warm lamp key light from the upper left, believable soft shadows on the desk wood, cozy evening warmth, cream and clay and warm wood tones.",
        PHOTOREAL,
        NO_TEXT,
      ),
      joinPrompt(
        "A real photo of a warm desk corner at home: laptop edge on the left, closed notebook, ceramic mug, glowing desk lamp upper left, and one clearly empty pool of lamp light on the bare wooden desk surface near the lamp, waiting.",
        "No people, no figurines, no readable text or screen content. Camera slightly below desk-spot level looking gently up. Soft believable shadows.",
        PHOTOREAL,
        NO_TEXT,
      ),
    ],
    alt: "A cozy desk with a laptop edge, notebook, and mug under warm lamp light, with an empty lit spot near the lamp",
  },
];

// Local fallback template files if Storage is unreachable (plan.md §2).
const localTemplateFallbacks = {
  chibi_female: "C:\\Users\\Eliud\\Desktop\\Styles\\SheRa-ChatGPTv4 Christina.png",
  heroic_fantasy_male: "C:\\Users\\Eliud\\Desktop\\Styles\\Heroic Male.png",
  heroic_fantasy_female: "C:\\Users\\Eliud\\Desktop\\Styles\\Heroic Female.png",
  super_hero_figure_female: "C:\\Users\\Eliud\\Desktop\\Styles\\Super Hero Female.png",
};

// ---------------------------------------------------------------------------
// Secrets — read the key without ever printing it
// ---------------------------------------------------------------------------

async function readEnvKeyFromFile(filePath, name) {
  try {
    const content = await readFile(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)\\s*$`));
      if (match) {
        let value = match[1].trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (value) return value;
      }
    }
  } catch {
    // file missing or unreadable — try the next location
  }
  return null;
}

async function loadApiKey() {
  const candidates = [
    ["process env", "VERTEX_API_KEY", null],
    ["apps/functions/.env", "VERTEX_API_KEY", path.join(repoRoot, "apps", "functions", ".env")],
    [
      "apps/functions/.secret.local",
      "VERTEX_API_KEY",
      path.join(repoRoot, "apps", "functions", ".secret.local"),
    ],
    ["root .env", "VERTEX_API_KEY", path.join(repoRoot, ".env")],
    ["root .env", "GOOGLE_API_KEY", path.join(repoRoot, ".env")],
    ["root .env", "GEMINI_API_KEY", path.join(repoRoot, ".env")],
  ];

  for (const [label, name, filePath] of candidates) {
    const value = filePath
      ? await readEnvKeyFromFile(filePath, name)
      : (process.env[name]?.trim() || null);
    if (value) {
      console.log(`Using ${name} from ${label}.`);
      return value;
    }
  }

  throw new Error(
    "No API key found. Expected VERTEX_API_KEY (or GOOGLE_API_KEY/GEMINI_API_KEY) in the process env, apps/functions/.env, apps/functions/.secret.local, or the root .env.",
  );
}

// ---------------------------------------------------------------------------
// Live style templates (Firestore config -> Storage), like the seed scripts
// ---------------------------------------------------------------------------

let firebaseReady = false;
function ensureFirebase() {
  if (!firebaseReady) {
    initializeApp({ projectId, storageBucket: bucketName });
    firebaseReady = true;
  }
}

async function resolveRefs() {
  await mkdir(refsDir, { recursive: true });
  const neededStyles = [...new Set(specs.map((spec) => spec.styleRef).filter(Boolean))];
  const index = {};

  let styles = [];
  try {
    ensureFirebase();
    const snapshot = await getFirestore()
      .collection("adminConfig")
      .doc("figurineWorkflow")
      .get();
    styles = snapshot.exists ? (snapshot.data()?.styles ?? []) : [];
  } catch (error) {
    console.warn(
      `Could not read adminConfig/figurineWorkflow (${error instanceof Error ? error.message : error}); falling back to local template files.`,
    );
  }

  for (const styleId of neededStyles) {
    const style = styles.find((entry) => entry?.id === styleId);
    const template = (style?.referenceImages ?? []).filter((image) => image?.enabled)[0];

    if (template?.storagePath) {
      try {
        const [buffer] = await getStorage()
          .bucket(bucketName)
          .file(template.storagePath)
          .download();
        const ext = template.mimeType === "image/jpeg" ? "jpg" : "png";
        const fileName = `${styleId}.${ext}`;
        await writeFile(path.join(refsDir, fileName), buffer);
        index[styleId] = {
          file: fileName,
          mimeType: template.mimeType === "image/jpeg" ? "image/jpeg" : "image/png",
          source: `storage:${template.storagePath}`,
          bytes: buffer.byteLength,
        };
        console.log(`ref ${styleId}: storage ${template.storagePath} (${buffer.byteLength} bytes)`);
        continue;
      } catch (error) {
        console.warn(
          `ref ${styleId}: storage download failed (${error instanceof Error ? error.message : error}); trying local fallback.`,
        );
      }
    } else {
      console.warn(`ref ${styleId}: no enabled reference image in live config; trying local fallback.`);
    }

    const localPath = localTemplateFallbacks[styleId];
    if (localPath) {
      try {
        await access(localPath);
        const fileName = `${styleId}.png`;
        await copyFile(localPath, path.join(refsDir, fileName));
        index[styleId] = {
          file: fileName,
          mimeType: "image/png",
          source: `local:${localPath}`,
        };
        console.log(`ref ${styleId}: local fallback ${localPath}`);
        continue;
      } catch {
        // fall through
      }
    }

    throw new Error(`No template reference available for style ${styleId}.`);
  }

  await writeFile(refsIndexPath, JSON.stringify(index, null, 2));
  console.log(`Wrote ${refsIndexPath}`);
  return index;
}

async function loadRefsIndex() {
  try {
    return JSON.parse(await readFile(refsIndexPath, "utf8"));
  } catch {
    console.log("Reference index missing — resolving live style templates first.");
    return resolveRefs();
  }
}

async function loadReferenceBuffer(entry) {
  let buffer = await readFile(path.join(refsDir, entry.file));
  if (buffer.byteLength > referenceByteLimit) {
    // Same 5 MB inline limit as production; downscale a too-large template.
    buffer = await sharp(buffer).resize({ width: 2048, withoutEnlargement: true }).png().toBuffer();
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// Vertex/Gemini requests — interactions route first (production 2K shape),
// Vertex Express generateContent as the fallback route.
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractInteractionsImage(payload) {
  const top = payload.output_image ?? payload.outputImage;
  if (top?.data) {
    return { mimeType: top.mime_type ?? top.mimeType ?? "image/jpeg", data: top.data };
  }
  for (const step of payload.steps ?? []) {
    for (const item of step.content ?? []) {
      if (item.type === "image" && item.data) {
        return { mimeType: item.mime_type ?? item.mimeType ?? "image/jpeg", data: item.data };
      }
    }
  }
  return null;
}

function extractInteractionsText(payload) {
  const texts = [];
  for (const step of payload.steps ?? []) {
    for (const item of step.content ?? []) {
      if (item.type === "text" && item.text) texts.push(item.text);
    }
  }
  return texts.join("\n").slice(0, 500);
}

function extractGenerateContentImage(payload) {
  if (payload.promptFeedback?.blockReason) {
    const error = new Error(`blocked: ${payload.promptFeedback.blockReason}`);
    error.safetyBlocked = true;
    throw error;
  }
  for (const candidate of payload.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const inline = part.inlineData ?? part.inline_data;
      const data = inline?.data;
      if (data) {
        return { mimeType: inline.mimeType ?? inline.mime_type ?? "image/png", data };
      }
    }
  }
  const finishReason = payload.candidates?.[0]?.finishReason ?? "no image";
  const text = (payload.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text)
    .filter(Boolean)
    .join(" ")
    .slice(0, 300);
  const error = new Error(`no image (finishReason: ${finishReason})${text ? ` text: ${text}` : ""}`);
  error.safetyBlocked = /SAFETY|PROHIBITED|BLOCK/i.test(finishReason);
  throw error;
}

async function requestInteractionsImage({ apiKey, promptText, referenceImages, aspect }) {
  const input = [
    { type: "text", text: promptText },
    ...referenceImages.map((ref) => ({
      type: "image",
      mime_type: ref.mimeType,
      data: ref.buffer.toString("base64"),
    })),
  ];
  const response = await fetch(interactionsBaseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      model,
      input,
      response_format: {
        type: "image",
        mime_type: "image/jpeg",
        aspect_ratio: aspect,
        image_size: "2K",
      },
    }),
  });

  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, 600);
    const error = new Error(`interactions HTTP ${response.status}: ${body}`);
    error.httpStatus = response.status;
    error.safetyBlocked =
      response.status === 400 && /safety|blocked|prohibited/i.test(body);
    throw error;
  }

  const payload = await response.json();
  const image = extractInteractionsImage(payload);
  if (!image) {
    const text = extractInteractionsText(payload);
    const error = new Error(
      `interactions returned no image (status: ${payload.status ?? "?"})${text ? ` text: ${text}` : ""}`,
    );
    error.safetyBlocked = /safety|blocked|prohibited|can't|cannot/i.test(text);
    throw error;
  }
  return { ...image, route: "interactions" };
}

async function requestGenerateContentImage({ apiKey, promptText, referenceImages }) {
  const endpoint = `${vertexExpressBaseUrl}/publishers/google/models/${encodeURIComponent(model)}:generateContent?${new URLSearchParams({ key: apiKey })}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "USER",
          parts: [
            { text: promptText },
            ...referenceImages.map((ref) => ({
              inlineData: { mimeType: ref.mimeType, data: ref.buffer.toString("base64") },
            })),
          ],
        },
      ],
      generationConfig: { candidateCount: 1, responseModalities: ["TEXT", "IMAGE"] },
      safetySettings: [
        "HARM_CATEGORY_HATE_SPEECH",
        "HARM_CATEGORY_HARASSMENT",
        "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "HARM_CATEGORY_DANGEROUS_CONTENT",
      ].map((category) => ({
        method: "PROBABILITY",
        category,
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      })),
    }),
  });

  if (!response.ok) {
    const body = (await response.text().catch(() => "")).slice(0, 600);
    const error = new Error(`generateContent HTTP ${response.status}: ${body}`);
    error.httpStatus = response.status;
    throw error;
  }

  return { ...extractGenerateContentImage(await response.json()), route: "generateContent" };
}

let lastRequestAt = 0;
async function throttle() {
  const wait = lastRequestAt + minSecondsBetweenRequests * 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

// One image with retry/backoff/variant policy (assets.md §3 gotchas):
// serialized requests, exponential backoff on 429/5xx, prompt-variant rotation
// on safety blocks, and route fallback on interactions auth/route failures.
async function generateOne({ apiKey, spec, refsIndex }) {
  const referenceImages = [];
  if (spec.styleRef) {
    const entry = refsIndex[spec.styleRef];
    if (!entry) throw new Error(`Missing reference for style ${spec.styleRef}`);
    referenceImages.push({ mimeType: entry.mimeType, buffer: await loadReferenceBuffer(entry) });
  }
  // Extra references (identity photos, base renders, ...) follow the template
  // in the order declared, so prompts can address "the last reference image".
  for (const extra of spec.extraRefs ?? []) {
    let buffer = await readFile(extra.path);
    if (buffer.byteLength > referenceByteLimit) {
      buffer = await sharp(buffer)
        .resize({ width: 2048, withoutEnlargement: true })
        .png()
        .toBuffer();
    }
    referenceImages.push({
      mimeType: /\.jpe?g$/i.test(extra.path) ? "image/jpeg" : "image/png",
      buffer,
    });
  }

  const attempts = [];
  let variantIndex = 0;
  let backoffSeconds = 30;
  let routeFallback = false;

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const promptText = spec.prompts[Math.min(variantIndex, spec.prompts.length - 1)];
    await throttle();
    const startedAt = Date.now();
    try {
      const request = { apiKey, promptText, referenceImages, aspect: spec.aspect };
      const image = routeFallback
        ? await requestGenerateContentImage(request)
        : await requestInteractionsImage(request);

      const pngBuffer = await sharp(Buffer.from(image.data, "base64")).png().toBuffer();
      const meta = await sharp(pngBuffer).metadata();
      const rawPath = path.join(rawDir, `${spec.id}.png`);
      await writeFile(rawPath, pngBuffer);

      const sidecar = {
        id: spec.id,
        outPath: spec.outPath,
        target: { w: spec.w, h: spec.h },
        aspect: spec.aspect,
        route: image.route,
        promptVariant: Math.min(variantIndex, spec.prompts.length - 1),
        prompt: promptText,
        referenceSource: spec.styleRef ? refsIndex[spec.styleRef].source : null,
        extraRefs: (spec.extraRefs ?? []).map((extra) => `${extra.label}:${extra.path}`),
        natural: { w: meta.width, h: meta.height },
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        attempts: attempts.length + 1,
      };
      await writeFile(path.join(rawDir, `${spec.id}.json`), JSON.stringify(sidecar, null, 2));
      return { ok: true, sidecar, attemptNotes: attempts };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = error?.httpStatus;
      attempts.push(`attempt ${attempt} [${routeFallback ? "generateContent" : "interactions"}, variant ${Math.min(variantIndex, spec.prompts.length - 1)}]: ${message.slice(0, 240)}`);
      console.warn(`  ${spec.id}: ${message.slice(0, 200)}`);

      if (status === 429 || (status >= 500 && status < 600)) {
        console.warn(`  ${spec.id}: backing off ${backoffSeconds}s`);
        await sleep(backoffSeconds * 1000);
        backoffSeconds = Math.min(backoffSeconds * 2, 240);
      } else if (error?.safetyBlocked) {
        variantIndex += 1; // rephrase per assets.md §3
        if (variantIndex >= spec.prompts.length && routeFallback) break;
        if (variantIndex >= spec.prompts.length) {
          routeFallback = true;
          variantIndex = 0;
        }
      } else if (!routeFallback && (status === 400 || status === 401 || status === 403 || status === 404)) {
        routeFallback = true; // interactions route unavailable for this key/shape
      } else if (routeFallback) {
        break;
      } else {
        routeFallback = true;
      }
    }
  }

  return { ok: false, attemptNotes: attempts };
}

// ---------------------------------------------------------------------------
// Logging (assets-log.md — prompts + outcomes, per assets.md §5)
// ---------------------------------------------------------------------------

async function logEntry(lines) {
  await appendFile(logPath, `${lines.join("\n")}\n\n`, "utf8");
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const only = (() => {
    const index = argv.indexOf("--only");
    if (index < 0) return null;
    return new Set((argv[index + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  })();
  return { only, force: argv.includes("--force") };
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function commandGenerate(argv) {
  const { only, force } = parseArgs(argv);
  const apiKey = await loadApiKey();
  const refsIndex = await loadRefsIndex();
  await mkdir(rawDir, { recursive: true });

  const queue = specs.filter((spec) => !only || only.has(spec.id));
  if (queue.length === 0) {
    console.log("Nothing matches --only; valid ids:", specs.map((s) => s.id).join(", "));
    return;
  }

  const results = [];
  for (const spec of queue) {
    const rawPath = path.join(rawDir, `${spec.id}.png`);
    if (!force && (await fileExists(rawPath))) {
      console.log(`skip ${spec.id} (raw exists; use --force to regenerate)`);
      continue;
    }

    console.log(`generate ${spec.id} (${spec.aspect} 2K, ref: ${spec.styleRef ?? "none"})...`);
    const result = await generateOne({ apiKey, spec, refsIndex });
    results.push({ spec, result });

    const stamp = new Date().toISOString();
    if (result.ok) {
      console.log(
        `  ok ${spec.id}: ${result.sidecar.natural.w}x${result.sidecar.natural.h} via ${result.sidecar.route} (variant ${result.sidecar.promptVariant}, ${result.sidecar.attempts} attempt${result.sidecar.attempts === 1 ? "" : "s"})`,
      );
      await logEntry([
        `### ${stamp} — ${spec.id} — GENERATED`,
        `- route: ${result.sidecar.route}, variant ${result.sidecar.promptVariant}, ${result.sidecar.attempts} attempt(s), ${result.sidecar.natural.w}x${result.sidecar.natural.h}`,
        `- reference: ${result.sidecar.referenceSource ?? "none"}`,
        ...(result.attemptNotes.length > 0
          ? ["- earlier attempts:", ...result.attemptNotes.map((note) => `  - ${note}`)]
          : []),
        "- prompt:",
        "```",
        result.sidecar.prompt,
        "```",
      ]);
    } else {
      console.error(`  FAILED ${spec.id} after ${result.attemptNotes.length} attempts`);
      await logEntry([
        `### ${stamp} — ${spec.id} — FAILED`,
        ...result.attemptNotes.map((note) => `- ${note}`),
      ]);
    }
  }

  const failed = results.filter((r) => !r.result.ok);
  console.log(
    `\nDone: ${results.filter((r) => r.result.ok).length} generated, ${failed.length} failed${failed.length ? ` (${failed.map((r) => r.spec.id).join(", ")})` : ""}.`,
  );
  if (failed.length > 0) process.exitCode = 1;
}

async function commandStatus() {
  for (const spec of specs) {
    const rawExists = await fileExists(path.join(rawDir, `${spec.id}.png`));
    const outExists = await fileExists(path.join(publicDir, ...spec.outPath.split("/")));
    console.log(
      `${rawExists ? "raw✓" : "raw·"} ${outExists ? "webp✓" : "webp·"}  ${spec.id} -> ${spec.outPath}`,
    );
  }
}

async function commandSheet() {
  const tiles = [];
  for (const spec of specs) {
    const sidecarPath = path.join(rawDir, `${spec.id}.json`);
    const rawExists = await fileExists(path.join(rawDir, `${spec.id}.png`));
    let sidecar = null;
    try {
      sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
    } catch {
      // no sidecar yet
    }
    tiles.push({ spec, sidecar, rawExists });
  }

  const sections = [
    ["Style cards — 1600x820 (shown cover-cropped to final ratio)", "card"],
    ["Comic hero panels — 1200x1200", "panel"],
    ["Supporting art", "support"],
    ["Scene plates — 1600x1200 (empty spot required)", "plate"],
  ];

  const tileHtml = (tile) => {
    const { spec, sidecar, rawExists } = tile;
    const img = rawExists
      ? `<a href="${spec.id}.png" target="_blank"><div class="art" style="aspect-ratio:${spec.w}/${spec.h}"><img src="${spec.id}.png" alt="" style="object-position:${spec.crop === "west" ? "left center" : "center"}"></div></a>`
      : `<div class="art missing" style="aspect-ratio:${spec.w}/${spec.h}">not generated</div>`;
    const meta = sidecar
      ? `${sidecar.natural.w}x${sidecar.natural.h} raw · ${sidecar.route} · variant ${sidecar.promptVariant} · ${sidecar.attempts} attempt(s)${sidecar.referenceSource ? ` · ref ${sidecar.referenceSource.split(":")[0]}` : ""}`
      : "";
    return `<figure>
      ${img}
      <figcaption>
        <strong>${spec.id}</strong> → ${spec.outPath} (${spec.w}x${spec.h})
        <span class="meta">${meta}</span>
        ${sidecar ? `<details><summary>prompt</summary><pre>${sidecar.prompt.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre></details>` : ""}
      </figcaption>
    </figure>`;
  };

  const html = `<!doctype html>
<meta charset="utf-8">
<title>Storyfront contact sheet — ${new Date().toISOString().slice(0, 16).replace("T", " ")}</title>
<style>
  body { font-family: system-ui, sans-serif; background:#f5f1ea; color:#1a1714; margin:2rem; }
  h1 { font-size:1.4rem; } h2 { font-size:1.05rem; margin-top:2.5rem; border-bottom:2px solid #e8552e; padding-bottom:.3rem; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(430px,1fr)); gap:1.2rem; }
  figure { margin:0; background:#fff; border:1px solid #e8dfd3; border-radius:10px; padding:.7rem; }
  .art { width:100%; overflow:hidden; border-radius:6px; background:#e8dfd3; }
  .art img { width:100%; height:100%; object-fit:cover; display:block; }
  .art.missing { display:flex; align-items:center; justify-content:center; color:#c2410c; font-weight:600; }
  figcaption { font-size:.78rem; margin-top:.5rem; line-height:1.45; }
  .meta { display:block; color:#6b6259; }
  pre { white-space:pre-wrap; font-size:.7rem; background:#f5f1ea; padding:.5rem; border-radius:6px; }
  p.note { max-width:70ch; }
</style>
<h1>Storyfront asset contact sheet</h1>
<p class="note">Each image is shown cover-cropped to its final display ratio (cards crop from the right edge; click any image to open the raw 2K PNG). Review for: template fidelity, no baked text, no cropped bodies, plate empty spots. Note fixes per image id.</p>
${sections
  .map(
    ([title, kind]) => `<h2>${title}</h2>
<div class="grid">
${tiles.filter((tile) => tile.spec.kind === kind).map(tileHtml).join("\n")}
</div>`,
  )
  .join("\n")}
`;
  const sheetPath = path.join(rawDir, "contact-sheet.html");
  await writeFile(sheetPath, html, "utf8");
  console.log(`Wrote ${sheetPath}`);
}

async function commandConvert() {
  const manifest = {};
  const qualitySteps = [82, 76, 70, 64, 58, 52];
  for (const spec of specs) {
    const rawPath = path.join(rawDir, `${spec.id}.png`);
    if (!(await fileExists(rawPath))) {
      throw new Error(`Missing raw PNG for ${spec.id}; generate it first.`);
    }
    const outPath = path.join(publicDir, ...spec.outPath.split("/"));
    await mkdir(path.dirname(outPath), { recursive: true });

    let buffer = null;
    let usedQuality = null;
    for (const quality of qualitySteps) {
      buffer = await sharp(rawPath)
        .resize(spec.w, spec.h, { fit: "cover", position: spec.crop === "west" ? "west" : "centre" })
        .webp({ quality })
        .toBuffer();
      usedQuality = quality;
      if (buffer.byteLength <= spec.budgetKB * 1024) break;
    }
    await writeFile(outPath, buffer);
    const kb = Math.round(buffer.byteLength / 1024);
    const overBudget = buffer.byteLength > spec.budgetKB * 1024;
    console.log(
      `${spec.outPath}: ${spec.w}x${spec.h} q${usedQuality} ${kb} KB${overBudget ? ` (OVER ${spec.budgetKB} KB budget)` : ""}`,
    );
    if (overBudget) process.exitCode = 1;
    manifest[spec.outPath] = { w: spec.w, h: spec.h, alt: spec.alt };
  }
  await writeFile(
    path.join(publicDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(`Wrote ${path.join(publicDir, "manifest.json")}`);
}

async function commandUploadPlates() {
  ensureFirebase();
  const bucket = getStorage().bucket(bucketName);
  for (const spec of specs.filter((s) => s.storagePlatePath)) {
    const rawPath = path.join(rawDir, `${spec.id}.png`);
    if (!(await fileExists(rawPath))) throw new Error(`Missing raw PNG for ${spec.id}`);
    // The generateScenePreview runner inlines the plate into a Vertex request
    // that mirrors aiProvider.ts (8 MB source / 5 MB reference guards), so the
    // uploaded master is the spec-size PNG, not the oversized 2K raw.
    const buffer = await sharp(rawPath)
      .resize(spec.w, spec.h, { fit: "cover", position: "centre" })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await bucket.file(spec.storagePlatePath).save(buffer, {
      resumable: false,
      metadata: {
        contentType: "image/png",
        cacheControl: "private, max-age=3600",
        metadata: {
          workflow: "storyfront-scene-plate",
          sourceSpec: spec.id,
          generatedBy: "scripts/storyfront/generate-assets.mjs",
        },
      },
    });
    console.log(`Uploaded ${spec.storagePlatePath} (${buffer.byteLength} bytes)`);
  }
}

const command = process.argv[2];
const commandArgs = process.argv.slice(3);
const commands = {
  refs: () => resolveRefs(),
  generate: () => commandGenerate(commandArgs),
  sheet: () => commandSheet(),
  status: () => commandStatus(),
  convert: () => commandConvert(),
  "upload-plates": () => commandUploadPlates(),
};

if (!commands[command]) {
  console.log(`Unknown command "${command ?? ""}". Commands: ${Object.keys(commands).join(", ")}`);
  process.exitCode = 1;
} else {
  commands[command]().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
