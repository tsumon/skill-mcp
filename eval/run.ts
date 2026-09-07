#!/usr/bin/env node
import { runEvalSuite } from "../src/eval.ts";

const suite = runEvalSuite();
for (const result of suite.results) {
  console.log((result.ok ? "PASS" : "FAIL") + "  " + result.detail);
}
console.log(suite.passed + " passed, " + suite.failed + " failed");
if (suite.failed > 0) process.exit(1);
