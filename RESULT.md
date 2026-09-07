# RESULT — review → TDD gap fill

## What was reviewed

Read-only review of `main` @ `7e6f884` using operating-code-review, then TDD gap fill. Contract: local stdio MCP; list/suggest/bind; hard max 3; token budget never raises the cap; CJK (Chinese/Japanese/Korean); doctor + archive_idle dry-run; read_skill explicit opt-in; no marketplace / auto-uninstall / ranker retrain; bilingual README with Claude Desktop and Cursor setup.

Full findings: [REVIEW.md](./REVIEW.md).

## What was fixed

| Finding | Change |
| --- | --- |
| High: Hangul omitted from CJK | `tokenize` (`src/ranker.ts`) and `estimateTokens` (`src/tokens.ts`) now include `\p{Script=Hangul}`. Hangul golden fixture `eval/ranker-fixtures/한글라우팅/`. |
| Medium: dual cap literals | `MAX_BOUND_SKILLS` is `MAX_BOUND` from `src/config.ts`. |
| Medium: missing public-seam tests | `handleTool` tests for huge budget vs cap=3, CJK list/suggest/bind/read, lean payloads, read_skill name required, doctor/archive filesystem freeze. |
| Low: doctor dry-run contract | `DoctorReport.dry_run: true` plus a never-mutate note; tool description says dry-run. |
| Low: doctor root prefix counts | Count uses `path.relative` so `/skills` does not swallow `/skills-extra`. |
| Low: duplicated token budget | `src/tokens.ts` re-exports `DEFAULT_TOKEN_BUDGET` from `src/config.ts`. |

No product-scope expansion (still stdio-only; still max 3; doctor/archive still report-only; read_skill still opt-in).

## Tests added

Public MCP seam (`handleTool`):

- `suggest_skills` with `budget: 999999` and 4 overlapping skills still returns 3 and a `why: "cap"` drop
- CJK names (中文 / ひらがな / 한글) on list, suggest, bind (3 names), read
- `read_skill` without `name` errors; list/suggest/bind/doctor/archive have no `body`
- `doctor.dry_run === true`; doctor + archive_idle leave skill files and state dir untouched
- doctor per-root counts ignore prefix-colliding extra roots

Unit / goldens:

- Hangul overlapping bigrams in `tokenize`
- Hangul `estimateTokens` (1 token per code point; mixed ASCII)
- golden `한글 라우팅` → `한글라우팅`
- ranker cap === config `MAX_BOUND`
- default token budget is the single config value (4000)

`npm test`: **50 pass**. `npx tsc --noEmit`: clean.

## Remaining risks

- `SKILL_MCP_ROOTS` still splits on `:`, which can break Windows drive letters. Not in the hard-constraint set; Linux/mac defaults are fine.
- `bind_skills` JSON schema still lacks `maxItems: 3` (runtime rejects >3).
- `writeCatalog` still mutates disk but is not an MCP tool.
- `readBinding` still treats `none: true` as none even if a hand-edited file also lists skills.
- Live Claude Desktop / Cursor processes were not launched; stdio transport is unit-checked via `src/index.ts` using `StdioServerTransport` only.

## How constraints were verified

| Constraint | Verification |
| --- | --- |
| stdio MCP only | `src/` has no HTTP server; `src/index.ts` connects `StdioServerTransport`. |
| list / suggest / bind | Tool table + `handleTool` tests. |
| max 3; budget never raises cap | Bind rejects 4 names; suggest with budget 999999 returns 3 + cap drop; ranker cap is `MAX_BOUND`. |
| CJK | Chinese golden unchanged; Japanese + Hangul tokenize; Hangul estimate; handleTool CJK roundtrip. |
| doctor / archive_idle dry-run | Both return `dry_run: true`; filesystem snapshot unchanged; no writes in those modules. |
| read_skill opt-in | Missing name errors; other tools have no `body` key; explicit name returns body. |
| Docs | README.md + README.zh-CN.md already include Claude Desktop and Cursor setup (unchanged). |

## Skills used

1. operating-code-review (Phase A, read-only → REVIEW.md)
2. tdd (Phase B, red → green vertical slices)
