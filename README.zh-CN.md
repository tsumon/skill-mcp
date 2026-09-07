# skill-mcp

本地 **stdio MCP 服务**：帮 agent 挑选要用的本地 `SKILL.md`，并控制上下文体积。

替代已删除的 `skillbind` CLI：仅 MCP，无 host adapter，非 marketplace。

## 为什么

- 最多绑定 **3** 个 skill；token **预算不会提高 cap**（默认 4000，CJK 友好）。
- 默认精简：只返回 name / description / path；完整正文用 `read_skill`。
- 默认根目录：`~/.claude/skills`、`~/.agents/skills`、`~/.codex/skills`、`~/.config/opencode/skills`。

## 安装

```bash
git clone https://github.com/tsumon/skill-mcp.git
cd skill-mcp
npm install
npm run build
npm test
```

需要 **Node 20+**。

## Claude Desktop

写入 Claude Desktop 的 MCP 配置（常称 mcp.json）：

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

可选环境变量：

- `SKILL_MCP_ROOTS` — 逗号/冒号分隔的根目录
- `SKILL_MCP_STATE_DIR` — 绑定状态目录（默认 `~/.config/skill-mcp`）

## Cursor

在 Cursor MCP 设置中使用相同的 command / args。

## MCP 工具

| 工具 | 作用 |
| --- | --- |
| `list_skills` | 列出技能目录；显示被遮蔽项 |
| `suggest_skills` | 按 prompt 词法排序短名单（cap 3 + budget） |
| `bind_skills` | 写入精简绑定（或 clear/none） |
| `get_binding` | 当前绑定 |
| `why` | 解释为何绑定这些 skill |
| `estimate_tokens` | 估算 token（body/description） |
| `doctor` | 检查根目录、数量、绑定路径 |
| `archive_idle` | 仅 dry-run 列出闲置候选 |
| `read_skill` | 显式读取完整 SKILL.md |

## 不变量

- 最多 3 个绑定；预算不会提高 cap
- 非 marketplace；不自动卸载；不重训 ranker
- 默认精简视图，不粘贴全文

## License

MIT

English: [README.md](./README.md).
