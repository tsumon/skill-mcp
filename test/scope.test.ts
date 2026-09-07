import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { handleTool, resetSessionBindings } from "../src/tools.ts";

function skillMd(name: string, desc: string): string {
  return "---\nname: " + name + "\ndescription: " + desc + "\n---\n\n# " + name + "\n";
}

function setup() {
  const home = mkdtempSync(path.join(tmpdir(), "skill-mcp-scope-"));
  const root = path.join(home, ".claude", "skills");
  const project = path.join(home, "proj");
  mkdirSync(path.join(root, "alpha"), { recursive: true });
  mkdirSync(path.join(root, "bravo"), { recursive: true });
  mkdirSync(path.join(root, "charlie"), { recursive: true });
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
    SKILL_MCP_SESSION_ID: "sess-" + path.basename(home),
  };
  resetSessionBindings();
  return { home, project, env, cleanup: () => { resetSessionBindings(); rmSync(home, { recursive: true, force: true }); } };
}

test("session bind does not overwrite global or project files", async () => {
  const { env, home, project, cleanup } = setup();
  await handleTool("bind_skills", { names: ["alpha"], scope: "global" }, env);
  await handleTool("bind_skills", { names: ["bravo"], scope: "project" }, env);
  await handleTool("bind_skills", { names: ["charlie"], scope: "session" }, env);

  const globalFile = path.join(home, "state", "binding.json");
  const projectFile = path.join(project, ".skill-mcp", "binding.json");
  assert.equal(existsSync(globalFile), true);
  assert.equal(existsSync(projectFile), true);
  const global = JSON.parse(readFileSync(globalFile, "utf8"));
  const proj = JSON.parse(readFileSync(projectFile, "utf8"));
  assert.deepEqual(global.skills.map((s: { name: string }) => s.name), ["alpha"]);
  assert.deepEqual(proj.skills.map((s: { name: string }) => s.name), ["bravo"]);

  const resolved = JSON.parse((await handleTool("get_binding", {}, env)).content[0].text);
  assert.equal(resolved.scope, "session");
  assert.deepEqual(resolved.skills.map((s: { name: string }) => s.name), ["charlie"]);
  assert.deepEqual(resolved.scopes.global.skills.map((s: { name: string }) => s.name), ["alpha"]);
  assert.deepEqual(resolved.scopes.project.skills.map((s: { name: string }) => s.name), ["bravo"]);
  assert.deepEqual(resolved.scopes.session.skills.map((s: { name: string }) => s.name), ["charlie"]);
  assert.deepEqual(resolved.priority, ["session", "project", "global"]);
  assert.match(resolved.persistence.session, /in-memory/i);
  assert.match(resolved.persistence.project, /\.skill-mcp/);
  assert.match(resolved.persistence.global, /binding\.json/);
  cleanup();
});

test("get_binding can inspect a specific scope without mixing it with others", async () => {
  const { env, cleanup } = setup();
  await handleTool("bind_skills", { names: ["alpha"], scope: "global" }, env);
  await handleTool("bind_skills", { names: ["bravo"], scope: "project" }, env);
  const global = JSON.parse((await handleTool("get_binding", { scope: "global" }, env)).content[0].text);
  const project = JSON.parse((await handleTool("get_binding", { scope: "project" }, env)).content[0].text);
  assert.equal(global.scope, "global");
  assert.deepEqual(global.skills.map((s: { name: string }) => s.name), ["alpha"]);
  assert.equal(project.scope, "project");
  assert.deepEqual(project.skills.map((s: { name: string }) => s.name), ["bravo"]);
  cleanup();
});

test("clearing session does not wipe the global bind file", async () => {
  const { env, home, cleanup } = setup();
  await handleTool("bind_skills", { names: ["alpha"], scope: "global" }, env);
  await handleTool("bind_skills", { names: ["bravo"], scope: "session" }, env);
  await handleTool("bind_skills", { clear: true, scope: "session" }, env);
  const global = JSON.parse(readFileSync(path.join(home, "state", "binding.json"), "utf8"));
  assert.deepEqual(global.skills.map((s: { name: string }) => s.name), ["alpha"]);
  const resolved = JSON.parse((await handleTool("get_binding", {}, env)).content[0].text);
  assert.equal(resolved.scope, "session");
  assert.equal(resolved.none, true);
  cleanup();
});
