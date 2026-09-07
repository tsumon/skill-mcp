import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { handleTool, clearCatalogCache } from "../src/tools.ts";
import { claudeSettingsPath } from "../src/host-skills.ts";

function skillMd(name: string, desc: string): string {
  return "---\nname: " + name + "\ndescription: " + desc + "\n---\n\n# " + name + "\n";
}

function setup(existingSettings?: Record<string, unknown>) {
  const home = mkdtempSync(path.join(tmpdir(), "skill-mcp-native-"));
  const root = path.join(home, ".claude", "skills");
  mkdirSync(path.join(root, "alpha"), { recursive: true });
  mkdirSync(path.join(root, "bravo"), { recursive: true });
  writeFileSync(path.join(root, "alpha", "SKILL.md"), skillMd("alpha", "alpha login fix helper with a long description"), "utf8");
  writeFileSync(path.join(root, "bravo", "SKILL.md"), skillMd("bravo", "bravo deploy helper with a long description"), "utf8");
  if (existingSettings) {
    mkdirSync(path.join(home, ".claude"), { recursive: true });
    writeFileSync(path.join(home, ".claude", "settings.json"), JSON.stringify(existingSettings, null, 2) + "\n", "utf8");
  }
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    SKILL_MCP_ROOTS: root,
    SKILL_MCP_STATE_DIR: path.join(home, "state"),
    SKILL_MCP_PROJECT_DIR: path.join(home, "proj"),
  };
  clearCatalogCache();
  return { home, env, cleanup: () => { clearCatalogCache(); rmSync(home, { recursive: true, force: true }); } };
}

test("enable native-skills bypass writes Claude skillOverrides name-only", async () => {
  const { env, home, cleanup } = setup({ theme: "dark" });
  const res = await handleTool("native_skills_bypass", { enabled: true }, env);
  assert.equal(res.isError, undefined);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.enabled, true);
  const settingsFile = claudeSettingsPath(env);
  assert.equal(settingsFile, path.join(home, ".claude", "settings.json"));
  const settings = JSON.parse(readFileSync(settingsFile, "utf8"));
  assert.equal(settings.theme, "dark");
  assert.equal(settings.skillOverrides.alpha, "name-only");
  assert.equal(settings.skillOverrides.bravo, "name-only");
  assert.ok(!JSON.stringify(settings.skillOverrides).includes("long description"));
  cleanup();
});

test("restore native-skills bypass reverts host settings in one step", async () => {
  const original = { theme: "dark", skillOverrides: { keepme: "on" } };
  const { env, home, cleanup } = setup(original);
  await handleTool("native_skills_bypass", { enabled: true }, env);
  const enabled = JSON.parse(readFileSync(path.join(home, ".claude", "settings.json"), "utf8"));
  assert.equal(enabled.skillOverrides.alpha, "name-only");
  const res = await handleTool("native_skills_bypass", { enabled: false }, env);
  assert.equal(res.isError, undefined);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.enabled, false);
  assert.equal(data.restored, true);
  const restored = JSON.parse(readFileSync(path.join(home, ".claude", "settings.json"), "utf8"));
  assert.deepEqual(restored, original);
  assert.equal(restored.skillOverrides.keepme, "on");
  assert.ok(!("alpha" in restored.skillOverrides));
  cleanup();
});

test("restore is a no-op when bypass was never enabled", async () => {
  const { env, home, cleanup } = setup({ theme: "light" });
  const before = readFileSync(path.join(home, ".claude", "settings.json"), "utf8");
  const res = await handleTool("native_skills_bypass", { enabled: false }, env);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.enabled, false);
  assert.equal(readFileSync(path.join(home, ".claude", "settings.json"), "utf8"), before);
  cleanup();
});
