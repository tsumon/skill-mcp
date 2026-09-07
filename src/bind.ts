import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { MAX_BOUND, bindingPath, stateDir } from "./config.js";

type Env = NodeJS.ProcessEnv;

export type LeanSkill = { name: string; description: string; path: string; tokens?: number };

export type BindingState = {
  version: 1;
  updatedAt: string;
  none: boolean;
  skills: LeanSkill[];
  reasons?: Record<string, string>;
  source?: "suggest" | "manual" | "clear";
};

export function emptyBinding(source: BindingState["source"] = "clear"): BindingState {
  return { version: 1, updatedAt: new Date().toISOString(), none: true, skills: [], reasons: {}, source };
}

export function readBinding(env: Env = process.env): BindingState {
  const file = bindingPath(env);
  if (!existsSync(file)) return emptyBinding("clear");
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as BindingState;
    const skills = (raw.skills ?? []).slice(0, MAX_BOUND).map((s) => ({
      name: s.name, description: s.description ?? "", path: s.path, tokens: s.tokens,
    }));
    return {
      version: 1,
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
      none: skills.length === 0 || Boolean(raw.none),
      skills,
      reasons: raw.reasons ?? {},
      source: raw.source ?? "manual",
    };
  } catch {
    return emptyBinding("clear");
  }
}

export function writeBinding(state: BindingState, env: Env = process.env): string {
  mkdirSync(stateDir(env), { recursive: true });
  const file = bindingPath(env);
  const lean: BindingState = {
    version: 1,
    updatedAt: new Date().toISOString(),
    none: state.skills.length === 0,
    skills: state.skills.slice(0, MAX_BOUND).map((s) => ({
      name: s.name,
      description: s.description ?? "",
      path: s.path,
      ...(typeof s.tokens === "number" ? { tokens: s.tokens } : {}),
    })),
    reasons: state.reasons ?? {},
    source: state.source ?? "manual",
  };
  writeFileSync(file, JSON.stringify(lean, null, 2), "utf8");
  return file;
}

export function clearBinding(env: Env = process.env): BindingState {
  const state = emptyBinding("clear");
  writeBinding(state, env);
  return state;
}

export function whyBinding(state: BindingState): string {
  if (state.none || state.skills.length === 0) return "No skills bound (clear/none).";
  const lines = state.skills.map((s) => {
    const reason = state.reasons?.[s.name];
    return reason ? "- " + s.name + ": " + reason : "- " + s.name + ": " + (state.source ?? "manual") + " bind";
  });
  return ["Bound " + state.skills.length + "/" + MAX_BOUND + " (source=" + (state.source ?? "manual") + ")", ...lines].join("\n");
}
