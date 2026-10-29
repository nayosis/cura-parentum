/*
 * Exports pour justifier : dossier PDF d'un remboursement (récapitulatif, dépenses, modifications ultérieures,
 * justificatifs en annexe), ZIP des justificatifs (avec un CSV et le dossier), bilan annuel en PDF.
 */
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { zipSync, strToU8, type Zippable } from "fflate";
import { query } from "../src/db/client";
import { bilanAnnuel } from "../src/data/bilan";
import { lireFoyer } from "../src/data/parametres";
import { ficheRemboursement } from "../src/data/remboursements";
import { dateLisible } from "../src/lib/dates";
import { euros } from "../src/lib/montants";
import { cheminFichier } from "./fichiers";
import { Redacteur } from "./pdf";

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const court = (d: string) => dateLisible(d, { day: "2-digit", month: "2-digit", year: "numeric" });
const signe = (c: number) => `${c > 0 ? "+" : ""}${euros(c)}`;

type Justif = { id: string; depenseId: string | null; nom: string; fichier: string; mime: string };
type DepenseDossier = { id: string; date: string; libelle: string; montant: number; moyen: string; categories: string; note: string | null; justificatifs: Justif[] };

/** Le remboursement, ses dépenses complètes (catégories, note, justificatifs non retirés) et ses propres justificatifs. */
async function donneesDossier(id: string) {
  const r = await ficheRemboursement(id);
  const lignes = await query(
    `select d.id, d.date, d.libelle, d.montant, m.libelle, d.note,
       (select group_concat(c.nom, ', ') from depense_categorie dc join categorie c on c.id = dc.categorie_id where dc.depense_id = d.id)
     from depense d join moyen_paiement m on m.id = d.moyen_id where d.remboursement_id = ? order by d.date, d.cree_le`,
    [id],
  );
  const justifs = (
    await query(
      `select j.id, j.depense_id, j.nom, j.fichier, j.mime from justificatif j
       where j.archive = 0 and (j.remboursement_id = ?1 or j.depense_id in (select id from depense where remboursement_id = ?1)) order by j.cree_le`,
      [id],
    )
  ).map(([jid, depenseId, nom, fichier, mime]) => ({ id: jid, depenseId, nom, fichier, mime }) as Justif);
  const depenses: DepenseDossier[] = lignes.map(([did, date, libelle, montant, moyen, note, categories]) => ({
    id: did as string,
    date: date as string,
    libelle: libelle as string,
    montant: Number(montant),
    moyen: moyen as string,
    note: note as string | null,
    categories: (categories as string | null) ?? "",
    justificatifs: justifs.filter((j) => j.depenseId === did),
  }));
  return { r, depenses, virement: justifs.filter((j) => !j.depenseId), foyer: await lireFoyer() };
}

/**
 * Écritures postérieures à la validation (retouches d'un admin) sur le remboursement ou ses dépenses : celles qui
 * suivent, dans le journal, la ligne de sa validation (l'ordre du journal, pas l'heure : deux écritures peuvent
 * tomber dans la même seconde).
 */
export async function modificationsUlterieures(id: string, depenseIds: string[]) {
  const [validation] = await query("select min(id) from journal where fonction = 'creerRemboursement' and cible = ?", [id]);
  const depuis = Number(validation?.[0] ?? 0);
  const marques = depenseIds.map(() => "?").join(", ") || "''";
  const lignes = await query(
    `select quand, utilisateur, fonction, avant, apres from journal
     where id > ?
       and (cible = ? or cible in (${marques}) or json_extract(apres, '$.depense_id') in (${marques}) or json_extract(avant, '$.depense_id') in (${marques}))
     order by id`,
    [depuis, id, ...depenseIds, ...depenseIds, ...depenseIds],
  );
  return lignes.map(([quand, utilisateur, fonction, avant, apres]) => ({
    quand: quand as string,
    utilisateur: utilisateur as string,
    fonction: fonction as string,
    changements: ecarts(avant as string | null, apres as string | null),
  }));
}

