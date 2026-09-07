import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type McpServerConfig = {
  command: string;
  args: string[];
  env?: Record<string, string>;
};

export type McpFile = {
  mcpServers: Record<string, McpServerConfig>;
};

export type GenerateOpts = {
  serverPath: string;
  nodePath?: string;
};

export function generateMcpSnippets(opts: GenerateOpts): { claude: McpFile; cursor: McpFile } {
  const serverPath = path.resolve(opts.serverPath);
  const nodePath = opts.nodePath || process.execPath;
  const server: McpServerConfig = { command: nodePath, args: [serverPath] };
  return {
    claude: { mcpServers: { "skill-mcp": { ...server } } },
    cursor: { mcpServers: { "skill-mcp": { ...server } } },
  };
}

export function writeMcpOutput(opts: GenerateOpts & { outputDir: string }): {
  claude: string;
  cursor: string;
  snippets: { claude: McpFile; cursor: McpFile };
} {
  mkdirSync(opts.outputDir, { recursive: true });
  const snippets = generateMcpSnippets(opts);
  const claude = path.join(opts.outputDir, "claude-desktop.mcp.json");
  const cursor = path.join(opts.outputDir, "cursor.mcp.json");
  writeFileSync(claude, JSON.stringify(snippets.claude, null, 2) + "\n", "utf8");
  writeFileSync(cursor, JSON.stringify(snippets.cursor, null, 2) + "\n", "utf8");
  return { claude, cursor, snippets };
}

function mergeMcpFile(file: string, incoming: McpFile): void {
  let current: McpFile = { mcpServers: {} };
  if (existsSync(file)) {
    try {
      current = JSON.parse(readFileSync(file, "utf8")) as McpFile;
      if (!current.mcpServers || typeof current.mcpServers !== "object") current.mcpServers = {};
    } catch {
      current = { mcpServers: {} };
    }
  } else {
    mkdirSync(path.dirname(file), { recursive: true });
  }
  current.mcpServers["skill-mcp"] = incoming.mcpServers["skill-mcp"];
  writeFileSync(file, JSON.stringify(current, null, 2) + "\n", "utf8");
}

export function hostConfigPaths(
  home: string = os.homedir(),
  platform: NodeJS.Platform = process.platform,
): { claude: string; cursor: string } {
  const claude = platform === "darwin"
    ? path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
    : path.join(home, ".config", "Claude", "claude_desktop_config.json");
  return {
    claude,
    cursor: path.join(home, ".cursor", "mcp.json"),
  };
}

export function installHostConfigs(opts: GenerateOpts & {
  home?: string;
  writeHosts?: boolean;
  platform?: NodeJS.Platform;
}): {
  claude?: string;
  cursor?: string;
} {
  if (opts.writeHosts === false) return {};
  const snippets = generateMcpSnippets(opts);
  const hosts = hostConfigPaths(opts.home, opts.platform);
  const out: { claude?: string; cursor?: string } = {};
  mergeMcpFile(hosts.claude, snippets.claude);
  out.claude = hosts.claude;
  mergeMcpFile(hosts.cursor, snippets.cursor);
  out.cursor = hosts.cursor;
  return out;
}
