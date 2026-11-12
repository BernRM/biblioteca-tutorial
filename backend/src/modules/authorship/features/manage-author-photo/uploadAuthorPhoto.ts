import { storage } from "../../../../infrastructure/storage";
import { NotImplemented } from "../../../../shared/errors";
import type { ImageUpload } from "../../../../shared/images";
import type { AuthorView } from "../../domain/Author";
import type { AuthorshipIntegration } from "../../domain/AuthorshipIntegration";

/**
 * UC26: grava a foto do autor no RustFS e marca no Postgres quando ela mudou.
 *
 * TODO (atividade): siga uploadBookCover, em
 * modules/catalog/features/manage-book-cover/uploadBookCover.ts:
 *   1. confira que o autor existe (findAuthor): 404 antes de gravar qualquer byte;
 *   2. grave o objeto em photoKey(id) com putObject, passando `client`;
 *   3. numa transação, grave foto_atualizada_em = now e monte a AuthorView
 *      (toAuthorView, com RETURNING das colunas de AuthorRow);
 *   4. se o autor sumiu no meio do caminho, descarte o objeto e responda 404;
 *   5. depois do COMMIT, invalide o cache da busca de autores. Sem isso, a busca
 *      continua devolvendo fotoUrl antiga por até 60 s.
 */
export async function uploadAuthorPhoto(
  id: number,
  image: ImageUpload,
  integration: AuthorshipIntegration,
  { client = storage, now = new Date() } = {},
): Promise<AuthorView> {
  throw new NotImplemented("UC26 ainda não implementado: enviar a foto do autor");
}