const TECHNIQUES = new Set(["table", "id", "cree_le", "cree_par", "modifie_par", "modifie_le", "moyen_id", "type_id", "remboursement_id", "depense_id", "justificatifs", "depenses"]);

/** « montant : 23,40 € -> 24,40 € ; libellé : … » */
function ecarts(a: string | null, b: string | null) {
  const avant = a ? (JSON.parse(a) as Record<string, unknown>) : {};
  const apres = b ? (JSON.parse(b) as Record<string, unknown>) : {};
  const val = (k: string, v: unknown) => (v == null || v === "" ? "-" : (k === "montant" || k === "montant_vire") && typeof v === "number" ? euros(v) : Array.isArray(v) ? v.join(", ") : String(v));
  return [...new Set([...Object.keys(avant), ...Object.keys(apres)])]
    .filter((k) => !TECHNIQUES.has(k) && val(k, avant[k]) !== val(k, apres[k]))
    .map((k) => `${k.replace("_", " ")} : ${val(k, avant[k])} -> ${val(k, apres[k])}`)
    .join(" ; ");
}

const ACTIONS: Record<string, string> = {
  majDepense: "Dépense modifiée",
  supprimerDepense: "Dépense supprimée",
  ajouterJustificatifs: "Justificatif ajouté",
  retirerJustificatif: "Justificatif retiré",
  renommerJustificatif: "Justificatif renommé",
  majRemboursement: "Remboursement corrigé",
};

/** Dossier PDF d'un remboursement : à remettre à un tiers (famille, notaire, juge des tutelles). */
export async function dossierRemboursement(id: string, par: string) {
  const { r, depenses, virement, foyer } = await donneesDossier(id);
  const titre = `Remboursement du ${court(r.dateVirement)}`;
  const p = await Redacteur.creer(titre);
  p.titre(titre);
  p.texte(`Dépenses faites pour ${foyer.nom || "le foyer"} du ${dateLisible(r.debut)} au ${dateLisible(r.fin)}.`, { gris: true });
  p.espace(8);
  p.champs([
    ["Date du virement", dateLisible(r.dateVirement)],
    ["Compte débité", foyer.compte || "-"],
    ["Plage", `du ${court(r.debut)} au ${court(r.fin)}`],
    ["Dépenses", String(depenses.length)],
    ["Total des dépenses", euros(r.total)],
    ["Montant viré", euros(r.montantVire)],
    ["Écart", r.ecart === 0 ? "aucun" : `${signe(r.ecart)} (${r.ecart > 0 ? "trop-perçu" : "manque"}, non reporté)`],
    ["Justificatifs", `${depenses.reduce((n, d) => n + d.justificatifs.length, 0) + virement.length} en annexe`],
  ]);
  if (r.note) {
    p.espace(4);
    p.texte(`Note : ${r.note}`);
  }
  p.espace(4);
  p.texte(`Document établi le ${new Date().toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })} par ${par}.`, { taille: 8, gris: true });

  // Numéros d'annexe, dans l'ordre du tableau puis ceux du virement.
  let n = 0;
  const annexes = new Map<string, number>();
  for (const d of depenses) for (const j of d.justificatifs) annexes.set(j.id, ++n);
  for (const j of virement) annexes.set(j.id, ++n);

  p.sousTitre("Dépenses remboursées");
  p.tableau(
    [
      { titre: "Date", largeur: 62 },
      { titre: "Libellé", largeur: 150 },
      { titre: "Catégories", largeur: 90 },
      { titre: "Payé avec", largeur: 80 },
      { titre: "Annexes", largeur: 52 },
      { titre: "Montant", largeur: 61, droite: true },
    ],
    depenses.map((d) => [
      court(d.date),
      d.libelle,
      d.categories,
      d.moyen,
      d.justificatifs.length ? d.justificatifs.map((j) => `A${annexes.get(j.id)}`).join(", ") : "aucune",
      euros(d.montant),
    ]),
    ["", "Total", "", "", "", euros(r.total)],
  );
  const notes = depenses.filter((d) => d.note);
  if (notes.length) {
    p.sousTitre("Notes des dépenses");
    for (const d of notes) p.texte(`${court(d.date)} ${d.libelle} : ${d.note}`);
  }

  const modifs = await modificationsUlterieures(id, depenses.map((d) => d.id));
  if (modifs.length) {
    p.sousTitre("Modifications après la validation");
    p.texte("Retouches faites après le remboursement (admins), telles que le journal les a enregistrées.", { gris: true, taille: 9 });
    p.tableau(
      [
        { titre: "Quand", largeur: 80 },
        { titre: "Qui", largeur: 110 },
        { titre: "Action", largeur: 95 },
        { titre: "Changements", largeur: 210 },
      ],
      modifs.map((m) => [new Date(m.quand).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }), m.utilisateur, ACTIONS[m.fonction] ?? m.fonction, m.changements || "-"]),
    );
  }

  // Annexes : chaque justificatif sur sa page (photo) ou ses pages (PDF).
  const annexer = async (j: Justif, contexte: string) => {
    const entete = `Annexe A${annexes.get(j.id)} · ${contexte} · ${j.nom}`;
    const chemin = cheminFichier(j.fichier);
    if (!existsSync(chemin)) return p.annexeAbsente(entete, "Fichier introuvable sur le serveur.");
    const octets = new Uint8Array(readFileSync(chemin));
    try {
      if (j.mime === "application/pdf") await p.pdfAnnexe(entete, octets);
      else if (j.mime === "image/jpeg" || j.mime === "image/png") await p.imageAnnexe(entete, octets, j.mime);
      else p.annexeAbsente(entete, "Format d'image non intégrable au PDF : le fichier est dans le ZIP des justificatifs.");
    } catch {
      p.annexeAbsente(entete, "Fichier illisible ou protégé : il est dans le ZIP des justificatifs.");
    }
  };
  for (const d of depenses) for (const j of d.justificatifs) await annexer(j, `${court(d.date)} ${d.libelle} ${euros(d.montant)}`);
  for (const j of virement) await annexer(j, `Virement du ${court(r.dateVirement)}`);

  return { octets: await p.terminer(), nom: `remboursement-${r.dateVirement}.pdf` };
}

