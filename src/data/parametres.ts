import { asc, eq, getTableColumns, sql } from "drizzle-orm";
import { batch, db, newId, query } from "../db/client";
import { categorie, moyenPaiement, parametre, typePaiement } from "../db/schema";
import { ErreurMetier } from "../../serveur/erreurs";
import { sansTrace, verifierVersion, versionDe } from "./version";

const texte = (x: string | null | undefined) => (typeof x === "string" ? x.trim() : "");
const obligatoire = (x: string | null | undefined, quoi: string) => {
  const t = texte(x);
  if (!t) throw new ErreurMetier(`${quoi} est obligatoire.`);
  return t;
};

// --- Foyer

export type Foyer = { nom: string; compte: string };

/** Nom du foyer (« Jeanne & Robert ») et compte débité par les remboursements. */
export async function lireFoyer(): Promise<Foyer> {
  const lignes = await db.select().from(parametre);
  const v = Object.fromEntries(lignes.map((l) => [l.cle, l.valeur]));
  return { nom: v.foyer_nom ?? "", compte: v.foyer_compte ?? "" };
}

export async function majFoyer(f: Partial<Foyer>) {
  for (const [cle, valeur] of [
    ["foyer_nom", f.nom],
    ["foyer_compte", f.compte],
  ] as const) {
    if (valeur === undefined) continue;
    await db
      .insert(parametre)
      .values({ cle, valeur: texte(valeur) })
      .onConflictDoUpdate({ target: parametre.cle, set: { valeur: texte(valeur) } });
  }
}

// --- Types de paiement

/** Types, avec leur nombre de moyens de paiement. */
export const listeTypesPaiement = () =>
  db
    .select({ ...getTableColumns(typePaiement), nbMoyens: sql<number>`(select count(*) from moyen_paiement m where m.type_id = "type_paiement"."id")` })
    .from(typePaiement)
    .orderBy(asc(typePaiement.ordre), asc(typePaiement.libelle));

export async function creerTypePaiement(v: { libelle: string }) {
  const id = newId();
  const [{ ordre }] = await db.select({ ordre: sql<number>`coalesce(max(${typePaiement.ordre}), 0) + 1` }).from(typePaiement);
  await db.insert(typePaiement).values({ id, libelle: obligatoire(v.libelle, "Le libellé"), ordre });
  return id;
}

export async function majTypePaiement(id: string, patch: { libelle?: string }, version?: string | null) {
  await verifierVersion("type_paiement", id, version);
  if (patch.libelle !== undefined) await db.update(typePaiement).set({ libelle: obligatoire(patch.libelle, "Le libellé") }).where(eq(typePaiement.id, id));
  return versionDe("type_paiement", id);
}

export async function supprimerTypePaiement(id: string) {
  const [[n]] = await query("select count(*) from moyen_paiement where type_id = ?", [id]);
  if (Number(n)) throw new ErreurMetier("Ce type est utilisé par des moyens de paiement.");
  await db.delete(typePaiement).where(eq(typePaiement.id, id));
}

// --- Moyens de paiement

/** Moyens de paiement, actifs d'abord, avec leur type et leur nombre de dépenses. */
export const listeMoyensPaiement = () =>
  db
    .select({
      ...getTableColumns(moyenPaiement),
      typeLibelle: typePaiement.libelle,
      nbDepenses: sql<number>`(select count(*) from depense d where d.moyen_id = "moyen_paiement"."id")`,
    })
    .from(moyenPaiement)
    .innerJoin(typePaiement, eq(typePaiement.id, moyenPaiement.typeId))
    .orderBy(asc(moyenPaiement.archive), asc(moyenPaiement.libelle));

export async function creerMoyenPaiement(v: { libelle: string; typeId: string }) {
  const id = newId();
  await db.insert(moyenPaiement).values({ id, libelle: obligatoire(v.libelle, "Le libellé"), typeId: v.typeId });
  return id;
}

export async function majMoyenPaiement(id: string, patch: { libelle?: string; typeId?: string; archive?: boolean }, version?: string | null) {
  await verifierVersion("moyen_paiement", id, version);
  const valeurs: Partial<typeof moyenPaiement.$inferInsert> = sansTrace({ ...patch });
  if (patch.libelle !== undefined) valeurs.libelle = obligatoire(patch.libelle, "Le libellé");
  if (Object.keys(valeurs).length) await db.update(moyenPaiement).set(valeurs).where(eq(moyenPaiement.id, id));
  return versionDe("moyen_paiement", id);
}

/** Seulement s'il n'a jamais servi ; sinon on l'archive. */
export async function supprimerMoyenPaiement(id: string) {
  const [[n]] = await query("select count(*) from depense where moyen_id = ?", [id]);
  if (Number(n)) throw new ErreurMetier("Ce moyen de paiement a déjà servi : archivez-le plutôt.");
  await db.delete(moyenPaiement).where(eq(moyenPaiement.id, id));
}

// --- Catégories

/** Catégories, actives d'abord, avec leur nombre de dépenses. */
export const listeCategories = () =>
  db
    .select({ ...getTableColumns(categorie), nbDepenses: sql<number>`(select count(*) from depense_categorie dc where dc.categorie_id = "categorie"."id")` })
    .from(categorie)
    .orderBy(asc(categorie.archivee), asc(categorie.nom));

/** Création (aussi pendant la saisie d'une dépense) ; une catégorie de même nom est réutilisée. */
export async function creerCategorie(v: { nom: string; couleur?: string }) {
  const nom = obligatoire(v.nom, "Le nom");
  const [existante] = await query("select id from categorie where lower(nom) = lower(?)", [nom]);
  if (existante) return existante[0] as string;
  const id = newId();
  await db.insert(categorie).values({ id, nom, couleur: v.couleur || "gray" });
  return id;
}

export async function majCategorie(id: string, patch: { nom?: string; couleur?: string; archivee?: boolean }, version?: string | null) {
  await verifierVersion("categorie", id, version);
  const valeurs: Partial<typeof categorie.$inferInsert> = sansTrace({ ...patch });
  if (patch.nom !== undefined) valeurs.nom = obligatoire(patch.nom, "Le nom");
  if (Object.keys(valeurs).length) await db.update(categorie).set(valeurs).where(eq(categorie.id, id));
  return versionDe("categorie", id);
}

/** Les dépenses de `source` passent dans `cible`, puis `source` disparaît. */
export async function fusionnerCategories(source: string, cible: string) {
  if (source === cible) throw new ErreurMetier("Choisissez deux catégories différentes.");
  await batch([
    { sql: "insert or ignore into depense_categorie (depense_id, categorie_id) select depense_id, ? from depense_categorie where categorie_id = ?", params: [cible, source] },
    { sql: "delete from depense_categorie where categorie_id = ?", params: [source] },
    { sql: "delete from categorie where id = ?", params: [source] },
  ]);
}

/** Seulement si aucune dépense ne l'utilise ; sinon on l'archive ou on la fusionne. */
export async function supprimerCategorie(id: string) {
  const [[n]] = await query("select count(*) from depense_categorie where categorie_id = ?", [id]);
  if (Number(n)) throw new ErreurMetier("Cette catégorie est utilisée : archivez-la ou fusionnez-la.");
  await db.delete(categorie).where(eq(categorie.id, id));
}
