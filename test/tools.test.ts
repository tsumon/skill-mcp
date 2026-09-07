import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { handleTool } from "../src/tools.ts";
import { MAX_BOUND } from "../src/config.ts";

function skillMd(name: string, desc: string): string {
  return "---\nname: " + name + "\ndescription: " + desc + "\n---\n\n# " + name + "\n\n## Steps\nDo " + name + ".\n";
}

function setup() {
  const home = mkdtempSync(path.join(tmpdir(), "skill-mcp-home-"));
  const root = path.join(home, ".claude", "skills");
  const state = path.join(home, "state");
  mkdirSync(path.join(root, "alpha"), { recursive: true });
  mkdirSync(path.join(root, "bravo"), { recursive: true });
  writeFileSync(path.join(root, "alpha", "SKILL.md"), skillMd("alpha", "alpha login fix helper"), "utf8");
  writeFileSync(path.join(root, "bravo", "SKILL.md"), skillMd("bravo", "bravo deploy helper"), "utf8");
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    SKILL_MCP_ROOTS: root,
    SKILL_MCP_STATE_DIR: state,
  };
  return { home, root, state, env, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

function writeSkill(root: string, name: string, desc: string): void {
  mkdirSync(path.join(root, name), { recursive: true });
  writeFileSync(path.join(root, name, "SKILL.md"), skillMd(name, desc), "utf8");
}

function treeSnapshot(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name);
      const st = statSync(full);
      out.push(ent.name + ":" + st.size);
      if (ent.isDirectory()) walk(full);
    }
  };
  walk(dir);
  return out.sort();
}

function jsonHasBody(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(jsonHasBody);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([k, v]) => k === "body" || jsonHasBody(v),
    );
  }
  return false;
}

test("list_skills returns lean catalog", () => {
  const { env, cleanup } = setup();
  const res = handleTool("list_skills", {}, env);
  assert.equal(res.isError, undefined);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.count, 2);
  assert.ok(data.skills.every((s: { description: string }) => s.description));
  assert.ok(data.skills.every((s: Record<string, unknown>) => !("body" in s)));
  cleanup();
});

test("bind_skills rejects more than 3 names", () => {
  const { env, cleanup } = setup();
  const res = handleTool("bind_skills", { names: ["a", "b", "c", "d"] }, env);
  assert.equal(res.isError, true);
  cleanup();
});

test("bind_skills and get_binding roundtrip", () => {
  const { env, cleanup } = setup();
  const bound = handleTool("bind_skills", { names: ["alpha"] }, env);
  assert.equal(bound.isError, undefined);
  const got = handleTool("get_binding", {}, env);
  const data = JSON.parse(got.content[0].text);
  assert.deepEqual(data.skills.map((s: { name: string }) => s.name), ["alpha"]);
  const why = handleTool("why", {}, env);
  assert.match(why.content[0].text, /alpha/);
  cleanup();
});

test("doctor reports roots", () => {
  const { env, cleanup } = setup();
  const res = handleTool("doctor", {}, env);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.ok, true);
  assert.equal(data.skills, 2);
  cleanup();
});

test("doctor is dry-run only", () => {
  const { env, cleanup } = setup();
  const res = handleTool("doctor", {}, env);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.dry_run, true);
  cleanup();
});

test("doctor counts skills per root without prefix collision", () => {
  const { env, home, cleanup } = setup();
  const extra = path.join(home, ".claude", "skills-extra");
  mkdirSync(path.join(extra, "zulu"), { recursive: true });
  writeFileSync(
    path.join(extra, "zulu", "SKILL.md"),
    skillMd("zulu", "zulu extra root helper"),
    "utf8",
  );
  env.SKILL_MCP_ROOTS = env.SKILL_MCP_ROOTS + "," + extra;
  const res = handleTool("doctor", {}, env);
  const data = JSON.parse(res.content[0].text);
  const byRoot = new Map(data.roots.map((r: { root: string; count: number }) => [r.root, r.count]));
  assert.equal(byRoot.get(path.join(home, ".claude", "skills")), 2);
  assert.equal(byRoot.get(extra), 1);
  cleanup();
});

test("archive_idle is dry-run", () => {
  const { env, cleanup } = setup();
  handleTool("bind_skills", { names: ["alpha"] }, env);
  const res = handleTool("archive_idle", {}, env);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.dry_run, true);
  assert.ok(data.candidates.some((c: { name: string }) => c.name === "bravo"));
  cleanup();
});

