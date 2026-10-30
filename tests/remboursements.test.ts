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
const envoyer = async () => {
  const f = new FormData();
  f.append("fichier", new File([new Uint8Array([37, 80, 68, 70])], "releve.pdf", { type: "application/pdf" }));
  const r = await s.app.handle(new Request("http://local/api/fichiers", { method: "POST", body: f, headers: { "x-cura": "1", cookie } }));
  return (await r.json()) as { fichier: string; nom: string };
};

const types = await ok("listeTypesPaiement");
const cb = await ok("creerMoyenPaiement", { libelle: "CB Patrick", typeId: types[0].id });
const depense = (date: string, libelle: string, montant: number) => ok("creerDepense", { date, libelle, montant, moyenId: cb });

const oubliee = await depense("2026-09-29", "Pharmacie oubliée", 1860);
const d1 = await depense("2026-10-03", "Carrefour", 9230);
const d2 = await depense("2026-10-15", "Avoir Amazon", -1599);
const d3 = await depense("2026-10-28", "Pharmacie", 2340);
const apres = await depense("2026-11-02", "Boulangerie", 420);

describe("remboursements", () => {
  test("plage proposée sans remboursement précédent : du 1er du mois à aujourd'hui", async () => {
    const p = await ok("plageProposee");
    expect(p.debut).toMatch(/^\d{4}-\d{2}-01$/);
    expect(p.debut <= p.fin).toBe(true);
  });

  test("candidats : la plage, et à part les oubliées d'avant ; rien d'après la plage", async () => {
    const c = await ok("candidats", "2026-10-01", "2026-10-31");
    expect(c.dansPlage.map((d: { id: string }) => d.id)).toEqual([d1, d2, d3]);
    expect(c.avant.map((d: { id: string }) => d.id)).toEqual([oubliee]);
    expect([...c.dansPlage, ...c.avant].some((d: { id: string }) => d.id === apres)).toBe(false);
    expect(await ok("enAttente")).toEqual({ nb: 5, total: 1860 + 9230 - 1599 + 2340 + 420 });
  });

  test("validation : dépenses cochées remboursées et verrouillées, total, écart affiché, justificatif du virement", async () => {
    const releve = await envoyer();
    const id = await ok("creerRemboursement", {
      dateVirement: "2026-10-29",
      debut: "2026-10-01",
      fin: "2026-10-31",
      montantVire: 12000,
      depenseIds: [d1, d2, d3, oubliee],
      note: "Arrondi à 120 €",
      justificatifs: [releve],
    });
    const r = await ok("ficheRemboursement", id);
    expect(r).toMatchObject({ montantVire: 12000, total: 11831, ecart: 169, note: "Arrondi à 120 €" });
    expect(r.depenses.map((d: { id: string }) => d.id)).toEqual([oubliee, d1, d2, d3]);
    expect(r.justificatifs).toHaveLength(1);
    expect((await ok("ficheDepense", d1)).remboursementId).toBe(id);
    expect(await ok("enAttente")).toEqual({ nb: 1, total: 420 });
    const [l] = await ok("listeRemboursements");
    expect(l).toMatchObject({ id, nbDepenses: 4, total: 11831, ecart: 169, nbJustificatifs: 1 });

    // Plage suivante : à partir du lendemain de la fin (sans dépasser aujourd'hui, qui la termine).
    const p = await ok("plageProposee");
    expect(p.debut).toBe(p.fin < "2026-11-01" ? p.fin : "2026-11-01");

    // Les dépenses cochées sont verrouillées pour le rôle écriture.
    const ecrivain = await s.compte("ecrivain-remb@famille.fr", "ecriture");
    expect((await appel("majDepense", [d1, { montant: 1 }], ecrivain.cookie)).statut).toBe(403);
  });

  test("une dépense ne se rembourse qu'une fois ; saisies invalides refusées", async () => {
    const base = { dateVirement: "2026-10-30", debut: "2026-10-01", fin: "2026-10-31", montantVire: 100 };
    expect((await appel("creerRemboursement", [{ ...base, depenseIds: [d1] }])).statut).toBe(409);
    expect((await appel("creerRemboursement", [{ ...base, depenseIds: [] }])).statut).toBe(400);
    expect((await appel("creerRemboursement", [{ ...base, montantVire: 0, depenseIds: [apres] }])).statut).toBe(400);
    expect((await appel("creerRemboursement", [{ ...base, debut: "2026-11-01", fin: "2026-10-01", depenseIds: [apres] }])).statut).toBe(400);
    expect((await ok("ficheDepense", apres)).remboursementId).toBeNull();
  });

  test("modifier un remboursement validé : admins seulement ; ses justificatifs aussi", async () => {
    const [r] = await ok("listeRemboursements");
    const ecrivain = await s.compte("ecrivain-maj@famille.fr", "ecriture");
    expect((await appel("majRemboursement", [r.id, { note: "x" }], ecrivain.cookie)).statut).toBe(403);
    const [j] = (await ok("ficheRemboursement", r.id)).justificatifs;
    expect((await appel("retirerJustificatif", [j.id], ecrivain.cookie)).statut).toBe(403);
    // Ajouter un justificatif reste possible.
    expect((await appel("ajouterJustificatifs", [r.id, [await envoyer()]], ecrivain.cookie)).statut).toBe(200);
    await ok("majRemboursement", r.id, { montantVire: 11831, note: "Corrigé : virement complémentaire de 1,69 € rendu" });
    expect(await ok("ficheRemboursement", r.id)).toMatchObject({ ecart: 0 });
  });

  test("journal : le remboursement avec les dépenses qu'il couvre ; lecture consulte sans créer", async () => {
    const [r] = await ok("listeRemboursements");
    const { lignes } = await (await s.requete(`/api/journal?cible=${r.id}`, { cookie })).json();
    const creation = lignes.find((l: { fonction: string }) => l.fonction === "creerRemboursement");
    expect(JSON.parse(creation.apres)).toMatchObject({ table: "remboursement", montant_vire: 12000, depenses: expect.arrayContaining([expect.objectContaining({ id: d1 })]) });
    const lecteur = await s.compte("lecteur-remb@famille.fr", "lecture");
    expect((await appel("ficheRemboursement", [r.id], lecteur.cookie)).statut).toBe(200);
    expect((await appel("creerRemboursement", [{ dateVirement: "2026-11-30", debut: "2026-11-01", fin: "2026-11-30", montantVire: 420, depenseIds: [apres] }], lecteur.cookie)).statut).toBe(403);
  });
});

