import type { PrismaClient } from "@prisma/client";
import { embedText } from "@wcs/core";

export interface RetrievedChunk {
  id: string;
  sourceRef: string;
  content: string;
  /** Cosine distance (pgvector's `<=>`) — lower is more similar. */
  distance: number;
}

/**
 * Real pgvector ANN search (`ORDER BY embedding <=> query LIMIT k`) — this
 * is genuine database retrieval, not a mock, even though embedText's
 * vectors are a deterministic hashing-trick construction rather than a real
 * ML embedding model (see packages/core/src/chatbot/embed.ts).
 */
export async function retrieveRelevantChunks(prisma: PrismaClient, query: string, k = 4): Promise<RetrievedChunk[]> {
  const vectorLiteral = `[${embedText(query).join(",")}]`;
  return prisma.$queryRaw<RetrievedChunk[]>`
    SELECT id, "sourceRef", content, (embedding <=> ${vectorLiteral}::vector) AS distance
    FROM "CalendarChunk"
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${k}
  `;
}
