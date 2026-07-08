import { getStorage } from "firebase-admin/storage";
import {
  buildProofStyleMetadata,
  buildProofStylePromptDirectives,
  type ProofStyleMetadata,
} from "./styleContracts.js";
import { isFigurineStyle } from "./figurineWorkflow.js";
import {
  defaultTemplateFaceSwapPrompt,
  type WorkflowProofMode,
  type WorkflowProofRendering,
  type WorkflowStyleReferenceImage,
} from "./figurineWorkflowConfig.js";

export type PosterGenerationInput = {
  jobId: string;
  uid: string;
  sourceImagePath: string;
  selectedStyle: string;
  selectedStyleLabel?: string;
  productType?: "poster" | "figurine";
  proofGenerationCount?: number;
  baseProofPrompt?: string;
  stylePrompt?: string;
  proofMode?: WorkflowProofMode;
  proofRendering?: WorkflowProofRendering;
  referenceImages?: WorkflowStyleReferenceImage[];
};

export type PosterGenerationOutput = {
  provider: "vertex-gemini-direct" | "cloudflare-ai-gateway";
  status: "succeeded" | "stubbed";
  generatedImagePaths: string[];
  metadata: {
    model: string;
    route: string;
    notes: string[];
    outputMimeType?: string;
    outputMimeTypes?: string[];
    proofGenerationCount?: number;
    styleMetadata?: ProofStyleMetadata;
    responseText?: string;
    responseTextByGeneration?: string[];
    modelVersion?: string;
    modelVersions?: string[];
    referenceImageCount?: number;
    referenceImageIds?: string[];
    failedProofGenerationCount?: number;
    proofGenerationFailures?: string[];
    proofMode?: WorkflowProofMode;
    templateReferenceImageId?: string;
    imageConfig?: Record<string, string>;
  };
};

export type PosterAiProvider = {
  generatePosterConcept(
    input: PosterGenerationInput,
  ): Promise<PosterGenerationOutput>;
};

const defaultVertexImageModel = "gemini-3-pro-image";
const defaultSourceImageByteLimit = 8 * 1024 * 1024;
const defaultReferenceImageByteLimit = 5 * 1024 * 1024;
const defaultProofGenerationCount = 1;
const maxProofGenerationCount = 4;
const vertexExpressBaseUrl = "https://aiplatform.googleapis.com/v1";
const geminiInteractionsBaseUrl =
  "https://generativelanguage.googleapis.com/v1beta/interactions";

type VertexGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: VertexPart[];
    };
    finishReason?: string;
  }>;
  modelVersion?: string;
  requestRoute?: string;
  interactionId?: string;
  promptFeedback?: {
    blockReason?: string;
  };
};

type VertexPart = {
  text?: string;
  inlineData?: VertexInlineData;
  inline_data?: {
    mime_type?: string;
    data?: string;
  };
};

type VertexInlineData = {
  mimeType?: string;
  data?: string;
};

type GeneratedVertexImage = {
  mimeType?: string;
  data: string;
};

type VertexProofGenerationSuccess = {
  status: "fulfilled";
  outputStoragePath: string;
  outputMimeType: string;
  responseText: string;
  modelVersion?: string;
  requestRoute?: string;
};

type VertexProofGenerationFailure = {
  status: "rejected";
  proofIndex: number;
  message: string;
};

type VertexRequestReferenceImage = {
  id: string;
  mimeType: "image/jpeg" | "image/png";
  imageBuffer: Buffer;
};

type VertexInteractionsResponseFormat = {
  type: "image";
  mime_type: "image/jpeg";
  aspect_ratio?: string;
  image_size?: string;
};

type VertexInteractionsResponse = {
  id?: string;
  status?: string;
  model?: string;
  output_image?: VertexInteractionsImageOutput;
  outputImage?: VertexInlineData;
  steps?: Array<{
    type?: string;
    content?: VertexInteractionsContentItem[];
  }>;
};

type VertexInteractionsImageOutput = {
  mime_type?: string;
  mimeType?: string;
  data?: string;
};

type VertexInteractionsContentItem = VertexInteractionsImageOutput & {
  type?: string;
  text?: string;
};

export function buildReferenceImageGenerationMetadata(
  referenceImages: WorkflowStyleReferenceImage[] = [],
): {
  referenceImageCount?: number;
  referenceImageIds?: string[];
} {
  const enabledImages = enabledReferenceImages(referenceImages);

  if (enabledImages.length === 0) {
    return {};
  }

  return {
    referenceImageCount: enabledImages.length,
    referenceImageIds: enabledImages.map((image) => image.id),
  };
}

