import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { handleTool } from "../src/tools.ts";
import { hostContractPaths, writeHostContract } from "../src/host-contract.ts";

function skillMd(name: string, desc: string): string {
  return "---\nname: " + name + "\ndescription: " + desc + "\n---\n\n# " + name + "\n";
}

function setup() {
  const home = mkdtempSync(path.join(tmpdir(), "skill-mcp-hcontract-"));
  const root = path.join(home, ".claude", "skills");
  const project = path.join(home, "proj");
  mkdirSync(path.join(root, "alpha"), { recursive: true });
  mkdirSync(path.join(root, "bravo"), { recursive: true });
  mkdirSync(path.join(root, "charlie"), { recursive: true });
  mkdirSync(project, { recursive: true });
  writeFileSync(path.join(root, "alpha", "SKILL.md"), skillMd("alpha", "alpha login fix helper"), "utf8");
  writeFileSync(path.join(root, "bravo", "SKILL.md"), skillMd("bravo", "bravo deploy helper"), "utf8");
  writeFileSync(path.join(root, "charlie", "SKILL.md"), skillMd("charlie", "charlie overlap helper"), "utf8");
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    SKILL_MCP_ROOTS: root,
    SKILL_MCP_STATE_DIR: path.join(home, "state"),
    SKILL_MCP_PROJECT_DIR: project,
  };
  return { home, project, env, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

test("writeHostContract files list only bound skills and forbid others", async () => {
  const { env, home, project, cleanup } = setup();
  await handleTool("bind_skills", { names: ["alpha", "bravo"] }, env);
  const written = writeHostContract(env);
  assert.ok(written.files.length >= 3);
  const canonical = readFileSync(written.canonical, "utf8");
  const claude = readFileSync(written.claude, "utf8");
  const cursor = readFileSync(written.cursor, "utf8");
  for (const body of [canonical, claude, cursor]) {
    assert.match(body, /only these 2 bound skills/i);
    assert.match(body, /alpha/);
    assert.match(body, /bravo/);
    assert.doesNotMatch(body, /charlie/);
    assert.match(body, /Do not load, follow, or bind any other SKILL\.md/i);
  }
  const paths = hostContractPaths(env);
  assert.equal(existsSync(paths.canonical), true);
  assert.ok(paths.claude.startsWith(home) || paths.claude.startsWith(project));
  assert.ok(paths.cursor.includes(".cursor") || paths.cursor.includes("rules"));
  cleanup();
});

test("write_host_contract tool injects Claude and Cursor rule files in one shot", async () => {
  const { env, cleanup } = setup();
  await handleTool("bind_skills", { names: ["alpha"] }, env);
  const res = await handleTool("write_host_contract", {}, env);
  assert.equal(res.isError, undefined);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.ok, true);
  assert.ok(Array.isArray(data.files));
  assert.ok(data.files.length >= 3);
  const claude = readFileSync(data.claude, "utf8");
  const cursor = readFileSync(data.cursor, "utf8");
  assert.match(claude, /only these 1 bound skill/i);
  assert.match(claude, /alpha/);
  assert.doesNotMatch(claude, /bravo/);
  assert.match(cursor, /alpha/);
  assert.doesNotMatch(cursor, /bravo/);
  cleanup();
});
