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

export function resolveRoots(env: Env = process.env): CatalogSource[] {
  const home = homedir(env);
  const roots = parseRootsEnv(env) ?? defaultRoots(home);
  return roots.map((root) => ({ root, tier: "user" as const }));
}
