import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { handleTool } from "../src/tools.ts";

function skillMd(name: string, desc: string): string {
  return "---\nname: " + name + "\ndescription: " + desc + "\n---\n\n# " + name + "\n\n## Steps\nDo " + name + ".\n";
}

function setup() {
  const home = mkdtempSync(path.join(tmpdir(), "skill-mcp-home-"));
  const root = path.join(home, ".claude", "skills");
  const state = path.join(home, "state");
  mkdirSync(path.join(root, "alpha"), { recursive: true });
  mkdirSync(path.join(root, "bravo"), { recursive: true });
  writeFileSync(path.join(root, "alpha", "SKILL.md"), skillMd("alpha", "alpha login fix helper"), "utf8");
  writeFileSync(path.join(root, "bravo", "SKILL.md"), skillMd("bravo", "bravo deploy helper"), "utf8");
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    SKILL_MCP_ROOTS: root,
    SKILL_MCP_STATE_DIR: state,
  };
  return { home, env, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

test("list_skills returns lean catalog", () => {
  const { env, cleanup } = setup();
  const res = handleTool("list_skills", {}, env);
  assert.equal(res.isError, undefined);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.count, 2);
  assert.ok(data.skills.every((s: { description: string }) => s.description));
  assert.ok(data.skills.every((s: Record<string, unknown>) => !("body" in s)));
  cleanup();
});

test("bind_skills rejects more than 3 names", () => {
  const { env, cleanup } = setup();
  const res = handleTool("bind_skills", { names: ["a", "b", "c", "d"] }, env);
  assert.equal(res.isError, true);
  cleanup();
});

test("bind_skills and get_binding roundtrip", () => {
  const { env, cleanup } = setup();
  const bound = handleTool("bind_skills", { names: ["alpha"] }, env);
  assert.equal(bound.isError, undefined);
  const got = handleTool("get_binding", {}, env);
  const data = JSON.parse(got.content[0].text);
  assert.deepEqual(data.skills.map((s: { name: string }) => s.name), ["alpha"]);
  const why = handleTool("why", {}, env);
  assert.match(why.content[0].text, /alpha/);
  cleanup();
});

test("doctor reports roots", () => {
  const { env, cleanup } = setup();
  const res = handleTool("doctor", {}, env);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.ok, true);
  assert.equal(data.skills, 2);
  cleanup();
});

test("archive_idle is dry-run", () => {
  const { env, cleanup } = setup();
  handleTool("bind_skills", { names: ["alpha"] }, env);
  const res = handleTool("archive_idle", {}, env);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.dry_run, true);
  assert.ok(data.candidates.some((c: { name: string }) => c.name === "bravo"));
  cleanup();
});

test("read_skill returns body only when asked", () => {
  const { env, cleanup } = setup();
  const res = handleTool("read_skill", { name: "alpha" }, env);
  const data = JSON.parse(res.content[0].text);
  assert.match(data.body, /name: alpha/);
  cleanup();
});
