import {
  normalizeFigurineWorkflowConfigResponse,
  type FigurineWorkflowConfig,
} from "./figurineWorkflowConfig";

export const storyfrontWorkflowConfigCacheKey =
  "storyfront-workflow-config-v1";

export function readCachedStoryfrontWorkflowConfig(): FigurineWorkflowConfig | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cachedConfig = window.localStorage.getItem(
      storyfrontWorkflowConfigCacheKey,
    );
    return cachedConfig
      ? normalizeFigurineWorkflowConfigResponse(JSON.parse(cachedConfig))
      : null;
  } catch {
    return null;
  }
}

export function cacheStoryfrontWorkflowConfig(rawConfig: unknown): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      storyfrontWorkflowConfigCacheKey,
      JSON.stringify(rawConfig),
    );
  } catch {
    // Storage can be unavailable in privacy modes. The bundled defaults still
    // give the page an immediate, usable first render.
  }
}
