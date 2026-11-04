# COLA — Redis na biblioteca (cache-aside)

Tudo aqui vem do código desta branch. Os `.diff` desta pasta mostram cada passo linha a linha.
Os caminhos abaixo são a partir de `backend/src/`, exceto `infra/`.

---

## (a) Os 4 passos: o que mexer e por quê

### Passo 01 — Redis no compose e o cliente (`passo01-...diff`)
| Arquivo | Ação | Motivo |
|---|---|---|
| `infra/compose.yaml` | alterar | serviço `redis` (imagem `redis:8`), `REDIS_URL` e `REDIS_PREFIX` em `app` e `test`, `depends_on` com healthcheck |
| `infrastructure/redis.ts` | criar | `createRedis`, `redis`, `ready`, `redisKey` |
| `infrastructure/redis.test.ts` | criar | testa prefixo, PING/versão 8 e cliente sem servidor falhando rápido |
| `shared/errors.ts` | alterar | nova classe `ServiceUnavailable` |
| `server.ts` | alterar | `ServiceUnavailable` vira HTTP 503 |
| `tests/errors.test.ts` | criar | testa o 503 |
| `seed.ts`, `import-books.ts` | alterar | `redis?.close()` no fim, senão a conexão aberta mantém o processo vivo |

### Passo 02 — Cache da busca de autores (`passo02-...diff`)
| Arquivo | Ação | Motivo |
|---|---|---|
| `modules/authorship/infrastructure/searchCache.ts` | criar | `readCachedSearch`, `writeCachedSearch`, `invalidateAuthorSearch`, `CacheStatus` |
| `modules/authorship/features/search-authors/searchAuthorsCached.ts` | criar | decide HIT / MISS / BYPASS |
| `modules/authorship/features/search-authors/route.ts` | alterar | usa a versão com cache e devolve o header `X-Cache` |
| `.../search-authors/search-authors-cache.test.ts` | criar | testes do cache |
| `create-author`, `update-author`, `delete-author` | alterar | `await invalidateAuthorSearch()` depois do COMMIT |
| `modules/authorship/index.ts` | alterar | exporta `invalidateAuthorSearch` (API pública do módulo) |
| `scripts/check-boundaries.ts` | alterar | regra `KEY_OWNERS`: prefixo da chave → módulo dono |

### Passo 03 — Livros invalidam o cache de autores (`passo03-...diff`)
Motivo: a busca de autores mostra `livrosNoAcervo`; criar/editar/excluir livro muda esse número, mas o módulo `catalog` não pode importar `authorship` diretamente.
| Arquivo | Ação | Motivo |
|---|---|---|
| `modules/catalog/domain/CatalogIntegration.ts` | alterar | novo método `bookCountsChanged(authorIds)` no contrato |
| `integration/catalogIntegration.ts` | alterar | implementa chamando `invalidateAuthorSearch()` |
| `create-book`, `update-book`, `delete-book` | alterar | `inTransaction` vira `const`; depois do COMMIT chama `integration.bookCountsChanged(...)` |
| `integration/derivedData.ts` | criar | `refreshDerivedData()`: invalida tudo a partir do Postgres |
| `main.ts`, `seed.ts`, `integration/seed/route.ts` | alterar | chamam `refreshDerivedData()` (servidor parado / seed escreve direto nas tabelas) |
| `search-authors-cache.test.ts` | alterar | teste: criar/excluir livro atualiza o cache de autores |

### Passo 04 — Cache da lista de livros (`passo04-...diff`)
| Arquivo | Ação | Motivo |
|---|---|---|
| `modules/catalog/infrastructure/booksCache.ts` | criar | `readCachedBooks`, `writeCachedBooks`, `invalidateBookList`, `CacheStatus` |
| `modules/catalog/features/list-books/listBooksCached.ts` | criar | HIT / MISS / BYPASS |
| `modules/catalog/features/list-books/route.ts` | alterar | usa `listBooksCached` e devolve `X-Cache` |
| `create-book`, `update-book`, `delete-book` | alterar | `await invalidateBookList()` depois do COMMIT |
| `create-copy`, `update-copy` | alterar | `return inTransaction(...)` vira `const copy = await ...` + invalidar + `return copy` |
| `delete-copy` | alterar | `await invalidateBookList()` depois do `inTransaction` |
| `list-books/list-books-cache.test.ts` | criar | HIT, invalidação por livro e exemplar, BYPASS |

Por que exemplar também invalida: a lista mostra `totalExemplares` e `exemplaresDisponiveis`.

---

## (b) Tabela "se o trecho tem X, o arquivo é Y"

