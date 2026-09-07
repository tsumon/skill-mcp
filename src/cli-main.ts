#!/usr/bin/env node
import { printCli, runCli } from "./cli.js";

const result = await runCli(process.argv.slice(2));
printCli(result);
process.exit(result.ok ? 0 : 1);
