import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { MAX_BOUND } from "../src/config.ts";
import { setEmbeddingClient, type EmbeddingClient } from "../src/embeddings.ts";
import { handleTool } from "../src/tools.ts";

function skillMd(name: string, desc: string): string {
  return "---\nname: " + name + "\ndescription: " + desc + "\n---\n\n# " + name + "\n\n## Steps\nDo " + name + ".\n";
}

function setup() {
  const home = mkdtempSync(path.join(tmpdir(), "skill-mcp-embed-"));
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
    SKILL_MCP_OLLAMA_URL: "http://127.0.0.1:1",
  };
  return { env, root, cleanup: () => { setEmbeddingClient(undefined); rmSync(home, { recursive: true, force: true }); } };
}

test("suggest stays lexical and succeeds when Ollama is unavailable", async () => {
  const { env, cleanup } = setup();
  env.SKILL_MCP_EMBEDDINGS = "on";
  const res = await handleTool("suggest_skills", { prompt: "alpha login" }, env);
  assert.equal(res.isError, undefined);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.router, "lexical");
  assert.match(String(data.router_note ?? ""), /lexical|unavailable|ollama/i);
  assert.ok(data.names.includes("alpha"));
  cleanup();
});

test("injected embedding client upgrades routing without raising the cap", async () => {
  const { env, root, cleanup } = setup();
  mkdirSync(path.join(root, "charlie"), { recursive: true });
  mkdirSync(path.join(root, "delta"), { recursive: true });
  writeFileSync(path.join(root, "charlie", "SKILL.md"), skillMd("charlie", "overlap token shared"), "utf8");
  writeFileSync(path.join(root, "delta", "SKILL.md"), skillMd("delta", "overlap token shared"), "utf8");
  writeFileSync(path.join(root, "alpha", "SKILL.md"), skillMd("alpha", "overlap token shared"), "utf8");
  writeFileSync(path.join(root, "bravo", "SKILL.md"), skillMd("bravo", "overlap token shared"), "utf8");

  const client: EmbeddingClient = {
    available: async () => true,
    embed: async (texts: string[]) =>
      texts.map((text) => {
        if (/prompt:/.test(text)) return [1, 0, 0];
        if (/alpha/.test(text)) return [1, 0, 0];
        if (/bravo/.test(text)) return [0.9, 0.1, 0];
        if (/charlie/.test(text)) return [0.8, 0.2, 0];
        if (/delta/.test(text)) return [0.7, 0.3, 0];
        return [0, 1, 0];
      }),
  };
  setEmbeddingClient(client);
  env.SKILL_MCP_EMBEDDINGS = "on";
  const res = await handleTool("suggest_skills", { prompt: "overlap token shared", budget: 999999 }, env);
  assert.equal(res.isError, undefined);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.router, "embedding");
  assert.equal(data.skills.length, MAX_BOUND);
  assert.equal(data.cap, MAX_BOUND);
  assert.deepEqual(data.names, ["alpha", "bravo", "charlie"]);
  assert.ok(data.dropped.some((d: { name: string }) => d.name === "delta"));
  cleanup();
});
