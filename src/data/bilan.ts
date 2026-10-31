import { query } from "../db/client";
import { ErreurMetier } from "../../serveur/erreurs";
import { parCategorie } from "./commun";
import { listeRemboursements } from "./remboursements";

/** Années qui ont des dépenses ou des remboursements, de la plus récente à la plus ancienne. */
export async function anneesDisponibles() {
  const lignes = await query("select distinct substr(date, 1, 4) from depense union select distinct substr(date_virement, 1, 4) from remboursement order by 1 desc");
  return lignes.map((l) => Number(l[0]));
}

/**
 * Bilan d'une année, pour rendre des comptes : total, par mois, par catégorie, par moyen de paiement,
 * dépenses sans justificatif, et les remboursements de l'année (virés dans l'année) avec leur écart cumulé.
 */
export async function bilanAnnuel(annee: number) {
  if (!Number.isInteger(annee) || annee < 1900 || annee > 9999) throw new ErreurMetier("Année invalide.");
  const debut = `${annee}-01-01`;
  const fin = `${annee}-12-31`;
  const [[nb, total]] = await query("select count(*), coalesce(sum(montant), 0) from depense where date between ? and ?", [debut, fin]);
  const [[sansJustificatif, absents]] = await query(
    `select coalesce(sum(d.absence is null), 0), coalesce(sum(d.absence is not null), 0) from depense d where d.date between ? and ?
     and not exists (select 1 from justificatif j where j.depense_id = d.id and j.archive = 0)`,
    [debut, fin],
  );
  const parMois = Array.from({ length: 12 }, () => 0);
  for (const [m, t] of await query("select substr(date, 6, 2), sum(montant) from depense where date between ? and ? group by 1", [debut, fin])) parMois[Number(m) - 1] = Number(t);
  const parMoyen = (
    await query(
      `select m.libelle, t.libelle, count(*), sum(d.montant) from depense d
         join moyen_paiement m on m.id = d.moyen_id join type_paiement t on t.id = m.type_id
       where d.date between ? and ? group by m.id order by 4 desc`,
      [debut, fin],
    )
  ).map(([libelle, type, n, t]) => ({ libelle: libelle as string, type: type as string, nb: Number(n), total: Number(t) }));
  const remboursements = (await listeRemboursements()).filter((r) => r.dateVirement.startsWith(String(annee))).reverse();
  return {
    annee,
    nbDepenses: Number(nb),
    total: Number(total),
    sansJustificatif: Number(sansJustificatif),
    absents: Number(absents),
    parMois,
    parCategorie: await parCategorie(debut, fin),
    parMoyen,
    remboursements,
    totalVire: remboursements.reduce((t, r) => t + r.montantVire, 0),
    ecartCumule: remboursements.reduce((t, r) => t + r.ecart, 0),
  };
}
