export { DEFAULT_TOKEN_BUDGET } from "./config.js";

const CJK_CHAR = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u;

export function estimateTokens(text: string): number {
  if (text === "") return 0;
  let cjkCodePoints = 0;
  let cjkUtf16Length = 0;
  for (const ch of text) {
    if (CJK_CHAR.test(ch)) {
      cjkCodePoints += 1;
      cjkUtf16Length += ch.length;
    }
  }
  if (cjkCodePoints === 0) {
    return Math.ceil(text.length / 4);
  }
  return cjkCodePoints + Math.ceil((text.length - cjkUtf16Length) / 4);
}

export function applyBudget<T extends { tokens: number }>(
  skills: T[],
  maxTokens: number,
): T[] {
  const kept: T[] = [];
  let used = 0;
  for (const skill of skills) {
    if (used + skill.tokens <= maxTokens) {
      kept.push(skill);
      used += skill.tokens;
    }
  }
  return kept;
}

export function skippedByBudget<T extends { tokens: number }>(
  skills: T[],
  maxTokens: number,
): T[] {
  const skipped: T[] = [];
  let used = 0;
  for (const skill of skills) {
    if (used + skill.tokens <= maxTokens) {
      used += skill.tokens;
    } else {
      skipped.push(skill);
    }
  }
  return skipped;
}
