# Code review — skill-mcp (local stdio MCP)

Reviewer: operating-code-review (read-only snapshot of `main` @ `7e6f884`).
Scope: `src/`, `test/`, `eval/ranker-fixtures/`, `README.md`, `README.zh-CN.md`, `package.json`, `tsconfig.json`.
Product constraints used as the contract: stdio-only MCP; list/suggest/bind; hard max 3; token budget never raises the cap; CJK names/content; doctor + archive_idle dry-run; read_skill explicit opt-in; no marketplace / auto-uninstall / ranker retrain; bilingual README with Claude Desktop + Cursor setup.

## Findings

### 1. High — Korean Hangul is omitted from the CJK tokenizer and token estimator

- **Where:** `tokenize` / `CJK_RUN` in `src/ranker.ts:13,35-51`; `estimateTokens` / `CJK_CHAR` in `src/tokens.ts:3-18`.
- **Failure mode:** A Korean skill name or prompt produces **zero** lexical tokens, so `rank()` / `suggest_skills` return `none: true`. Token estimates undercount Hangul as ASCII (`ceil(length/4)`).
- **Trigger:** Any Hangul in skill `name` / `description` / `h2` or in the suggest prompt. Chinese (`Script=Han`) and Japanese (`Hiragana`/`Katakana`) are included; `Script=Hangul` is not.
- **Evidence (reproduced):**

  ```
  tokenize("한글 라우팅")        => []
  tokenize("한글라우팅")         => []
  estimateTokens("한글")         => 1   // should be 2 if CJK-aware
  rank([{name:"한글라우팅", ...}], "한글 라우팅") => { skills: [], none: true }
  tokenize("中文路由")           => ["中文","文路","路由"]  // Chinese works
  tokenize("ひらがな")           => ["ひら","らが","がな"]  // Japanese works
  ```

  Durable tests cover Han/Hiragana/Katakana only (`test/ranker.test.ts:24-29,46-52`, `test/tokens.test.ts:31-34`, fixture `eval/ranker-fixtures/中文路由/`). No Hangul fixture or tool-level CJK test.
- **Smallest correction:** Add `\p{Script=Hangul}` to both character classes (keep overlapping-bigram tokenization for runs length > 1; keep 1 token per Hangul code point in `estimateTokens`). Add a Hangul golden (tokenize / estimate / suggest via `handleTool`).
- **Confidence:** verified.

### 2. Medium — Hard cap is defined twice and can drift

