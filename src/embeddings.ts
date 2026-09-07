import { MAX_BOUND } from "./config.js";
import type { CatalogSkill } from "./catalog.js";
import type { RankResult, RankedSkill } from "./ranker.js";

export type EmbeddingClient = {
  available: () => boolean | Promise<boolean>;
  embed: (texts: string[]) => number[][] | Promise<number[][]>;
};

let injected: EmbeddingClient | undefined;

export function setEmbeddingClient(client?: EmbeddingClient): void {
  injected = client;
}

export function embeddingMode(env: NodeJS.ProcessEnv = process.env): "off" | "auto" | "on" {
  const raw = String(env.SKILL_MCP_EMBEDDINGS || "auto").toLowerCase();
  if (raw === "off" || raw === "on" || raw === "auto") return raw;
  return "auto";
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function createOllamaClient(env: NodeJS.ProcessEnv = process.env): EmbeddingClient {
  const base = String(env.SKILL_MCP_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = env.SKILL_MCP_EMBED_MODEL || "nomic-embed-text";
  return {
    async available() {
      try {
        const res = await fetch(base + "/api/tags", { signal: AbortSignal.timeout(400) });
        return res.ok;
      } catch {
        return false;
      }
    },
    async embed(texts: string[]) {
      const out: number[][] = [];
      for (const prompt of texts) {
        const res = await fetch(base + "/api/embeddings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, prompt }),
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) throw new Error("ollama embed failed");
        const json = (await res.json()) as { embedding?: number[] };
        if (!Array.isArray(json.embedding)) throw new Error("ollama embed missing");
        out.push(json.embedding);
      }
      return out;
    },
  };
}

export function resolveEmbeddingClient(env: NodeJS.ProcessEnv = process.env): EmbeddingClient | undefined {
  if (injected) return injected;
  const mode = embeddingMode(env);
  if (mode === "off") return undefined;
  if (mode === "auto" && !env.SKILL_MCP_OLLAMA_URL && !env.SKILL_MCP_EMBED_MODEL) {
    return undefined;
  }
  return createOllamaClient(env);
}

function skillText(skill: Pick<CatalogSkill, "name" | "description" | "h2">): string {
  return "skill:" + skill.name + "\n" + skill.description + "\n" + (skill.h2 ?? "");
}

export async function rankEmbedded(
  catalog: CatalogSkill[],
  prompt: string,
  client: EmbeddingClient,
): Promise<RankResult> {
  const texts = ["prompt:" + prompt, ...catalog.map(skillText)];
  const vectors = await client.embed(texts);
  const query = vectors[0] ?? [];
  const scored: RankedSkill[] = catalog.map((skill, i) => ({
    name: skill.name,
    path: skill.path,
    score: cosine(query, vectors[i + 1] ?? []),
    reason: "embedding cosine",
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  const kept = scored.filter((s) => s.score >= 0.15);
  return {
    skills: kept.slice(0, MAX_BOUND),
    overflow: kept.slice(MAX_BOUND),
    none: kept.length === 0,
  };
}
