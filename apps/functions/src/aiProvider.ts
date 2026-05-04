export type PosterGenerationInput = {
  jobId: string;
  uid: string;
  sourceImagePath: string;
  selectedStyle: string;
};

export type PosterGenerationOutput = {
  provider: "vertex-gemini-direct" | "cloudflare-ai-gateway";
  status: "stubbed";
  generatedImagePaths: string[];
  metadata: {
    model: string;
    route: string;
    notes: string[];
  };
};

export type PosterAiProvider = {
  generatePosterConcept(input: PosterGenerationInput): Promise<PosterGenerationOutput>;
};

const defaultVertexModel = "gemini-2.5-flash";

export function createPosterAiProvider(): PosterAiProvider {
  const aiRoute = process.env.AI_PROVIDER_ROUTE ?? "vertex-gemini-direct";

  if (aiRoute === "cloudflare-ai-gateway") {
    return new CloudflareGatewayPosterAiProvider();
  }

  return new VertexGeminiPosterAiProvider();
}

class VertexGeminiPosterAiProvider implements PosterAiProvider {
  async generatePosterConcept(input: PosterGenerationInput): Promise<PosterGenerationOutput> {
    const model = process.env.VERTEX_MODEL ?? defaultVertexModel;

    return {
      provider: "vertex-gemini-direct",
      status: "stubbed",
      generatedImagePaths: [`generated/${input.uid}/${input.jobId}/preview.png`],
      metadata: {
        model,
        route: "direct-gcp-vertex-gemini",
        notes: [
          "MVP route uses direct GCP Vertex/Gemini integration for speed.",
          "Real model calls, Storage writes, and safety checks are not implemented yet.",
        ],
      },
    };
  }
}

class CloudflareGatewayPosterAiProvider implements PosterAiProvider {
  async generatePosterConcept(input: PosterGenerationInput): Promise<PosterGenerationOutput> {
    const model = process.env.CLOUDFLARE_AI_GATEWAY_MODEL ?? defaultVertexModel;

    return {
      provider: "cloudflare-ai-gateway",
      status: "stubbed",
      generatedImagePaths: [`generated/${input.uid}/${input.jobId}/preview.png`],
      metadata: {
        model,
        route: "cloudflare-ai-gateway",
        notes: [
          "Cloudflare AI Gateway is reserved for later provider comparison, rate limiting, observability, and fallback.",
          "Real gateway calls are not implemented yet.",
        ],
      },
    };
  }
}
