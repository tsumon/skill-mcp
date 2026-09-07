import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadSkillMd, type SkillRecord } from "./ranker.js";
import { estimateTokens } from "./tokens.js";

export type SkillTier = "project" | "user" | "plugin";

export type CatalogSource = {
  root: string;
  tier: SkillTier;
};

export type CatalogSkill = SkillRecord & {
  tier: SkillTier;
  tokens: number;
};

export type Catalog = {
  skills: CatalogSkill[];
  shadowed: CatalogSkill[];
};

export type TokenMode = "body" | "description";

export type BuildCatalogOptions = {
  tokens?: TokenMode;
};

const TIER_RANK: Record<SkillTier, number> = {
  project: 0,
  user: 1,
  plugin: 2,
};

const MAX_DEPTH = 4;

function walkSkillFiles(dir: string, depth: number, out: string[]): void {
  if (depth > MAX_DEPTH || !existsSync(dir)) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === "skills-archive" ||
      entry.name.startsWith(".")
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === "SKILL.md") {
      out.push(full);
    } else if (entry.isDirectory()) {
      walkSkillFiles(full, depth + 1, out);
    }
  }
}

function skillTokens(record: { name: string; description: string }, content: string, mode: TokenMode): number {
  if (mode === "description") {
    return estimateTokens(`${record.name}\n${record.description}`);
  }
  return estimateTokens(content);
}

function collect(source: CatalogSource, mode: TokenMode): CatalogSkill[] {
  if (!existsSync(source.root)) return [];
  const files: string[] = [];
  walkSkillFiles(source.root, 0, files);
  const skills: CatalogSkill[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const record = loadSkillMd(file, content);
    skills.push({
      ...record,
      tier: source.tier,
      tokens: skillTokens(record, content, mode),
    });
  }
  return skills;
}

export type ShadowWhy =
  | "project-beats-user"
  | "project-beats-plugin"
  | "user-beats-plugin"
  | "shorter-path"
  | "lex-path";

export function better(a: CatalogSkill, b: CatalogSkill): number {
  const tier = TIER_RANK[a.tier] - TIER_RANK[b.tier];
  if (tier !== 0) return tier;
  if (a.path.length !== b.path.length) return a.path.length - b.path.length;
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

export function shadowWhy(
  loser: Pick<CatalogSkill, "tier" | "path">,
  winner: Pick<CatalogSkill, "tier" | "path">,
): ShadowWhy {
  if (TIER_RANK[winner.tier] !== TIER_RANK[loser.tier]) {
    return `${winner.tier}-beats-${loser.tier}` as ShadowWhy;
  }
  if (winner.path.length !== loser.path.length) return "shorter-path";
  return "lex-path";
}

export function unshadowHint(
  loser: Pick<CatalogSkill, "name" | "tier" | "path">,
  winner: Pick<CatalogSkill, "tier" | "path">,
): string {
  const why = shadowWhy(loser, winner);
  if (why === "project-beats-user") {
    return `manually archive ${loser.name} then re-scan roots`;
  }
  if (why === "project-beats-plugin" || why === "user-beats-plugin") {
    return "leave it or uninstall the plugin outside skill-mcp";
  }
  return "remove or rename the winning path, then re-scan roots";
}

export function dedupSkills(records: CatalogSkill[]): Catalog {
  const byName = new Map<string, CatalogSkill[]>();
  for (const skill of records) {
    const list = byName.get(skill.name) ?? [];
    list.push(skill);
    byName.set(skill.name, list);
  }
  const skills: CatalogSkill[] = [];
  const shadowed: CatalogSkill[] = [];
  for (const group of byName.values()) {
    group.sort(better);
    skills.push(group[0]);
    shadowed.push(...group.slice(1));
  }
  skills.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { skills, shadowed };
}

export function buildCatalog(
  sources: CatalogSource[],
  options: BuildCatalogOptions = {},
): Catalog {
  const mode = options.tokens ?? "body";
  const all: CatalogSkill[] = [];
  for (const source of sources) {
    all.push(...collect(source, mode));
  }
  return dedupSkills(all);
}

export function writeCatalog(skillbindHome: string, catalog: Catalog): string {
  mkdirSync(skillbindHome, { recursive: true });
  const out = path.join(skillbindHome, "catalog.json");
  writeFileSync(out, JSON.stringify(catalog, null, 2), "utf8");
  return out;
}
