import type { Catalog, CatalogSkill } from "./catalog.js";
import { MAX_BOUND } from "./config.js";
import { readBinding } from "./bind.js";

type Env = NodeJS.ProcessEnv;

export type IdleCandidate = { name: string; path: string; description: string; reason: string };

/** Dry-run only: never moves or deletes. */
export function planArchiveIdle(catalog: Catalog, env: Env = process.env) {
  const binding = readBinding(env);
  const recent = new Set(binding.skills.slice(0, MAX_BOUND).map((s) => s.name));
  const candidates: IdleCandidate[] = catalog.skills
    .filter((s: CatalogSkill) => !recent.has(s.name))
    .map((s) => ({
      name: s.name,
      path: s.path,
      description: s.description,
      reason: recent.size ? "not in current binding" : "no binding set — all catalog skills listed as idle candidates",
    }));
  return {
    dry_run: true as const,
    candidates,
    note: "archive_idle is dry-run only; skill-mcp never moves or deletes skills",
  };
}
