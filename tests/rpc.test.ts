import { describe, expect, test } from "bun:test";
import { FONCTIONS } from "../serveur/rpc";
import { SUPER, serveurDeTest } from "./outils-serveur";

const s = await serveurDeTest();
const { cookie } = await s.connexion(SUPER.email, SUPER.motDePasse);

describe("RPC", () => {
  test("lectures et écritures repérées, toutes les fonctions de src/data/ exposées", () => {
    expect(FONCTIONS.get("listeCategories")?.droit).toBe("lecture");
    expect(FONCTIONS.get("lireFoyer")?.droit).toBe("lecture");
    expect(FONCTIONS.get("creerCategorie")?.droit).toBe("ecriture");
    expect(FONCTIONS.get("fusionnerCategories")?.droit).toBe("ecriture");
    expect(FONCTIONS.get("majFoyer")?.droit).toBe("ecriture");
  });

  test("écriture puis lecture ; écritures journalisées", async () => {
    const r = await s.rpc("creerCategorie", [{ nom: "  Coiffure  ", couleur: "teal" }], cookie);
    expect(r.status).toBe(200);
    const { resultat: id } = await r.json();
    expect(typeof id).toBe("string");
    const liste = await (await s.rpc("listeCategories", [], cookie)).json();
    expect(liste.resultat.find((c: { id: string }) => c.id === id)).toMatchObject({ nom: "Coiffure", couleur: "teal", creePar: SUPER.email });
    const journal = await (await s.requete("/api/journal", { cookie })).json();
    expect(journal.lignes[0]).toMatchObject({ fonction: "creerCategorie", cible: id, utilisateur: SUPER.email });
  });

  test("conflit : version périmée modifiée par quelqu'un d'autre refusée", async () => {
    const autre = await s.compte("autre@famille.fr", "ecriture");
    const id = (await (await s.rpc("creerCategorie", [{ nom: "Taxi" }], cookie)).json()).resultat;
    const { resultat: v1 } = await (await s.rpc("majCategorie", [id, { couleur: "red" }], cookie)).json();
    // La version est l'heure à la milliseconde : deux écritures dans la même milliseconde se confondraient.
    await Bun.sleep(5);
    expect((await s.rpc("majCategorie", [id, { couleur: "blue" }, v1.modifieLe], autre.cookie)).status).toBe(200);
    expect((await s.rpc("majCategorie", [id, { couleur: "green" }, v1.modifieLe], cookie)).status).toBe(409);
  });

  test("fonction inconnue : 404 ; arguments invalides : 422", async () => {
    expect((await s.rpc("dropTable", [], cookie)).status).toBe(404);
    expect((await s.requete("/api/rpc/listeCategories", { corps: {}, cookie })).status).toBe(422);
  });
});
