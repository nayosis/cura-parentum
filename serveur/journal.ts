/**
 * Journal des modifications : qui a appelé quelle fonction d'écriture, sur quelle fiche, quand,
 * et la fiche entière avant et après (la preuve de ce qui a changé).
 */
import { baseCourante } from "./base";
import { TABLES_SUIVIES } from "./tracabilite";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fiche visée par les arguments : le premier identifiant (modification, suppression). */
export const cibleDesArguments = (args: unknown[]) => {
  const id = args.find((a) => typeof a === "string" && UUID.test(a));
  return typeof id === "string" ? id : null;
};

/** Fiche concernée : celle des arguments, sinon celle renvoyée (création). */
function cibleDe(args: unknown[], resultat: unknown) {
  return cibleDesArguments(args) ?? (typeof resultat === "string" && UUID.test(resultat) ? resultat : null);
}

/** Résumé lisible des arguments (tronqué) : utile pour savoir ce qui a été demandé. */
function resumeDe(args: unknown[]) {
  const texte = JSON.stringify(args.filter((a) => !(typeof a === "string" && UUID.test(a))));
  return texte.length > 400 ? `${texte.slice(0, 399)}…` : texte;
}

type Ligne = Record<string, unknown>;

/**
 * La fiche telle qu'elle est en base, quelle que soit sa table (null si elle n'existe pas ou plus).
 * Une dépense est complétée de ce qui la décrit vraiment : moyen de paiement, catégories et justificatifs ;
 * un remboursement, des dépenses qu'il couvre et de ses justificatifs.
 */
export function instantane(id: string): (Ligne & { table: string }) | null {
  const base = baseCourante();
  for (const table of TABLES_SUIVIES) {
    const ligne = base.query<Ligne, [string]>(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!ligne) continue;
    if (table === "depense") {
      ligne.moyen = base.query<{ libelle: string }, [string]>("SELECT libelle FROM moyen_paiement WHERE id = ?").get(String(ligne.moyen_id))?.libelle ?? null;
      ligne.categories = base
        .query<{ nom: string }, [string]>("SELECT c.nom FROM depense_categorie dc JOIN categorie c ON c.id = dc.categorie_id WHERE dc.depense_id = ? ORDER BY c.nom")
        .all(id)
        .map((c) => c.nom);
      ligne.justificatifs = base.query("SELECT id, nom, fichier, archive FROM justificatif WHERE depense_id = ? ORDER BY cree_le").all(id);
    }
    if (table === "remboursement") {
      ligne.depenses = base.query("SELECT id, date, libelle, montant FROM depense WHERE remboursement_id = ? ORDER BY date").all(id);
      ligne.justificatifs = base.query("SELECT id, nom, fichier, archive FROM justificatif WHERE remboursement_id = ? ORDER BY cree_le").all(id);
    }
    return { table, ...ligne };
  }
  return null;
}

export function journaliser(utilisateur: string, fonction: string, args: unknown[], resultat: unknown, avant: unknown = null) {
  try {
    const cible = cibleDe(args, resultat);
    const apres = cible ? instantane(cible) : null;
    baseCourante()
      .query("INSERT INTO journal (quand, utilisateur, fonction, cible, resume, avant, apres) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(
        new Date().toISOString(),
        utilisateur,
        fonction,
        cible,
        resumeDe(args),
        avant ? JSON.stringify(avant) : null,
        apres ? JSON.stringify(apres) : null,
      );
  } catch (e) {
    // Le journal ne doit jamais faire échouer l'écriture elle-même.
    console.error("Journal :", e);
  }
}

export type LigneJournal = {
  id: number;
  quand: string;
  utilisateur: string;
  fonction: string;
  cible: string | null;
  resume: string | null;
  avant: string | null;
  apres: string | null;
};

/** 200 lignes au plus, des plus récentes aux plus anciennes ; `avant` : id pour la page suivante ; `cible` : une fiche. */
export function lireJournal(f: { utilisateur?: string; depuis?: string; avant?: number; cible?: string }) {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (f.utilisateur) {
    conditions.push("utilisateur = ?");
    params.push(f.utilisateur);
  }
  if (f.depuis) {
    conditions.push("quand >= ?");
    params.push(f.depuis);
  }
  if (f.avant) {
    conditions.push("id < ?");
    params.push(f.avant);
  }
  if (f.cible) {
    // Une dépense : ses lignes et celles de ses justificatifs. Un remboursement : ses lignes, celles de ses
    // justificatifs et des dépenses qu'il couvre (retouchées ensuite par un admin).
    conditions.push(
      `(cible = ? OR json_extract(apres, '$.depense_id') = ? OR json_extract(avant, '$.depense_id') = ?
        OR json_extract(apres, '$.remboursement_id') = ? OR json_extract(avant, '$.remboursement_id') = ?)`,
    );
    params.push(f.cible, f.cible, f.cible, f.cible, f.cible);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return baseCourante()
    .query<LigneJournal, (string | number)[]>(`SELECT id, quand, utilisateur, fonction, cible, resume, avant, apres FROM journal ${where} ORDER BY id DESC LIMIT 200`)
    .all(...params);
}
