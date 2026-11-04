import type { RedisClient } from "bun";
import { ready, redis, redisKey } from "../../../infrastructure/redis";
import type { BookView } from "../domain/Book";

export type CacheStatus = "HIT" | "MISS" | "BYPASS";

/** A lista em cache vale por 60 s mesmo que ninguém a invalide. */
const TTL_SECONDS = 60;

// "acervo" é o prefixo do módulo catalog (KEY_OWNERS em scripts/check-boundaries.ts)
const GENERATION = redisKey("acervo", "livros", "geracao");

/** Campo único do hash: a listagem não tem termo, é sempre a lista inteira. */
const FIELD = "lista";

/**
 * Cada geração é um hash com o campo da lista, com TTL próprio (HSETEX, novo no
 * Redis 8). Quando o campo expira, o hash some.
 */
function generationHash(generation: number): string {
  return redisKey("acervo", "livros", String(generation));
}

/**
 * Lê a geração atual e, nela, a lista de livros. Devolve null quando não há
 * Redis (bypass): quem chamou segue direto para o Postgres.
 */
export async function readCachedBooks(client: RedisClient | null = redis): Promise<{ generation: number; books: BookView[] | null } | null> {
  if (!client) return null;
  try {
    await ready(client);
    const generation = Number(await client.get(GENERATION) ?? 0);
    const cached = await client.hget(generationHash(generation), FIELD);
    return { generation, books: cached === null ? null : JSON.parse(cached) as BookView[] };
  } catch (error) {
    console.warn("Cache de livros indisponível:", (error as Error).message);
    return null;
  }
}

/**
 * Grava na geração que estava valendo quando a leitura começou. Se uma escrita
 * invalidou o cache no meio do caminho, esta lista (talvez velha) vai para uma
 * geração que ninguém mais lê, e expira sozinha.
 */
export async function writeCachedBooks(generation: number, books: BookView[], client: RedisClient | null = redis): Promise<void> {
  if (!client) return;
  try {
    await ready(client);
    await client.send("HSETEX", [generationHash(generation), "EX", String(TTL_SECONDS), "FIELDS", "1", FIELD, JSON.stringify(books)]);
  } catch (error) {
    console.warn("Cache de livros indisponível:", (error as Error).message);
  }
}

/**
 * Invalida a lista: a próxima leitura procura na geração seguinte, que começa
 * vazia. Chame depois do COMMIT; antes dele, uma leitura concorrente ainda veria
 * o dado antigo no Postgres e o gravaria na geração nova.
 */
export async function invalidateBookList(client: RedisClient | null = redis): Promise<void> {
  if (!client) return;
  try {
    await ready(client);
    await client.incr(GENERATION);
  } catch (error) {
    console.warn("Cache de livros indisponível:", (error as Error).message);
  }
}