export function buildVertexUserParts(input: {
  promptText: string;
  sourceImageBuffer: Buffer;
  sourceMimeType: string;
  referenceImages?: VertexRequestReferenceImage[];
}): VertexPart[] {
  return [
    {
      text: input.promptText,
    },
    {
      inlineData: {
        mimeType: input.sourceMimeType,
        data: input.sourceImageBuffer.toString("base64"),
      },
    },
    ...(input.referenceImages ?? []).map((referenceImage) => ({
      inlineData: {
        mimeType: referenceImage.mimeType,
        data: referenceImage.imageBuffer.toString("base64"),
      },
    })),
  ];
}

export function createPosterAiProvider(): PosterAiProvider {
  const aiRoute = process.env.AI_PROVIDER_ROUTE ?? "vertex-gemini-direct";

  if (aiRoute === "cloudflare-ai-gateway") {
    return new CloudflareGatewayPosterAiProvider();
  }

  return new VertexGeminiPosterAiProvider();
}

class VertexGeminiPosterAiProvider implements PosterAiProvider {
  async generatePosterConcept(
    input: PosterGenerationInput,
  ): Promise<PosterGenerationOutput> {
    const apiKey = process.env.VERTEX_API_KEY;
    if (!apiKey) {
      throw new Error(
        "VERTEX_API_KEY is required for the direct Vertex/Gemini provider.",
      );
    }

    const model = process.env.VERTEX_IMAGE_MODEL ?? defaultVertexImageModel;
    const promptText = buildPosterPrompt(input);
    const styleMetadata = buildProofStyleMetadata(input.selectedStyle);
    const proofGenerationCount = resolveProofGenerationCount(
      input.proofGenerationCount,
    );
    const bucket = getConfiguredStorageBucket();
    const sourceFile = bucket.file(input.sourceImagePath);
    const [downloadResult, metadataResult] = await Promise.all([
      sourceFile.download(),
      sourceFile.getMetadata(),
    ]);
    const sourceImageBuffer = downloadResult[0];
    const sourceMimeType = resolveImageMimeType(
      input.sourceImagePath,
      metadataResult[0].contentType,
    );

    const sourceImageByteLimit = resolvePositiveIntegerEnv(
      "VERTEX_MAX_SOURCE_IMAGE_BYTES",
      defaultSourceImageByteLimit,
    );
    if (sourceImageBuffer.byteLength > sourceImageByteLimit) {
      throw new Error(
        `Source image is ${sourceImageBuffer.byteLength} bytes, which exceeds the configured Vertex inline image limit of ${sourceImageByteLimit} bytes.`,
      );
    }
    const referenceImages = await loadStyleReferenceImages({
      bucket,
      referenceImages: input.referenceImages ?? [],
    });
    const referenceImageMetadata = buildReferenceImageGenerationMetadata(
      input.referenceImages ?? [],
    );

    if (input.proofMode === "template_face_swap") {
      return generateTemplateFaceSwapProof({
        apiKey,
        model,
        input,
        styleMetadata,
        customerImageBuffer: sourceImageBuffer,
        customerMimeType: sourceMimeType,
        templateImages: referenceImages,
        referenceImageMetadata,
      });
    }

    const generationAttempts = await Promise.all(
      Array.from({ length: proofGenerationCount }, async (_, index) => {
        try {
          const vertexResponse = await generateVertexImage({
            apiKey,
            model,
            promptText: buildProofVariantPrompt({
              promptText,
            index,
            count: proofGenerationCount,
            lockReferenceStyling: referenceImages.length > 0,
          }),
            sourceImageBuffer,
            sourceMimeType,
            referenceImages,
          });
          const generatedImage = extractGeneratedImage(vertexResponse);
          const generatedImageBuffer = Buffer.from(
            generatedImage.data,
            "base64",
          );
          const outputMimeType = generatedImage.mimeType ?? "image/png";
          const outputStoragePath =
            proofGenerationCount === 1
              ? `generated/${input.uid}/${input.jobId}/preview.${extensionForMimeType(outputMimeType)}`
              : `generated/${input.uid}/${input.jobId}/preview-${index + 1}.${extensionForMimeType(outputMimeType)}`;

          await bucket.file(outputStoragePath).save(generatedImageBuffer, {
            resumable: false,
            metadata: {
              contentType: outputMimeType,
              cacheControl: "private, max-age=3600",
              metadata: {
                jobId: input.jobId,
                uid: input.uid,
                provider: "vertex-gemini-direct",
                model,
                proofIndex: String(index + 1),
                proofGenerationCount: String(proofGenerationCount),
              },
            },
          });

          return {
            status: "fulfilled",
            outputStoragePath,
            outputMimeType,
            responseText: extractResponseText(vertexResponse),
            modelVersion: vertexResponse.modelVersion,
            requestRoute: vertexResponse.requestRoute,
          } satisfies VertexProofGenerationSuccess;
        } catch (error) {
          return {
            status: "rejected",
            proofIndex: index + 1,
            message: summarizeProofGenerationError(error),
          } satisfies VertexProofGenerationFailure;
        }
      }),
    );
    const generationResults = generationAttempts.filter(
      (result): result is VertexProofGenerationSuccess =>
        result.status === "fulfilled",
    );
    const generationFailures = generationAttempts.filter(
      (result): result is VertexProofGenerationFailure =>
        result.status === "rejected",
    );

    if (generationResults.length === 0) {
      throw new Error(
        `Vertex/Gemini returned no proof images. ${summarizeProofGenerationFailures(generationFailures)}`,
      );
    }

    const outputMimeTypes = generationResults.map(
      (result) => result.outputMimeType,
    );
    const responseTextByGeneration = generationResults
      .map((result) => result.responseText)
      .filter((responseText) => responseText.length > 0);
    const modelVersions = generationResults
      .map((result) => result.modelVersion)
      .filter((modelVersion): modelVersion is string => Boolean(modelVersion));
    const requestRoute =
      generationResults[0]?.requestRoute ?? "direct-gcp-vertex-gemini-express";

    return {
      provider: "vertex-gemini-direct",
      status: "succeeded",
      generatedImagePaths: generationResults.map(
        (result) => result.outputStoragePath,
      ),
      metadata: {
        model,
        route: requestRoute,
        outputMimeType: outputMimeTypes[0],
        outputMimeTypes,
        proofGenerationCount,
        styleMetadata,
        ...referenceImageMetadata,
        ...(input.selectedStyleLabel
          ? { selectedStyleLabel: input.selectedStyleLabel }
          : {}),
        ...(responseTextByGeneration[0]
          ? { responseText: responseTextByGeneration[0] }
          : {}),
        ...(responseTextByGeneration.length > 0
          ? { responseTextByGeneration }
          : {}),
        ...(modelVersions[0] ? { modelVersion: modelVersions[0] } : {}),
        ...(modelVersions.length > 0 ? { modelVersions } : {}),
        ...(generationFailures.length > 0
          ? {
              failedProofGenerationCount: generationFailures.length,
              proofGenerationFailures:
                summarizeProofGenerationFailureMessages(generationFailures),
            }
          : {}),
        notes: [
          `Generated through the ${requestRoute} provider route.`,
          `${generationResults.length} of ${proofGenerationCount} proof image${proofGenerationCount === 1 ? " was" : "s were"} stored in the job-scoped Firebase Storage path.`,
          ...(generationFailures.length > 0
            ? [
                `${generationFailures.length} proof option${generationFailures.length === 1 ? "" : "s"} failed and were omitted.`,
              ]
            : []),
        ],
      },
    };
  }
}

