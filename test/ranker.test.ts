import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { loadSkillMd, MAX_BOUND_SKILLS, rank, tokenize, type SkillRecord } from "../src/ranker.ts";

const fixturesRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "eval",
  "ranker-fixtures",
);

function loadCatalog() {
  return readdirSync(fixturesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const skillPath = path.join(fixturesRoot, d.name, "SKILL.md");
      return loadSkillMd(skillPath, readFileSync(skillPath, "utf8"));
    });
}

test("tokenize splits ascii words and cjk overlapping bigrams", () => {
  assert.deepEqual(tokenize("Login 500"), ["login", "500"]);
  assert.deepEqual(tokenize("a"), []);
  assert.deepEqual(tokenize("路由技能"), ["路由", "由技", "技能"]);
  assert.deepEqual(tokenize("中"), ["中"]);
});

test("golden: login 500 error -> login-fix", () => {
  const ranked = rank(loadCatalog(), "login 500 error");
  assert.deepEqual(
    ranked.skills.map((s) => s.name),
    ["login-fix"],
  );
  assert.equal(ranked.none, false);
});

test("golden: hello there -> none", () => {
  const ranked = rank(loadCatalog(), "hello there");
  assert.deepEqual(ranked.skills, []);
  assert.equal(ranked.none, true);
});

test("golden: 路由 技能 -> 中文路由", () => {
  const ranked = rank(loadCatalog(), "路由 技能");
  assert.deepEqual(
    ranked.skills.map((s) => s.name),
    ["中文路由"],
  );
});

test("golden: alpha bravo -> alpha then bravo", () => {
  const ranked = rank(loadCatalog(), "alpha bravo");
  assert.deepEqual(
    ranked.skills.map((s) => s.name),
    ["alpha", "bravo"],
  );
  for (const s of ranked.skills) {
    assert.ok(s.score >= 0.15, `${s.name} score ${s.score}`);
  }
});

test("golden: overlap token shared caps at three with overlap-delta overflow", () => {
  const ranked = rank(loadCatalog(), "overlap token shared");
  assert.equal(ranked.skills.length, MAX_BOUND_SKILLS);
  assert.equal(MAX_BOUND_SKILLS, 3);
  assert.deepEqual(
    ranked.skills.map((s) => s.name),
    ["overlap-alpha", "overlap-bravo", "overlap-charlie"],
  );
  assert.deepEqual(
    ranked.overflow.map((s) => s.name),
    ["overlap-delta"],
  );
  assert.ok(ranked.overflow.every((s) => s.score >= 0.15));
  assert.equal(ranked.none, false);
});

test("four overlapping skills cap at MAX_BOUND_SKILLS", () => {
  const catalog: SkillRecord[] = ["delta", "alpha", "charlie", "bravo"].map((name) => ({
    name,
    path: `/tmp/${name}/SKILL.md`,
    description: "overlap token shared",
    h2: "overlap",
  }));
  const ranked = rank(catalog, "overlap token shared");
  assert.equal(ranked.skills.length, MAX_BOUND_SKILLS);
  assert.equal(MAX_BOUND_SKILLS, 3);
  assert.deepEqual(
    ranked.skills.map((s) => s.name),
    ["alpha", "bravo", "charlie"],
  );
  assert.equal(ranked.none, false);
});

test("four overlapping skills put the 4th above-threshold name in overflow", () => {
  const catalog: SkillRecord[] = ["delta", "alpha", "charlie", "bravo"].map((name) => ({
    name,
    path: `/tmp/${name}/SKILL.md`,
    description: "overlap token shared",
    h2: "overlap",
  }));
  const ranked = rank(catalog, "overlap token shared");
  assert.deepEqual(
    ranked.overflow.map((s) => s.name),
    ["delta"],
  );
  assert.ok(ranked.overflow.every((s) => s.score >= 0.15));
  assert.deepEqual(
    ranked.skills.map((s) => s.name),
    ["alpha", "bravo", "charlie"],
  );
});

test("rank overflow is empty when fewer than MAX_BOUND_SKILLS match", () => {
  const ranked = rank(loadCatalog(), "login 500 error");
  assert.deepEqual(ranked.overflow, []);
  const none = rank(loadCatalog(), "hello there");
  assert.deepEqual(none.overflow, []);
  assert.equal(none.none, true);
});

test("same catalog and prompt produce identical name lists", () => {
  const catalog = loadCatalog();
  const a = rank(catalog, "login 500 error");
  const b = rank(catalog, "login 500 error");
  assert.deepEqual(
    a.skills.map((s) => s.name),
    b.skills.map((s) => s.name),
  );
});
