import assert from "node:assert/strict";
import { test } from "node:test";
import type { CatalogSkill } from "../src/catalog.ts";
import { suggestSkills } from "../src/suggest.ts";
import { MAX_BOUND } from "../src/config.ts";

function skill(name: string, tokens: number, description: string): CatalogSkill {
  return { name, path: "/tmp/" + name + "/SKILL.md", description, h2: description, tier: "user", tokens };
}

test("suggest_skills hard cap 3 with cap drops", () => {
  const catalog = ["alpha", "bravo", "charlie", "delta"].map((n) =>
    skill(n, 10, "overlap token shared"),
  );
  const result = suggestSkills(catalog, "overlap token shared", 4000);
  assert.equal(result.skills.length, MAX_BOUND);
  assert.equal(result.cap, 3);
  assert.ok(result.dropped.some((d) => d.why === "cap"));
});

test("suggest_skills budget drops without raising cap", () => {
  const catalog = [
    skill("alpha", 50, "overlap token shared"),
    skill("bravo", 50, "overlap token shared"),
    skill("charlie", 50, "overlap token shared"),
  ];
  const result = suggestSkills(catalog, "overlap token shared", 60);
  assert.ok(result.skills.length <= MAX_BOUND);
  assert.ok(result.skills.length <= 1);
  assert.ok(result.dropped.some((d) => d.why === "budget"));
  assert.equal(result.budget.max_tokens, 60);
});
