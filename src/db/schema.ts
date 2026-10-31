import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/*
 * Modèle : Dépense ─┬→ Moyen de paiement → Type de paiement
 *                   ├→ Catégories (0..n)
 *                   ├→ Justificatifs (0..n : photo, PDF)
 *                   └→ Remboursement (0..1 : le virement qui l'a remboursée)
 * Remboursement → Justificatifs (relevé du virement…).
 * Dates : chaînes ISO « AAAA-MM-JJ ». Montants : entiers en centimes (négatif = avoir).
 */

const id = () => text("id").primaryKey();
const creeLe = () => text("cree_le").notNull().default(sql`(datetime('now'))`);

/**
 * Qui a créé / modifié la ligne, et quand (ISO, à la milliseconde). Remplies par le serveur
 * (déclencheurs SQLite, cf. serveur/tracabilite.ts) ; `modifieLe` sert aussi de version (conflits).
 */
const tracabilite = () => ({
  creePar: text("cree_par"),
  modifiePar: text("modifie_par"),
  modifieLe: text("modifie_le"),
});

/** Réglages du foyer, avec les données (sauvegardés) : nom du foyer, compte débité… */
export const parametre = sqliteTable("parametre", {
  cle: text("cle").primaryKey(),
  valeur: text("valeur").notNull(),
});

/** Carte bancaire, chèque, espèces, virement… (paramétrable). */
export const typePaiement = sqliteTable("type_paiement", {
  id: id(),
  libelle: text("libelle").notNull(),
  ordre: integer("ordre").notNull().default(0),
  creeLe: creeLe(),
  ...tracabilite(),
});

/** « CB Patrick », « Chéquier Roger », « Espèces » : tous appartiennent à l'aidant, donc tout est à rembourser. */
export const moyenPaiement = sqliteTable("moyen_paiement", {
  id: id(),
  libelle: text("libelle").notNull(),
  typeId: text("type_id")
    .notNull()
    .references(() => typePaiement.id, { onDelete: "restrict" }),
  /** Plus proposé à la saisie, gardé pour les dépenses passées. */
  archive: integer("archive", { mode: "boolean" }).notNull().default(false),
  creeLe: creeLe(),
  ...tracabilite(),
});

/** Courses, Pharmacie, Médecin… (liste des paramètres, complétée pendant la saisie). */
export const categorie = sqliteTable("categorie", {
  id: id(),
  nom: text("nom").notNull(),
  /** Nom d'une couleur Mantine (green, blue, grape…). */
  couleur: text("couleur").notNull().default("gray"),
  archivee: integer("archivee", { mode: "boolean" }).notNull().default(false),
  creeLe: creeLe(),
  ...tracabilite(),
});

/**
 * Le virement par lequel l'aidant se rembourse. La plage ne fait que proposer les dépenses :
 * ce sont les dépenses cochées (depense.remboursement_id) qui comptent. L'écart (montant viré − total coché)
 * est affiché, jamais reporté. Pas d'annulation en V1.
 */
export const remboursement = sqliteTable(
  "remboursement",
  {
    id: id(),
    dateVirement: text("date_virement").notNull(),
    debut: text("debut").notNull(),
    fin: text("fin").notNull(),
    /** Centimes. */
    montantVire: integer("montant_vire").notNull(),
    note: text("note"),
    creeLe: creeLe(),
    ...tracabilite(),
  },
  (t) => [index("remboursement_date_idx").on(t.dateVirement)],
);

/** Une dépense faite pour les parents. Remboursée (remboursement_id renseigné) : verrouillée, sauf pour un admin. */
export const depense = sqliteTable(
  "depense",
  {
    id: id(),
    date: text("date").notNull(),
    libelle: text("libelle").notNull(),
    /** Centimes ; négatif pour un avoir (retour d'article…), déduit du remboursement suivant. */
    montant: integer("montant").notNull(),
    moyenId: text("moyen_id")
      .notNull()
      .references(() => moyenPaiement.id, { onDelete: "restrict" }),
    note: text("note"),
    remboursementId: text("remboursement_id").references(() => remboursement.id, { onDelete: "restrict" }),
    /** Justificatif déclaré absent : motif (perdu, pas de ticket, autre + précision), qui et quand. */
    absence: text("absence", { enum: ["perdu", "pas_de_ticket", "autre"] }),
    absenceDetail: text("absence_detail"),
    absencePar: text("absence_par"),
    absenceLe: text("absence_le"),
    creeLe: creeLe(),
    ...tracabilite(),
  },
  (t) => [index("depense_date_idx").on(t.date), index("depense_remboursement_idx").on(t.remboursementId)],
);

export const depenseCategorie = sqliteTable(
  "depense_categorie",
  {
    depenseId: text("depense_id")
      .notNull()
      .references(() => depense.id, { onDelete: "cascade" }),
    categorieId: text("categorie_id")
      .notNull()
      .references(() => categorie.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.depenseId, t.categorieId] }), index("depense_categorie_categorie_idx").on(t.categorieId)],
);

/**
 * Un fichier (photo JPEG, PDF) rattaché à une dépense ou à un remboursement.
 * Jamais effacé : un justificatif retiré est archivé et reste visible depuis le journal (preuve).
 */
export const justificatif = sqliteTable(
  "justificatif",
  {
    id: id(),
    depenseId: text("depense_id").references(() => depense.id, { onDelete: "restrict" }),
    remboursementId: text("remboursement_id").references(() => remboursement.id, { onDelete: "restrict" }),
    /** Nom affiché (celui du fichier envoyé, modifiable). */
    nom: text("nom").notNull(),
    /** Nom sur le disque, choisi par le serveur (UUID + extension). */
    fichier: text("fichier").notNull(),
    mime: text("mime").notNull(),
    taille: integer("taille").notNull(),
    archive: integer("archive", { mode: "boolean" }).notNull().default(false),
    creeLe: creeLe(),
    ...tracabilite(),
  },
  (t) => [index("justificatif_depense_idx").on(t.depenseId), index("justificatif_remboursement_idx").on(t.remboursementId)],
);

export type TypePaiement = typeof typePaiement.$inferSelect;
export type MoyenPaiement = typeof moyenPaiement.$inferSelect;
export type Categorie = typeof categorie.$inferSelect;
export type Remboursement = typeof remboursement.$inferSelect;
export type Depense = typeof depense.$inferSelect;
export type Justificatif = typeof justificatif.$inferSelect;

/**
 * Journal des modifications : une ligne par action d'écriture (fonction appelée, par qui, sur quoi).
 * `avant` / `apres` : la fiche entière (JSON) avant et après l'écriture, pour prouver ce qui a changé.
 */
export const journal = sqliteTable(
  "journal",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    quand: text("quand").notNull(),
    utilisateur: text("utilisateur").notNull(),
    fonction: text("fonction").notNull(),
    cible: text("cible"),
    resume: text("resume"),
    avant: text("avant"),
    apres: text("apres"),
  },
  (t) => [index("journal_quand_idx").on(t.quand), index("journal_utilisateur_idx").on(t.utilisateur), index("journal_cible_idx").on(t.cible)],
);
