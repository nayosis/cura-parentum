import { desc, eq, getTableColumns, sql } from "drizzle-orm";
import { batch, db, newId, query } from "../db/client";
import { depense, justificatif, moyenPaiement, remboursement } from "../db/schema";
import { ErreurMetier } from "../../serveur/erreurs";
import { adminCourant, superAdminCourant } from "../../serveur/tracabilite";
import { aujourdhui } from "../lib/dates";
import { DATE, instructionsJustificatifs, type FichierARattacher } from "./commun";
import { verifierVersion, versionDe } from "./version";

const NB_DEPENSES = sql<number>`(select count(*) from depense d where d.remboursement_id = "remboursement"."id")`;
const TOTAL = sql<number>`(select coalesce(sum(d.montant), 0) from depense d where d.remboursement_id = "remboursement"."id")`;
const NB_JUSTIFICATIFS = sql<number>`(select count(*) from justificatif j where j.remboursement_id = "remboursement"."id" and j.archive = 0)`;

// --- Lecture

/**
 * Remboursements, du plus récent au plus ancien : nombre de dépenses, total coché et écart (montant viré − total,
 * positif = trop-perçu). L'écart est seulement affiché, jamais reporté.
 */
export async function listeRemboursements() {
  const lignes = await db
    .select({ ...getTableColumns(remboursement), nbDepenses: NB_DEPENSES, total: TOTAL, nbJustificatifs: NB_JUSTIFICATIFS })
    .from(remboursement)
    .orderBy(desc(remboursement.dateVirement), desc(remboursement.creeLe));
  return lignes.map((r) => ({ ...r, ecart: r.montantVire - r.total }));
}

/** Ce qui attend d'être remboursé : nombre et total des dépenses non remboursées. */
export async function enAttente() {
  const [[nb, total]] = await query("select count(*), coalesce(sum(montant), 0) from depense where remboursement_id is null");
  return { nb: Number(nb), total: Number(total) };
}

/** Un remboursement, ses dépenses et ses justificatifs (retirés compris). */
export async function ficheRemboursement(id: string) {
  const [r] = await db.select({ ...getTableColumns(remboursement), total: TOTAL }).from(remboursement).where(eq(remboursement.id, id));
  if (!r) throw new ErreurMetier("Remboursement introuvable.", 404);
  const depenses = await db
    .select({
      id: depense.id,
      date: depense.date,
      libelle: depense.libelle,
      montant: depense.montant,
      moyenLibelle: moyenPaiement.libelle,
      absence: depense.absence,
      absenceDetail: depense.absenceDetail,
      nbJustificatifs: sql<number>`(select count(*) from justificatif j where j.depense_id = ${depense.id} and j.archive = 0)`,
    })
    .from(depense)
    .innerJoin(moyenPaiement, eq(moyenPaiement.id, depense.moyenId))
    .where(eq(depense.remboursementId, id))
    .orderBy(depense.date, depense.creeLe);
  const justificatifs = await db.select().from(justificatif).where(eq(justificatif.remboursementId, id)).orderBy(justificatif.creeLe);
  return { ...r, ecart: r.montantVire - r.total, depenses, justificatifs };
}

/** Plage proposée : du lendemain de la fin du dernier remboursement (sinon du 1er du mois) à aujourd'hui. */
export async function plageProposee() {
  const fin = aujourdhui();
  const [l] = await query("select max(fin) from remboursement");
  const derniere = l?.[0] as string | null;
  if (!derniere) return { debut: `${fin.slice(0, 7)}-01`, fin };
  const lendemain = new Date(`${derniere}T12:00:00Z`);
  lendemain.setUTCDate(lendemain.getUTCDate() + 1);
  const debut = lendemain.toISOString().slice(0, 10);
  return { debut: debut <= fin ? debut : fin, fin };
}

/**
 * Dépenses proposées pour un remboursement : les non remboursées de la plage, et à part celles d'avant la plage
 * (oubliées, saisies en retard). Celles d'après la plage attendent le remboursement suivant.
 */
export async function candidats(debut: string, fin: string) {
  if (!DATE.test(debut) || !DATE.test(fin)) throw new ErreurMetier("Plage invalide.");
  const lignes = await db
    .select({
      id: depense.id,
      date: depense.date,
      libelle: depense.libelle,
      montant: depense.montant,
      moyenLibelle: moyenPaiement.libelle,
      creeLe: depense.creeLe,
      absence: depense.absence,
      absenceDetail: depense.absenceDetail,
      nbJustificatifs: sql<number>`(select count(*) from justificatif j where j.depense_id = ${depense.id} and j.archive = 0)`,
    })
    .from(depense)
    .innerJoin(moyenPaiement, eq(moyenPaiement.id, depense.moyenId))
    .where(sql`${depense.remboursementId} is null and ${depense.date} <= ${fin}`)
    .orderBy(depense.date, depense.creeLe);
  return { dansPlage: lignes.filter((d) => d.date >= debut), avant: lignes.filter((d) => d.date < debut) };
}