class CloudflareGatewayPosterAiProvider implements PosterAiProvider {
  async generatePosterConcept(
    input: PosterGenerationInput,
  ): Promise<PosterGenerationOutput> {
    const model =
      process.env.CLOUDFLARE_AI_GATEWAY_MODEL ?? defaultVertexImageModel;
    const styleMetadata = buildProofStyleMetadata(input.selectedStyle);
    const proofGenerationCount = resolveProofGenerationCount(
      input.proofGenerationCount,
    );
    const referenceImageMetadata = buildReferenceImageGenerationMetadata(
      input.referenceImages ?? [],
    );

    return {
      provider: "cloudflare-ai-gateway",
      status: "stubbed",
      generatedImagePaths: Array.from(
        { length: proofGenerationCount },
        (_, index) => `generated/${input.uid}/${input.jobId}/preview-${index + 1}.png`,
      ),
      metadata: {
        model,
        route: "cloudflare-ai-gateway",
        proofGenerationCount,
        styleMetadata,
        ...referenceImageMetadata,
        notes: [
          "Cloudflare AI Gateway is reserved for later provider comparison, rate limiting, observability, and fallback.",
          "Real gateway calls are not implemented yet.",
        ],
      },
    };
  }
}

// Template face swap keeps the style template's stylization and detail intact
// (exp-019a: editing the source preserves detail; re-rendering destroys it)
// and swaps only the identity, so the 3D provider receives an input with the
// same quality characteristics as the approved exp-011 run.
async function generateTemplateFaceSwapProof(swap: {
  apiKey: string;
  model: string;
  input: PosterGenerationInput;
  styleMetadata: ProofStyleMetadata;
  customerImageBuffer: Buffer;
  customerMimeType: string;
  templateImages: VertexRequestReferenceImage[];
  referenceImageMetadata: {
    referenceImageCount?: number;
    referenceImageIds?: string[];
  };
}): Promise<PosterGenerationOutput> {
  const template = swap.templateImages[0];
  if (!template) {
    throw new Error(
      "template_face_swap requires at least one enabled reference image on the selected style to use as the template.",
    );
  }

  const templateDimensions = readImageDimensions(
    template.imageBuffer,
    template.mimeType,
  );
  const imageConfig: Record<string, string> = {
    imageSize: "2K",
    ...(templateDimensions
      ? {
          aspectRatio: nearestSupportedAspectRatio(
            templateDimensions.width,
            templateDimensions.height,
          ),
        }
      : {}),
  };
  const promptText = resolveTemplateFaceSwapPrompt(swap.input.stylePrompt);
  const vertexResponse = await generateVertexImage({
    apiKey: swap.apiKey,
    model: swap.model,
    promptText,
    sourceImageBuffer: template.imageBuffer,
    sourceMimeType: template.mimeType,
    referenceImages: [
      {
        id: "customer-photo",
        mimeType:
          swap.customerMimeType === "image/png" ? "image/png" : "image/jpeg",
        imageBuffer: swap.customerImageBuffer,
      },
    ],
    imageConfig,
  });
  const generatedImage = extractGeneratedImage(vertexResponse);
  const generatedImageBuffer = Buffer.from(generatedImage.data, "base64");
  const outputMimeType = generatedImage.mimeType ?? "image/png";
  const outputStoragePath = `generated/${swap.input.uid}/${swap.input.jobId}/preview.${extensionForMimeType(outputMimeType)}`;
  const bucket = getConfiguredStorageBucket();

  await bucket.file(outputStoragePath).save(generatedImageBuffer, {
    resumable: false,
    metadata: {
      contentType: outputMimeType,
      cacheControl: "private, max-age=3600",
      metadata: {
        jobId: swap.input.jobId,
        uid: swap.input.uid,
        provider: "vertex-gemini-direct",
        model: swap.model,
        proofMode: "template_face_swap",
        templateReferenceImageId: template.id,
      },
    },
  });

  const responseText = extractResponseText(vertexResponse);

  return {
    provider: "vertex-gemini-direct",
    status: "succeeded",
    generatedImagePaths: [outputStoragePath],
    metadata: {
      model: swap.model,
      route:
        vertexResponse.requestRoute ?? "direct-gcp-vertex-gemini-express",
      outputMimeType,
      outputMimeTypes: [outputMimeType],
      proofGenerationCount: 1,
      proofMode: "template_face_swap",
      templateReferenceImageId: template.id,
      imageConfig,
      styleMetadata: swap.styleMetadata,
      ...swap.referenceImageMetadata,
      ...(swap.input.selectedStyleLabel
        ? { selectedStyleLabel: swap.input.selectedStyleLabel }
        : {}),
      ...(responseText ? { responseText } : {}),
      ...(vertexResponse.modelVersion
        ? { modelVersion: vertexResponse.modelVersion }
        : {}),
      notes: [
        `Generated through the ${vertexResponse.requestRoute ?? "direct-gcp-vertex-gemini-express"} provider route in template_face_swap proof mode.`,
        "The style template reference image was edited to carry the customer's facial identity; costume, pose, and detail were preserved.",
        ...(templateDimensions
          ? [
              `Template dimensions ${templateDimensions.width}x${templateDimensions.height}; requested ${imageConfig.imageSize} output at ${imageConfig.aspectRatio ?? "default"} aspect.`,
            ]
          : [
              "Template dimensions could not be read; requested 2K output at the model default aspect.",
            ]),
      ],
    },
  };
}

