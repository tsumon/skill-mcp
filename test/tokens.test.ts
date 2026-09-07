import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { applyBudget, estimateTokens, skippedByBudget } from "../src/tokens.ts";

const loginFix = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "eval",
    "ranker-fixtures",
    "login-fix",
    "SKILL.md",
  ),
  "utf8",
);

test("estimateTokens: empty string is 0, four chars is 1", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcde"), 2);
});

test("estimateTokens: ASCII-only login-fix stays ceil(length/4) = 36", () => {
  assert.equal(Math.ceil(loginFix.length / 4), 36);
  assert.equal(estimateTokens(loginFix), 36);
});

test("estimateTokens: CJK is one token per code point; mixed adds ceil(nonCjk/4)", () => {
  assert.equal(estimateTokens("中文"), 2);
  assert.equal(estimateTokens("ab中"), 2);
});

test("applyBudget skips an over-budget middle skill and keeps a later smaller one", () => {
  const kept = applyBudget(
    [
      { name: "alpha", tokens: 10 },
      { name: "bravo", tokens: 100 },
      { name: "charlie", tokens: 5 },
    ],
    20,
  );
  assert.deepEqual(
    kept.map((s) => s.name),
    ["alpha", "charlie"],
  );
});

test("applyBudget skips a single skill larger than the cap", () => {
  assert.deepEqual(applyBudget([{ name: "huge", tokens: 50 }], 10), []);
  assert.deepEqual(applyBudget([{ name: "huge", tokens: 50 }], 0), []);
});

test("skippedByBudget reports shortlist rows applyBudget skipped", () => {
  const skills = [
    { name: "alpha", tokens: 10 },
    { name: "bravo", tokens: 100 },
    { name: "charlie", tokens: 5 },
  ];
  assert.deepEqual(
    applyBudget(skills, 20).map((s) => s.name),
    ["alpha", "charlie"],
  );
  assert.deepEqual(
    skippedByBudget(skills, 20).map((s) => s.name),
    ["bravo"],
  );
  assert.deepEqual(
    skippedByBudget(skills, 20).map((s) => s.tokens),
    [100],
  );
  assert.deepEqual(skippedByBudget([{ name: "huge", tokens: 50 }], 10), [
    { name: "huge", tokens: 50 },
  ]);
  assert.deepEqual(skippedByBudget(skills, 4000), []);
});
