export const GENERATION_LIMIT = 3;
const STORAGE_KEY = 'qiju-generation-usage';

export interface GenerationUsage {
  used: number;
  remaining: number;
}

function clampUsed(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.min(GENERATION_LIMIT, Math.max(0, Math.floor(value)));
}

function readUsed(): number {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return 0;
    }

    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || !('used' in parsed)) {
      return 0;
    }

    return clampUsed(parsed.used);
  } catch {
    return 0;
  }
}

function writeUsed(used: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ used }));
  } catch {
    // If storage is unavailable, the current session can still generate.
  }
}

export function getGenerationUsage(): GenerationUsage {
  const used = readUsed();
  return { used, remaining: GENERATION_LIMIT - used };
}

export function recordSuccessfulGeneration(): GenerationUsage {
  const used = Math.min(GENERATION_LIMIT, readUsed() + 1);
  writeUsed(used);
  return { used, remaining: GENERATION_LIMIT - used };
}
