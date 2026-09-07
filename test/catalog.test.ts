import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildCatalog,
  shadowWhy,
  unshadowHint,
  writeCatalog,
  type CatalogSkill,
  type SkillTier,
} from "../src/catalog.ts";
import { estimateTokens } from "../src/tokens.ts";

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "eval",
  "ranker-fixtures",
);

function skillMd(name: string, extra = ""): string {
  return `---\nname: ${name}\ndescription: ${name} skill\n---\n\n# ${name}\n${extra}\n`;
}

function nest(root: string, rel: string, name: string): string {
  const dir = path.join(root, rel, name);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "SKILL.md");
  writeFileSync(file, skillMd(name), "utf8");
  return file;
}

test("index --root finds SKILL.md one level down", () => {
  const root = mkdtempSync(path.join(tmpdir(), "skillbind-cat-"));
  nest(root, ".", "alpha");
  const catalog = buildCatalog([{ root, tier: "user" }]);
  assert.equal(catalog.skills.length, 1);
  assert.equal(catalog.skills[0].name, "alpha");
  assert.equal(catalog.shadowed.length, 0);
});

test("repeatable --root unions two trees", () => {
  const a = mkdtempSync(path.join(tmpdir(), "skillbind-a-"));
  const b = mkdtempSync(path.join(tmpdir(), "skillbind-b-"));
  nest(a, ".", "alpha");
  nest(b, ".", "bravo");
  const catalog = buildCatalog([
    { root: a, tier: "user" },
    { root: b, tier: "user" },
  ]);
  const names = catalog.skills.map((s) => s.name).sort();
  assert.deepEqual(names, ["alpha", "bravo"]);
});

test("project tier beats user for the same name", () => {
  const user = mkdtempSync(path.join(tmpdir(), "skillbind-user-"));
  const project = mkdtempSync(path.join(tmpdir(), "skillbind-proj-"));
  const userPath = nest(user, ".", "login-fix");
  const projPath = nest(project, ".", "login-fix");
  const catalog = buildCatalog([
    { root: user, tier: "user" },
    { root: project, tier: "project" },
  ]);
  assert.equal(catalog.skills.length, 1);
  assert.equal(catalog.skills[0].path, projPath);
  assert.equal(catalog.shadowed.length, 1);
  assert.equal(catalog.shadowed[0].path, userPath);
});

test("same tier: shortest path wins, then lex path", () => {
  const root = mkdtempSync(path.join(tmpdir(), "skillbind-dup-"));
  const short = nest(root, "a", "login-fix");
  const longer = nest(root, "aaaa", "login-fix");
  const catalog = buildCatalog([{ root, tier: "user" }]);
  assert.equal(catalog.skills.length, 1);
  assert.equal(catalog.skills[0].path, short);
  assert.equal(catalog.shadowed[0].path, longer);
});

test("writeCatalog writes catalog.json under SKILLBIND_HOME", () => {
  const home = mkdtempSync(path.join(tmpdir(), "skillbind-home-"));
  const root = mkdtempSync(path.join(tmpdir(), "skillbind-root-"));
  nest(root, ".", "alpha");
  const catalog = buildCatalog([{ root, tier: "user" }]);
  const out = writeCatalog(home, catalog);
  assert.equal(out, path.join(home, "catalog.json"));
  assert.equal(existsSync(out), true);
  const parsed = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(parsed.skills[0].name, "alpha");
});

test("missing root yields empty catalog not throw", () => {
  const catalog = buildCatalog([
    { root: path.join(tmpdir(), "skillbind-no-such-dir"), tier: "user" },
  ]);
  assert.equal(catalog.skills.length, 0);
});

test("index stores estimateTokens(content) on active and shadowed rows", () => {
  const root = mkdtempSync(path.join(tmpdir(), "skillbind-tok-"));
  const shortDir = path.join(root, "short", "alpha");
  const longDir = path.join(root, "long", "alpha");
  mkdirSync(shortDir, { recursive: true });
  mkdirSync(longDir, { recursive: true });
  const shortContent = skillMd("alpha");
  const longContent = skillMd("alpha") + "x".repeat(400);
  writeFileSync(path.join(shortDir, "SKILL.md"), shortContent, "utf8");
  writeFileSync(path.join(longDir, "SKILL.md"), longContent, "utf8");
  const catalog = buildCatalog([{ root, tier: "user" }]);
  assert.equal(catalog.skills.length, 1);
  assert.equal(catalog.shadowed.length, 1);
  const byPath = new Map(
    [...catalog.skills, ...catalog.shadowed].map((s) => [s.path, s]),
  );
  assert.equal(byPath.get(path.join(shortDir, "SKILL.md"))?.tokens, estimateTokens(shortContent));
  assert.equal(byPath.get(path.join(longDir, "SKILL.md"))?.tokens, estimateTokens(longContent));
  assert.ok((byPath.get(path.join(longDir, "SKILL.md"))?.tokens ?? 0) > (byPath.get(path.join(shortDir, "SKILL.md"))?.tokens ?? 0));
});

