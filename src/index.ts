#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { printCli, runCli } from "./cli.js";
import { listBindingResources, readBindingResource } from "./resources.js";
import { handleTool } from "./tools.js";

const CLI_COMMANDS = new Set(["archive-idle", "write-contract", "native-skills", "help"]);

const TOOLS = [
  {
    name: "list_skills",
    description: "Catalog local SKILL.md skills from configured roots; include shadowed duplicates with why.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "suggest_skills",
    description: "Lexically rank skills for a prompt. Hard cap 3; default token budget 4000 (CJK-aware). Returns reasons and dropped (cap/budget).",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "User or agent task prompt" },
        budget: { type: "number", description: "Token budget (default 4000); never raises the max-3 cap" },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "bind_skills",
    description: "Persist lean binding (name/description/path only). Max 3. Pass clear:true or none to clear. Optional scope: session (in-memory), project (.skill-mcp/binding.json), or global (~/.config/skill-mcp/binding.json). Default global. Priority: session > project > global.",
    inputSchema: {
      type: "object",
      properties: {
        names: { oneOf: [{ type: "array", items: { type: "string" } }, { type: "string" }] },
        clear: { type: "boolean" },
        none: { type: "boolean" },
        reasons: { type: "object", additionalProperties: { type: "string" } },
        scope: { type: "string", enum: ["session", "project", "global"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_binding",
    description: "Return current lean skill binding. Default is the resolved binding (session > project > global). Pass scope to inspect one layer. Includes the host contract (only these N skills).",
    inputSchema: {
      type: "object",
      properties: { scope: { type: "string", enum: ["session", "project", "global"] } },
      additionalProperties: false,
    },
  },
  {
    name: "why",
    description: "Explain why the current skills are bound.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "estimate_tokens",
    description: "Estimate tokens for one/many/all skills (mode: body|description).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        names: { type: "array", items: { type: "string" } },
        mode: { type: "string", enum: ["body", "description"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "doctor",
    description: "Dry-run only: check skill roots exist, counts, shadowed, and binding path. Never mutates.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "archive_idle",
    description: "List idle and shadowed user-tier skills. Default dry-run reports what would move. Pass apply:true to archive into a recoverable path. Never silent-deletes.",
    inputSchema: {
      type: "object",
      properties: { apply: { type: "boolean", description: "When true, move candidates into a recoverable archive. Default false (dry-run)." } },
      additionalProperties: false,
    },
  },
  {
    name: "read_skill",
    description: "Read full SKILL.md body by explicit skill name (opt-in; other tools stay lean).",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "rescan_skills",
    description: "Rescan skill roots into the in-memory catalog without restarting the MCP process. list_skills and suggest_skills then reflect new/changed/removed skills.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "write_host_contract",
    description: "Write the current binding contract into Claude CLAUDE.md and Cursor .cursor/rules in one shot. The files list only bound skills and forbid others.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "native_skills_bypass",
    description: "Optional: write Claude skillOverrides name-only so the host listing does not dump every skill description. enabled:true writes; enabled:false restores the previous settings in one step. Risk: routing fight with Claude Code native skills.",
    inputSchema: {
      type: "object",
      properties: {
        enabled: { type: "boolean", description: "true writes name-only skillOverrides; false restores the prior host file" },
      },
      required: ["enabled"],
      additionalProperties: false,
    },
  },
] as const;

const server = new Server(
  { name: "skill-mcp", version: "0.2.0" },
  { capabilities: { tools: {}, resources: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  return handleTool(name, args);
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: listBindingResources(),
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const body = readBindingResource(request.params.uri);
  return { contents: [{ uri: body.uri, mimeType: body.mimeType, text: body.text }] };
});

async function main() {
  const cmd = process.argv[2];
  if (cmd && CLI_COMMANDS.has(cmd)) {
    const result = await runCli(process.argv.slice(2));
    printCli(result);
    process.exit(result.ok ? 0 : 1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("skill-mcp v0.2.0 listening on stdio");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
