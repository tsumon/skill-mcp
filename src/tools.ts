import { readFileSync, existsSync } from "node:fs";
import { buildCatalog, shadowMessage, shadowWhy, unshadowHint, type Catalog, type CatalogSkill } from "./catalog.js";
import {
  bindingContract,
  clearBindingAt,
  parseBindScope,
  resetSessionBindings,
  resolveBinding,
  whyBinding,
  writeBindingAt,
  type BindingState,
  type BindScope,
  type LeanSkill,
} from "./bind.js";
import { MAX_BOUND, resolveRoots, DEFAULT_TOKEN_BUDGET } from "./config.js";
import { runDoctor } from "./doctor.js";
import { applyArchiveIdle, planArchiveIdle } from "./archive.js";
import {
  embeddingMode,
  rankEmbedded,
  resolveEmbeddingClient,
  setEmbeddingClient,
} from "./embeddings.js";
import { suggestSkills } from "./suggest.js";
import { estimateTokens } from "./tokens.js";
import { loadSkillMd } from "./ranker.js";
import { writeHostContract } from "./host-contract.js";
import { setNativeSkillsBypass } from "./host-skills.js";

export { resetSessionBindings, setEmbeddingClient };

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

const catalogCache = new Map<string, Catalog>();

function rootsKey(env: Env): string {
  return resolveRoots(env)
    .map((s) => s.tier + ":" + s.root)
    .join("\n");
}

export function clearCatalogCache(): void {
  catalogCache.clear();
}

export function getCatalog(env: Env = process.env, opts: { rescan?: boolean } = {}) {
  const key = rootsKey(env);
  if (!opts.rescan) {
    const hit = catalogCache.get(key);
    if (hit) return hit;
  }
  const catalog = buildCatalog(resolveRoots(env));
  catalogCache.set(key, catalog);
  return catalog;
}

export function rescanCatalog(env: Env = process.env): {
  catalog: Catalog;
  added: string[];
  removed: string[];
  unchanged: number;
} {
  const key = rootsKey(env);
  const previous = catalogCache.get(key);
  const catalog = getCatalog(env, { rescan: true });
  const prevNames = new Set((previous?.skills ?? []).map((s) => s.name));
  const nextNames = new Set(catalog.skills.map((s) => s.name));
  const added = catalog.skills.map((s) => s.name).filter((n) => !prevNames.has(n));
  const removed = [...prevNames].filter((n) => !nextNames.has(n));
  return {
    catalog,
    added,
    removed,
    unchanged: catalog.skills.length - added.length,
  };
}

export async function handleTool(name: string, args: Record<string, unknown>, env: Env = process.env): Promise<ToolResult> {
  try {
    switch (name) {
      case "list_skills": return toolListSkills(env);
      case "suggest_skills": return await toolSuggest(args, env);
      case "bind_skills": return toolBind(args, env);
      case "get_binding": return toolGetBinding(args, env);
      case "why": {
        const resolved = resolveBinding(env);
        return ok({ why: whyBinding(resolved.state), binding: resolved.state, scope: resolved.scope });
      }
      case "estimate_tokens": return toolEstimate(args, env);
      case "doctor": return ok(runDoctor(env));
      case "archive_idle": return toolArchiveIdle(args, env);
      case "read_skill": return toolReadSkill(args, env);
      case "rescan_skills": return toolRescan(env);
      case "write_host_contract": return ok(writeHostContract(env));
      case "native_skills_bypass": {
        if (typeof args.enabled !== "boolean") return err("enabled boolean is required (true to write name-only skillOverrides, false to restore)");
        return ok(setNativeSkillsBypass(args.enabled, env));
      }
      default: return err("Unknown tool: " + name);
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

function bindingView(scope: BindScope, state: BindingState, snapshot: ReturnType<typeof resolveBinding>) {
  return {
    ...state,
    scope,
    contract: bindingContract(state),
    persistence: snapshot.persistence,
    priority: snapshot.priority,
  };
}

function toolGetBinding(args: Record<string, unknown>, env: Env): ToolResult {
  const snapshot = resolveBinding(env);
  const requested = parseBindScope(args.scope, null);
  if (requested) {
    const state = snapshot.scopes[requested] ?? { version: 1 as const, updatedAt: new Date().toISOString(), none: true, skills: [], reasons: {}, source: "clear" as const };
    return ok(bindingView(requested, state, snapshot));
  }
  return ok({
    ...bindingView(snapshot.scope, snapshot.state, snapshot),
    scopes: snapshot.scopes,
  });
}

function toolRescan(env: Env): ToolResult {
  const result = rescanCatalog(env);
  return ok({
    rescanned: true,
    skills: result.catalog.skills.map((s) => lean(s)),
    count: result.catalog.skills.length,
    shadowed_count: result.catalog.shadowed.length,
    added: result.added,
    removed: result.removed,
    unchanged: result.unchanged,
  });
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
      shadow_message: winner ? shadowMessage(s, winner) : "This skill is shadowed; the winning copy could not be identified.",
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

async function toolSuggest(args: Record<string, unknown>, env: Env): Promise<ToolResult> {
  const prompt = String(args.prompt ?? args.query ?? "");
  if (!prompt.trim()) return err("prompt is required");
  const budget = typeof args.budget === "number" ? args.budget : DEFAULT_TOKEN_BUDGET;
  const catalog = getCatalog(env);
  const lexical = () => suggestSkills(catalog.skills, prompt, budget);
  const mode = embeddingMode(env);
  if (mode === "off") {
    return ok({ ...lexical(), router: "lexical" });
  }
  const client = resolveEmbeddingClient(env);
  if (!client) {
    return ok({
      ...lexical(),
      router: "lexical",
      router_note: "embedding unavailable; using lexical",
    });
  }
  try {
    const available = await client.available();
    if (!available) {
      return ok({
        ...lexical(),
        router: "lexical",
        router_note: "embedding unavailable; using lexical",
      });
    }
    const ranked = await rankEmbedded(catalog.skills, prompt, client);
    return ok({ ...suggestSkills(catalog.skills, prompt, budget, ranked), router: "embedding" });
  } catch {
    return ok({
      ...lexical(),
      router: "lexical",
      router_note: "embedding unavailable; using lexical",
    });
  }
}

function parseNames(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function toolBind(args: Record<string, unknown>, env: Env): ToolResult {
  const scope = parseBindScope(args.scope, "global") ?? "global";
  const clear = Boolean(args.clear) || args.names === "none" || args.none === true;
  if (clear) {
    const state = clearBindingAt(scope, env);
    return ok(bindingView(scope, state, resolveBinding(env)));
  }
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
  const written = writeBindingAt(
    scope,
    { version: 1, updatedAt: new Date().toISOString(), none: false, skills, reasons, source: "manual" },
    env,
  );
  return ok(bindingView(scope, written, resolveBinding(env)));
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

function toolArchiveIdle(args: Record<string, unknown>, env: Env): ToolResult {
  const catalog = getCatalog(env);
  if (args.apply === true) {
    const result = applyArchiveIdle(catalog, env);
    rescanCatalog(env);
    return ok(result);
  }
  return ok(planArchiveIdle(catalog, env));
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
