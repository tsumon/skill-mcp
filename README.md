# skill-mcp

<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="skill-mcp: local stdio MCP that lists, suggests, and binds at most 3 local SKILL.md files. Token budget never raises the cap.">
</p>

<p align="center"><a href="./README.zh-CN.md">中文</a></p>

Local **stdio MCP** server that helps an agent pick which local `SKILL.md` files to use — and keeps the context small.

Replacement for the deleted `skillbind` CLI: MCP-only, no host adapters, no marketplace.

<p align="center">
  <img src="./assets/readme/workflow.svg" width="100%" alt="Core loop: list_skills catalogs local SKILL.md files, suggest_skills ranks a prompt with hard cap 3 then a token budget, bind_skills persists a lean binding. Full bodies load only through read_skill.">
</p>

## Why the cap is hard

- **Max 3** bound skills. A larger token budget never raises that cap.
- Default budget is **4000** tokens (CJK-aware: Han, Hiragana, Katakana, Hangul). Budget can only drop more candidates.
- Lean by default: `name` / `description` / `path`. Full `SKILL.md` body is opt-in via `read_skill`.
- Default roots: `~/.claude/skills`, `~/.agents/skills`, `~/.codex/skills`, `~/.config/opencode/skills`.

## Install

Requires **Node 20+**.

```bash
git clone https://github.com/tsumon/skill-mcp.git
cd skill-mcp
npm install
npm run build
npm test
```

The server speaks MCP over stdio:

```bash
node dist/index.js
```

## Claude Desktop

Add to the Claude Desktop MCP config (often `mcp.json`):

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

- `SKILL_MCP_ROOTS` — comma-separated roots (overrides defaults). Colon and semicolon also work; prefer commas on Windows.
- `SKILL_MCP_STATE_DIR` — binding state directory (default `~/.config/skill-mcp`)

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

## Core tools

### `list_skills`

Catalog `SKILL.md` files from configured roots. Each row is lean (`name`, `description`, `path`, `tokens`). Duplicate names are **shadowed** (project beats user beats plugin; then shorter path). Shadowed entries include `shadow_why` and an `unshadow_hint`.

### `suggest_skills`

Lexically rank skills for a prompt. Returns at most **3**. Then applies the token budget (default 4000). `dropped[].why` is `cap`, `budget`, or `threshold`.

```json
{
  "prompt": "fix login redirect"
}
```

Pass `budget` to change the token limit. It still cannot return more than 3.

### `bind_skills`

Persist a lean binding (or clear it). More than 3 names is an error.

```json
{ "names": ["login-fix", "alpha"] }
```

```json
{ "clear": true }
```

`none` also clears. State is `~/.config/skill-mcp/binding.json` unless `SKILL_MCP_STATE_DIR` is set.

## Other tools

| Tool | Purpose |
| --- | --- |
| `get_binding` | Current lean binding |
| `why` | Why those skills are bound |
| `estimate_tokens` | Per skill or list (`body` or `description`) |
| `read_skill` | Explicit full `SKILL.md` body |
| `doctor` | Dry-run: roots, counts, binding path |
| `archive_idle` | Dry-run: idle candidates only |

`doctor` and `archive_idle` never create, move, or delete skill files.

## Invariants

- Max 3 bound skills; budget never raises the cap
- Not a marketplace; no auto-uninstall; no ranker retrain
- Lean list / suggest / bind — no full bodies by default

## License

MIT

中文说明见 [README.zh-CN.md](./README.zh-CN.md).
