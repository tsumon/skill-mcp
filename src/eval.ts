import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_BOUND } from "./config.js";
import { loadSkillMd, rank, type SkillRecord } from "./ranker.js";

export type EvalCase = {
  id: string;
  prompt: string;
  catalog: string[];
  expect?: string[];
  expectOverflow?: string[];
  lang?: string;
  conflict?: boolean;
};

export type EvalCaseResult = {
  id: string;
  ok: boolean;
  names: string[];
  overflow: string[];
  detail: string;
};

export type EvalSuiteResult = {
  passed: number;
  failed: number;
  results: EvalCaseResult[];
  failures: string[];
};

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function loadCatalogDir(dir: string): SkillRecord[] {
  const records: SkillRecord[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return records;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(dir, entry.name, "SKILL.md");
    try {
      records.push(loadSkillMd(skillPath, readFileSync(skillPath, "utf8")));
    } catch {
      continue;
    }
  }
  return records;
}

export function loadEvalCases(root: string = repoRoot()): EvalCase[] {
  const file = path.join(root, "eval", "goldens.json");
  return JSON.parse(readFileSync(file, "utf8")) as EvalCase[];
}

export function runEvalCase(c: EvalCase, root: string = repoRoot()): EvalCaseResult {
  const catalog = c.catalog.flatMap((rel) => loadCatalogDir(path.join(root, rel)));
  const ranked = rank(catalog, c.prompt);
  const names = ranked.skills.map((s) => s.name);
  const overflow = ranked.overflow.map((s) => s.name);
  const problems: string[] = [];
  if (names.length > MAX_BOUND) problems.push("cap exceeded: " + names.length);
  if (c.expect && JSON.stringify(names) !== JSON.stringify(c.expect)) {
    problems.push("expected " + JSON.stringify(c.expect) + " got " + JSON.stringify(names));
  }
  if (c.expectOverflow && JSON.stringify(overflow) !== JSON.stringify(c.expectOverflow)) {
    problems.push("overflow expected " + JSON.stringify(c.expectOverflow) + " got " + JSON.stringify(overflow));
  }
  return {
    id: c.id,
    ok: problems.length === 0,
    names,
    overflow,
    detail: problems.length ? c.id + ": " + problems.join("; ") : c.id + " ok",
  };
}

export function runEvalSuite(root: string = repoRoot()): EvalSuiteResult {
  const results = loadEvalCases(root).map((c) => runEvalCase(c, root));
  const failures = results.filter((r) => !r.ok).map((r) => r.detail);
  return {
    passed: results.filter((r) => r.ok).length,
    failed: failures.length,
    results,
    failures,
  };
}
