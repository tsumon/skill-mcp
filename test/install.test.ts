import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { generateMcpSnippets, writeMcpOutput } from "../src/install.ts";

test("mcp.json snippets use an absolute server path for Claude and Cursor", () => {
  const serverPath = "/opt/skill-mcp/dist/index.js";
  const snippets = generateMcpSnippets({ serverPath, nodePath: "/usr/bin/node" });
  assert.equal(path.isAbsolute(snippets.claude.mcpServers["skill-mcp"].args[0]), true);
  assert.equal(path.isAbsolute(snippets.cursor.mcpServers["skill-mcp"].args[0]), true);
  assert.equal(snippets.claude.mcpServers["skill-mcp"].args[0], serverPath);
  assert.equal(snippets.cursor.mcpServers["skill-mcp"].command, "/usr/bin/node");
  assert.doesNotMatch(snippets.claude.mcpServers["skill-mcp"].args[0], /^\.\//);
});

test("committed docs/output snippets use absolute server paths", () => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const claude = JSON.parse(readFileSync(path.join(repo, "docs", "output", "claude-desktop.mcp.json"), "utf8"));
  const cursor = JSON.parse(readFileSync(path.join(repo, "docs", "output", "cursor.mcp.json"), "utf8"));
  const claudePath = claude.mcpServers["skill-mcp"].args[0];
  const cursorPath = cursor.mcpServers["skill-mcp"].args[0];
  assert.equal(path.isAbsolute(claudePath), true);
  assert.equal(path.isAbsolute(cursorPath), true);
  assert.equal(claudePath, cursorPath);
  assert.match(claudePath, /dist\/index\.js$/);
});

test("writeMcpOutput writes absolute-path files under docs/output", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "skill-mcp-install-"));
  const serverPath = path.join(dir, "dist", "index.js");
  const written = writeMcpOutput({
    outputDir: path.join(dir, "docs", "output"),
    serverPath,
    nodePath: "/usr/bin/node",
  });
  const claude = JSON.parse(readFileSync(written.claude, "utf8"));
  const cursor = JSON.parse(readFileSync(written.cursor, "utf8"));
  assert.equal(path.isAbsolute(claude.mcpServers["skill-mcp"].args[0]), true);
  assert.equal(claude.mcpServers["skill-mcp"].args[0], serverPath);
  assert.equal(cursor.mcpServers["skill-mcp"].args[0], serverPath);
  rmSync(dir, { recursive: true, force: true });
});
