import type { Hono } from "hono";
import { catalogIntegration } from "../../../../integration/catalogIntegration";
import { bookJson } from "../../infrastructure/json";
import { listBooksCached } from "./listBooksCached";

/** Lista todos os livros, com cache no Redis. */
export function registerRoutes(api: Hono): void {
  api.get("/lista-livros", async (c) => {
    const { books, cache } = await listBooksCached(catalogIntegration);
    // HIT, MISS ou BYPASS (sem Redis): dá para ver o cache funcionando no DevTools
    c.header("X-Cache", cache);
    return c.json(books.map(bookJson));
  });
}