- **Where:** `MAX_BOUND` in `src/config.ts:5`; `MAX_BOUND_SKILLS` in `src/ranker.ts:10`; consumed by `rank()` at `src/ranker.ts:175-176` and reported by `suggestSkills` as `cap: MAX_BOUND` in `src/suggest.ts:64`.
- **Failure mode:** If the two constants diverge, `suggest_skills` can return more than 3 (ranker's slice) while `bind_skills` still rejects `names.length > 3` (`src/tools.ts:91`), or the advertised `cap` field lies. The product invariant is a single hard max of 3.
- **Trigger:** Editing one constant and not the other. Today both equal 3 (reproduced).
- **Evidence:** Two independent numeric literals; tests assert each locally (`test/ranker.test.ts:67-68`, `test/bind.test.ts:39-40`) but never `MAX_BOUND_SKILLS === MAX_BOUND`. `applyBudget` (`src/tokens.ts:21-34`) has no cap of its own — safety depends on `rank()` already slicing.
- **Smallest correction:** Make `rank()` import `MAX_BOUND` from `config.ts` (delete the second literal). Keep a test that the public suggest seam never exceeds `MAX_BOUND` even with a huge budget.
- **Confidence:** strongly inferred (latent; not currently observable).

### 3. Medium — Public MCP seam does not lock hard-constraint regressions

- **Where:** `handleTool` in `src/tools.ts:31-47`; tests in `test/tools.test.ts` (only list, bind>3, bind roundtrip, doctor ok, archive `dry_run`, read_skill success).
- **Failure mode:** The shipped MCP tools are the contract. Unit tests on `rank` / `suggestSkills` / `applyBudget` will not catch a wiring bug in `toolSuggest` / `toolBind` / `toolReadSkill` (wrong budget default, passing overflow back, dumping `body` on list/suggest, mutating on doctor).
- **Trigger:** Future edits to `src/tools.ts` or `src/index.ts` without touching unit modules.
- **Evidence:** No `handleTool("suggest_skills", ...)` test. No test that `budget: 999999` still returns ≤3 with a 4th match dropped `why: "cap"`. No Hangul names through list/suggest/bind/read. No snapshot that `doctor` / `archive_idle` leave the skill tree and `SKILL_MCP_STATE_DIR` untouched. `read_skill` missing `name` is untested (runtime does error: `src/tools.ts:123-124`).
- **Smallest correction:** Add public-behavior tests on `handleTool` for: cap=3 + huge budget; CJK (including Hangul) list/suggest/bind/read; doctor + archive_idle filesystem freeze; list/suggest/bind/doctor/archive responses have no `body`; `read_skill` requires `name`.
- **Confidence:** verified (missing durable tests). Implementation of cap-then-budget and dry-run currently holds (see Cleared surfaces).

### 4. Low — `doctor` does not advertise dry-run the way `archive_idle` does

- **Where:** `runDoctor` return type `DoctorReport` in `src/doctor.ts:10-18,42-50`; tool description in `src/index.ts:64-66`. Compare `planArchiveIdle` `dry_run: true` in `src/archive.ts:22-24` and `src/index.ts:69-71`.
- **Failure mode:** Agents may assume `doctor` is allowed to repair roots or write binding state. The implementation only reads (`existsSync`, `buildCatalog`, `readBinding`) and does not write. The contract is implicit.
- **Trigger:** Calling `doctor` with the expectation of a documented no-mutate / dry-run result.
- **Evidence:** Reproduced: `SKILL_MCP_STATE_DIR` did not exist before `doctor` + `archive_idle` and still did not exist after. `DoctorReport` has no `dry_run` field. `test/tools.test.ts:60-67` only checks `ok` and `skills`.
- **Smallest correction:** Add `dry_run: true` (and a short note) to `DoctorReport`, matching `archive_idle`. Test that neither tool creates/renames/deletes skill files or binding state.
- **Confidence:** strongly inferred (behavior is already dry-run; contract is incomplete).

### 5. Low — `doctor` root counts use `String.startsWith` on paths

- **Where:** `runDoctor` in `src/doctor.ts:25-28`.
- **Failure mode:** Root `/tmp/skills` also matches files under `/tmp/skills-extra` (prefix collision), inflating `roots[].count` and probes.
- **Trigger:** Two configured roots where one path is a prefix of the other.
- **Evidence:** Code uses `sk.path.startsWith(s.root)` with no separator boundary. Analogous sibling: `walkSkillFiles` joins with `path.join` (`src/catalog.ts:53`).
- **Smallest correction:** Count with `path.relative(root, sk.path)` that does not start with `..` (and is not absolute), or `startsWith(root + path.sep)`.
- **Confidence:** strongly inferred (not reproduced with live roots).

### 6. Low — `DEFAULT_TOKEN_BUDGET` is duplicated

- **Where:** `src/config.ts:6` (imported by `src/tools.ts:4,73`); `src/tokens.ts:1` (imported by `src/suggest.ts:4`).
- **Failure mode:** Default budget advertised as 4000 can silently split (tool default vs `suggestSkills` default).
- **Trigger:** Changing one literal.
- **Evidence:** Two `export const DEFAULT_TOKEN_BUDGET = 4000` literals. Not currently divergent.
- **Smallest correction:** Single export from `config.ts`; `tokens.ts` / `suggest.ts` import it.
- **Confidence:** strongly inferred (latent).

## ROOT_CAUSE_ALIGNMENT

`NOT_APPLICABLE`

This is a full-tree contract review, not a defect-repair diff. Finding 1 is a missing character-class in the CJK boundary (root cause = incomplete Unicode script set, not a caller workaround). Findings 2 and 6 are duplicated literals at the owning invariant. No caller-only special case, swallowed exception, or weakened test was used as a “fix” in this snapshot.

## Questions / optional improvements

- `bind_skills` inputSchema (`src/index.ts:29-38`) does not set `maxItems: 3` on `names`; runtime rejects in `toolBind`. Schema-level cap would help MCP clients.
- `parseRootsEnv` (`src/config.ts:32-35`) splits on `:`, which breaks Windows drive letters in `SKILL_MCP_ROOTS`. Not in the product constraint list; Linux/mac defaults are fine.
- `writeCatalog` (`src/catalog.ts:160-165`) mutates disk but is not wired to any MCP tool. Dead for the stdio product path.
- `readBinding` (`src/bind.ts:32`) sets `none: skills.length === 0 || Boolean(raw.none)`, so a hand-edited file with both `none: true` and skills would report none while still listing skills. `writeBinding` stays consistent.

## Cleared surfaces

Checked against the product constraints; strongest counterexample noted.

| Constraint | Result | Counterexample attempted |
| --- | --- | --- |
| Local stdio MCP only | Pass | `src/index.ts:100-102` uses `StdioServerTransport` only. `src/` has no `createServer` / `listen` / `express` / `fetch`. HTTP appears only as transitive MCP SDK deps, not product code. |
| list / suggest / bind tools | Pass | Registered in `src/index.ts:7-82`; dispatched in `src/tools.ts:33-42`. No marketplace / uninstall / ranker-train tool. |
| Hard max 3 bound skills | Pass (today) | `handleTool("bind_skills", {names: 4})` errors (`test/tools.test.ts:41-46`). `writeBinding`/`readBinding` slice to `MAX_BOUND`. Reproduced: `suggest_skills` with `budget: 999999` and 4 overlapping skills returned 3, dropped 4th with `why: "cap"`. |
| Token budget never raises cap | Pass (today) | `suggestSkills` applies `applyBudget` **after** `rank()` already sliced to 3 (`src/suggest.ts:27-38`). Huge budget cannot resurrect overflow. Unit test `test/suggest.test.ts:21-32` covers a tight budget reducing further. Missing: durable `handleTool` test (Finding 3). |
| CJK Chinese / Japanese | Pass | Goldens for `中文路由` and hiragana/katakana tokenize. |
| CJK Korean | **Fail** | Finding 1. |
| doctor dry-run | Pass (behavior) | No `writeFileSync` in `src/doctor.ts`. Reproduced: does not create `SKILL_MCP_STATE_DIR`. Contract incomplete (Finding 4). |
| archive_idle dry-run | Pass (behavior) | `planArchiveIdle` only reads catalog + binding; returns `dry_run: true` and an explicit never-move note. Test checks the flag, not the filesystem. |
| read_skill explicit opt-in | Pass (behavior) | Only `toolReadSkill` reads file body (`src/tools.ts:122-131`). `list_skills` strips body via `lean()` (`src/tools.ts:23-25,63`). Reproduced: list rows have no `body`; `read_skill` without `name` errors. Missing: suggest/bind/doctor/archive body-absent tests. |
| Out of scope (store / auto-uninstall / retrain) | Pass | No such tools or modules. `unshadowHint` never suggests `rm -rf` (`test/catalog.test.ts:178-200`). |
| Bilingual README + Claude Desktop + Cursor | Pass | `README.md` and `README.zh-CN.md` both include install, Claude Desktop JSON, Cursor snippet, tool table, max-3 / budget / lean invariants. |

**Analogous implementation checked:** bind cap (`toolBind` + `writeBinding` slice) vs suggest cap (`rank` slice + `applyBudget`). Bind fails closed (error on >3 names); suggest fails closed by truncation + `dropped`. Archive vs doctor: archive is explicit dry-run; doctor is implicit.

**Unavailable / unreviewed:** live Claude Desktop / Cursor process; npm packed tarball contents beyond `package.json` `files`; MCP SDK request-schema stripping of extra properties (`query` / `skills` aliases in `src/tools.ts`); Windows `SKILL_MCP_ROOTS` drive-letter behavior.

## Verification gaps (for TDD follow-up)

Material gaps that violate constraints or leave them unproven at the public seam:

1. Hangul tokenize, `estimateTokens`, and `suggest_skills` / `list_skills` / `bind_skills` / `read_skill` through `handleTool`.
2. `handleTool("suggest_skills")` with four matches and a huge budget still returns `skills.length === 3` and a `why: "cap"` drop.
3. `doctor` and `archive_idle` filesystem freeze (no create/rename/delete) plus `doctor.dry_run === true`.
4. Lean default: list / suggest / bind / doctor / archive payloads contain no `body`; `read_skill` requires an explicit name.
5. Single `MAX_BOUND` source of truth used by ranker and bind.
