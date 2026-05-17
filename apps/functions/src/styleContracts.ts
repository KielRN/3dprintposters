export type SurfaceIntentClass =
  | "smooth_skin"
  | "smooth_scalp"
  | "smooth_neck"
  | "smooth_ears"
  | "smooth_hands"
  | "smooth_body"
  | "smooth_simple_clothing"
  | "flat_background"
  | "raised_text"
  | "raised_logo"
  | "graphic_edge"
  | "panel_line"
  | "hair_texture"
  | "fabric_texture"
  | "material_texture";

export type SurfaceIntentTreatment =
  | "smooth"
  | "crisp_raised"
  | "shallow_texture";

export type SurfaceIntentRegionPolicy = {
  intent: SurfaceIntentClass;
  treatment: SurfaceIntentTreatment;
  detailWeight: number;
  labels: string[];
};

export type SurfaceIntentPolicy = {
  policyId: "smooth-default-v1";
  version: "2026-05-17";
  defaultIntent: "smooth_surface";
  defaultTreatment: "smooth";
  smoothIntents: SurfaceIntentClass[];
  crispIntents: SurfaceIntentClass[];
  textureIntents: SurfaceIntentClass[];
  regions: SurfaceIntentRegionPolicy[];
};

export type ProofStyleContract = {
  contractId: "super-dad-north-star-v1";
  version: "2026-05-17";
  styleFamily: "controlled_printable_poster";
  target: "super_dad_north_star";
  surfaceIntentPolicy: SurfaceIntentPolicy;
  promptDirectives: string[];
  negativeDirectives: string[];
};

export type ProofStyleMetadata = {
  selectedStyle: string;
  proofStyleContract: {
    contractId: ProofStyleContract["contractId"];
    version: ProofStyleContract["version"];
    styleFamily: ProofStyleContract["styleFamily"];
    target: ProofStyleContract["target"];
    promptStorage: "contract_metadata_only";
    surfacePolicyId: SurfaceIntentPolicy["policyId"];
  };
  surfaceIntentPolicy: SurfaceIntentPolicy;
};

const smoothDefaultSurfaceIntentPolicy: SurfaceIntentPolicy = {
  policyId: "smooth-default-v1",
  version: "2026-05-17",
  defaultIntent: "smooth_surface",
  defaultTreatment: "smooth",
  smoothIntents: [
    "smooth_skin",
    "smooth_scalp",
    "smooth_neck",
    "smooth_ears",
    "smooth_hands",
    "smooth_body",
    "smooth_simple_clothing",
    "flat_background",
  ],
  crispIntents: [
    "raised_text",
    "raised_logo",
    "graphic_edge",
    "panel_line",
  ],
  textureIntents: ["hair_texture", "fabric_texture", "material_texture"],
  regions: [
    {
      intent: "smooth_skin",
      treatment: "smooth",
      detailWeight: 0,
      labels: ["face", "forehead", "cheeks", "nose", "mouth"],
    },
    {
      intent: "smooth_scalp",
      treatment: "smooth",
      detailWeight: 0,
      labels: ["bald head", "top of head", "scalp"],
    },
    {
      intent: "smooth_neck",
      treatment: "smooth",
      detailWeight: 0,
      labels: ["neck", "throat"],
    },
    {
      intent: "smooth_ears",
      treatment: "smooth",
      detailWeight: 0,
      labels: ["ears"],
    },
    {
      intent: "smooth_hands",
      treatment: "smooth",
      detailWeight: 0,
      labels: ["hands", "fingers"],
    },
    {
      intent: "smooth_body",
      treatment: "smooth",
      detailWeight: 0.06,
      labels: ["torso", "arms", "legs", "broad body volumes"],
    },
    {
      intent: "smooth_simple_clothing",
      treatment: "smooth",
      detailWeight: 0.08,
      labels: ["simple shirt", "super suit body", "plain fabric"],
    },
    {
      intent: "flat_background",
      treatment: "smooth",
      detailWeight: 0,
      labels: ["sky", "park", "simple backdrop", "distant scenery"],
    },
    {
      intent: "raised_text",
      treatment: "crisp_raised",
      detailWeight: 0.9,
      labels: ["poster title", "banner lettering", "large readable type"],
    },
    {
      intent: "raised_logo",
      treatment: "crisp_raised",
      detailWeight: 0.85,
      labels: ["chest emblem", "badge", "simple logo"],
    },
    {
      intent: "panel_line",
      treatment: "crisp_raised",
      detailWeight: 0.55,
      labels: ["suit panel", "designed seam", "graphic line"],
    },
    {
      intent: "hair_texture",
      treatment: "shallow_texture",
      detailWeight: 0.22,
      labels: ["stylized hair mass", "large hair strands"],
    },
  ],
};

const superDadNorthStarStyleContract: ProofStyleContract = {
  contractId: "super-dad-north-star-v1",
  version: "2026-05-17",
  styleFamily: "controlled_printable_poster",
  target: "super_dad_north_star",
  surfaceIntentPolicy: smoothDefaultSurfaceIntentPolicy,
  promptDirectives: [
    "Translate the uploaded photo into controlled printable poster art, using the customer image as identity and composition reference rather than raw texture source.",
    "Use smooth stylized skin, scalp, neck, ears, hands, and broad body forms with clean toy-like or illustrated surfaces.",
    "Keep simple clothing and backgrounds calm and low-detail unless the style explicitly needs a designed graphic line.",
    "Make text, logos, emblems, and graphic edges large, clean, crisp, and raised-looking enough to become shallow relief details.",
    "Use simple readable depth layers, soft lighting, strong silhouettes, and broad color shapes that can become a 5 inch by 7 inch relief.",
  ],
  negativeDirectives: [
    "Avoid photorealistic pores, stubble, scalp speckle, neck wrinkles, rough shirt weave, grass noise, leaf noise, and random AI brush texture.",
    "Avoid tiny decorative texture, busy background detail, mottled skin, noisy gradients, and fine repeated patterns that would become rough geometry.",
    "Do not add watermarks, UI, mockup frames, tiny labels, unreadable text, or extra border text.",
  ],
};

export function resolveProofStyleContract(
  _selectedStyle: string,
): ProofStyleContract {
  return superDadNorthStarStyleContract;
}

export function buildProofStyleMetadata(
  selectedStyle: string,
): ProofStyleMetadata {
  const contract = resolveProofStyleContract(selectedStyle);

  return {
    selectedStyle: normalizeSelectedStyle(selectedStyle),
    proofStyleContract: {
      contractId: contract.contractId,
      version: contract.version,
      styleFamily: contract.styleFamily,
      target: contract.target,
      promptStorage: "contract_metadata_only",
      surfacePolicyId: contract.surfaceIntentPolicy.policyId,
    },
    surfaceIntentPolicy: contract.surfaceIntentPolicy,
  };
}

export function buildProofStylePromptDirectives(selectedStyle: string): string[] {
  const contract = resolveProofStyleContract(selectedStyle);
  return [
    ...contract.promptDirectives,
    "Surface intent policy: unmarked regions are smooth by default; preserve crisp relief detail only for intentional raised text, logos, emblems, graphic edges, panel lines, hair, fabric, or material texture.",
    ...contract.negativeDirectives,
  ];
}

function normalizeSelectedStyle(selectedStyle: string): string {
  const normalized = selectedStyle.trim().slice(0, 120);
  return normalized || "gallery-relief";
}
