import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { handleTool, clearCatalogCache } from "../src/tools.ts";

function skillMd(name: string, desc: string): string {
  return "---\nname: " + name + "\ndescription: " + desc + "\n---\n\n# " + name + "\n";
}

function writeSkill(root: string, name: string, desc: string): string {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "SKILL.md");
  writeFileSync(file, skillMd(name, desc), "utf8");
  return file;
}

function setup() {
  const home = mkdtempSync(path.join(tmpdir(), "skill-mcp-archive-"));
  const userRoot = path.join(home, ".claude", "skills");
  const projectRoot = path.join(home, "proj", ".claude", "skills");
  writeSkill(userRoot, "alpha", "alpha login fix helper");
  writeSkill(userRoot, "bravo", "bravo deploy helper");
  writeSkill(userRoot, "idle-one", "idle unused helper");
  writeSkill(userRoot, "shadowed-user", "user copy of shadowed");
  writeSkill(projectRoot, "shadowed-user", "project copy of shadowed");
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    SKILL_MCP_ROOTS: userRoot,
    SKILL_MCP_PROJECT_ROOTS: projectRoot,
    SKILL_MCP_STATE_DIR: path.join(home, "state"),
    SKILL_MCP_PROJECT_DIR: path.join(home, "proj"),
  };
  clearCatalogCache();
  return { home, userRoot, env, cleanup: () => { clearCatalogCache(); rmSync(home, { recursive: true, force: true }); } };
}

test("archive_idle defaults to dry-run and does not move files", async () => {
  const { env, userRoot, cleanup } = setup();
  await handleTool("bind_skills", { names: ["alpha"] }, env);
  const before = readFileSync(path.join(userRoot, "idle-one", "SKILL.md"), "utf8");
  const res = await handleTool("archive_idle", {}, env);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.dry_run, true);
  assert.equal(data.applied, false);
  assert.ok(data.candidates.some((c: { name: string }) => c.name === "idle-one"));
  assert.ok(data.candidates.some((c: { name: string; reason: string }) => c.name === "shadowed-user" && /shadow/i.test(c.reason)));
  assert.ok(!data.candidates.some((c: { name: string }) => c.name === "alpha"));
  assert.equal(existsSync(path.join(userRoot, "idle-one", "SKILL.md")), true);
  assert.equal(readFileSync(path.join(userRoot, "idle-one", "SKILL.md"), "utf8"), before);
  assert.equal(existsSync(path.join(userRoot, "bravo", "SKILL.md")), true);
  cleanup();
});

test("archive_idle apply moves idle and shadowed user skills to a recoverable archive", async () => {
  const { env, userRoot, home, cleanup } = setup();
  await handleTool("bind_skills", { names: ["alpha"] }, env);
  const original = readFileSync(path.join(userRoot, "idle-one", "SKILL.md"), "utf8");
  const shadowed = readFileSync(path.join(userRoot, "shadowed-user", "SKILL.md"), "utf8");
  const res = await handleTool("archive_idle", { apply: true }, env);
  assert.equal(res.isError, undefined);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.dry_run, false);
  assert.equal(data.applied, true);
  assert.ok(data.moved.some((m: { name: string }) => m.name === "idle-one"));
  assert.ok(data.moved.some((m: { name: string }) => m.name === "shadowed-user"));
  assert.equal(existsSync(path.join(userRoot, "idle-one", "SKILL.md")), false);
  assert.equal(existsSync(path.join(userRoot, "shadowed-user", "SKILL.md")), false);
  assert.equal(existsSync(path.join(userRoot, "alpha", "SKILL.md")), true);
  const idleMove = data.moved.find((m: { name: string }) => m.name === "idle-one");
  assert.equal(existsSync(idleMove.to), true);
  assert.equal(readFileSync(idleMove.to, "utf8"), original);
  const shadowMove = data.moved.find((m: { name: string }) => m.name === "shadowed-user");
  assert.equal(readFileSync(shadowMove.to, "utf8"), shadowed);
  assert.match(String(idleMove.to), /archive/);
  assert.ok(idleMove.to.startsWith(path.join(home, "state")) || idleMove.to.includes("archive"));
  cleanup();
});

test("archive_idle never silently deletes — apply archives, dry-run leaves tree intact", async () => {
  const { env, userRoot, cleanup } = setup();
  await handleTool("bind_skills", { names: ["alpha"] }, env);
  await handleTool("archive_idle", {}, env);
  assert.equal(existsSync(path.join(userRoot, "bravo", "SKILL.md")), true);
  const applied = JSON.parse((await handleTool("archive_idle", { apply: true }, env)).content[0].text);
  for (const moved of applied.moved) {
    assert.equal(existsSync(moved.from), false);
    assert.equal(existsSync(moved.to), true);
    assert.match(readFileSync(moved.to, "utf8"), /name:/);
  }
  assert.equal(existsSync(path.join(userRoot, "alpha", "SKILL.md")), true);
  cleanup();
});