describe("suppression d'un remboursement", () => {
  test("super admin seulement : dépenses libérées et de nouveau modifiables, justificatifs archivés, fiche gardée au journal", async () => {
    const d = await ok("creerDepense", { date: "2027-01-05", libelle: "Erreur d'année", montant: 1500, moyenId: cb });
    const releve = await envoyer();
    const r = await ok("creerRemboursement", { dateVirement: "2027-02-01", debut: "2027-01-01", fin: "2027-01-31", montantVire: 1500, depenseIds: [d], justificatifs: [releve] });
    const admin = await s.compte("admin-suppression@famille.fr", "admin");
    const ecrivain = await s.compte("ecrivain-suppression@famille.fr", "ecriture");
    expect((await appel("supprimerRemboursement", [r], admin.cookie)).statut).toBe(403);
    expect((await appel("majDepense", [d, { date: "2026-01-05" }], ecrivain.cookie)).statut).toBe(403);

    await ok("supprimerRemboursement", r);
    expect((await appel("ficheRemboursement", [r])).statut).toBe(404);
    expect((await ok("ficheDepense", d)).remboursementId).toBeNull();
    expect((await appel("majDepense", [d, { date: "2026-01-05" }], ecrivain.cookie)).statut).toBe(200);
    expect(await query("select remboursement_id, archive from justificatif where fichier = ?", [releve.fichier])).toEqual([[null, 1]]);

    const { lignes } = await (await s.requete(`/api/journal?cible=${r}`, { cookie })).json();
    const suppression = lignes.find((l: { fonction: string }) => l.fonction === "supprimerRemboursement");
    expect(JSON.parse(suppression.avant)).toMatchObject({ table: "remboursement", montant_vire: 1500, depenses: [{ id: d }] });
    expect(suppression.apres).toBeNull();
  });
});
