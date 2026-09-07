import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("CI workflow runs tests, TypeScript build, and offline eval goldens", () => {
  const file = path.join(repo, ".github", "workflows", "ci.yml");
  assert.equal(existsSync(file), true);
  const body = readFileSync(file, "utf8");
  assert.match(body, /pull_request/);
  assert.match(body, /branches:\s*\n\s*-\s*main/m);
  assert.match(body, /npm test/);
  assert.match(body, /npx tsc --noEmit|npm run build/);
  assert.match(body, /npm run eval/);
});