// The style prompt IS the Vertex instruction in swap mode — sent verbatim so
// admins can see and control exactly what the model receives. The default is
// only a safety net for a blank prompt.
export function resolveTemplateFaceSwapPrompt(
  stylePrompt: string | undefined,
): string {
  const trimmed = stylePrompt?.trim();
  return trimmed || defaultTemplateFaceSwapPrompt;
}

const supportedAspectRatios = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;

export function nearestSupportedAspectRatio(
  width: number,
  height: number,
): string {
  const targetRatio = width / height;
  let best: string = supportedAspectRatios[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of supportedAspectRatios) {
    const [w, h] = candidate.split(":").map(Number);
    const distance = Math.abs(Math.log(targetRatio / (w / h)));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

export function readImageDimensions(
  buffer: Buffer,
  mimeType: string,
): { width: number; height: number } | null {
  try {
    if (mimeType === "image/png") {
      const isPng =
        buffer.length > 24 &&
        buffer.readUInt32BE(0) === 0x89504e47 &&
        buffer.readUInt32BE(4) === 0x0d0a1a0a;
      if (!isPng) {
        return null;
      }
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
      };
    }

    if (mimeType === "image/jpeg") {
      if (buffer.length < 4 || buffer.readUInt16BE(0) !== 0xffd8) {
        return null;
      }
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buffer[offset + 1];
        if (marker === 0xff) {
          offset += 1;
          continue;
        }
        // Start-of-frame markers carry dimensions; C4/C8/CC are not frames.
        if (
          marker >= 0xc0 &&
          marker <= 0xcf &&
          marker !== 0xc4 &&
          marker !== 0xc8 &&
          marker !== 0xcc
        ) {
          return {
            height: buffer.readUInt16BE(offset + 5),
            width: buffer.readUInt16BE(offset + 7),
          };
        }
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
          offset += 2;
          continue;
        }
        offset += 2 + buffer.readUInt16BE(offset + 2);
      }
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

function buildPosterPrompt(input: PosterGenerationInput): string {
  if (input.productType === "figurine" || isFigurineStyle(input.selectedStyle)) {
    return buildFigurineProofPrompt(input);
  }

  const selectedStyle = (input.selectedStyleLabel ?? input.selectedStyle)
    .trim()
    .slice(0, 120);
  const stylePrompt = input.stylePrompt?.trim();
  const referenceImageCount = enabledReferenceImages(input.referenceImages).length;

  return [
    "Create one portrait proof image for a custom 5 inch by 7 inch 3D print poster relief.",
    "Use the uploaded image as the main composition reference. Preserve the primary subject, crop, and recognizable visual intent while translating it into a polished poster-ready design.",
    `Selected style: ${selectedStyle}.`,
    ...(stylePrompt ? [`Style prompt: ${stylePrompt}`] : []),
    ...(referenceImageCount > 0
      ? [
          "Use the additional admin reference images only as style, composition, material, and finish guidance. The uploaded customer source photo remains the main subject reference.",
        ]
      : []),
    ...buildProofStylePromptDirectives(input.selectedStyle),
    "Output only the poster proof image.",
  ].join("\n");
}

export function buildFigurineProofPrompt(input: PosterGenerationInput): string {
  const selectedStyle = (input.selectedStyleLabel ?? input.selectedStyle)
    .trim()
    .slice(0, 120);
  const baseProofPrompt = input.baseProofPrompt?.trim();
  const stylePrompt = input.stylePrompt?.trim();

  // realistic_person proofs deliberately skip baseProofPrompt and the
  // stylized-figurine directives below: the downstream 3D provider (Meshy
  // Creative Lab prototype) does all character stylization, so the proof must
  // stay a clean realistic person. Validated 2026-07-08 — a style prompt alone
  // cannot override the stylized scaffold, hence this separate branch.
  if (input.proofRendering === "realistic_person") {
    return [
      "Create a clean, realistic full-body studio portrait of the person in the uploaded photo, as the proof image for a personalized 3D printed figurine. The later 3D step handles all character stylization, so this proof must stay a realistic person, never a stylized, cartoon, or figurine character.",
      "Preserve the person's identity exactly: face, head shape, skin tone, hairstyle, facial hair (beard, mustache, stubble) exactly as in the photo, glasses if present, body build, and their actual clothing.",
      "If parts of the outfit are not visible in the photo, complete them naturally with matching pieces (pants and shoes that fit the visible outfit) so the person is fully dressed head to toe.",
      `Selected figurine style: ${selectedStyle}.`,
      ...(stylePrompt ? [`Style prompt: ${stylePrompt}`] : []),
      "Pose: standing tall in a confident, relaxed pose, front-facing, shoulders back, slight natural smile, arms relaxed and slightly away from the torso with both hands visible, feet flat on an invisible ground plane.",
      "CRITICAL FRAMING: show the ENTIRE person head to feet with clear margin above the head and below the shoes. Do not crop any part of the body.",
      "Composition: single person centered on a seamless neutral gray studio background with soft even lighting. No environment, furniture, props, freestanding text, or watermark.",
      "No base, pedestal, platform, stand, plaque, nameplate, sign, ground disk, scenery, or support prop.",
      "Output only the proof image.",
    ].join("\n");
  }
  const referenceImageCount = enabledReferenceImages(input.referenceImages).length;

  return [
    ...(baseProofPrompt
      ? [baseProofPrompt]
      : [
          "Create one clean full-body 2D concept image for a personalized 3D printed figurine.",
          "Use the uploaded photo as the identity and outfit reference. Preserve recognizable facial likeness, broad head shape, glasses or facial hair if present, and the main clothing color impression.",
        ]),
    `Selected figurine style: ${selectedStyle}.`,
    ...(stylePrompt
      ? [`Style prompt: ${stylePrompt}`]
      : [
          "Style: smooth chibi or emoji/avatar vinyl toy character, simplified expressive face, friendly proportions, clean silhouette, and broad color regions.",
        ]),
    ...(referenceImageCount > 0
      ? [
          "Input image priority for this reference-image workflow: the first image is the customer source photo and controls face identity only: recognizable face, head shape, skin tone, facial hair, glasses, and expression. The additional admin reference images control the final character's overall visual style: render style, character design language, stylization level, proportions, material finish, lighting feel, outfit, costume, color palette, emblem treatment, accessories, and pose language. If the customer source photo clothing conflicts with the admin reference styling, the admin reference styling wins. Dress and render the customer identity like the admin reference character/style while avoiding the admin reference face/identity. Keep backgrounds from the admin references out of the result. If the admin reference includes costume emblems or logo-like shapes, simplify them as part of the costume design rather than adding separate text.",
        ]
      : []),
    "Pose: natural standing pose, front-facing or slight three-quarter view, with head, torso, arms, hands, legs, shoes, and feet all visible.",
    "Keep arms slightly away from the torso and hands visible. Keep feet clear and flat on an invisible ground plane.",
    "Composition: single body-only character centered on a plain white studio background. No environment, no props unless they are part of the admin reference outfit or customer identity, no freestanding text, and no watermark.",
    "No base, pedestal, platform, stand, plaque, nameplate, sign, ground disk, scenery, or support prop.",
    "Avoid fragile fingers, hair wisps, noisy textures, photorealistic pores, busy clothing detail, cropped limbs, bust-only framing, floating objects, display bases, or side-view-only body shapes.",
    "Output only the figurine concept image.",
  ].join("\n");
}

function buildProofVariantPrompt(input: {
  promptText: string;
  index: number;
  count: number;
  lockReferenceStyling?: boolean;
}): string {
  if (input.count === 1) {
    return input.promptText;
  }

  return [
    input.promptText,
    input.lockReferenceStyling
      ? `Proof option ${input.index + 1} of ${input.count}: keep the same customer face identity and the same admin-reference visual style, render style, character design language, proportions, outfit, costume, color scheme, emblem treatment, material finish, body style, pose language, and accessories. Vary only small expression, head angle, camera angle, or render polish. Do not change clothing category, costume theme, costume colors, style family, logo/emblem placement, material finish, or accessories between proof options.`
      : `Proof option ${input.index + 1} of ${input.count}: keep the same product constraints and recognizable identity, but make this option visually distinct through expression, proportions, clothing simplification, color interpretation, or camera angle within the selected style.`,
  ].join("\n\n");
}

function resolveProofGenerationCount(value: number | undefined): number {
  if (!Number.isInteger(value)) {
    return defaultProofGenerationCount;
  }

  return Math.min(Math.max(value as number, 1), maxProofGenerationCount);
}

function summarizeProofGenerationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 500);
}

