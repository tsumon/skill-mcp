import type { CatalogSkill } from "./catalog.js";
import { MAX_BOUND } from "./config.js";
import { rank, type RankedSkill } from "./ranker.js";
import { DEFAULT_TOKEN_BUDGET, applyBudget, skippedByBudget } from "./tokens.js";

export type SuggestDropped = {
  name: string;
  path: string;
  score?: number;
  reason: string;
  why: "cap" | "budget" | "threshold";
};

export type SuggestResult = {
  skills: Array<RankedSkill & { description: string; tokens: number }>;
  dropped: SuggestDropped[];
  none: boolean;
  budget: { max_tokens: number; used_tokens: number };
  cap: number;
};

export function suggestSkills(
  catalog: CatalogSkill[],
  prompt: string,
  budgetTokens: number = DEFAULT_TOKEN_BUDGET,
): SuggestResult {
  const ranked = rank(catalog, prompt);
  const byName = new Map(catalog.map((s) => [s.name, s]));
  const withTokens = ranked.skills.map((r) => {
    const full = byName.get(r.name);
    return {
      ...r,
      description: full?.description ?? "",
      tokens: full?.tokens ?? 0,
    };
  });

  const keptByBudget = applyBudget(withTokens, budgetTokens);
  const budgetSkipped = skippedByBudget(withTokens, budgetTokens);

  const dropped: SuggestDropped[] = [
    ...ranked.overflow.map((r) => ({
      name: r.name,
      path: r.path,
      score: r.score,
      reason: r.reason,
      why: "cap" as const,
    })),
    ...budgetSkipped.map((r) => ({
      name: r.name,
      path: r.path,
      score: r.score,
      reason: r.reason,
      why: "budget" as const,
    })),
  ];

  const used = keptByBudget.reduce((n, s) => n + s.tokens, 0);
  return {
    skills: keptByBudget,
    dropped,
    none: keptByBudget.length === 0,
    budget: { max_tokens: budgetTokens, used_tokens: used },
    cap: MAX_BOUND,
  };
}
