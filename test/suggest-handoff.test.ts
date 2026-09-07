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
  const home = mkdtempSync(path.join(tmpdir(), "skill-mcp-handoff-"));
  const root = path.join(home, ".claude", "skills");
  const state = path.join(home, "state");
  mkdirSync(path.join(root, "alpha"), { recursive: true });
  writeFileSync(path.join(root, "alpha", "SKILL.md"), skillMd("alpha", "alpha login fix helper"), "utf8");
  mkdirSync(path.join(root, "bravo"), { recursive: true });
  writeFileSync(path.join(root, "bravo", "SKILL.md"), skillMd("bravo", "bravo deploy helper"), "utf8");
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    SKILL_MCP_ROOTS: root,
    SKILL_MCP_STATE_DIR: state,
  };
  return { env, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

test("suggest_skills returns names ready for bind_skills plus a next step", async () => {
  const { env, cleanup } = setup();
  const suggested = await handleTool("suggest_skills", { prompt: "alpha login" }, env);
  assert.equal(suggested.isError, undefined);
  const data = JSON.parse(suggested.content[0].text);
  assert.ok(Array.isArray(data.names), "suggest must include names[] for bind_skills");
  assert.deepEqual(data.names, data.skills.map((s: { name: string }) => s.name));
  assert.ok(data.names.includes("alpha"));
  assert.match(String(data.next_step), /bind_skills/);
  assert.match(String(data.next_step), /alpha/);
  cleanup();
});

test("suggest names bind without rewriting the list", async () => {
  const { env, cleanup } = setup();
  const suggested = JSON.parse((await handleTool("suggest_skills", { prompt: "alpha login" }, env)).content[0].text);
  const bound = await handleTool("bind_skills", { names: suggested.names }, env);
  assert.equal(bound.isError, undefined);
  const binding = JSON.parse(bound.content[0].text);
  assert.deepEqual(
    binding.skills.map((s: { name: string }) => s.name),
    suggested.names,
  );
  cleanup();
});
