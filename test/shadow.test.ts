import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { handleTool } from "../src/tools.ts";
import { shadowMessage, unshadowHint, type CatalogSkill, type SkillTier } from "../src/catalog.ts";

function skillMd(name: string, desc: string): string {
  return "---\nname: " + name + "\ndescription: " + desc + "\n---\n\n# " + name + "\n";
}

function nest(root: string, name: string): string {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "SKILL.md");
  writeFileSync(file, skillMd(name, name + " helper"), "utf8");
  return file;
}

function row(name: string, tier: SkillTier, skillPath: string): CatalogSkill {
  return { name, tier, path: skillPath, description: name + " skill", h2: name, tokens: 1 };
}

test("shadowMessage is plain English naming who shadows and why", async () => {
  const loser = row("login-fix", "user", "/home/me/.claude/skills/login-fix/SKILL.md");
  const winner = row("login-fix", "project", "/repo/.claude/skills/login-fix/SKILL.md");
  const message = shadowMessage(loser, winner);
  assert.match(message, /login-fix/);
  assert.match(message, /shadowed/i);
  assert.match(message, /project/i);
  assert.match(message, /user/i);
  assert.match(message, /\/repo\/\.claude\/skills\/login-fix\/SKILL\.md/);
  assert.doesNotMatch(message, /project-beats-user/);
  assert.doesNotMatch(message, /rm -rf/);

  const hint = unshadowHint(loser, winner);
  assert.match(hint, /rescan_skills|rescan/i);
  assert.match(hint, /archive|rename/i);
  assert.doesNotMatch(hint, /rm -rf/);
});

test("list_skills shadowed rows include readable why and how to unshadow", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "skill-mcp-shadow-"));
  const userRoot = path.join(home, ".claude", "skills");
  const projectRoot = path.join(home, "repo", ".claude", "skills");
  const userPath = nest(userRoot, "login-fix");
  const projectPath = nest(projectRoot, "login-fix");
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    SKILL_MCP_ROOTS: userRoot,
    SKILL_MCP_PROJECT_ROOTS: projectRoot,
    SKILL_MCP_STATE_DIR: path.join(home, "state"),
  };
  const listed = JSON.parse((await handleTool("list_skills", {}, env)).content[0].text);
  assert.equal(listed.skills[0].name, "login-fix");
  assert.equal(listed.skills[0].path, projectPath);
  assert.equal(listed.shadowed.length, 1);
  const shadowed = listed.shadowed[0];
  assert.equal(shadowed.path, userPath);
  assert.equal(shadowed.shadowed, true);
  assert.match(String(shadowed.shadow_message), /shadowed/i);
  assert.match(String(shadowed.shadow_message), /project/i);
  assert.match(String(shadowed.shadow_message), /login-fix/);
  assert.match(String(shadowed.shadow_message), new RegExp(projectPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(String(shadowed.shadow_message), /project-beats-user/);
  assert.match(String(shadowed.unshadow_hint), /rescan/i);
  assert.match(String(shadowed.unshadow_hint), /archive|rename/i);
  rmSync(home, { recursive: true, force: true });
});
