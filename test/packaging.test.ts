import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("pack.sh compiles a single-file binary with bun and documents the node fallback", () => {
  const script = path.join(repo, "scripts", "pack.sh");
  assert.equal(existsSync(script), true);
  const body = readFileSync(script, "utf8");
  assert.match(body, /bun build --compile/);
  assert.match(body, /fallback: npm run build && node dist\/index\.js/);
  const docs = readFileSync(path.join(repo, "docs", "PACKAGING.md"), "utf8");
  assert.match(docs, /bun compile/);
  assert.match(docs, /node dist\/index\.js/);
});
