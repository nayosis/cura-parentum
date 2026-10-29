import { and, desc, eq, getTableColumns, isNotNull, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { existsSync, statSync } from "node:fs";
import { extname } from "node:path";
import { batch, db, newId, query, type Statement } from "../db/client";
import { depense, justificatif, moyenPaiement, remboursement } from "../db/schema";
import { MIME_PAR_EXTENSION } from "../lib/documents";
import { ErreurMetier } from "../../serveur/erreurs";
import { cheminFichier, nomValide } from "../../serveur/fichiers";
import { adminCourant, utilisateurCourant } from "../../serveur/tracabilite";
import { verifierVersion, versionDe } from "./version";

export type CategorieDeDepense = { id: string; nom: string; couleur: string };
export type FichierARattacher = { fichier: string; nom: string };

/** Ce que voit l'utilisateur : « à rembourser » = pas encore cochée dans un remboursement. */
export type Statut = "toutes" | "a_rembourser" | "remboursees" | "sans_justificatif";

export type Filtre = { debut?: string; fin?: string; statut?: Statut; categorieId?: string; moyenId?: string; recherche?: string };

const CATEGORIES = sql<string>`(select json_group_array(json_object('id', c.id, 'nom', c.nom, 'couleur', c.couleur))
  from depense_categorie dc join categorie c on c.id = dc.categorie_id where dc.depense_id = "depense"."id")`;
const NB_JUSTIFICATIFS = sql<number>`(select count(*) from justificatif j where j.depense_id = "depense"."id" and j.archive = 0)`;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// --- Lecture

/** Dépenses filtrées, des plus récentes aux plus anciennes, avec moyen de paiement, catégories et nombre de justificatifs. */
export async function listeDepenses(f: Filtre = {}) {
  const conditions: SQL[] = [];
  if (f.debut) conditions.push(sql`${depense.date} >= ${f.debut}`);
  if (f.fin) conditions.push(sql`${depense.date} <= ${f.fin}`);
  if (f.statut === "a_rembourser") conditions.push(isNull(depense.remboursementId));
  if (f.statut === "remboursees") conditions.push(isNotNull(depense.remboursementId));
  if (f.statut === "sans_justificatif") conditions.push(sql`${NB_JUSTIFICATIFS} = 0`);
  if (f.moyenId) conditions.push(eq(depense.moyenId, f.moyenId));
  if (f.categorieId) conditions.push(sql`exists (select 1 from depense_categorie dc where dc.depense_id = ${depense.id} and dc.categorie_id = ${f.categorieId})`);
  const r = f.recherche?.trim();
  if (r) conditions.push(or(like(depense.libelle, `%${r}%`), like(depense.note, `%${r}%`))!);
  const lignes = await db
    .select({ ...getTableColumns(depense), moyenLibelle: moyenPaiement.libelle, categories: CATEGORIES, nbJustificatifs: NB_JUSTIFICATIFS })
    .from(depense)
    .innerJoin(moyenPaiement, eq(moyenPaiement.id, depense.moyenId))
    .where(and(...conditions))
    .orderBy(desc(depense.date), desc(depense.creeLe));
  return lignes.map((l) => ({ ...l, categories: JSON.parse(l.categories) as CategorieDeDepense[] }));
}

/** Une dépense, avec tous ses justificatifs (retirés compris, pour la preuve) et son remboursement. */
export async function ficheDepense(id: string) {
  const [d] = await db
    .select({ ...getTableColumns(depense), moyenLibelle: moyenPaiement.libelle, categories: CATEGORIES, dateVirement: remboursement.dateVirement })
    .from(depense)
    .innerJoin(moyenPaiement, eq(moyenPaiement.id, depense.moyenId))
    .leftJoin(remboursement, eq(remboursement.id, depense.remboursementId))
    .where(eq(depense.id, id));
  if (!d) throw new ErreurMetier("Dépense introuvable (supprimée ?).", 404);
  const justificatifs = await db.select().from(justificatif).where(eq(justificatif.depenseId, id)).orderBy(justificatif.creeLe);
  return { ...d, categories: JSON.parse(d.categories) as CategorieDeDepense[], justificatifs };
}

/** Pour pré-remplir la saisie : le moyen de paiement de la dernière dépense saisie par cette personne. */
export async function derniereSaisie() {
  const [l] = await query(
    `select d.moyen_id from depense d join moyen_paiement m on m.id = d.moyen_id
     where d.cree_par = ? and m.archive = 0 order by d.cree_le desc, d.rowid desc limit 1`,
    [utilisateurCourant()],
  );
  return { moyenId: (l?.[0] as string | undefined) ?? null };
}

// --- Contrôles

type Saisie = { date: string; libelle: string; montant: number; moyenId: string; note?: string | null; categorieIds?: string[] };

async function verifierSaisie(v: Partial<Saisie>, creation: boolean) {
  if (v.date !== undefined && !DATE.test(v.date)) throw new ErreurMetier("Date invalide.");
  if (v.libelle !== undefined && !v.libelle.trim()) throw new ErreurMetier("Le libellé est obligatoire.");
  if (v.montant !== undefined && (!Number.isInteger(v.montant) || v.montant === 0)) throw new ErreurMetier("Montant invalide.");
  if (v.moyenId !== undefined) {
    const [m] = await query("select archive from moyen_paiement where id = ?", [v.moyenId]);
    if (!m) throw new ErreurMetier("Moyen de paiement inconnu.");
    if (creation && m[0]) throw new ErreurMetier("Ce moyen de paiement est archivé.");
  }
  for (const c of v.categorieIds ?? []) if (!(await query("select 1 from categorie where id = ?", [c])).length) throw new ErreurMetier("Catégorie inconnue.");
}

/** Une dépense remboursée est verrouillée : seul un admin la retouche (et c'est journalisé). */
async function verifierModifiable(id: string) {
  const [l] = await query("select remboursement_id from depense where id = ?", [id]);
  if (!l) throw new ErreurMetier("Dépense introuvable (supprimée ?).", 404);
  if (l[0] && !adminCourant()) throw new ErreurMetier("Cette dépense a été remboursée : seul un admin peut la modifier.", 403);
}

/** Fichiers déjà envoyés (POST /api/fichiers) : présents sur le disque, jamais rattachés. Type et taille relus sur le disque. */
async function instructionsJustificatifs(fichiers: FichierARattacher[], lien: { depenseId?: string; remboursementId?: string }): Promise<Statement[]> {
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

const instructionsCategories = (id: string, categorieIds: string[]): Statement[] => [
  { sql: "delete from depense_categorie where depense_id = ?", params: [id] },
  ...[...new Set(categorieIds)].map((c) => ({ sql: "insert into depense_categorie (depense_id, categorie_id) values (?, ?)", params: [id, c] })),
];

// --- Écriture

/** Nouvelle dépense, avec ses catégories et ses justificatifs, d'un seul tenant. */
export async function creerDepense(v: Saisie & { justificatifs?: FichierARattacher[] }) {
  await verifierSaisie(v, true);
  const id = newId();
  await batch([
    {
      sql: "insert into depense (id, date, libelle, montant, moyen_id, note) values (?, ?, ?, ?, ?, ?)",
      params: [id, v.date, v.libelle.trim(), v.montant, v.moyenId, v.note?.trim() || null],
    },
    ...instructionsCategories(id, v.categorieIds ?? []),
    ...(await instructionsJustificatifs(v.justificatifs ?? [], { depenseId: id })),
  ]);
  return id;
}

export async function majDepense(id: string, patch: Partial<Saisie>, version?: string | null) {
  await verifierModifiable(id);
  await verifierVersion("depense", id, version);
  await verifierSaisie(patch, false);
  const valeurs: Partial<typeof depense.$inferInsert> = {};
  if (patch.date !== undefined) valeurs.date = patch.date;
  if (patch.libelle !== undefined) valeurs.libelle = patch.libelle.trim();
  if (patch.montant !== undefined) valeurs.montant = patch.montant;
  if (patch.moyenId !== undefined) valeurs.moyenId = patch.moyenId;
  if (patch.note !== undefined) valeurs.note = patch.note?.trim() || null;
  const sts: Statement[] = [];
  if (Object.keys(valeurs).length) sts.push(db.update(depense).set(valeurs).where(eq(depense.id, id)).toSQL());
  // Catégories seules : la dépense change quand même de version (et de « modifié par »).
  else sts.push({ sql: "update depense set modifie_le = modifie_le where id = ?", params: [id] });
  if (patch.categorieIds) sts.push(...instructionsCategories(id, patch.categorieIds));
  await batch(sts);
  return versionDe("depense", id);
}

/**
 * Supprime une dépense non remboursée (ou, pour un admin, remboursée). Ses justificatifs ne sont pas effacés :
 * détachés et retirés, ils restent sur le disque et dans les sauvegardes ; le journal garde la dépense entière.
 */
export async function supprimerDepense(id: string) {
  await verifierModifiable(id);
  await batch([
    { sql: "update justificatif set depense_id = null, archive = 1 where depense_id = ?", params: [id] },
    { sql: "delete from depense where id = ?", params: [id] },
  ]);
}

// --- Justificatifs

/** Ajoute des justificatifs à une dépense ou à un remboursement (même remboursés : un justificatif de plus ne change rien au montant). */
export async function ajouterJustificatifs(cible: string, fichiers: FichierARattacher[]) {
  if (!fichiers.length) return;
  const estDepense = (await query("select 1 from depense where id = ?", [cible])).length > 0;
  if (!estDepense && !(await query("select 1 from remboursement where id = ?", [cible])).length) throw new ErreurMetier("Dépense ou remboursement introuvable.", 404);
  const sts = await instructionsJustificatifs(fichiers, estDepense ? { depenseId: cible } : { remboursementId: cible });
  // La fiche change de version : un autre écran ouvert sur elle le saura.
  sts.push({ sql: `update ${estDepense ? "depense" : "remboursement"} set modifie_le = modifie_le where id = ?`, params: [cible] });
  await batch(sts);
}

async function justificatifModifiable(id: string) {
  const [j] = await db.select({ depenseId: justificatif.depenseId }).from(justificatif).where(eq(justificatif.id, id));
  if (!j) throw new ErreurMetier("Justificatif introuvable.", 404);
  if (j.depenseId) await verifierModifiable(j.depenseId);
}

/** Retirer n'efface jamais : le justificatif est archivé, il reste consultable (fiche, journal, sauvegardes). */
export async function retirerJustificatif(id: string) {
  await justificatifModifiable(id);
  await db.update(justificatif).set({ archive: true }).where(eq(justificatif.id, id));
}

export async function renommerJustificatif(id: string, nom: string) {
  if (!nom.trim()) throw new ErreurMetier("Le nom est obligatoire.");
  await justificatifModifiable(id);
  await db.update(justificatif).set({ nom: nom.trim() }).where(eq(justificatif.id, id));
}
