import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { handleTool } from "../src/tools.ts";

function skillMd(name: string, desc: string): string {
  return "---\nname: " + name + "\ndescription: " + desc + "\n---\n\n# " + name + "\n\n## Steps\nDo " + name + ".\n";
}

function setup() {
  const home = mkdtempSync(path.join(tmpdir(), "skill-mcp-rescan-"));
  const root = path.join(home, ".claude", "skills");
  const state = path.join(home, "state");
  mkdirSync(path.join(root, "alpha"), { recursive: true });
  writeFileSync(path.join(root, "alpha", "SKILL.md"), skillMd("alpha", "alpha login fix helper"), "utf8");
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    SKILL_MCP_ROOTS: root,
    SKILL_MCP_STATE_DIR: state,
  };
  return {
    home,
    root,
    env,
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}

test("list_skills does not see a new skill until rescan_skills", async () => {
  const { env, root, cleanup } = setup();
  const before = JSON.parse((await handleTool("list_skills", {}, env)).content[0].text);
  assert.deepEqual(
    before.skills.map((s: { name: string }) => s.name),
    ["alpha"],
  );

  mkdirSync(path.join(root, "charlie"), { recursive: true });
  writeFileSync(path.join(root, "charlie", "SKILL.md"), skillMd("charlie", "charlie overlap helper"), "utf8");

  const stale = JSON.parse((await handleTool("list_skills", {}, env)).content[0].text);
  assert.deepEqual(
    stale.skills.map((s: { name: string }) => s.name),
    ["alpha"],
    "catalog must stay cached until rescan",
  );

  const rescanned = await handleTool("rescan_skills", {}, env);
  assert.equal(rescanned.isError, undefined);
  const scan = JSON.parse(rescanned.content[0].text);
  assert.ok(scan.skills.map((s: { name: string }) => s.name).includes("charlie"));
  assert.equal(scan.added.includes("charlie"), true);

  const after = JSON.parse((await handleTool("list_skills", {}, env)).content[0].text);
  assert.ok(after.skills.map((s: { name: string }) => s.name).includes("charlie"));

  const suggested = JSON.parse(
    (await handleTool("suggest_skills", { prompt: "charlie overlap" }, env)).content[0].text,
  );
  assert.ok(suggested.names.includes("charlie"));
  cleanup();
});

test("rescan_skills reports removed skills after a file disappears", async () => {
  const { env, root, cleanup } = setup();
  await handleTool("list_skills", {}, env);
  mkdirSync(path.join(root, "bravo"), { recursive: true });
  writeFileSync(path.join(root, "bravo", "SKILL.md"), skillMd("bravo", "bravo deploy helper"), "utf8");
  await handleTool("rescan_skills", {}, env);

  rmSync(path.join(root, "bravo"), { recursive: true, force: true });
  const rescanned = JSON.parse((await handleTool("rescan_skills", {}, env)).content[0].text);
  assert.ok(rescanned.removed.includes("bravo"));
  assert.equal(
    JSON.parse((await handleTool("list_skills", {}, env)).content[0].text).skills.some(
      (s: { name: string }) => s.name === "bravo",
    ),
    false,
  );
  cleanup();
});
