import { describe, expect, test } from "bun:test";
import { query } from "../src/db/client";
import { SUPER, serveurDeTest } from "./outils-serveur";

const s = await serveurDeTest();
const { cookie } = await s.connexion(SUPER.email, SUPER.motDePasse);

const appel = async (nom: string, args: unknown[], c = cookie) => {
  const r = await s.rpc(nom, args, c);
  const corps = await r.json();
  return { statut: r.status, resultat: corps.resultat, erreur: corps.erreur as string | undefined };
};
const ok = async (nom: string, ...args: unknown[]) => {
  const r = await appel(nom, args);
  if (r.statut !== 200) throw new Error(`${nom} : ${r.statut} ${r.erreur}`);
  return r.resultat;
};

const envoyer = async (nom = "ticket.jpg", type = "image/jpeg") => {
  const f = new FormData();
  f.append("fichier", new File([new Uint8Array([255, 216, 255])], nom, { type }));
  const r = await s.app.handle(new Request("http://local/api/fichiers", { method: "POST", body: f, headers: { "x-cura": "1", cookie } }));
  return (await r.json()) as { fichier: string; nom: string };
};

const types = await ok("listeTypesPaiement");
const cb = await ok("creerMoyenPaiement", { libelle: "CB Marie", typeId: types[0].id });
const especes = await ok("creerMoyenPaiement", { libelle: "Espèces", typeId: types[2].id });
const categories: { id: string; nom: string }[] = await ok("listeCategories");
const pharmacie = categories.find((c) => c.nom === "Pharmacie")!.id;
const sante = categories.find((c) => c.nom === "Santé")!.id;

/** Coche des dépenses dans un remboursement, directement en base (les remboursements arrivent à l'étape 3). */
async function rembourser(...ids: string[]) {
  const r = crypto.randomUUID();
  await query("insert into remboursement (id, date_virement, debut, fin, montant_vire) values (?, '2026-11-02', '2026-10-01', '2026-10-31', 0)", [r]);
  for (const id of ids) await query("update depense set remboursement_id = ? where id = ?", [r, id]);
  return r;
}

