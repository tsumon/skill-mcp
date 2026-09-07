import os from "node:os";
import path from "node:path";
import type { CatalogSource } from "./catalog.js";

export const MAX_BOUND = 3;
export const DEFAULT_TOKEN_BUDGET = 4000;

type Env = NodeJS.ProcessEnv;

export function homedir(env: Env = process.env): string {
  return env.HOME || env.USERPROFILE || os.homedir();
}

export function stateDir(env: Env = process.env): string {
  if (env.SKILL_MCP_STATE_DIR) return env.SKILL_MCP_STATE_DIR;
  return path.join(homedir(env), ".config", "skill-mcp");
}

export function bindingPath(env: Env = process.env): string {
  return path.join(stateDir(env), "binding.json");
}

export function projectDir(env: Env = process.env): string {
  return env.SKILL_MCP_PROJECT_DIR || env.PWD || process.cwd();
}

export function projectStateDir(env: Env = process.env): string {
  return path.join(projectDir(env), ".skill-mcp");
}

export function projectBindingPath(env: Env = process.env): string {
  return path.join(projectStateDir(env), "binding.json");
}

export function sessionId(env: Env = process.env): string {
  return env.SKILL_MCP_SESSION_ID || "default";
}

export function defaultRoots(home: string = homedir()): string[] {
  return [
    path.join(home, ".claude", "skills"),
    path.join(home, ".agents", "skills"),
    path.join(home, ".codex", "skills"),
    path.join(home, ".config", "opencode", "skills"),
  ];
}

export function parseRootsEnv(env: Env = process.env): string[] | null {
  const raw = env.SKILL_MCP_ROOTS;
  if (!raw || !raw.trim()) return null;
  return raw.split(/[,:;]/).map((s) => s.trim()).filter(Boolean);
}

function parseRootList(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw.split(/[,:;]/).map((s) => s.trim()).filter(Boolean);
}

export function resolveRoots(env: Env = process.env): CatalogSource[] {
  const home = homedir(env);
  const sources: CatalogSource[] = [];
  for (const root of parseRootList(env.SKILL_MCP_PROJECT_ROOTS)) {
    sources.push({ root, tier: "project" });
  }
  const userRoots = parseRootsEnv(env) ?? defaultRoots(home);
  for (const root of userRoots) {
    sources.push({ root, tier: "user" });
  }
  for (const root of parseRootList(env.SKILL_MCP_PLUGIN_ROOTS)) {
    sources.push({ root, tier: "plugin" });
  }
  return sources;
}