function summarizeProofGenerationFailures(
  failures: VertexProofGenerationFailure[],
): string {
  return summarizeProofGenerationFailureMessages(failures).join(" ");
}

function summarizeProofGenerationFailureMessages(
  failures: VertexProofGenerationFailure[],
): string[] {
  return failures.map(
    (failure) => `Proof option ${failure.proofIndex} failed: ${failure.message}`,
  );
}

function getConfiguredStorageBucket() {
  const bucketName = process.env.APP_STORAGE_BUCKET;
  return bucketName ? getStorage().bucket(bucketName) : getStorage().bucket();
}

async function loadStyleReferenceImages(input: {
  bucket: ReturnType<typeof getConfiguredStorageBucket>;
  referenceImages: WorkflowStyleReferenceImage[];
}): Promise<VertexRequestReferenceImage[]> {
  const referenceImageByteLimit = defaultReferenceImageByteLimit;

  return Promise.all(
    enabledReferenceImages(input.referenceImages).map(async (referenceImage) => {
      const file = input.bucket.file(referenceImage.storagePath);
      const [downloadResult, metadataResult] = await Promise.all([
        file.download(),
        file.getMetadata(),
      ]);
      const imageBuffer = downloadResult[0];

      if (imageBuffer.byteLength > referenceImageByteLimit) {
        throw new Error(
          `Reference image ${referenceImage.id} is ${imageBuffer.byteLength} bytes, which exceeds the configured Vertex inline reference image limit of ${referenceImageByteLimit} bytes.`,
        );
      }

      return {
        id: referenceImage.id,
        mimeType: resolveReferenceImageMimeType(
          referenceImage,
          metadataResult[0].contentType,
        ),
        imageBuffer,
      };
    }),
  );
}

