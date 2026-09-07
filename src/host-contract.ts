import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { bindingContract, resolveBinding } from "./bind.js";
import { projectDir, stateDir } from "./config.js";

type Env = NodeJS.ProcessEnv;

export const CONTRACT_START = "<!-- skill-mcp-contract:start -->";
export const CONTRACT_END = "<!-- skill-mcp-contract:end -->";

export type HostContractPaths = {
  canonical: string;
  claude: string;
  cursor: string;
};

export type HostContractWrite = HostContractPaths & {
  files: string[];
  contract: string;
  ok: true;
};

export function hostContractPaths(env: Env = process.env): HostContractPaths {
  const project = projectDir(env);
  return {
    canonical: path.join(stateDir(env), "HOST-CONTRACT.md"),
    claude: path.join(project, "CLAUDE.md"),
    cursor: path.join(project, ".cursor", "rules", "skill-mcp-contract.mdc"),
  };
}

export function hostContractBody(env: Env = process.env): string {
  return bindingContract(resolveBinding(env).state);
}

function wrapManaged(body: string): string {
  return [CONTRACT_START, body.trimEnd(), CONTRACT_END].join("\n");
}

function upsertManagedBlock(existing: string, body: string): string {
  const block = wrapManaged(body);
  const start = existing.indexOf(CONTRACT_START);
  const end = existing.indexOf(CONTRACT_END);
  if (start !== -1 && end !== -1 && end > start) {
    return existing.slice(0, start) + block + existing.slice(end + CONTRACT_END.length);
  }
  const trimmed = existing.trimEnd();
  return (trimmed ? trimmed + "\n\n" : "") + block + "\n";
}

function writeFileEnsured(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

function cursorRule(body: string): string {
  return [
    "---",
    "description: skill-mcp binding contract — use only the bound skills",
    "alwaysApply: true",
    "---",
    "",
    wrapManaged(body),
    "",
  ].join("\n");
}

export function writeHostContract(env: Env = process.env): HostContractWrite {
  const contract = hostContractBody(env);
  const paths = hostContractPaths(env);
  writeFileEnsured(paths.canonical, contract + "\n");

  const previousClaude = existsSync(paths.claude) ? readFileSync(paths.claude, "utf8") : "";
  writeFileEnsured(paths.claude, upsertManagedBlock(previousClaude, contract));
  writeFileEnsured(paths.cursor, cursorRule(contract));

  return {
    ...paths,
    files: [paths.canonical, paths.claude, paths.cursor],
    contract,
    ok: true,
  };
}
