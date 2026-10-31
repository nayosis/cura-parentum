import { describe, expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
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
  f.append("fichier", new File([new Uint8Array([255, 216, 255])], "ticket.jpg", { type: "image/jpeg" }));
  const r = await s.app.handle(new Request("http://local/api/fichiers", { method: "POST", body: f, headers: { "x-cura": "1", cookie } }));
  return (await r.json()) as { fichier: string; nom: string };
};

const types = await ok("listeTypesPaiement");
const cb = await ok("creerMoyenPaiement", { libelle: "CB", typeId: types[0].id });
const depense = (libelle: string, extra: object = {}) => ok("creerDepense", { date: "2025-06-10", libelle, montant: 1000, moyenId: cb, ...extra });
const ecrivain = await s.compte("ecrivain-absence@famille.fr", "ecriture");

describe("justificatif absent", () => {
  test("à la saisie : motif gardé avec qui et quand ; « Autre » demande une précision ; une photo l'emporte", async () => {
    const id = await depense("Marché", { absence: { motif: "pas_de_ticket" } });
    expect(await ok("ficheDepense", id)).toMatchObject({ absence: "pas_de_ticket", absenceDetail: null, absencePar: SUPER.email });
    expect((await appel("creerDepense", [{ date: "2025-06-10", libelle: "X", montant: 100, moyenId: cb, absence: { motif: "autre" } }])).statut).toBe(400);
    const avecPhoto = await depense("Pharmacie", { absence: { motif: "perdu" }, justificatifs: [await envoyer()] });
    expect((await ok("ficheDepense", avecPhoto)).absence).toBeNull();
  });

  test("tableau de bord, liste et bilan : les absences déclarées ne sont plus des oublis, comptées à part", async () => {
    const avant = (await ok("tableauDeBord")).sansJustificatif;
    const a = await depense("Hyper U");
    const b = await depense("Boucherie");
    expect((await ok("tableauDeBord")).sansJustificatif.nb).toBe(avant.nb + 2);
    expect(await ok("declarerAbsence", [a, b], { motif: "perdu" })).toBe(2);
    const t = (await ok("tableauDeBord")).sansJustificatif;
    expect(t).toMatchObject({ nb: avant.nb, absents: avant.absents + 2 });
    const oublis = (await ok("listeDepenses", { statut: "sans_justificatif" })).map((d: { id: string }) => d.id);
    expect(oublis).not.toContain(a);
    expect((await ok("bilanAnnuel", 2025)).absents).toBeGreaterThanOrEqual(3);
  });

  test("un justificatif ajouté plus tard efface la déclaration ; on peut aussi la retirer", async () => {
    const a = await depense("Retrouvé", { absence: { motif: "perdu" } });
    await ok("ajouterJustificatifs", a, [await envoyer()]);
    expect((await ok("ficheDepense", a)).absence).toBeNull();
    const b = await depense("Erreur", { absence: { motif: "perdu" } });
    await ok("declarerAbsence", [b], null);
    expect((await ok("ficheDepense", b)).absence).toBeNull();
  });

  test("dépense remboursée : admins seulement ; journal et dossier du remboursement", async () => {
    const a = await depense("Vieille dépense");
    const r = await ok("creerRemboursement", { dateVirement: "2025-07-01", debut: "2025-06-01", fin: "2025-06-30", montantVire: 1000, depenseIds: [a] });
    expect((await appel("declarerAbsence", [[a], { motif: "perdu" }], ecrivain.cookie)).statut).toBe(403);
    const admin = await s.compte("admin-absence@famille.fr", "admin");
    expect((await appel("declarerAbsence", [[a], { motif: "autre", detail: "Ticket illisible" }], admin.cookie)).statut).toBe(200);

    const { lignes } = await (await s.requete(`/api/journal?cible=${a}`, { cookie })).json();
    const l = lignes.find((x: { fonction: string }) => x.fonction === "declarerAbsence");
    expect(JSON.parse(l.avant).absence).toBeNull();
    expect(JSON.parse(l.apres)).toMatchObject({ absence: "autre", absence_detail: "Ticket illisible", absence_par: "admin-absence@famille.fr" });

    const zip = unzipSync(new Uint8Array(await (await s.requete(`/api/exports/remboursements/${r}/justificatifs`, { cookie })).arrayBuffer()));
    expect(strFromU8(zip["depenses.csv"])).toContain("Absent (Autre : Ticket illisible, déclaré par admin-absence@famille.fr le ");
  });
});
