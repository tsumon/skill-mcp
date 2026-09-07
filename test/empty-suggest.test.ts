import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { handleTool } from "../src/tools.ts";
import { suggestSkills } from "../src/suggest.ts";
import type { CatalogSkill } from "../src/catalog.ts";

function skill(name: string, description: string): CatalogSkill {
  return { name, path: "/tmp/" + name + "/SKILL.md", description, h2: description, tier: "user", tokens: 10 };
}

function skillMd(name: string, desc: string): string {
  return "---\nname: " + name + "\ndescription: " + desc + "\n---\n\n# " + name + "\n";
}

function setup() {
  const home = mkdtempSync(path.join(tmpdir(), "skill-mcp-empty-"));
  const root = path.join(home, ".claude", "skills");
  mkdirSync(path.join(root, "alpha"), { recursive: true });
  writeFileSync(path.join(root, "alpha", "SKILL.md"), skillMd("alpha", "alpha login fix helper"), "utf8");
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    SKILL_MCP_ROOTS: root,
    SKILL_MCP_STATE_DIR: path.join(home, "state"),
  };
  return { env, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

const EMPTY_EN = "This directory has no matching skill for that prompt.";

test("empty suggestSkills result names the missing skill in human language", () => {
  const result = suggestSkills([skill("alpha", "alpha login fix helper")], "zzzz-unrelated-topic-xyz");
  assert.equal(result.none, true);
  assert.deepEqual(result.names, []);
  assert.equal(result.empty_message, EMPTY_EN);
  assert.match(result.empty_message_zh, /该目录下没有/);
  assert.match(result.next_step, /no matching skill/i);
  assert.doesNotMatch(result.next_step, /undefined|null|\[object/i);
});

test("suggest_skills tool says the directory has no such skill when nothing matches", async () => {
  const { env, cleanup } = setup();
  const res = await handleTool("suggest_skills", { prompt: "zzzz-unrelated-topic-xyz" }, env);
  assert.equal(res.isError, undefined);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.none, true);
  assert.deepEqual(data.names, []);
  assert.equal(data.empty_message, EMPTY_EN);
  assert.match(String(data.empty_message_zh), /该目录下没有/);
  assert.match(String(data.next_step), /This directory has no matching skill/i);
  cleanup();
});
