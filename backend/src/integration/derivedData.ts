import { invalidateAuthorSearch } from "../modules/authorship";
import { reconcileBookIndex } from "../modules/catalog";
import { catalogIntegration } from "./catalogIntegration";

/**
 * Os dados derivados do Redis podem ter ficado para trás: o servidor esteve
 * parado enquanto o banco mudou, ou o seed escreveu direto nas tabelas.
 * Recalcula tudo a partir do Postgres, a fonte da verdade.
 */
export async function refreshDerivedData(): Promise<void> {
  await invalidateAuthorSearch();
  const { indexed, removed } = await reconcileBookIndex(catalogIntegration);
  console.log(`Índice semântico: ${indexed} livro(s) indexado(s), ${removed} removido(s)`);
}