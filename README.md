# skill-mcp

Local **stdio MCP server** that helps agents pick which local `SKILL.md` skills to use — and keeps context small.

Replacement for the deleted `skillbind` CLI: MCP-only, no host adapters, no marketplace.

## Why

- **Max 3** bound skills; token **budget never raises the cap** (default 4000, CJK-aware).
- Lean by default: name / description / path only; `read_skill` is opt-in for full body.
- Default roots: `~/.claude/skills`, `~/.agents/skills`, `~/.codex/skills`, `~/.config/opencode/skills`.

## Install

```bash
git clone https://github.com/tsumon/skill-mcp.git
cd skill-mcp
npm install
npm run build
npm test
```

Requires **Node 20+**.

## Claude Desktop

Add to your Claude Desktop MCP config (often called mcp.json):

```json
{
  "mcpServers": {
    "skill-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/skill-mcp/dist/index.js"]
    }
  }
}
```

Optional env vars:

- `SKILL_MCP_ROOTS` — comma/colon-separated roots (overrides defaults)
- `SKILL_MCP_STATE_DIR` — binding state dir (default `~/.config/skill-mcp`)

## Cursor

Same shape under Cursor MCP settings:

```json
{
  "mcpServers": {
    "skill-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/skill-mcp/dist/index.js"]
    }
  }
}
```

## MCP tools

| Tool | Purpose |
| --- | --- |
| `list_skills` | Catalog skills; show shadowed |
| `suggest_skills` | Lexical rank prompt → shortlist (cap 3 + budget) |
| `bind_skills` | Persist lean binding (or clear/none) |
| `get_binding` | Current binding |
| `why` | Why current skills are bound |
| `estimate_tokens` | Per skill or list (body\|description) |
| `doctor` | Roots exist? counts? binding path? |
| `archive_idle` | Dry-run idle candidates only |
| `read_skill` | Explicit full SKILL.md body |

## Invariants

- Max 3 bound skills; budget never raises cap
- Not a marketplace; no auto-uninstall; no ranker retrain
- Lean bind/list/suggest — no full bodies by default

## License

MIT

中文说明见 [README.zh-CN.md](./README.zh-CN.md).
