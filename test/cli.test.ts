import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runCli } from "../src/cli.ts";
import { clearCatalogCache } from "../src/tools.ts";

function skillMd(name: string, desc: string): string {
  return "---\nname: " + name + "\ndescription: " + desc + "\n---\n\n# " + name + "\n";
}

function setup() {
  const home = mkdtempSync(path.join(tmpdir(), "skill-mcp-cli-"));
  const root = path.join(home, ".claude", "skills");
  mkdirSync(path.join(root, "alpha"), { recursive: true });
  mkdirSync(path.join(root, "idle-one"), { recursive: true });
  mkdirSync(path.join(home, "proj"), { recursive: true });
  writeFileSync(path.join(root, "alpha", "SKILL.md"), skillMd("alpha", "alpha login fix helper"), "utf8");
  writeFileSync(path.join(root, "idle-one", "SKILL.md"), skillMd("idle-one", "idle unused helper"), "utf8");
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    SKILL_MCP_ROOTS: root,
    SKILL_MCP_STATE_DIR: path.join(home, "state"),
    SKILL_MCP_PROJECT_DIR: path.join(home, "proj"),
  };
  clearCatalogCache();
  return { home, root, env, cleanup: () => { clearCatalogCache(); rmSync(home, { recursive: true, force: true }); } };
}

test("CLI archive-idle is dry-run unless --apply", async () => {
  const { env, root, cleanup } = setup();
  const { handleTool } = await import("../src/tools.ts");
  await handleTool("bind_skills", { names: ["alpha"] }, env);
  const dry = await runCli(["archive-idle"], env);
  assert.equal(dry.ok, true);
  assert.match(JSON.stringify(dry.data), /"dry_run":true/);
  assert.equal(existsSync(path.join(root, "idle-one", "SKILL.md")), true);
  const applied = await runCli(["archive-idle", "--apply"], env);
  assert.equal(applied.ok, true);
  assert.match(JSON.stringify(applied.data), /"applied":true/);
  assert.equal(existsSync(path.join(root, "idle-one", "SKILL.md")), false);
  cleanup();
});

test("CLI write-contract writes host files listing only bound skills", async () => {
  const { env, cleanup } = setup();
  const { handleTool } = await import("../src/tools.ts");
  await handleTool("bind_skills", { names: ["alpha"] }, env);
  const result = await runCli(["write-contract"], env);
  assert.equal(result.ok, true);
  const files = result.data as { claude: string; cursor: string };
  assert.match(readFileSync(files.claude, "utf8"), /alpha/);
  assert.doesNotMatch(readFileSync(files.claude, "utf8"), /idle-one/);
  cleanup();
});

test("CLI native-skills enable then restore reverts settings", async () => {
  const { env, home, cleanup } = setup();
  mkdirSync(path.join(home, ".claude"), { recursive: true });
  writeFileSync(path.join(home, ".claude", "settings.json"), JSON.stringify({ theme: "dark" }, null, 2) + "\n", "utf8");
  const enabled = await runCli(["native-skills", "enable"], env);
  assert.equal(enabled.ok, true);
  const settings = JSON.parse(readFileSync(path.join(home, ".claude", "settings.json"), "utf8"));
  assert.equal(settings.skillOverrides.alpha, "name-only");
  const restored = await runCli(["native-skills", "restore"], env);
  assert.equal(restored.ok, true);
  const after = JSON.parse(readFileSync(path.join(home, ".claude", "settings.json"), "utf8"));
  assert.deepEqual(after, { theme: "dark" });
  cleanup();
});
