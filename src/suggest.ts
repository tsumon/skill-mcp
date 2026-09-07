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
  names: string[];
  next_step: string;
  dropped: SuggestDropped[];
  none: boolean;
  budget: { max_tokens: number; used_tokens: number };
  cap: number;
};

export function bindNextStep(names: string[]): string {
  if (names.length === 0) {
    return "Next step: no matching skills to bind. Call list_skills or try a more specific prompt.";
  }
  return "Next step: call bind_skills with names " + JSON.stringify(names) + ".";
}

export function suggestSkills(
  catalog: CatalogSkill[],
  prompt: string,
  budgetTokens: number = DEFAULT_TOKEN_BUDGET,
  ranked = rank(catalog, prompt),
): SuggestResult {
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
  const names = keptByBudget.map((s) => s.name);
  return {
    skills: keptByBudget,
    names,
    next_step: bindNextStep(names),
    dropped,
    none: keptByBudget.length === 0,
    budget: { max_tokens: budgetTokens, used_tokens: used },
    cap: MAX_BOUND,
  };
}
