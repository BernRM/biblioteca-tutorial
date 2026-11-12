import { storage } from "../../../../infrastructure/storage";
import { NotImplemented } from "../../../../shared/errors";

/**
 * UC26: remove a foto do autor.
 *
 * TODO (atividade): siga removeBookCover, em
 * modules/catalog/features/manage-book-cover/removeBookCover.ts:
 *   1. sem RustFS (requireStorage), 503 antes de mexer no banco;
 *   2. numa transação, zere foto_atualizada_em; autor inexistente, 404;
 *   3. só então descarte o objeto em photoKey(id) com discardObject;
 *   4. invalide o cache da busca de autores.
 */
export async function removeAuthorPhoto(id: number, client = storage): Promise<void> {
  throw new NotImplemented("UC26 ainda não implementado: remover a foto do autor");
}
