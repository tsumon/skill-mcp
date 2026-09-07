import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildCatalog } from "./catalog.js";
import { homedir, resolveRoots, stateDir } from "./config.js";

type Env = NodeJS.ProcessEnv;

export const NATIVE_SKILLS_RISK =
  "Routing fight: Claude Code native skills still exist on disk. skillOverrides name-only hides descriptions from the listing so skill-mcp can suggest/bind progressively. Restore with native_skills_bypass enabled:false (or CLI restore) to return to prior host behavior.";

export function claudeSettingsPath(env: Env = process.env): string {
  return path.join(homedir(env), ".claude", "settings.json");
}

function backupPath(env: Env): string {
  return path.join(stateDir(env), "host-skills-backup.json");
}

function markerPath(env: Env): string {
  return path.join(stateDir(env), "host-skills-bypass.json");
}

function readSettings(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {};
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    return raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function catalogNames(env: Env): string[] {
  const catalog = buildCatalog(resolveRoots(env));
  const names = [...catalog.skills, ...catalog.shadowed].map((s) => s.name);
  return [...new Set(names)];
}

export function enableNativeSkillsBypass(env: Env = process.env) {
  const settingsFile = claudeSettingsPath(env);
  const backupFile = backupPath(env);
  mkdirSync(path.dirname(backupFile), { recursive: true });
  if (!existsSync(backupFile)) {
    writeFileSync(
      backupFile,
      JSON.stringify({
        existed: existsSync(settingsFile),
        text: existsSync(settingsFile) ? readFileSync(settingsFile, "utf8") : null,
      }, null, 2) + "\n",
      "utf8",
    );
  }
  const current = readSettings(settingsFile);
  const names = catalogNames(env);
  const overrides = {
    ...((current.skillOverrides && typeof current.skillOverrides === "object")
      ? current.skillOverrides as Record<string, string>
      : {}),
  };
  for (const name of names) {
    overrides[name] = "name-only";
  }
  current.skillOverrides = overrides;
  mkdirSync(path.dirname(settingsFile), { recursive: true });
  writeFileSync(settingsFile, JSON.stringify(current, null, 2) + "\n", "utf8");
  writeFileSync(
    markerPath(env),
    JSON.stringify({ enabled: true, names, settings: settingsFile }, null, 2) + "\n",
    "utf8",
  );
  return {
    enabled: true as const,
    settings: settingsFile,
    names,
    mode: "name-only" as const,
    risk: NATIVE_SKILLS_RISK,
  };
}

export function restoreNativeSkillsBypass(env: Env = process.env) {
  const settingsFile = claudeSettingsPath(env);
  const backupFile = backupPath(env);
  if (!existsSync(backupFile)) {
    return {
      enabled: false as const,
      restored: false as const,
      settings: settingsFile,
      note: "No skill-mcp bypass backup; host settings left unchanged.",
    };
  }
  const backup = JSON.parse(readFileSync(backupFile, "utf8")) as { existed: boolean; text: string | null };
  if (!backup.existed) {
    if (existsSync(settingsFile)) rmSync(settingsFile);
  } else if (typeof backup.text === "string") {
    mkdirSync(path.dirname(settingsFile), { recursive: true });
    writeFileSync(settingsFile, backup.text, "utf8");
  }
  rmSync(backupFile, { force: true });
  if (existsSync(markerPath(env))) rmSync(markerPath(env));
  return {
    enabled: false as const,
    restored: true as const,
    settings: settingsFile,
    risk: NATIVE_SKILLS_RISK,
  };
}

export function setNativeSkillsBypass(enabled: boolean, env: Env = process.env) {
  return enabled ? enableNativeSkillsBypass(env) : restoreNativeSkillsBypass(env);
}
