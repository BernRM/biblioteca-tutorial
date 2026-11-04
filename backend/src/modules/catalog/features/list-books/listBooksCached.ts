import type { RedisClient } from "bun";
import { redis } from "../../../../infrastructure/redis";
import type { BookView } from "../../domain/Book";
import type { CatalogIntegration } from "../../domain/CatalogIntegration";
import { readCachedBooks, writeCachedBooks, type CacheStatus } from "../../infrastructure/booksCache";
import { listBooks } from "./listBooks";

/**
 * Cache-aside: procura no Redis; se não estiver lá, busca no Postgres e guarda.
 * A listagem original continua igual, com várias consultas por livro (autor,
 * contagem, exemplares, disponibilidade); é esse custo que o cache evita.
 */
export async function listBooksCached(integration: CatalogIntegration, client: RedisClient | null = redis): Promise<{ books: BookView[]; cache: CacheStatus }> {
  const cached = await readCachedBooks(client);
  if (cached?.books) return { books: cached.books, cache: "HIT" };
  const books = await listBooks(integration);
  if (!cached) return { books, cache: "BYPASS" };
  await writeCachedBooks(cached.generation, books, client);
  return { books, cache: "MISS" };
}
