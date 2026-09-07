import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Catalog, CatalogSkill } from "./catalog.js";
import { MAX_BOUND, stateDir } from "./config.js";
import { resolveBinding } from "./bind.js";

type Env = NodeJS.ProcessEnv;

export type IdleCandidate = {
  name: string;
  path: string;
  description: string;
  reason: string;
  tier: CatalogSkill["tier"];
};

export type ArchiveMove = {
  name: string;
  from: string;
  to: string;
  reason: string;
};

function archiveRoot(env: Env): string {
  return path.join(stateDir(env), "archive");
}

function uniqueByPath(items: IdleCandidate[]): IdleCandidate[] {
  const seen = new Set<string>();
  const out: IdleCandidate[] = [];
  for (const item of items) {
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    out.push(item);
  }
  return out;
}

export function planArchiveIdle(catalog: Catalog, env: Env = process.env) {
  const binding = resolveBinding(env).state;
  const recent = new Set(binding.skills.slice(0, MAX_BOUND).map((s) => s.name));
  const idle: IdleCandidate[] = catalog.skills
    .filter((s: CatalogSkill) => s.tier === "user" && !recent.has(s.name))
    .map((s) => ({
      name: s.name,
      path: s.path,
      description: s.description,
      tier: s.tier,
      reason: recent.size
        ? "idle user-tier skill; not in current binding"
        : "no binding set — idle user-tier skill",
    }));
  const shadowed: IdleCandidate[] = catalog.shadowed
    .filter((s: CatalogSkill) => s.tier === "user")
    .map((s) => ({
      name: s.name,
      path: s.path,
      description: s.description,
      tier: s.tier,
      reason: "shadowed user-tier skill",
    }));
  const candidates = uniqueByPath([...shadowed, ...idle]);
  return {
    dry_run: true as const,
    applied: false as const,
    candidates,
    note: "archive_idle is dry-run by default; pass apply:true or --apply to move into a recoverable archive. Never silent-deletes.",
  };
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function destDirFor(root: string, name: string, fromPath: string): string {
  const safe = name.replace(/[\\/]/g, "_") || "skill";
  let dest = path.join(root, safe);
  if (!existsSync(dest)) return dest;
  const tag = Buffer.from(fromPath).toString("hex").slice(0, 8);
  dest = path.join(root, safe + "-" + tag);
  return dest;
}

function moveSkillDir(fromFile: string, toDir: string): string {
  const fromDir = path.dirname(fromFile);
  mkdirSync(path.dirname(toDir), { recursive: true });
  try {
    renameSync(fromDir, toDir);
  } catch {
    cpSync(fromDir, toDir, { recursive: true });
    rmSync(fromDir, { recursive: true, force: true });
  }
  return path.join(toDir, path.basename(fromFile));
}

export function applyArchiveIdle(catalog: Catalog, env: Env = process.env) {
  const plan = planArchiveIdle(catalog, env);
  const destRoot = path.join(archiveRoot(env), stamp());
  mkdirSync(destRoot, { recursive: true });
  const moved: ArchiveMove[] = [];
  for (const candidate of plan.candidates) {
    if (!existsSync(candidate.path)) continue;
    const toDir = destDirFor(destRoot, candidate.name, candidate.path);
    const to = moveSkillDir(candidate.path, toDir);
    moved.push({ name: candidate.name, from: candidate.path, to, reason: candidate.reason });
  }
  const manifest = path.join(destRoot, "manifest.json");
  writeFileSync(manifest, JSON.stringify({ moved, createdAt: new Date().toISOString() }, null, 2) + "\n", "utf8");
  return {
    dry_run: false as const,
    applied: true as const,
    moved,
    archive: destRoot,
    manifest,
    note: "Moved to a recoverable archive. Original skill files were not deleted without a destination copy.",
  };
}
