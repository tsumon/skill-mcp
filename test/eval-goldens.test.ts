import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_BOUND } from "../src/config.ts";
import { loadEvalCases, runEvalCase, runEvalSuite } from "../src/eval.ts";

test("offline CJK goldens rank ZH/JA/KO skills", () => {
  const cases = loadEvalCases().filter((c) => c.lang === "zh" || c.lang === "ja" || c.lang === "ko");
  assert.ok(cases.length >= 3, "need ZH, JA, and KO goldens");
  for (const c of cases) {
    const result = runEvalCase(c);
    assert.equal(result.ok, true, result.detail);
    assert.deepEqual(result.names, c.expect);
  }
});

test("multi-skill conflict eval caps at 3 and keeps expected winners", () => {
  const cases = loadEvalCases().filter((c) => c.conflict);
  assert.ok(cases.length >= 1);
  for (const c of cases) {
    const result = runEvalCase(c);
    assert.equal(result.ok, true, result.detail);
    assert.ok(result.names.length <= MAX_BOUND);
    assert.equal(MAX_BOUND, 3);
  }
});

test("eval suite script reports all goldens passing offline", () => {
  const suite = runEvalSuite();
  assert.equal(suite.failed, 0, suite.failures.join("\n"));
  assert.ok(suite.passed >= 4);
});