// --- Écriture

type Saisie = { dateVirement: string; debut: string; fin: string; montantVire: number; note?: string | null };

function verifierSaisie(v: Partial<Saisie>) {
  for (const d of [v.dateVirement, v.debut, v.fin]) if (d !== undefined && !DATE.test(d)) throw new ErreurMetier("Date invalide.");
  if (v.debut && v.fin && v.debut > v.fin) throw new ErreurMetier("La plage commence après sa fin.");
  if (v.montantVire !== undefined && (!Number.isInteger(v.montantVire) || v.montantVire <= 0)) throw new ErreurMetier("Montant viré invalide.");
}

/**
 * Valide un remboursement : le virement, les dépenses cochées (qui deviennent remboursées et verrouillées)
 * et ses justificatifs, d'un seul tenant. Pas d'annulation en V1.
 */
export async function creerRemboursement(v: Saisie & { depenseIds: string[]; justificatifs?: FichierARattacher[] }) {
  verifierSaisie(v);
  const ids = [...new Set(v.depenseIds)];
  if (!ids.length) throw new ErreurMetier("Cochez au moins une dépense.");
  for (const d of ids) {
    const [l] = await query("select remboursement_id from depense where id = ?", [d]);
    if (!l) throw new ErreurMetier("Une dépense cochée n'existe plus : rechargez la page.");
    if (l[0]) throw new ErreurMetier("Une dépense cochée a déjà été remboursée entre-temps : rechargez la page.", 409);
  }
  const id = newId();
  await batch([
    {
      sql: "insert into remboursement (id, date_virement, debut, fin, montant_vire, note) values (?, ?, ?, ?, ?, ?)",
      params: [id, v.dateVirement, v.debut, v.fin, v.montantVire, v.note?.trim() || null],
    },
    // « remboursement_id is null » : une dépense cochée deux fois en même temps ne bascule qu'une fois.
    ...ids.map((d) => ({ sql: "update depense set remboursement_id = ? where id = ? and remboursement_id is null", params: [id, d] })),
    ...(await instructionsJustificatifs(v.justificatifs ?? [], { remboursementId: id })),
  ]);
  const [[n]] = await query("select count(*) from depense where remboursement_id = ?", [id]);
  if (Number(n) !== ids.length) {
    // Course perdue contre un autre remboursement : on défait celui-ci.
    await batch([
      { sql: "update depense set remboursement_id = null where remboursement_id = ?", params: [id] },
      { sql: "update justificatif set remboursement_id = null, archive = 1 where remboursement_id = ?", params: [id] },
      { sql: "delete from remboursement where id = ?", params: [id] },
    ]);
    throw new ErreurMetier("Une dépense cochée a déjà été remboursée entre-temps : rechargez la page.", 409);
  }
  return id;
}

/** Corriger la date, le montant viré ou la note d'un remboursement validé : admins seulement (journalisé). Les dépenses cochées ne changent pas. */
export async function majRemboursement(id: string, patch: { dateVirement?: string; montantVire?: number; note?: string | null }, version?: string | null) {
  if (!adminCourant()) throw new ErreurMetier("Un remboursement validé ne se modifie que par un admin.", 403);
  if (!(await query("select 1 from remboursement where id = ?", [id])).length) throw new ErreurMetier("Remboursement introuvable.", 404);
  await verifierVersion("remboursement", id, version);
  verifierSaisie(patch);
  const valeurs: Partial<typeof remboursement.$inferInsert> = {};
  if (patch.dateVirement !== undefined) valeurs.dateVirement = patch.dateVirement;
  if (patch.montantVire !== undefined) valeurs.montantVire = patch.montantVire;
  if (patch.note !== undefined) valeurs.note = patch.note?.trim() || null;
  if (Object.keys(valeurs).length) await db.update(remboursement).set(valeurs).where(eq(remboursement.id, id));
  return versionDe("remboursement", id);
}

/**
 * Supprime un remboursement (super admin seulement, pour réparer une erreur de saisie) : ses dépenses repassent
 * « à rembourser » et redeviennent modifiables, ses justificatifs sont archivés (jamais effacés). Le journal garde
 * la fiche entière d'avant la suppression, avec la liste des dépenses qu'il couvrait.
 */
export async function supprimerRemboursement(id: string) {
  if (!superAdminCourant()) throw new ErreurMetier("Seul le super admin peut supprimer un remboursement.", 403);
  if (!(await query("select 1 from remboursement where id = ?", [id])).length) throw new ErreurMetier("Remboursement introuvable.", 404);
  await batch([
    { sql: "update depense set remboursement_id = null where remboursement_id = ?", params: [id] },
    { sql: "update justificatif set remboursement_id = null, archive = 1 where remboursement_id = ?", params: [id] },
    { sql: "delete from remboursement where id = ?", params: [id] },
  ]);
}
