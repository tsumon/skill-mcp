import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { bindingContract, emptyBinding } from "../src/bind.ts";
import { handleTool } from "../src/tools.ts";
import { BINDING_CONTRACT_URI, listBindingResources, readBindingResource } from "../src/resources.ts";

function skillMd(name: string, desc: string): string {
  return "---\nname: " + name + "\ndescription: " + desc + "\n---\n\n# " + name + "\n";
}

function setup() {
  const home = mkdtempSync(path.join(tmpdir(), "skill-mcp-contract-"));
  const root = path.join(home, ".claude", "skills");
  mkdirSync(path.join(root, "alpha"), { recursive: true });
  mkdirSync(path.join(root, "bravo"), { recursive: true });
  writeFileSync(path.join(root, "alpha", "SKILL.md"), skillMd("alpha", "alpha login fix helper"), "utf8");
  writeFileSync(path.join(root, "bravo", "SKILL.md"), skillMd("bravo", "bravo deploy helper"), "utf8");
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    SKILL_MCP_ROOTS: root,
    SKILL_MCP_STATE_DIR: path.join(home, "state"),
  };
  return { env, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

test("bindingContract lists only the bound names and forbids others", async () => {
  const empty = bindingContract(emptyBinding());
  assert.match(empty, /No skills are bound/i);
  const bound = bindingContract({
    version: 1,
    updatedAt: new Date().toISOString(),
    none: false,
    skills: [
      { name: "alpha", description: "a", path: "/a" },
      { name: "bravo", description: "b", path: "/b" },
    ],
    source: "manual",
  });
  assert.match(bound, /only these 2 bound skills/i);
  assert.match(bound, /alpha/);
  assert.match(bound, /bravo/);
  assert.doesNotMatch(bound, /charlie/);
});

test("get_binding exposes a contract that lists the bound skill names", async () => {
  const { env, cleanup } = setup();
  await handleTool("bind_skills", { names: ["alpha", "bravo"] }, env);
  const data = JSON.parse((await handleTool("get_binding", {}, env)).content[0].text);
  assert.equal(typeof data.contract, "string");
  assert.match(data.contract, /only these 2 bound skills/i);
  assert.match(data.contract, /alpha/);
  assert.match(data.contract, /bravo/);
  cleanup();
});

test("binding contract resource lists the same names as get_binding", async () => {
  const { env, cleanup } = setup();
  await handleTool("bind_skills", { names: ["alpha"] }, env);
  const listed = listBindingResources();
  assert.ok(listed.some((r) => r.uri === BINDING_CONTRACT_URI));
  const resource = readBindingResource(BINDING_CONTRACT_URI, env);
  assert.match(resource.text, /only these 1 bound skill/i);
  assert.match(resource.text, /alpha/);
  assert.doesNotMatch(resource.text, /bravo/);
  const fromTool = JSON.parse((await handleTool("get_binding", {}, env)).content[0].text);
  assert.equal(resource.text, fromTool.contract);
  cleanup();
});
