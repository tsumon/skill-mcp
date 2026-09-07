import { existsSync } from "node:fs";
import path from "node:path";
import { buildCatalog, type Catalog } from "./catalog.js";
import { bindingPath, resolveRoots, stateDir } from "./config.js";
import { readBinding } from "./bind.js";

type Env = NodeJS.ProcessEnv;

export type DoctorProbe = { name: string; ok: boolean; detail: string };

export type DoctorReport = {
  ok: boolean;
  dry_run: true;
  roots: Array<{ root: string; exists: boolean; count: number }>;
  skills: number;
  shadowed: number;
  binding: { path: string; bound: number; none: boolean };
  stateDir: string;
  probes: DoctorProbe[];
  note: string;
};

export function runDoctor(env: Env = process.env, catalog?: Catalog): DoctorReport {
  const sources = resolveRoots(env);
  const cat = catalog ?? buildCatalog(sources);
  const underRoot = (skillPath: string, root: string): boolean => {
    const rel = path.relative(root, skillPath);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  };
  const roots = sources.map((s) => {
    const exists = existsSync(s.root);
    const count =
      cat.skills.filter((sk) => underRoot(sk.path, s.root)).length +
      cat.shadowed.filter((sk) => underRoot(sk.path, s.root)).length;
    return { root: s.root, exists, count };
  });
  const binding = readBinding(env);
  const probes: DoctorProbe[] = roots.map((r) => ({
    name: "root:" + r.root,
    ok: r.exists,
    detail: r.exists ? r.count + " skill file(s) under root" : "missing",
  }));
  probes.push({ name: "state_dir", ok: true, detail: stateDir(env) });
  probes.push({
    name: "binding",
    ok: true,
    detail: binding.none ? "none" : binding.skills.map((s) => s.name).join(", "),
  });
  return {
    ok: roots.some((r) => r.exists),
    dry_run: true,
    roots,
    skills: cat.skills.length,
    shadowed: cat.shadowed.length,
    binding: { path: bindingPath(env), bound: binding.skills.length, none: binding.none },
    stateDir: stateDir(env),
    probes,
    note: "doctor is dry-run only; skill-mcp never creates, moves, or deletes skills",
  };
}
