import { applyArchiveIdle, planArchiveIdle } from "./archive.js";
import { writeHostContract } from "./host-contract.js";
import { setNativeSkillsBypass } from "./host-skills.js";
import { getCatalog, rescanCatalog } from "./tools.js";

type Env = NodeJS.ProcessEnv;

export type CliResult = { ok: boolean; command: string; data: unknown; message?: string };

export async function runCli(argv: string[], env: Env = process.env): Promise<CliResult> {
  const [command, ...rest] = argv;
  if (command === "archive-idle") {
    const apply = rest.includes("--apply");
    const catalog = getCatalog(env);
    if (!apply) {
      return { ok: true, command, data: planArchiveIdle(catalog, env) };
    }
    const data = applyArchiveIdle(catalog, env);
    rescanCatalog(env);
    return { ok: true, command, data };
  }
  if (command === "write-contract") {
    return { ok: true, command, data: writeHostContract(env) };
  }
  if (command === "native-skills") {
    const action = rest[0] === "restore" || rest[0] === "disable" ? "restore" : rest[0] === "enable" ? "enable" : "";
    if (!action) {
      return { ok: false, command, data: null, message: "usage: native-skills enable|restore" };
    }
    return { ok: true, command, data: setNativeSkillsBypass(action === "enable", env) };
  }
  if (command === "help" || command === "--help" || command === "-h") {
    return {
      ok: true,
      command: "help",
      data: {
        usage: [
          "skill-mcp                         # stdio MCP server",
          "skill-mcp archive-idle            # dry-run idle/shadowed user skills",
          "skill-mcp archive-idle --apply    # move into a recoverable archive",
          "skill-mcp write-contract          # inject Claude/Cursor host contract",
          "skill-mcp native-skills enable    # Claude skillOverrides name-only",
          "skill-mcp native-skills restore   # revert host settings in one step",
        ],
      },
    };
  }
  if (command === "install") {
    return { ok: false, command, data: null, message: "use scripts/install.sh or node dist/install-cli.js" };
  }
  return { ok: false, command: command ?? "", data: null, message: "unknown command. try: archive-idle | write-contract | native-skills | help" };
}

export function printCli(result: CliResult): void {
  if (result.message) console.error(result.message);
  if (result.data !== null && result.data !== undefined) {
    console.log(JSON.stringify(result.data, null, 2));
  }
}