test("read_skill returns body only when asked", () => {
  const { env, cleanup } = setup();
  const res = handleTool("read_skill", { name: "alpha" }, env);
  const data = JSON.parse(res.content[0].text);
  assert.match(data.body, /name: alpha/);
  cleanup();
});

test("read_skill requires an explicit name", () => {
  const { env, cleanup } = setup();
  const res = handleTool("read_skill", {}, env);
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /name is required/);
  cleanup();
});

test("list/suggest/bind/doctor/archive stay lean without body", () => {
  const { env, cleanup } = setup();
  const listed = JSON.parse(handleTool("list_skills", {}, env).content[0].text);
  const suggested = JSON.parse(handleTool("suggest_skills", { prompt: "alpha login" }, env).content[0].text);
  const bound = JSON.parse(handleTool("bind_skills", { names: ["alpha"] }, env).content[0].text);
  const doctor = JSON.parse(handleTool("doctor", {}, env).content[0].text);
  const archive = JSON.parse(handleTool("archive_idle", {}, env).content[0].text);
  assert.equal(jsonHasBody(listed), false);
  assert.equal(jsonHasBody(suggested), false);
  assert.equal(jsonHasBody(bound), false);
  assert.equal(jsonHasBody(doctor), false);
  assert.equal(jsonHasBody(archive), false);
  cleanup();
});

test("suggest_skills huge token budget never raises the max-3 cap", () => {
  const { env, root, cleanup } = setup();
  writeSkill(root, "charlie", "overlap token shared");
  writeSkill(root, "delta", "overlap token shared");
  writeFileSync(path.join(root, "alpha", "SKILL.md"), skillMd("alpha", "overlap token shared"), "utf8");
  writeFileSync(path.join(root, "bravo", "SKILL.md"), skillMd("bravo", "overlap token shared"), "utf8");
  const res = handleTool("suggest_skills", { prompt: "overlap token shared", budget: 999999 }, env);
  assert.equal(res.isError, undefined);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.skills.length, MAX_BOUND);
  assert.equal(data.cap, MAX_BOUND);
  assert.equal(MAX_BOUND, 3);
  assert.ok(data.dropped.some((d: { why: string }) => d.why === "cap"));
  assert.ok(data.skills.every((s: Record<string, unknown>) => !("body" in s)));
  cleanup();
});

test("CJK Chinese Japanese Korean names work on list/suggest/bind/read", () => {
  const { env, root, cleanup } = setup();
  writeSkill(root, "中文路由", "按中文意图路由技能");
  writeSkill(root, "ひらがな案内", "ひらがなでスキルを選ぶ");
  writeSkill(root, "한글라우팅", "한글 의도로 스킬을 고른다");
  const listed = JSON.parse(handleTool("list_skills", {}, env).content[0].text);
  const names = listed.skills.map((s: { name: string }) => s.name);
  assert.ok(names.includes("中文路由"));
  assert.ok(names.includes("ひらがな案内"));
  assert.ok(names.includes("한글라우팅"));

  const suggested = JSON.parse(
    handleTool("suggest_skills", { prompt: "한글 라우팅" }, env).content[0].text,
  );
  assert.deepEqual(
    suggested.skills.map((s: { name: string }) => s.name),
    ["한글라우팅"],
  );

  const bound = handleTool("bind_skills", { names: ["中文路由", "ひらがな案内", "한글라우팅"] }, env);
  assert.equal(bound.isError, undefined);
  const binding = JSON.parse(bound.content[0].text);
  assert.deepEqual(
    binding.skills.map((s: { name: string }) => s.name),
    ["中文路由", "ひらがな案内", "한글라우팅"],
  );

  const read = JSON.parse(handleTool("read_skill", { name: "한글라우팅" }, env).content[0].text);
  assert.match(read.body, /한글라우팅/);
  cleanup();
});

test("doctor and archive_idle do not create move or delete files", () => {
  const { env, home, root, state, cleanup } = setup();
  const beforeSkills = treeSnapshot(root);
  const beforeHome = treeSnapshot(home);
  assert.equal(existsSync(state), false);
  handleTool("doctor", {}, env);
  handleTool("archive_idle", {}, env);
  assert.deepEqual(treeSnapshot(root), beforeSkills);
  assert.deepEqual(treeSnapshot(home), beforeHome);
  assert.equal(existsSync(state), false);
  assert.equal(
    readFileSync(path.join(root, "alpha", "SKILL.md"), "utf8").includes("alpha login"),
    true,
  );
  cleanup();
});
