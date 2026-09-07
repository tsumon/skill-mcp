import { readFileSync, existsSync } from "node:fs";
import { buildCatalog, shadowWhy, unshadowHint, type CatalogSkill } from "./catalog.js";
import { clearBinding, readBinding, whyBinding, writeBinding, type LeanSkill } from "./bind.js";
import { MAX_BOUND, resolveRoots, DEFAULT_TOKEN_BUDGET } from "./config.js";
import { runDoctor } from "./doctor.js";
import { planArchiveIdle } from "./archive.js";
import { suggestSkills } from "./suggest.js";
import { estimateTokens } from "./tokens.js";
import { loadSkillMd } from "./ranker.js";

type Env = NodeJS.ProcessEnv;

export type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function err(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function lean(s: CatalogSkill) {
  return { name: s.name, description: s.description, path: s.path, tokens: s.tokens, tier: s.tier };
}

export function getCatalog(env: Env = process.env) {
  return buildCatalog(resolveRoots(env));
}

export function handleTool(name: string, args: Record<string, unknown>, env: Env = process.env): ToolResult {
  try {
    switch (name) {
      case "list_skills": return toolListSkills(env);
      case "suggest_skills": return toolSuggest(args, env);
      case "bind_skills": return toolBind(args, env);
      case "get_binding": return ok(readBinding(env));
      case "why": return ok({ why: whyBinding(readBinding(env)), binding: readBinding(env) });
      case "estimate_tokens": return toolEstimate(args, env);
      case "doctor": return ok(runDoctor(env));
      case "archive_idle": return ok(planArchiveIdle(getCatalog(env), env));
      case "read_skill": return toolReadSkill(args, env);
      default: return err("Unknown tool: " + name);
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

function toolListSkills(env: Env): ToolResult {
  const catalog = getCatalog(env);
  const winners = new Map(catalog.skills.map((s) => [s.name, s]));
  const shadowed = catalog.shadowed.map((s) => {
    const winner = winners.get(s.name);
    return {
      ...lean(s),
      shadowed: true,
      shadow_why: winner ? shadowWhy(s, winner) : "unknown",
      unshadow_hint: winner ? unshadowHint(s, winner) : "",
    };
  });
  return ok({
    skills: catalog.skills.map((s) => ({ ...lean(s), shadowed: false })),
    shadowed,
    count: catalog.skills.length,
    shadowed_count: catalog.shadowed.length,
  });
}

function toolSuggest(args: Record<string, unknown>, env: Env): ToolResult {
  const prompt = String(args.prompt ?? args.query ?? "");
  if (!prompt.trim()) return err("prompt is required");
  const budget = typeof args.budget === "number" ? args.budget : DEFAULT_TOKEN_BUDGET;
  const catalog = getCatalog(env);
  return ok(suggestSkills(catalog.skills, prompt, budget));
}

function parseNames(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function toolBind(args: Record<string, unknown>, env: Env): ToolResult {
  const clear = Boolean(args.clear) || args.names === "none" || args.none === true;
  if (clear) return ok(clearBinding(env));
  const names = parseNames(args.names ?? args.skills);
  if (names.length === 0) return err("provide names[] or clear:true");
  if (names.length > MAX_BOUND) return err("max " + MAX_BOUND + " skills; got " + names.length);
  const catalog = getCatalog(env);
  const byName = new Map(catalog.skills.map((s) => [s.name, s]));
  const skills: LeanSkill[] = [];
  const reasons: Record<string, string> = {};
  const reasonMap = (args.reasons && typeof args.reasons === "object") ? (args.reasons as Record<string, string>) : {};
  for (const n of names) {
    const s = byName.get(n);
    if (!s) return err("unknown skill: " + n);
    skills.push({ name: s.name, description: s.description, path: s.path, tokens: s.tokens });
    reasons[n] = reasonMap[n] ?? "manual bind";
  }
  writeBinding({ version: 1, updatedAt: new Date().toISOString(), none: false, skills, reasons, source: "manual" }, env);
  return ok(readBinding(env));
}

function toolEstimate(args: Record<string, unknown>, env: Env): ToolResult {
  const mode = args.mode === "description" ? "description" : "body";
  const catalog = buildCatalog(resolveRoots(env), { tokens: mode });
  const names = parseNames(args.names ?? args.name);
  const list = names.length
    ? names.map((n) => {
        const s = catalog.skills.find((x) => x.name === n) || catalog.shadowed.find((x) => x.name === n);
        if (!s) throw new Error("unknown skill: " + n);
        return { name: s.name, path: s.path, tokens: s.tokens, mode };
      })
    : catalog.skills.map((s) => ({ name: s.name, path: s.path, tokens: s.tokens, mode }));
  const total = list.reduce((n, s) => n + s.tokens, 0);
  return ok({ mode, skills: list, total });
}

function toolReadSkill(args: Record<string, unknown>, env: Env): ToolResult {
  const name = String(args.name ?? "");
  if (!name) return err("name is required");
  const catalog = getCatalog(env);
  const s = catalog.skills.find((x) => x.name === name) || catalog.shadowed.find((x) => x.name === name);
  if (!s) return err("unknown skill: " + name);
  if (!existsSync(s.path)) return err("missing file: " + s.path);
  const body = readFileSync(s.path, "utf8");
  const meta = loadSkillMd(s.path, body);
  return ok({ name: meta.name, path: s.path, description: meta.description, body, tokens: estimateTokens(body) });
}
