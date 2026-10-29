import { describe, expect, test } from "bun:test";
import { aujourdhui } from "../src/lib/dates";
import { SUPER, serveurDeTest } from "./outils-serveur";

const s = await serveurDeTest();
const { cookie } = await s.connexion(SUPER.email, SUPER.motDePasse);

const ok = async (nom: string, ...args: unknown[]) => {
  const r = await s.rpc(nom, args, cookie);
  const corps = await r.json();
  if (r.status !== 200) throw new Error(`${nom} : ${r.status} ${corps.erreur}`);
  return corps.resultat;
};
const envoyer = async () => {
  const f = new FormData();
  f.append("fichier", new File([new Uint8Array([255, 216, 255])], "ticket.jpg", { type: "image/jpeg" }));
  const r = await s.app.handle(new Request("http://local/api/fichiers", { method: "POST", body: f, headers: { "x-cura": "1", cookie } }));
  return (await r.json()) as { fichier: string; nom: string };
};

const jour = aujourdhui();
const annee = jour.slice(0, 4);
const mois = jour.slice(0, 7);
// Un mois plus tôt dans l'année quand c'est possible (en janvier : le même mois).
const autreMois = mois.endsWith("-01") ? mois : `${annee}-${String(Number(jour.slice(5, 7)) - 1).padStart(2, "0")}`;

const types = await ok("listeTypesPaiement");
const cb = await ok("creerMoyenPaiement", { libelle: "CB", typeId: types[0].id });
const categories: { id: string; nom: string }[] = await ok("listeCategories");
const cat = (nom: string) => categories.find((c) => c.nom === nom)!.id;

describe("tableau de bord", () => {
  test("vide : tout à zéro, pas de remboursement", async () => {
    const t = await ok("tableauDeBord");
    expect(t).toMatchObject({ jour, aRembourser: { nb: 0, total: 0, depuis: null }, sansJustificatif: { nb: 0 }, dernierRemboursement: null });
    expect(t.annee.parMois).toHaveLength(12);
  });

  test("à rembourser, sans justificatif, dernier remboursement, année, catégories, dernières dépenses", async () => {
    const vieille = await ok("creerDepense", { date: `${Number(annee) - 1}-12-20`, libelle: "Année passée", montant: 5000, moyenId: cb });
    const avant = await ok("creerDepense", { date: `${autreMois}-01`, libelle: "Carrefour", montant: 9000, moyenId: cb, categorieIds: [cat("Courses")], justificatifs: [await envoyer()] });
    await ok("creerRemboursement", { dateVirement: jour, debut: `${Number(annee) - 1}-12-01`, fin: `${autreMois}-01`, montantVire: 14000, depenseIds: [vieille, avant] });
    await ok("creerDepense", { date: jour, libelle: "Pharmacie", montant: 2340, moyenId: cb, categorieIds: [cat("Pharmacie"), cat("Santé")] });
    await ok("creerDepense", { date: jour, libelle: "Marché", montant: 1250, moyenId: cb });
    await ok("creerDepense", { date: jour, libelle: "Avoir", montant: -599, moyenId: cb, categorieIds: [cat("Santé")], justificatifs: [await envoyer()] });

    const t = await ok("tableauDeBord");
    expect(t.aRembourser).toEqual({ nb: 3, total: 2340 + 1250 - 599, depuis: jour });
    // Sans justificatif : la vieille dépense (remboursée), Pharmacie et Marché (à rembourser).
    expect(t.sansJustificatif).toEqual({ nb: 3, aRembourser: 2 });
    expect(t.dernierRemboursement).toMatchObject({ montantVire: 14000, total: 14000, ecart: 0 });
    expect(t.annee.total).toBe(9000 + 2340 + 1250 - 599);
    expect(t.annee.parMois[Number(jour.slice(5, 7)) - 1]).toBe(autreMois === mois ? 9000 + 2991 : 2991);

    const mois_ = Object.fromEntries(t.categoriesMois.map((c: { nom: string; total: number }) => [c.nom, c.total]));
    expect(mois_).toEqual(autreMois === mois ? { Courses: 9000, Pharmacie: 2340, Santé: 1741, "Sans catégorie": 1250 } : { Pharmacie: 2340, Santé: 1741, "Sans catégorie": 1250 });
    expect(t.categoriesAnnee[0]).toMatchObject({ nom: "Courses", total: 9000 });

    expect(t.dernieresDepenses).toHaveLength(5);
    expect(t.dernieresDepenses[0].date).toBe(jour);
    expect(t.remboursementsRecents).toHaveLength(1);
  });
});
