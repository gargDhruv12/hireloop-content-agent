/**
 * What a pack costs, worked out from the tokens it used. An estimate: Google
 * bills by its own count, and the rupee rate moves.
 *
 * Prices: Gemini Developer API, Standard (paid) tier, USD per 1M tokens, from
 * https://ai.google.dev/gemini-api/docs/pricing, checked 31 October 2026.
 * Update this table when Google's page changes.
 */
import type { Usage } from "@/lib/content/types";

interface Price {
  /** Last day (inclusive, YYYY-MM-DD) this price applies; omit for "until further notice". */
  until?: string;
  input: number;
  output: number;
}

interface ModelPrice {
  periods: Price[];
  /** Image models: price of one 1K image, used when the token count looks too low to be a whole image. */
  perImage?: number;
}

export const PRICES: Record<string, ModelPrice> = {
  "gemini-3.8-flash": {
    periods: [
      { until: "2026-12-31", input: 0.75, output: 3.75 },
      { input: 1.5, output: 7.5 },
    ],
  },
  "gemini-4-argon": {
    periods: [
      { until: "2026-11-30", input: 2, output: 10 },
      { input: 4, output: 20 },
    ],
  },
  // Image output tokens are $30 per 1M ("equivalent to $0.0336 per 1K image").
  "gemini-nano-banana-2.1": { periods: [{ input: 1.5, output: 30 }], perImage: 0.0336 },
};

/** Rupees per US dollar. About ₹93–97 through 2026; set USD_INR to today's rate. */
export function usdToInr(): number {
  const rate = Number(process.env.USD_INR);
  return Number.isFinite(rate) && rate > 0 ? rate : 95;
}

export interface Cost {
  usd: number;
  inr: number;
  /** The ₹/$ rate used. */
  rate: number;
  /** Models used that have no price here (for example a fallback); their tokens aren't counted. */
  unpriced: string[];
  /** True for runs made before per-model counts existed: all tokens priced as the text model. */
  estimatedFromTotals: boolean;
}

function priceOn(model: string, day: string): Price | undefined {
  return PRICES[model]?.periods.find((p) => !p.until || day <= p.until);
}

/**
 * Cost of one run's usage. `day` (the run's date) picks the price period, so a
 * pack made in December keeps December's price after the January increase.
 */
export function costOf(usage: Usage, opts: { day: string; textModel: string; imageModel: string; hadImage: boolean }): Cost {
  const day = opts.day.slice(0, 10);
  let usd = 0;
  const unpriced: string[] = [];
  const byModel = usage.byModel ?? { [opts.textModel]: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } };

  for (const [model, u] of Object.entries(byModel)) {
    const price = priceOn(model, day);
    if (!price) {
      if (u.inputTokens || u.outputTokens) unpriced.push(model);
      continue;
    }
    let modelUsd = (u.inputTokens * price.input + u.outputTokens * price.output) / 1e6;
    const perImage = PRICES[model]?.perImage;
    if (perImage) modelUsd = Math.max(modelUsd, (usage.images ?? 0) * perImage);
    usd += modelUsd;
  }

  // Older runs have no per-model counts: add the image at its flat price.
  if (!usage.byModel && opts.hadImage) usd += PRICES[opts.imageModel]?.perImage ?? 0;

  const rate = usdToInr();
  return { usd, inr: usd * rate, rate, unpriced, estimatedFromTotals: !usage.byModel };
}

/** Cost of a saved run (or its summary); null for offline sample runs, which cost nothing. */
export function runCost(run: {
  createdAt: string;
  usage?: Usage;
  models: { text: string; image: string; mock?: boolean };
  image?: unknown;
  hadImage?: boolean;
}): Cost | null {
  if (run.models.mock || !run.usage) return null;
  return costOf(run.usage, {
    day: run.createdAt,
    textModel: run.models.text,
    imageModel: run.models.image,
    hadImage: run.hadImage ?? !!run.image,
  });
}

export function formatInr(inr: number): string {
  return `₹${inr < 10 ? inr.toFixed(2) : Math.round(inr).toLocaleString("en-IN")}`;
}