describe("dépenses", () => {
  test("création avec catégories et justificatifs, en un seul tenant ; fiche complète", async () => {
    const photo = await envoyer();
    const id = await ok("creerDepense", {
      date: "2026-10-28",
      libelle: "  Pharmacie du Centre ",
      montant: 2340,
      moyenId: cb,
      categorieIds: [pharmacie, sante, pharmacie],
      justificatifs: [photo],
    });
    const f = await ok("ficheDepense", id);
    expect(f).toMatchObject({ libelle: "Pharmacie du Centre", montant: 2340, moyenLibelle: "CB Marie", remboursementId: null, creePar: SUPER.email });
    expect(f.categories.map((c: { nom: string }) => c.nom).sort()).toEqual(["Pharmacie", "Santé"]);
    expect(f.justificatifs).toHaveLength(1);
    expect(f.justificatifs[0]).toMatchObject({ fichier: photo.fichier, mime: "image/jpeg", archive: false });
    // Le même fichier ne se rattache pas deux fois.
    expect((await appel("creerDepense", [{ date: "2026-10-28", libelle: "Doublon", montant: 100, moyenId: cb, justificatifs: [photo] }])).statut).toBe(400);
  });

  test("saisies refusées : montant nul ou à virgule, date invalide, libellé vide, moyen archivé", async () => {
    const base = { date: "2026-10-20", libelle: "Courses", montant: 1250, moyenId: cb };
    for (const v of [{ montant: 0 }, { montant: 12.5 }, { date: "20/10/2026" }, { libelle: "  " }, { moyenId: crypto.randomUUID() }]) {
      expect((await appel("creerDepense", [{ ...base, ...v }])).statut).toBe(400);
    }
    const ancienne = await ok("creerMoyenPaiement", { libelle: "Ancienne CB", typeId: types[0].id });
    await ok("majMoyenPaiement", ancienne, { archive: true });
    expect((await appel("creerDepense", [{ ...base, moyenId: ancienne }])).erreur).toContain("archivé");
  });

  test("avoir : montant négatif accepté", async () => {
    const id = await ok("creerDepense", { date: "2026-10-15", libelle: "Avoir Amazon", montant: -1599, moyenId: cb });
    expect((await ok("ficheDepense", id)).montant).toBe(-1599);
  });

  test("filtres : période, statut, sans justificatif, catégorie, moyen, recherche", async () => {
    const a = await ok("creerDepense", { date: "2026-09-03", libelle: "Marché de la place", montant: 1250, moyenId: especes, note: "légumes" });
    const b = await ok("creerDepense", { date: "2026-09-05", libelle: "Dr Lefèvre", montant: 3000, moyenId: cb, categorieIds: [sante], justificatifs: [await envoyer("feuille.pdf", "application/pdf")] });
    await rembourser(b);
    const ids = async (f: object) => ((await ok("listeDepenses", f)) as { id: string }[]).map((d) => d.id);
    const sept = { debut: "2026-09-01", fin: "2026-09-30" };
    expect(await ids(sept)).toEqual([b, a]);
    expect(await ids({ ...sept, statut: "a_rembourser" })).toEqual([a]);
    expect(await ids({ ...sept, statut: "remboursees" })).toEqual([b]);
    expect(await ids({ ...sept, statut: "sans_justificatif" })).toEqual([a]);
    expect(await ids({ ...sept, categorieId: sante })).toEqual([b]);
    expect(await ids({ ...sept, moyenId: especes })).toEqual([a]);
    expect(await ids({ recherche: "légume" })).toEqual([a]);
    const [ligne] = await ok("listeDepenses", { ...sept, statut: "remboursees" });
    expect(ligne).toMatchObject({ moyenLibelle: "CB Marie", nbJustificatifs: 1, categories: [{ nom: "Santé" }] });
  });

  test("modification : catégories remplacées, nouvelle version ; conflit avec une version périmée", async () => {
    const id = await ok("creerDepense", { date: "2026-10-01", libelle: "Carrefour", montant: 9230, moyenId: cb, categorieIds: [pharmacie] });
    const v0 = (await ok("ficheDepense", id)).modifieLe;
    await Bun.sleep(5);
    const { modifieLe: v1 } = await ok("majDepense", id, { categorieIds: [sante] }, v0);
    expect(v1).not.toBe(v0);
    expect((await ok("ficheDepense", id)).categories.map((c: { nom: string }) => c.nom)).toEqual(["Santé"]);
    const autre = await s.compte("soeur@famille.fr", "ecriture");
    await Bun.sleep(5);
    expect((await appel("majDepense", [id, { montant: 9300 }, v1], autre.cookie)).statut).toBe(200);
    expect((await appel("majDepense", [id, { montant: 9400 }, v1])).statut).toBe(409);
  });

  test("dépense remboursée verrouillée : écriture refusée, admin autorisé ; un justificatif peut toujours s'ajouter", async () => {
    const id = await ok("creerDepense", { date: "2026-10-08", libelle: "Leroy Merlin", montant: 5490, moyenId: cb });
    await rembourser(id);
    const ecrivain = await s.compte("ecrivain-verrou@famille.fr", "ecriture");
    expect((await appel("majDepense", [id, { montant: 1 }], ecrivain.cookie)).statut).toBe(403);
    expect((await appel("supprimerDepense", [id], ecrivain.cookie)).statut).toBe(403);
    expect((await appel("ajouterJustificatifs", [id, [await envoyer()]], ecrivain.cookie)).statut).toBe(200);
    const [j] = (await ok("ficheDepense", id)).justificatifs;
    expect((await appel("retirerJustificatif", [j.id], ecrivain.cookie)).statut).toBe(403);
    expect((await appel("majDepense", [id, { libelle: "Leroy Merlin — barre d'appui" }])).statut).toBe(200);
  });

  test("justificatifs jamais effacés : retirer archive, supprimer la dépense les détache", async () => {
    const photo = await envoyer();
    const id = await ok("creerDepense", { date: "2026-10-12", libelle: "Coiffeuse", montant: 2500, moyenId: especes, justificatifs: [photo] });
    const [j] = (await ok("ficheDepense", id)).justificatifs;
    await ok("retirerJustificatif", j.id);
    expect((await ok("ficheDepense", id)).justificatifs[0].archive).toBe(true);
    expect((await ok("listeDepenses", { recherche: "Coiffeuse" }))[0].nbJustificatifs).toBe(0);
    await ok("supprimerDepense", id);
    expect((await appel("ficheDepense", [id])).statut).toBe(404);
    expect(await query("select depense_id, archive from justificatif where id = ?", [j.id])).toEqual([[null, 1]]);
  });

  test("lecture : consulte, n'écrit pas", async () => {
    const lecteur = await s.compte("lecteur-depenses@famille.fr", "lecture");
    expect((await appel("listeDepenses", [{}], lecteur.cookie)).statut).toBe(200);
    expect((await appel("creerDepense", [{ date: "2026-10-01", libelle: "X", montant: 100, moyenId: cb }], lecteur.cookie)).statut).toBe(403);
  });

  test("dernière saisie : le moyen de paiement de sa dernière dépense", async () => {
    const tante = await s.compte("tante@famille.fr", "ecriture");
    expect((await appel("derniereSaisie", [], tante.cookie)).resultat).toEqual({ moyenId: null });
    await appel("creerDepense", [{ date: "2026-10-02", libelle: "Boulangerie", montant: 420, moyenId: especes }], tante.cookie);
    expect((await appel("derniereSaisie", [], tante.cookie)).resultat).toEqual({ moyenId: especes });
  });
});

