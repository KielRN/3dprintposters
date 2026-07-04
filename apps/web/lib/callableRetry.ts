const transientCallableCodes = new Set([
  "internal",
  "unavailable",
  "deadline-exceeded",
  "functions/internal",
  "functions/unavailable",
  "functions/deadline-exceeded",
]);

const defaultRetryDelaysMs = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000];

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function callableErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : "";
  }
  return "";
}

export function callableErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallback;
}

export function isTransientCallableError(error: unknown) {
  const code = callableErrorCode(error);
  if (transientCallableCodes.has(code)) {
    return true;
  }

  const message = callableErrorMessage(error, "").trim().toLowerCase();
  return transientCallableCodes.has(message);
}

export async function callWithTransientRetry<T>(
  operation: () => Promise<T>,
  options: {
    delaysMs?: number[];
    onRetry?: (input: { attempt: number; delayMs: number; error: unknown }) => void;
  } = {},
) {
  const delaysMs = options.delaysMs ?? defaultRetryDelaysMs;
  let lastError: unknown;

  for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const delayMs = delaysMs[attempt];
      if (delayMs === undefined || !isTransientCallableError(error)) {
        throw error;
      }
      options.onRetry?.({ attempt: attempt + 1, delayMs, error });
      await sleep(delayMs);
    }
  }

  throw lastError;
}
