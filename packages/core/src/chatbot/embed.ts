// Matches the CalendarChunk.embedding column's vector(1536) dimension.
export const EMBEDDING_DIMENSIONS = 1536;

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/**
 * Deterministic bag-of-words "hashing trick" embedding — NOT a real ML
 * embedding model. No embedding provider (OpenAI, Voyage, a local Ollama
 * embedding model, ...) is configured in this environment, so this function
 * is the swap-later mock: each token hashes into a fixed-size vector with a
 * sign derived from the same hash (the standard hashing-trick construction),
 * then the result is L2-normalized. Text sharing vocabulary lands measurably
 * closer in cosine distance than unrelated text, which is enough to exercise
 * real pgvector ANN search end to end (see packages/chatbot/src/retrieve.ts)
 * — it is not a semantic embedding and won't generalize across synonyms or
 * paraphrase the way a real model would. See DATA_TODO.md.
 */
export function embedText(text: string, dims = EMBEDDING_DIMENSIONS): number[] {
  const vec = new Array<number>(dims).fill(0);
  for (const token of tokenize(text)) {
    const h = fnv1a(token);
    const idx = h % dims;
    const sign = h & 1 ? 1 : -1;
    vec[idx] = (vec[idx] ?? 0) + sign;
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

/** Both inputs are expected L2-normalized (as embedText produces), so the dot product equals cosine similarity. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error("cosineSimilarity: vectors must have the same length");
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot;
}