function enabledReferenceImages(
  referenceImages: WorkflowStyleReferenceImage[] | undefined,
): WorkflowStyleReferenceImage[] {
  return (referenceImages ?? []).filter((image) => image.enabled).slice(0, 4);
}

function resolveImageMimeType(
  sourceImagePath: string,
  metadataContentType: unknown,
): string {
  if (
    metadataContentType === "image/jpeg" ||
    metadataContentType === "image/png"
  ) {
    return metadataContentType;
  }

  if (/\.png$/i.test(sourceImagePath)) {
    return "image/png";
  }

  return "image/jpeg";
}

function resolveReferenceImageMimeType(
  referenceImage: WorkflowStyleReferenceImage,
  metadataContentType: unknown,
): "image/jpeg" | "image/png" {
  if (metadataContentType === "image/jpeg" || metadataContentType === "image/png") {
    return metadataContentType;
  }

  return referenceImage.mimeType;
}

function resolvePositiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeVertexModelResource(model: string): string {
  const trimmedModel = model.trim();
  if (trimmedModel.startsWith("publishers/")) {
    return trimmedModel;
  }

  return `publishers/google/models/${trimmedModel}`;
}

function buildVertexGenerateContentEndpoint(
  model: string,
  apiKey: string,
): string {
  const baseUrl = (
    process.env.VERTEX_EXPRESS_BASE_URL ?? vertexExpressBaseUrl
  ).replace(/\/$/, "");
  const modelResource = normalizeVertexModelResource(model)
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const params = new URLSearchParams({ key: apiKey });

  return `${baseUrl}/${modelResource}:generateContent?${params.toString()}`;
}

