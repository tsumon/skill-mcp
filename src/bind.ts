import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  MAX_BOUND,
  bindingPath,
  projectBindingPath,
  projectStateDir,
  sessionId,
  stateDir,
} from "./config.js";

type Env = NodeJS.ProcessEnv;

export type LeanSkill = { name: string; description: string; path: string; tokens?: number };

export type BindScope = "session" | "project" | "global";

export const BIND_PRIORITY: BindScope[] = ["session", "project", "global"];

export type BindingState = {
  version: 1;
  updatedAt: string;
  none: boolean;
  skills: LeanSkill[];
  reasons?: Record<string, string>;
  source?: "suggest" | "manual" | "clear";
};

const sessionStore = new Map<string, BindingState>();

export function resetSessionBindings(): void {
  sessionStore.clear();
}

export function emptyBinding(source: BindingState["source"] = "clear"): BindingState {
  return { version: 1, updatedAt: new Date().toISOString(), none: true, skills: [], reasons: {}, source };
}

function leanState(state: BindingState): BindingState {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    none: state.skills.length === 0 || Boolean(state.none),
    skills: state.skills.slice(0, MAX_BOUND).map((s) => ({
      name: s.name,
      description: s.description ?? "",
      path: s.path,
      ...(typeof s.tokens === "number" ? { tokens: s.tokens } : {}),
    })),
    reasons: state.reasons ?? {},
    source: state.source ?? "manual",
  };
}

function parseBindingFile(file: string): BindingState {
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

function writeBindingFile(dir: string, file: string, state: BindingState): BindingState {
  mkdirSync(dir, { recursive: true });
  const lean = leanState(state);
  writeFileSync(file, JSON.stringify(lean, null, 2), "utf8");
  return lean;
}

export function readBinding(env: Env = process.env): BindingState {
  return parseBindingFile(bindingPath(env));
}

export function writeBinding(state: BindingState, env: Env = process.env): string {
  writeBindingFile(stateDir(env), bindingPath(env), state);
  return bindingPath(env);
}

export function clearBinding(env: Env = process.env): BindingState {
  const state = emptyBinding("clear");
  writeBinding(state, env);
  return state;
}

export function parseBindScope(raw: unknown, fallback: BindScope | null = "global"): BindScope | null {
  if (raw === "session" || raw === "project" || raw === "global") return raw;
  return fallback;
}

export function readBindingAt(scope: BindScope, env: Env = process.env): BindingState | null {
  if (scope === "session") {
    return sessionStore.get(sessionId(env)) ?? null;
  }
  if (scope === "project") {
    const file = projectBindingPath(env);
    if (!existsSync(file)) return null;
    return parseBindingFile(file);
  }
  return readBinding(env);
}

export function writeBindingAt(scope: BindScope, state: BindingState, env: Env = process.env): BindingState {
  const lean = leanState(state);
  if (scope === "session") {
    sessionStore.set(sessionId(env), lean);
    return lean;
  }
  if (scope === "project") {
    return writeBindingFile(projectStateDir(env), projectBindingPath(env), lean);
  }
  writeBindingFile(stateDir(env), bindingPath(env), lean);
  return lean;
}

export function clearBindingAt(scope: BindScope, env: Env = process.env): BindingState {
  return writeBindingAt(scope, emptyBinding("clear"), env);
}

export type BindingSnapshot = {
  scope: BindScope;
  state: BindingState;
  scopes: { session: BindingState | null; project: BindingState | null; global: BindingState };
  persistence: Record<BindScope, string>;
  priority: BindScope[];
};

export function resolveBinding(env: Env = process.env): BindingSnapshot {
  const session = readBindingAt("session", env);
  const project = readBindingAt("project", env);
  const global = readBinding(env);
  let scope: BindScope = "global";
  let state = global;
  if (session) {
    scope = "session";
    state = session;
  } else if (project) {
    scope = "project";
    state = project;
  }
  return {
    scope,
    state,
    scopes: { session, project, global },
    persistence: {
      session: "in-memory (SKILL_MCP_SESSION_ID=" + sessionId(env) + ")",
      project: projectBindingPath(env),
      global: bindingPath(env),
    },
    priority: BIND_PRIORITY,
  };
}

export function whyBinding(state: BindingState): string {
  if (state.none || state.skills.length === 0) return "No skills bound (clear/none).";
  const lines = state.skills.map((s) => {
    const reason = state.reasons?.[s.name];
    return reason ? "- " + s.name + ": " + reason : "- " + s.name + ": " + (state.source ?? "manual") + " bind";
  });
  return ["Bound " + state.skills.length + "/" + MAX_BOUND + " (source=" + (state.source ?? "manual") + ")", ...lines].join("\n");
}

export function bindingContract(state: BindingState): string {
  if (state.none || state.skills.length === 0) {
    return "No skills are bound. Do not load or follow any SKILL.md until the user binds skills.";
  }
  const names = state.skills.map((s) => s.name);
  const n = names.length;
  const noun = n === 1 ? "skill" : "skills";
  return (
    "You may use only these " + n + " bound " + noun + ": " + names.join(", ") +
    ". Do not load, follow, or bind any other SKILL.md."
  );
}