| Se o trecho tem... | O arquivo é... |
|---|---|
| `new RedisClient(url, { enableOfflineQueue: false ... })`, `ready`, `redisKey` | `infrastructure/redis.ts` |
| `image: redis:8`, `REDIS_PREFIX` | `infra/compose.yaml` |
| `HSETEX`, `client.incr(GENERATION)`, `client.hget` | `searchCache.ts` (autores) ou `booksCache.ts` (livros) |
| `redisKey("autoria", ...)` | `authorship/infrastructure/searchCache.ts` |
| `redisKey("acervo", ...)` | `catalog/infrastructure/booksCache.ts` |
| `return { ..., cache: "HIT" }` / `"MISS"` / `"BYPASS"` | `searchAuthorsCached.ts` ou `listBooksCached.ts` |
| `c.header("X-Cache", cache)` | `route.ts` da fatia |
| `await invalidateBookList()` | `create/update/delete-book` e `create/update/delete-copy` |
| `await invalidateAuthorSearch()` | `create/update/delete-author` e `integration/catalogIntegration.ts` |
| `integration.bookCountsChanged(...)` | `create/update/delete-book` (chama a integração) |
| `refreshDerivedData` | `integration/derivedData.ts`, `main.ts`, `seed.ts`, `seed/route.ts` |
| `KEY_OWNERS` | `scripts/check-boundaries.ts` |
| `new ServiceUnavailable` / status 503 | `shared/errors.ts` / `server.ts` |
| `createRedis("redis://127.0.0.1:1", { autoReconnect: false })` | testes de BYPASS |

---

## (c) HIT / MISS / BYPASS e a geração

**Geração** = um número guardado na chave `biblioteca:acervo:livros:geracao` (se não existe, vale 0).
Os dados ficam num hash `biblioteca:acervo:livros:<geração>`, campo `lista`, gravado com `HSETEX ... EX 60` (TTL de 60 s no campo).

Fluxo de `listBooksCached`:
1. `readCachedBooks` lê a geração atual e tenta o `HGET` nela.
2. Achou → **HIT** (devolve o cache, não toca no Postgres).
3. Não achou → busca no Postgres com `listBooks`, grava com `writeCachedBooks` **na geração lida no passo 1** → **MISS**.
4. Sem Redis (`client` nulo) ou Redis fora do ar (`readCachedBooks` devolve `null`) → só Postgres, não grava → **BYPASS**.

Invalidar = `INCR` na geração. A próxima leitura olha o hash da geração nova (vazio) e dá MISS. Os hashes antigos expiram sozinhos em 60 s.

O header `X-Cache` mostra o resultado no DevTools.

---

## (d) Por que invalidar DEPOIS do COMMIT

Conforme o comentário em `invalidateBookList`: se a invalidação fosse **antes** do COMMIT, uma leitura concorrente ainda veria o dado antigo no Postgres (a transação não terminou) e o gravaria na **geração nova**. O cache ficaria velho até o TTL.

Depois do COMMIT, o dado novo já está visível; quem ler a geração nova lê o dado certo.

Por isso `invalidateBookList()` fica **fora** do `inTransaction`, e por isso createCopy/updateCopy precisaram do `const copy = await inTransaction(...)`.

A geração cobre também a corrida "leitura lenta": a leitura anota a geração **antes** de ir ao Postgres. Se uma escrita invalidar no meio, o resultado velho vai para uma geração que ninguém mais lê.

---

## (e) Armadilhas

- **Prefixo da chave = módulo dono.** `check-boundaries.ts` lê `redisKey("xxx"` e compara com `KEY_OWNERS` (`autoria` → authorship, `acervo` → catalog). Usar `"livros"` como primeiro trecho, ou usar `"acervo"` dentro de `authorship`, quebra o `check-boundaries`.
- **`REDIS_PREFIX` diferente nos testes.** App usa `biblioteca`, testes usam `biblioteca_test` (no `compose.yaml`). Dividem o mesmo Redis, mas as chaves não se misturam.
- **Sem `ports` e sem `volume` no redis.** De propósito: só guarda dado derivado do Postgres. Se o contêiner sumir, reconstrói.
- **Redis nunca derruba a API.** Todo acesso está em `try/catch` com `console.warn`; falha vira BYPASS. O cliente é criado com `enableOfflineQueue: false` para falhar na hora.
- **Sempre passar por `ready(client)`** antes de qualquer comando (a conexão abre no primeiro uso).
- **Não importe `authorship` dentro de `catalog`.** Por isso existe `bookCountsChanged` na integração.
- **Banco de testes:** se aparecer `database "biblioteca_test" does not exist`, rode `docker compose -f infra/compose.yaml exec db createdb -U biblioteca biblioteca_test` (está no README).
- Scripts de linha de comando (`seed`, `import-books`) precisam de `redis?.close()` no fim.

---

## (f) Comandos

Na raiz do repositório:

```
# subir tudo (app na porta 3000; db e redis só na rede interna)
docker compose -f infra/compose.yaml up --build

# criar o banco de testes (uma vez)
docker compose -f infra/compose.yaml exec db createdb -U biblioteca biblioteca_test

# rodar os testes
docker compose -f infra/compose.yaml run --rm --build test

# conferir fronteiras de módulo
docker compose -f infra/compose.yaml run --rm app bun run check-boundaries

# ver o cache funcionando (com o app no ar)
curl -i http://localhost:3000/api/lista-livros
```

Rode o `curl` duas vezes: o header `X-Cache` vai de `MISS` para `HIT`.