function buildVertexInteractionsEndpoint(): string {
  return (process.env.GEMINI_INTERACTIONS_BASE_URL ?? geminiInteractionsBaseUrl)
    .replace(/\/$/, "");
}

export function buildVertexInteractionsResponseFormat(
  imageConfig: Record<string, string> | undefined,
): VertexInteractionsResponseFormat | null {
  const aspectRatio =
    imageConfig?.aspectRatio ?? process.env.VERTEX_IMAGE_ASPECT_RATIO;
  const imageSize = imageConfig?.imageSize;
  if (!aspectRatio && !imageSize) {
    return null;
  }

  return {
    type: "image",
    mime_type: "image/jpeg",
    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
    ...(imageSize ? { image_size: imageSize } : {}),
  };
}

export function buildVertexImageGenerationConfig(): Record<string, unknown> {
  return {
    candidateCount: 1,
    responseModalities: ["TEXT", "IMAGE"],
  };
}

async function generateVertexImage(input: {
  apiKey: string;
  model: string;
  imageConfig?: Record<string, string>;
  promptText: string;
  sourceImageBuffer: Buffer;
  sourceMimeType: string;
  referenceImages?: VertexRequestReferenceImage[];
}): Promise<VertexGenerateContentResponse> {
  const interactionsResponseFormat = buildVertexInteractionsResponseFormat(
    input.imageConfig,
  );
  if (interactionsResponseFormat) {
    return generateVertexInteractionsImage({
      ...input,
      responseFormat: interactionsResponseFormat,
    });
  }

  const generationConfig = buildVertexImageGenerationConfig();

  const response = await fetch(
    buildVertexGenerateContentEndpoint(input.model, input.apiKey),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "USER",
            parts: buildVertexUserParts({
              promptText: input.promptText,
              sourceImageBuffer: input.sourceImageBuffer,
              sourceMimeType: input.sourceMimeType,
              referenceImages: input.referenceImages,
            }),
          },
        ],
        generationConfig,
        safetySettings: [
          {
            method: "PROBABILITY",
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            method: "PROBABILITY",
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            method: "PROBABILITY",
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            method: "PROBABILITY",
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Vertex/Gemini request failed with HTTP ${response.status}: ${await readErrorBody(response)}`,
    );
  }

  return {
    ...((await response.json()) as VertexGenerateContentResponse),
    requestRoute: "direct-gcp-vertex-gemini-express",
  };
}

async function generateVertexInteractionsImage(input: {
  apiKey: string;
  model: string;
  promptText: string;
  sourceImageBuffer: Buffer;
  sourceMimeType: string;
  referenceImages?: VertexRequestReferenceImage[];
  responseFormat: VertexInteractionsResponseFormat;
}): Promise<VertexGenerateContentResponse> {
  const response = await fetch(buildVertexInteractionsEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": input.apiKey,
    },
    body: JSON.stringify({
      model: input.model,
      input: buildVertexInteractionsInput({
        promptText: input.promptText,
        sourceImageBuffer: input.sourceImageBuffer,
        sourceMimeType: input.sourceMimeType,
        referenceImages: input.referenceImages,
      }),
      response_format: input.responseFormat,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Gemini Interactions request failed with HTTP ${response.status}: ${await readErrorBody(response)}`,
    );
  }

  return normalizeVertexInteractionsResponse(
    (await response.json()) as VertexInteractionsResponse,
  );
}

