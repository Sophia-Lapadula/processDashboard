// Preços em USD por 1M tokens. Atualize quando a Anthropic mudar pricing.
// https://docs.claude.com/en/docs/about-claude/pricing

export interface ModelRates {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
}

const RATES: Record<string, ModelRates> = {
  "claude-opus-4-7": { input: 15.0, output: 75.0, cache_read: 1.5, cache_write: 18.75 },
  "claude-opus-4-6": { input: 15.0, output: 75.0, cache_read: 1.5, cache_write: 18.75 },
  "claude-opus-4-5": { input: 15.0, output: 75.0, cache_read: 1.5, cache_write: 18.75 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0, cache_read: 0.3, cache_write: 3.75 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0, cache_read: 0.3, cache_write: 3.75 },
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0, cache_read: 0.1, cache_write: 1.25 },
};

const DEFAULT: ModelRates = RATES["claude-sonnet-4-5"];

export function getRates(model: string): ModelRates {
  // strip suffix de versão pra fallback ("claude-sonnet-4-5-20251022" → "claude-sonnet-4-5")
  if (RATES[model]) return RATES[model];
  const base = model.replace(/-\d{8}$/, "");
  return RATES[base] ?? DEFAULT;
}

export interface UsageCounts {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

export function computeCostUsd(model: string, usage: UsageCounts): number {
  const rates = getRates(model);
  const cost =
    (usage.input_tokens * rates.input +
      usage.output_tokens * rates.output +
      usage.cache_read_tokens * rates.cache_read +
      usage.cache_creation_tokens * rates.cache_write) /
    1_000_000;
  return Number(cost.toFixed(6));
}

export const AVAILABLE_MODELS = Object.keys(RATES);