/** Nom de fichier lisible et sûr : « 2026-10-03_Pharmacie du Centre_23,40.pdf ». */
function nomFichier(parties: string[], ext: string, pris: Set<string>) {
  const base = parties
    .join("_")
    .replace(/[  ]/g, " ")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  let nom = `${base}${ext}`;
  for (let i = 2; pris.has(nom.toLowerCase()); i++) nom = `${base}_${i}${ext}`;
  pris.add(nom.toLowerCase());
  return nom;
}

const montantFichier = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const csv = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** ZIP d'un remboursement : les justificatifs renommés, un CSV des dépenses et le dossier PDF. */
export async function zipRemboursement(id: string, par: string) {
  const { r, depenses, virement } = await donneesDossier(id);
  const pris = new Set<string>();
  const contenu: Zippable = {};
  const lignesCsv = [["Date", "Libellé", "Montant", "Payé avec", "Catégories", "Note", "Justificatifs"].join(";")];
  const ajouter = (j: Justif, parties: string[]) => {
    const nom = nomFichier(parties, extname(j.fichier), pris);
    const chemin = cheminFichier(j.fichier);
    // Photos et PDF sont déjà compressés : rangés tels quels.
    if (existsSync(chemin)) contenu[`justificatifs/${nom}`] = [new Uint8Array(readFileSync(chemin)), { level: 0 }];
    return nom;
  };
  for (const d of depenses) {
    const noms = d.justificatifs.map((j) => ajouter(j, [d.date, d.libelle, montantFichier(d.montant)]));
    lignesCsv.push([d.date, d.libelle, montantFichier(d.montant), d.moyen, d.categories, d.note ?? "", noms.join(", ")].map(csv).join(";"));
  }
  for (const j of virement) ajouter(j, [r.dateVirement, "virement", j.nom.replace(/\.[^.]+$/, "")]);
  // BOM : Excel lit l'UTF-8 (accents) correctement.
  contenu["depenses.csv"] = strToU8(`﻿${lignesCsv.join("\r\n")}\r\n`);
  const dossier = await dossierRemboursement(id, par);
  contenu[dossier.nom] = [dossier.octets, { level: 0 }];
  return { octets: zipSync(contenu, { level: 6 }), nom: `justificatifs-${r.dateVirement}.zip` };
}