function buildVertexInteractionsInput(input: {
  promptText: string;
  sourceImageBuffer: Buffer;
  sourceMimeType: string;
  referenceImages?: VertexRequestReferenceImage[];
}): Array<{
  type: "text" | "image";
  text?: string;
  mime_type?: string;
  data?: string;
}> {
  return [
    {
      type: "text",
      text: input.promptText,
    },
    {
      type: "image",
      mime_type: input.sourceMimeType,
      data: input.sourceImageBuffer.toString("base64"),
    },
    ...(input.referenceImages ?? []).map((referenceImage) => ({
      type: "image" as const,
      mime_type: referenceImage.mimeType,
      data: referenceImage.imageBuffer.toString("base64"),
    })),
  ];
}

function normalizeVertexInteractionsResponse(
  response: VertexInteractionsResponse,
): VertexGenerateContentResponse {
  const parts: VertexPart[] = [];
  const topLevelImage = normalizeInteractionsImageOutput(
    response.output_image ?? response.outputImage,
  );
  if (topLevelImage?.data) {
    parts.push({ inlineData: topLevelImage });
  }

  for (const contentItem of extractInteractionsContentItems(response)) {
    if (contentItem.type === "image" && contentItem.data) {
      parts.push({
        inlineData: {
          mimeType: contentItem.mime_type ?? contentItem.mimeType,
          data: contentItem.data,
        },
      });
    } else if (contentItem.type === "text" && contentItem.text) {
      parts.push({ text: contentItem.text });
    }
  }

  return {
    candidates: [
      {
        content: {
          parts,
        },
        ...(response.status && response.status !== "completed"
          ? { finishReason: response.status }
          : {}),
      },
    ],
    modelVersion: response.model,
    requestRoute: "direct-gemini-interactions",
    interactionId: response.id,
  };
}

function extractInteractionsContentItems(
  response: VertexInteractionsResponse,
): VertexInteractionsContentItem[] {
  return response.steps?.flatMap((step) => step.content ?? []) ?? [];
}

function normalizeInteractionsImageOutput(
  output: VertexInteractionsImageOutput | VertexInlineData | undefined,
): VertexInlineData | undefined {
  if (!output?.data) {
    return undefined;
  }
  const mimeType =
    "mime_type" in output ? output.mime_type : output.mimeType;

  return {
    mimeType,
    data: output.data,
  };
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const body = await response.text();
    return body.slice(0, 1000);
  } catch {
    return "Unable to read error body.";
  }
}

function extractGeneratedImage(
  response: VertexGenerateContentResponse,
): GeneratedVertexImage {
  if (response.promptFeedback?.blockReason) {
    throw new Error(
      `Vertex/Gemini blocked the prompt: ${response.promptFeedback.blockReason}.`,
    );
  }

  for (const part of extractResponseParts(response)) {
    const inlineData = normalizeInlineData(part);
    if (inlineData?.data) {
      return {
        mimeType: inlineData.mimeType,
        data: inlineData.data,
      };
    }
  }

  const finishReason = response.candidates?.[0]?.finishReason;
  throw new Error(
    `Vertex/Gemini returned no generated image.${finishReason ? ` Finish reason: ${finishReason}.` : ""}`,
  );
}

function extractResponseText(response: VertexGenerateContentResponse): string {
  return extractResponseParts(response)
    .map((part) => part.text?.trim())
    .filter((text): text is string => Boolean(text))
    .join("\n\n")
    .slice(0, 4000);
}

function extractResponseParts(
  response: VertexGenerateContentResponse,
): VertexPart[] {
  return (
    response.candidates?.flatMap(
      (candidate) => candidate.content?.parts ?? [],
    ) ?? []
  );
}

function normalizeInlineData(part: VertexPart): VertexInlineData | undefined {
  if (part.inlineData) {
    return part.inlineData;
  }

  if (part.inline_data) {
    return {
      mimeType: part.inline_data.mime_type,
      data: part.inline_data.data,
    };
  }

  return undefined;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") {
    return "jpg";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "png";
}
