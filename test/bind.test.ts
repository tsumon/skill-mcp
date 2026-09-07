import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { clearBinding, readBinding, whyBinding, writeBinding } from "../src/bind.ts";
import { MAX_BOUND } from "../src/config.ts";

test("bind clear/none persists empty lean state", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "skill-mcp-bind-"));
  const env = { ...process.env, SKILL_MCP_STATE_DIR: dir };
  const cleared = clearBinding(env);
  assert.equal(cleared.none, true);
  assert.deepEqual(cleared.skills, []);
  const again = readBinding(env);
  assert.equal(again.none, true);
  assert.match(whyBinding(again), /No skills bound/);
  rmSync(dir, { recursive: true, force: true });
});

test("bind writes lean view only and caps at MAX_BOUND", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "skill-mcp-bind-"));
  const env = { ...process.env, SKILL_MCP_STATE_DIR: dir };
  const skills = ["a", "b", "c", "d"].map((name) => ({
    name,
    description: name + " desc",
    path: "/tmp/" + name + "/SKILL.md",
    tokens: 10,
  }));
  writeBinding({
    version: 1,
    updatedAt: new Date().toISOString(),
    none: false,
    skills,
    reasons: { a: "matched: a" },
    source: "manual",
  }, env);
  const got = readBinding(env);
  assert.equal(got.skills.length, MAX_BOUND);
  assert.equal(MAX_BOUND, 3);
  assert.deepEqual(got.skills.map((s) => s.name), ["a", "b", "c"]);
  assert.ok(!("body" in (got.skills[0] as object)));
  assert.equal(got.skills[0].description, "a desc");
  assert.match(whyBinding(got), /matched: a/);
  rmSync(dir, { recursive: true, force: true });
});