describe("journal avant / après", () => {
  type Ligne = { fonction: string; cible: string; avant: string | null; apres: string | null };
  const lignesDe = async (cible: string) => ((await (await s.requete(`/api/journal?cible=${cible}`, { cookie })).json()).lignes as Ligne[]).reverse();

  test("création, modification, justificatif retiré, suppression : la fiche entière à chaque étape", async () => {
    const photo = await envoyer();
    const id = await ok("creerDepense", { date: "2026-10-24", libelle: "Amazon coussin", montant: 3999, moyenId: cb, categorieIds: [sante], justificatifs: [photo] });
    await ok("majDepense", id, { montant: 4199 });
    const [j] = (await ok("ficheDepense", id)).justificatifs;
    await ok("retirerJustificatif", j.id);
    await ok("supprimerDepense", id);

    const lignes = await lignesDe(id);
    expect(lignes.map((l) => l.fonction)).toEqual(["creerDepense", "majDepense", "retirerJustificatif", "supprimerDepense"]);
    const [creation, maj, retrait, suppression] = lignes;
    expect(creation.avant).toBeNull();
    expect(JSON.parse(creation.apres!)).toMatchObject({ table: "depense", montant: 3999, moyen: "CB Marie", categories: ["Santé"], justificatifs: [{ fichier: photo.fichier, archive: 0 }] });
    expect(JSON.parse(maj.avant!).montant).toBe(3999);
    expect(JSON.parse(maj.apres!).montant).toBe(4199);
    expect(JSON.parse(retrait.avant!)).toMatchObject({ table: "justificatif", archive: 0 });
    expect(JSON.parse(retrait.apres!)).toMatchObject({ table: "justificatif", archive: 1 });
    expect(JSON.parse(suppression.avant!)).toMatchObject({ table: "depense", libelle: "Amazon coussin", montant: 4199 });
    expect(suppression.apres).toBeNull();
  });
});
