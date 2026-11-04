import { expect, test } from "bun:test";
import { api, testAuthor, testBook, testIsbn, testName } from "#tests/api";
import { createRedis } from "../../../../infrastructure/redis";
import { catalogIntegration } from "../../../../integration/catalogIntegration";
import { invalidateBookList } from "../../infrastructure/booksCache";
import { listBooksCached } from "./listBooksCached";

async function list() {
  const response = await api("GET", "/lista-livros");
  expect(response.status).toBe(200);
  return { cache: response.headers.get("X-Cache"), books: await response.json() as { id: number; totalExemplares: number }[] };
}

test("lista-livros: a segunda listagem vem do cache", async () => {
  await invalidateBookList();
  const first = await list();
  expect(first.cache).toBe("MISS");
  const second = await list();
  expect(second.cache).toBe("HIT");
  expect(second.books).toEqual(first.books);
});

test("lista-livros: cadastrar e excluir livro invalidam o cache", async () => {
  await list();
  expect((await list()).cache).toBe("HIT");
  const author = await testAuthor();
  const book = await (await api("POST", "/livros", { isbn: testIsbn(), titulo: testName("Livro"), autorId: author.id })).json();
  const afterCreate = await list();
  expect(afterCreate.cache).toBe("MISS");
  expect(afterCreate.books.some((b) => b.id === book.id)).toBe(true);

  expect((await list()).cache).toBe("HIT");
  expect((await api("DELETE", `/livros/${book.id}`)).status).toBe(204);
  const afterDelete = await list();
  expect(afterDelete.cache).toBe("MISS");
  expect(afterDelete.books.some((b) => b.id === book.id)).toBe(false);
});

test("lista-livros: cadastrar exemplar invalida o cache", async () => {
  const book = await testBook();
  await list();
  expect((await list()).cache).toBe("HIT");
  expect((await api("POST", "/exemplares", { livroId: book.id, localizacao: "Estante A", estadoConservacao: "bom" })).status).toBe(201);
  const afterCopy = await list();
  expect(afterCopy.cache).toBe("MISS");
  expect(afterCopy.books.find((b) => b.id === book.id)!.totalExemplares).toBe(1);
});

test("lista-livros: sem Redis a listagem responde do Postgres", async () => {
  const book = await testBook();
  const dead = createRedis("redis://127.0.0.1:1", { autoReconnect: false });
  const result = await listBooksCached(catalogIntegration, dead);
  expect(result.cache).toBe("BYPASS");
  expect(result.books.some((b) => b.id === book.id)).toBe(true);
  await invalidateBookList(dead);
});
