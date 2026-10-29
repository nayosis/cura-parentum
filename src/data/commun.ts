/*
 * Outils partagés par les fonctions de src/data/ (côté serveur uniquement).
 * Ce module n'est pas exposé par RPC : rien ici n'est appelable depuis le navigateur.
 */
import { existsSync, statSync } from "node:fs";
import { extname } from "node:path";
import { newId, query, type Statement } from "../db/client";
import { MIME_PAR_EXTENSION } from "../lib/documents";
import { ErreurMetier } from "../../serveur/erreurs";
import { cheminFichier, nomValide } from "../../serveur/fichiers";

export type FichierARattacher = { fichier: string; nom: string };

export const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Fichiers déjà envoyés (POST /api/fichiers) : présents sur le disque, jamais rattachés. Type et taille relus sur le disque. */
export async function instructionsJustificatifs(fichiers: FichierARattacher[], lien: { depenseId?: string; remboursementId?: string }): Promise<Statement[]> {
  const vus = new Set<string>();
  const sts: Statement[] = [];
  for (const f of fichiers) {
    if (!nomValide(f.fichier) || !existsSync(cheminFichier(f.fichier))) throw new ErreurMetier("Fichier introuvable : renvoyez-le.");
    const mime = MIME_PAR_EXTENSION[extname(f.fichier).slice(1)];
    if (!mime) throw new ErreurMetier("Type de fichier non pris en charge.");
    if (vus.has(f.fichier) || (await query("select 1 from justificatif where fichier = ?", [f.fichier])).length) throw new ErreurMetier("Ce fichier est déjà rattaché.");
    vus.add(f.fichier);
    sts.push({
      sql: "insert into justificatif (id, depense_id, remboursement_id, nom, fichier, mime, taille) values (?, ?, ?, ?, ?, ?, ?)",
      params: [newId(), lien.depenseId ?? null, lien.remboursementId ?? null, f.nom.trim() || f.fichier, f.fichier, mime, statSync(cheminFichier(f.fichier)).size],
    });
  }
  return sts;
}

export type TotalCategorie = { id: string | null; nom: string; couleur: string; total: number };

/**
 * Dépenses par catégorie entre deux dates (incluses), de la plus grosse à la plus petite. Une dépense à plusieurs
 * catégories compte dans chacune (la somme des catégories peut donc dépasser le total) ; sans catégorie : à part.
 */
export async function parCategorie(debut: string, fin: string): Promise<TotalCategorie[]> {
  const lignes = await query(
    `select c.id, c.nom, c.couleur, sum(d.montant) from depense d
       join depense_categorie dc on dc.depense_id = d.id join categorie c on c.id = dc.categorie_id
     where d.date between ?1 and ?2 group by c.id
     union all
     select null, 'Sans catégorie', 'gray', sum(d.montant) from depense d
     where d.date between ?1 and ?2 and not exists (select 1 from depense_categorie dc where dc.depense_id = d.id)
     having count(*) > 0`,
    [debut, fin],
  );
  return lignes
    .map(([id, nom, couleur, total]) => ({ id: id as string | null, nom: nom as string, couleur: couleur as string, total: Number(total) }))
    .sort((a, b) => b.total - a.total);
}
