import { query } from "../db/client";
import { parCategorie } from "./commun";
export type { TotalCategorie } from "./commun";
import { aujourdhui } from "../lib/dates";
import { listeDepenses } from "./depenses";
import { listeRemboursements } from "./remboursements";

/**
 * Le tableau de bord : ce qui attend d'être remboursé, les dépenses sans justificatif, le dernier remboursement,
 * le dépensé de l'année (par mois), les catégories du mois et de l'année, les dernières dépenses et remboursements.
 */
export async function tableauDeBord() {
  const jour = aujourdhui();
  const annee = jour.slice(0, 4);
  const mois = jour.slice(0, 7);
  const debutAnnee = `${annee}-01-01`;
  const finAnnee = `${annee}-12-31`;

  const [[nbAttente, totalAttente, depuis]] = await query("select count(*), coalesce(sum(montant), 0), min(date) from depense where remboursement_id is null");
  const [[sansJustificatif, sansJustificatifAttente]] = await query(
    `select count(*), coalesce(sum(remboursement_id is null), 0) from depense d
     where not exists (select 1 from justificatif j where j.depense_id = d.id and j.archive = 0)`,
  );
  const mensuel = await query("select substr(date, 6, 2), sum(montant) from depense where date between ? and ? group by 1", [debutAnnee, finAnnee]);
  const parMois = Array.from({ length: 12 }, () => 0);
  for (const [m, total] of mensuel) parMois[Number(m) - 1] = Number(total);
  const totalAnnee = parMois.reduce((t, x) => t + x, 0);
  const moisEcoules = Number(jour.slice(5, 7));

  const remboursements = await listeRemboursements();

  return {
    jour,
    aRembourser: { nb: Number(nbAttente), total: Number(totalAttente), depuis: (depuis as string | null) ?? null },
    sansJustificatif: { nb: Number(sansJustificatif), aRembourser: Number(sansJustificatifAttente) },
    dernierRemboursement: remboursements[0] ?? null,
    annee: { annee: Number(annee), total: totalAnnee, moyenneMensuelle: Math.round(totalAnnee / moisEcoules), parMois },
    categoriesMois: await parCategorie(`${mois}-01`, `${mois}-31`),
    categoriesAnnee: await parCategorie(debutAnnee, finAnnee),
    dernieresDepenses: await listeDepenses({ limite: 6 }),
    remboursementsRecents: remboursements.slice(0, 3),
  };
}