test("buildCatalog default tokens equal estimateTokens of the SKILL.md body", () => {
  const catalog = buildCatalog([{ root: fixtures, tier: "user" }]);
  const login = catalog.skills.find((s) => s.name === "login-fix");
  const content = readFileSync(path.join(fixtures, "login-fix", "SKILL.md"), "utf8");
  assert.equal(login?.tokens, estimateTokens(content));
  assert.equal(login?.tokens, 36);
});

test("buildCatalog description mode estimates name plus description, not the body", () => {
  const bodyCatalog = buildCatalog([{ root: fixtures, tier: "user" }]);
  const descCatalog = buildCatalog([{ root: fixtures, tier: "user" }], {
    tokens: "description",
  });
  const body = bodyCatalog.skills.find((s) => s.name === "login-fix");
  const desc = descCatalog.skills.find((s) => s.name === "login-fix");
  assert.equal(desc?.tokens, estimateTokens("login-fix\nfix login 500 errors and auth failures"));
  assert.equal(desc?.tokens, 12);
  assert.equal(body?.tokens, 36);
  assert.ok((desc?.tokens ?? 0) < (body?.tokens ?? 0));
});

function row(name: string, tier: SkillTier, skillPath: string): CatalogSkill {
  return {
    name,
    tier,
    path: skillPath,
    description: `${name} skill`,
    h2: name,
    tokens: 1,
  };
}

test("shadowWhy names the better() reason against the active winner", () => {
  assert.equal(
    shadowWhy(row("n", "user", "/u/n/SKILL.md"), row("n", "project", "/p/n/SKILL.md")),
    "project-beats-user",
  );
  assert.equal(
    shadowWhy(row("n", "plugin", "/plug/n/SKILL.md"), row("n", "project", "/p/n/SKILL.md")),
    "project-beats-plugin",
  );
  assert.equal(
    shadowWhy(row("n", "plugin", "/plug/n/SKILL.md"), row("n", "user", "/u/n/SKILL.md")),
    "user-beats-plugin",
  );
  assert.equal(
    shadowWhy(row("n", "user", "/user/longer/n/SKILL.md"), row("n", "user", "/u/n/SKILL.md")),
    "shorter-path",
  );
  assert.equal(
    shadowWhy(row("n", "user", "/u/n/SKILL.md"), row("n", "user", "/a/n/SKILL.md")),
    "lex-path",
  );
});

test("unshadowHint is reversible text and never rm -rf", () => {
  const lostToProject = unshadowHint(
    row("login-fix", "user", "/u/login-fix/SKILL.md"),
    row("login-fix", "project", "/p/login-fix/SKILL.md"),
  );
  assert.match(lostToProject, /archive/);
  assert.match(lostToProject, /login-fix/);
  assert.doesNotMatch(lostToProject, /rm -rf/);

  const sameTier = unshadowHint(
    row("n", "user", "/user/longer/n/SKILL.md"),
    row("n", "user", "/u/n/SKILL.md"),
  );
  assert.match(sameTier, /re-scan|index/);
  assert.doesNotMatch(sameTier, /rm -rf/);

  const plugin = unshadowHint(
    row("n", "plugin", "/plug/n/SKILL.md"),
    row("n", "user", "/u/n/SKILL.md"),
  );
  assert.match(plugin, /plugin/);
  assert.doesNotMatch(plugin, /rm -rf/);
});

test("index skips a skills-archive tree under --root", () => {
  const root = mkdtempSync(path.join(tmpdir(), "skillbind-arch-"));
  nest(root, ".", "alpha");
  nest(root, "skills-archive", "idle-one");
  nest(root, "nested/skills-archive", "idle-two");
  const catalog = buildCatalog([{ root, tier: "user" }]);
  assert.deepEqual(
    catalog.skills.map((s) => s.name),
    ["alpha"],
  );
  assert.equal(
    catalog.skills.some((s) => s.path.includes(`${path.sep}skills-archive${path.sep}`)),
    false,
  );
});
