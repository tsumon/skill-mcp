import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hostConfigPaths, installHostConfigs } from "../src/install.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Mac Claude Desktop path sits under Library/Application Support", () => {
  const home = "/Users/ada";
  const hosts = hostConfigPaths(home, "darwin");
  assert.equal(
    hosts.claude,
    path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
  );
  assert.equal(hosts.cursor, path.join(home, ".cursor", "mcp.json"));
  assert.equal(path.isAbsolute(hosts.claude), true);
  assert.equal(path.isAbsolute(hosts.cursor), true);
});

test("Linux Claude Desktop path sits under .config/Claude", () => {
  const home = "/home/ada";
  const hosts = hostConfigPaths(home, "linux");
  assert.equal(hosts.claude, path.join(home, ".config", "Claude", "claude_desktop_config.json"));
  assert.equal(hosts.cursor, path.join(home, ".cursor", "mcp.json"));
});

test("installHostConfigs merges absolute-path skill-mcp into Claude and Cursor mcp.json", () => {
  const home = mkdtempSync(path.join(tmpdir(), "skill-mcp-attach-"));
  const serverPath = path.join(home, "opt", "skill-mcp", "dist", "index.js");
  mkdirSync(path.dirname(serverPath), { recursive: true });
  writeFileSync(serverPath, "#!/usr/bin/env node\n", "utf8");
  const written = installHostConfigs({
    serverPath,
    nodePath: "/usr/bin/node",
    home,
    platform: "linux",
    writeHosts: true,
  });
  assert.ok(written.claude);
  assert.ok(written.cursor);
  const claude = JSON.parse(readFileSync(written.claude!, "utf8"));
  const cursor = JSON.parse(readFileSync(written.cursor!, "utf8"));
  const claudeArgs = claude.mcpServers["skill-mcp"].args;
  const cursorArgs = cursor.mcpServers["skill-mcp"].args;
  assert.equal(path.isAbsolute(claudeArgs[0]), true);
  assert.equal(claudeArgs[0], serverPath);
  assert.equal(cursorArgs[0], serverPath);
  assert.equal(claude.mcpServers["skill-mcp"].command, "/usr/bin/node");
  assert.doesNotMatch(claudeArgs[0], /^\.\//);
  assert.equal(existsSync(written.claude!), true);
  assert.equal(existsSync(written.cursor!), true);
  rmSync(home, { recursive: true, force: true });
});

test("install.sh is the one-shot attach entry and invokes install-cli", () => {
  const script = path.join(repo, "scripts", "install.sh");
  assert.equal(existsSync(script), true);
  const body = readFileSync(script, "utf8");
  assert.match(body, /npm run build/);
  assert.match(body, /node dist\/install-cli\.js/);
  assert.match(body, /set -euo pipefail/);
});