/** Bilan annuel en PDF : pour une reddition de comptes. */
export async function bilanPdf(annee: number, par: string) {
  const b = await bilanAnnuel(annee);
  const foyer = await lireFoyer();
  const titre = `Bilan ${annee}`;
  const p = await Redacteur.creer(titre);
  p.titre(`${titre} · dépenses pour ${foyer.nom || "le foyer"}`);
  p.champs([
    ["Dépenses", `${b.nbDepenses} dépense${b.nbDepenses > 1 ? "s" : ""} pour ${euros(b.total)}`],
    ["Sans justificatif", String(b.sansJustificatif)],
    ["Remboursements", `${b.remboursements.length} virement${b.remboursements.length > 1 ? "s" : ""}, ${euros(b.totalVire)}`],
    ["Écart cumulé", b.ecartCumule === 0 ? "aucun" : `${signe(b.ecartCumule)} (${b.ecartCumule > 0 ? "trop-perçu" : "manque"})`],
    ["Compte débité", foyer.compte || "-"],
  ]);
  p.espace(4);
  p.texte(`Document établi le ${new Date().toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })} par ${par}.`, { taille: 8, gris: true });

  p.sousTitre("Par mois");
  p.tableau(
    [
      { titre: "Mois", largeur: 200 },
      { titre: "Dépensé", largeur: 120, droite: true },
    ],
    b.parMois.map((t, i) => [MOIS[i], euros(t)]),
    ["Total", euros(b.total)],
  );
  p.sousTitre("Par catégorie");
  p.texte("Une dépense à plusieurs catégories compte dans chacune.", { gris: true, taille: 9 });
  p.tableau(
    [
      { titre: "Catégorie", largeur: 200 },
      { titre: "Dépensé", largeur: 120, droite: true },
    ],
    b.parCategorie.map((c) => [c.nom, euros(c.total)]),
  );
  p.sousTitre("Par moyen de paiement");
  p.tableau(
    [
      { titre: "Moyen", largeur: 160 },
      { titre: "Type", largeur: 120 },
      { titre: "Dépenses", largeur: 70, droite: true },
      { titre: "Total", largeur: 100, droite: true },
    ],
    b.parMoyen.map((m) => [m.libelle, m.type, String(m.nb), euros(m.total)]),
  );
  p.sousTitre("Remboursements de l'année");
  p.tableau(
    [
      { titre: "Virement", largeur: 70 },
      { titre: "Plage", largeur: 130 },
      { titre: "Dépenses", largeur: 60, droite: true },
      { titre: "Total", largeur: 80, droite: true },
      { titre: "Viré", largeur: 80, droite: true },
      { titre: "Écart", largeur: 75, droite: true },
    ],
    b.remboursements.map((r) => [court(r.dateVirement), `${court(r.debut)} -> ${court(r.fin)}`, String(r.nbDepenses), euros(r.total), euros(r.montantVire), r.ecart ? signe(r.ecart) : "-"]),
    ["Total", "", "", euros(b.remboursements.reduce((t, r) => t + r.total, 0)), euros(b.totalVire), b.ecartCumule ? signe(b.ecartCumule) : "-"],
  );
  return { octets: await p.terminer(), nom: `bilan-${annee}.pdf` };
}
