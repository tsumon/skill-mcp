#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installHostConfigs, writeMcpOutput } from "./install.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const serverPath = path.join(root, "dist", "index.js");
const outputDir = path.join(root, "docs", "output");
const writeHosts = process.argv.includes("--no-hosts") ? false : true;

const written = writeMcpOutput({
  outputDir,
  serverPath,
  nodePath: process.execPath,
});
const hosts = installHostConfigs({
  serverPath,
  nodePath: process.execPath,
  writeHosts,
});

console.log("skill-mcp install");
console.log("  server: " + serverPath);
console.log("  Claude snippet: " + written.claude);
console.log("  Cursor snippet: " + written.cursor);
if (hosts.claude) console.log("  Claude Desktop config: " + hosts.claude);
if (hosts.cursor) console.log("  Cursor config: " + hosts.cursor);
console.log("Restart Claude Desktop / Cursor after wiring.");
console.log("Next: bind_skills then: node dist/index.js write-contract");
console.log("Archive idle (dry-run): node dist/index.js archive-idle");
console.log("Native skills bypass: node dist/index.js native-skills enable|restore");
