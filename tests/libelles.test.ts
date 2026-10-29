import { describe, expect, test } from "bun:test";
import { proposer } from "../src/components/SuggestionsLibelle";
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

const types = await ok("listeTypesPaiement");
const cb = await ok("creerMoyenPaiement", { libelle: "CB", typeId: types[0].id });
const categories: { id: string; nom: string }[] = await ok("listeCategories");
const courses = categories.find((c) => c.nom === "Courses")!.id;
const sante = categories.find((c) => c.nom === "Santé")!.id;
const depense = (libelle: string, date = "2026-10-01", categorieIds: string[] = []) => ok("creerDepense", { date, libelle, montant: 1000, moyenId: cb, categorieIds });

for (let i = 0; i < 3; i++) await depense("Hyper U", "2026-10-01", [courses]);
await depense("hyper u ", "2026-10-05", [courses, sante]);
await depense("Boucherie Marchais");
await depense("Boucherie Marchais");
await depense("Delaunay Volailler");
await depense("Delaunay Volailler");
await depense("Delaunay volaille");
await depense("Pharmacie du Centre");
await depense("Épicerie fine");

describe("libellés fréquents", () => {
  test("regroupés sans tenir compte des majuscules ni des espaces, du plus fréquent au moins fréquent", async () => {
    const l = await ok("libellesFrequents");
    // L'écriture et les catégories de la dernière dépense à ce libellé.
    expect(l[0]).toEqual({ libelle: "hyper u", nb: 4, categorieIds: expect.arrayContaining([courses, sante]) });
    expect(l.slice(1, 3).map((x: { libelle: string }) => x.libelle)).toEqual(["Boucherie Marchais", "Delaunay Volailler"]);
    expect(l).toHaveLength(6);
  });

  test("propositions : 5 au plus, filtrées sans accents, celles qui commencent par la saisie d'abord", async () => {
    const l = await ok("libellesFrequents");
    expect(proposer(l, "")).toHaveLength(5);
    expect(proposer(l, "epi").map((x) => x.libelle)).toEqual(["Épicerie fine"]);
    expect(proposer(l, "ce").map((x) => x.libelle)).toEqual(["Pharmacie du Centre", "Épicerie fine"]);
    expect(proposer(l, "del").map((x) => x.libelle)).toEqual(["Delaunay Volailler", "Delaunay volaille"]);
    // Le libellé tapé en entier n'est plus proposé.
    expect(proposer(l, "Delaunay volaille").map((x) => x.libelle)).toEqual(["Delaunay Volailler"]);
  });
});

describe("renommer un libellé", () => {
  test("admin seulement ; toutes les dépenses concernées, chacune au journal", async () => {
    const ecrivain = await s.compte("ecrivain-libelles@famille.fr", "ecriture");
    expect((await appel("renommerLibelle", ["Delaunay volaille", "Delaunay Volailler"], ecrivain.cookie)).statut).toBe(403);
    expect(await ok("renommerLibelle", "Delaunay volaille", "Delaunay Volailler")).toBe(1);
    const l = await ok("libellesFrequents");
    expect(l.find((x: { libelle: string }) => x.libelle === "Delaunay Volailler").nb).toBe(3);
    expect(l.some((x: { libelle: string }) => x.libelle === "Delaunay volaille")).toBe(false);
    const { lignes } = await (await s.requete("/api/journal", { cookie })).json();
    const ligne = lignes.find((x: { fonction: string; cible: string | null }) => x.fonction === "renommerLibelle" && x.cible);
    expect(JSON.parse(ligne.avant).libelle).toBe("Delaunay volaille");
    expect(JSON.parse(ligne.apres).libelle).toBe("Delaunay Volailler");
  });
});
