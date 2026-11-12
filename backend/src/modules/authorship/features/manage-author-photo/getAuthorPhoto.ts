import { storage, type StoredObject } from "../../../../infrastructure/storage";
import { NotImplemented } from "../../../../shared/errors";

/**
 * UC26: o Postgres diz se o autor tem foto; o RustFS guarda os bytes.
 *
 * TODO (atividade): siga getBookCover, em
 * modules/catalog/features/manage-book-cover/getBookCover.ts:
 *   1. leia foto_atualizada_em do autor: 404 "Autor não encontrado" se ele não
 *      existe, 404 "Autor sem foto" se a coluna é nula, sem consultar o RustFS;
 *   2. leia o objeto em photoKey(id) com getObject, passando `client`;
 *   3. objeto ausente (a coluna diz que há foto, mas o bucket não tem): 404.
 */
export async function getAuthorPhoto(id: number, client = storage): Promise<StoredObject> {
  throw new NotImplemented("UC26 ainda não implementado: mostrar a foto do autor");
}
