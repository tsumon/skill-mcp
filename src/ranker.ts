import path from "node:path";
import { MAX_BOUND } from "./config.js";

const WEIGHTS = {
  name: 3,
  description: 2,
  h2: 1,
} as const;

const SCORE_THRESHOLD = 0.15;
export const MAX_BOUND_SKILLS = MAX_BOUND;

const ASCII_TOKEN = /[a-z0-9]+/g;
const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;

export type SkillRecord = {
  name: string;
  path: string;
  description: string;
  h2: string;
};

export type RankedSkill = {
  name: string;
  path: string;
  score: number;
  reason: string;
};

export type RankResult = {
  skills: RankedSkill[];
  overflow: RankedSkill[];
  none: boolean;
};

export function tokenize(input: string): string[] {
  const text = input.normalize("NFC").toLowerCase();
  const tokens: string[] = [];
  for (const match of text.matchAll(ASCII_TOKEN)) {
    const tok = match[0];
    if (tok.length > 1) tokens.push(tok);
  }
  for (const match of text.matchAll(CJK_RUN)) {
    const run = match[0];
    if (run.length === 1) {
      tokens.push(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i++) {
      tokens.push(run.slice(i, i + 2));
    }
  }
  return tokens;
}

function parseFrontmatter(raw: string): { name: string; description: string; body: string } {
  const trimmed = raw.replace(/^\uFEFF/, "");
  if (!trimmed.startsWith("---")) {
    return { name: "", description: "", body: trimmed };
  }
  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) {
    return { name: "", description: "", body: trimmed };
  }
  const yaml = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 4).replace(/^\r?\n/, "");
  let name = "";
  let description = "";
  for (const line of yaml.split(/\r?\n/)) {
    const m = line.match(/^(name|description):\s*(.*)$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "").trim();
    if (m[1] === "name") name = value;
    else description = value;
  }
  return { name, description, body };
}

function extractH2(body: string): string {
  const heads: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) heads.push(m[1]);
  }
  return heads.join(" ");
}

export function loadSkillMd(skillPath: string, content: string): SkillRecord {
  const parsed = parseFrontmatter(content);
  const folder = path.basename(path.dirname(skillPath));
  return {
    name: parsed.name || folder,
    path: skillPath,
    description: parsed.description,
    h2: extractH2(parsed.body),
  };
}

function fieldTokens(skill: SkillRecord): { name: string[]; description: string[]; h2: string[] } {
  return {
    name: tokenize(skill.name),
    description: tokenize(skill.description),
    h2: tokenize(skill.h2),
  };
}

function tf(tokens: string[], term: string): number {
  let n = 0;
  for (const t of tokens) {
    if (t === term) n += 1;
  }
  return n;
}

function skillHasTerm(fields: ReturnType<typeof fieldTokens>, term: string): boolean {
  return (
    fields.name.includes(term) ||
    fields.description.includes(term) ||
    fields.h2.includes(term)
  );
}

export function rank(catalog: SkillRecord[], prompt: string): RankResult {
  const promptTokens = tokenize(prompt);
  const N = catalog.length;
  const fieldsBySkill = catalog.map(fieldTokens);

  const df = new Map<string, number>();
  for (const term of new Set(promptTokens)) {
    let count = 0;
    for (const fields of fieldsBySkill) {
      if (skillHasTerm(fields, term)) count += 1;
    }
    df.set(term, count);
  }

  const idf = (term: string): number =>
    Math.log((N + 1) / ((df.get(term) ?? 0) + 1)) + 1;

  const raws = catalog.map((skill, i) => {
    const fields = fieldsBySkill[i];
    let raw = 0;
    const matched: string[] = [];
    for (const term of promptTokens) {
      const nameTf = tf(fields.name, term);
      const descTf = tf(fields.description, term);
      const h2Tf = tf(fields.h2, term);
      if (nameTf + descTf + h2Tf > 0 && !matched.includes(term)) matched.push(term);
      raw += WEIGHTS.name * nameTf * idf(term);
      raw += WEIGHTS.description * descTf * idf(term);
      raw += WEIGHTS.h2 * h2Tf * idf(term);
    }
    const tokenCount =
      fields.name.length + fields.description.length + fields.h2.length;
    raw /= 1 + 0.05 * tokenCount;
    return { skill, raw, matched };
  });

  const maxRaw = Math.max(0, ...raws.map((r) => r.raw));
  if (maxRaw === 0) {
    return { skills: [], overflow: [], none: true };
  }

  const scored: RankedSkill[] = raws
    .map((r) => ({
      name: r.skill.name,
      path: r.skill.path,
      score: r.raw / maxRaw,
      reason: r.matched.length ? `matched: ${r.matched.join(", ")}` : "no overlap",
    }))
    .filter((s) => s.score >= SCORE_THRESHOLD)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  const skills = scored.slice(0, MAX_BOUND_SKILLS);
  const overflow = scored.slice(MAX_BOUND_SKILLS);

  return { skills, overflow, none: skills.length === 0 };
}
