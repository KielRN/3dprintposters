import { getStorage } from "firebase-admin/storage";
import {
  buildProofStyleMetadata,
  buildProofStylePromptDirectives,
  type ProofStyleMetadata,
} from "./styleContracts.js";
import { isFigurineStyle } from "./figurineWorkflow.js";

export type PosterGenerationInput = {
  jobId: string;
  uid: string;
  sourceImagePath: string;
  selectedStyle: string;
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
    styleMetadata?: ProofStyleMetadata;
    responseText?: string;
    modelVersion?: string;
  };
};

export type PosterAiProvider = {
  generatePosterConcept(
    input: PosterGenerationInput,
  ): Promise<PosterGenerationOutput>;
};

const defaultVertexImageModel = "gemini-2.5-flash-image";
const defaultSourceImageByteLimit = 8 * 1024 * 1024;
const vertexExpressBaseUrl = "https://aiplatform.googleapis.com/v1";

type VertexGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: VertexPart[];
    };
    finishReason?: string;
  }>;
  modelVersion?: string;
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

    const vertexResponse = await generateVertexImage({
      apiKey,
      model,
      promptText,
      sourceImageBuffer,
      sourceMimeType,
    });
    const generatedImage = extractGeneratedImage(vertexResponse);
    const generatedImageBuffer = Buffer.from(generatedImage.data, "base64");
    const outputMimeType = generatedImage.mimeType ?? "image/png";
    const outputStoragePath = `generated/${input.uid}/${input.jobId}/preview.${extensionForMimeType(outputMimeType)}`;

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
        },
      },
    });

    const responseText = extractResponseText(vertexResponse);

    return {
      provider: "vertex-gemini-direct",
      status: "succeeded",
      generatedImagePaths: [outputStoragePath],
      metadata: {
        model,
        route: "direct-gcp-vertex-gemini-express",
        outputMimeType,
        styleMetadata,
        ...(responseText ? { responseText } : {}),
        ...(vertexResponse.modelVersion
          ? { modelVersion: vertexResponse.modelVersion }
          : {}),
        notes: [
          "Generated through the direct Vertex/Gemini provider route.",
          "The generated proof image was stored in the job-scoped Firebase Storage path.",
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

    return {
      provider: "cloudflare-ai-gateway",
      status: "stubbed",
      generatedImagePaths: [
        `generated/${input.uid}/${input.jobId}/preview.png`,
      ],
      metadata: {
        model,
        route: "cloudflare-ai-gateway",
        styleMetadata,
        notes: [
          "Cloudflare AI Gateway is reserved for later provider comparison, rate limiting, observability, and fallback.",
          "Real gateway calls are not implemented yet.",
        ],
      },
    };
  }
}

function buildPosterPrompt(input: PosterGenerationInput): string {
  if (isFigurineStyle(input.selectedStyle)) {
    return buildFigurineProofPrompt(input);
  }

  const selectedStyle = input.selectedStyle.trim().slice(0, 120);

  return [
    "Create one portrait proof image for a custom 5 inch by 7 inch 3D print poster relief.",
    "Use the uploaded image as the main composition reference. Preserve the primary subject, crop, and recognizable visual intent while translating it into a polished poster-ready design.",
    `Selected style: ${selectedStyle}.`,
    ...buildProofStylePromptDirectives(input.selectedStyle),
    "Output only the poster proof image.",
  ].join("\n");
}

function buildFigurineProofPrompt(input: PosterGenerationInput): string {
  const selectedStyle = input.selectedStyle.trim().slice(0, 120);

  return [
    "Create one clean full-body 2D concept image for a personalized 3D printed figurine.",
    "Use the uploaded photo as the identity and outfit reference. Preserve recognizable facial likeness, broad head shape, glasses or facial hair if present, and the main clothing color impression.",
    `Selected figurine style: ${selectedStyle}.`,
    "Style: smooth chibi or emoji/avatar vinyl toy character, simplified expressive face, friendly proportions, clean silhouette, and broad color regions.",
    "Pose: natural standing pose, front-facing or slight three-quarter view, with head, torso, arms, hands, legs, shoes, and feet all visible.",
    "Keep arms slightly away from the torso and hands visible. Keep feet clear and flat on an invisible ground plane.",
    "Composition: single body-only character centered on a plain white studio background. No environment, no props unless they are part of the person, no text, and no watermark.",
    "No base, pedestal, platform, stand, plaque, nameplate, sign, ground disk, scenery, or support prop.",
    "Avoid fragile fingers, hair wisps, noisy textures, photorealistic pores, busy clothing detail, cropped limbs, bust-only framing, floating objects, display bases, or side-view-only body shapes.",
    "Output only the figurine concept image.",
  ].join("\n");
}

function getConfiguredStorageBucket() {
  const bucketName = process.env.APP_STORAGE_BUCKET;
  return bucketName ? getStorage().bucket(bucketName) : getStorage().bucket();
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

async function generateVertexImage(input: {
  apiKey: string;
  model: string;
  promptText: string;
  sourceImageBuffer: Buffer;
  sourceMimeType: string;
}): Promise<VertexGenerateContentResponse> {
  const generationConfig: Record<string, unknown> = {
    candidateCount: 1,
    responseModalities: ["TEXT", "IMAGE"],
  };
  const aspectRatio = process.env.VERTEX_IMAGE_ASPECT_RATIO;
  if (aspectRatio) {
    generationConfig.imageConfig = {
      aspectRatio,
    };
  }

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
            parts: [
              {
                text: input.promptText,
              },
              {
                inlineData: {
                  mimeType: input.sourceMimeType,
                  data: input.sourceImageBuffer.toString("base64"),
                },
              },
            ],
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

  return (await response.json()) as VertexGenerateContentResponse;
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
