# Packaging

Optional single-file binary. Does not replace `node dist/index.js`.

## bun compile (verified on this box)

```bash
./scripts/pack.sh
# writes dist-pack/skill-mcp and dist-pack/skill-mcp-cli
```

Point Claude Desktop / Cursor `args` at the **absolute** path of `dist-pack/skill-mcp`.

CLI from the same tree:

```bash
./dist-pack/skill-mcp archive-idle
./dist-pack/skill-mcp archive-idle --apply
./dist-pack/skill-mcp write-contract
./dist-pack/skill-mcp native-skills enable
./dist-pack/skill-mcp native-skills restore
```

`dist-pack/` is gitignored (tens of MB per platform). Attach the artifact to a GitHub Release when cutting a version.

## Fallback

If `bun` is missing:

```bash
npm run build
node dist/index.js
node dist/cli-main.js archive-idle
```
