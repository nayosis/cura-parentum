import { describe, expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { strFromU8, unzipSync } from "fflate";
import { modificationsUlterieures } from "../serveur/exports";
import { orientationJpeg } from "../serveur/pdf";
import { SUPER, serveurDeTest } from "./outils-serveur";

const s = await serveurDeTest();
const { cookie } = await s.connexion(SUPER.email, SUPER.motDePasse);

const ok = async (nom: string, ...args: unknown[]) => {
  const r = await s.rpc(nom, args, cookie);
  const corps = await r.json();
  if (r.status !== 200) throw new Error(`${nom} : ${r.status} ${corps.erreur}`);
  return corps.resultat;
};
const envoyer = async (octets: Uint8Array, nom: string, type: string) => {
  const f = new FormData();
  f.append("fichier", new File([octets], nom, { type }));
  const r = await s.app.handle(new Request("http://local/api/fichiers", { method: "POST", body: f, headers: { "x-cura": "1", cookie } }));
  return (await r.json()) as { fichier: string; nom: string };
};

/** Une image PNG de 1 × 1 pixel, et un PDF de deux pages. */
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const facture = await PDFDocument.create();
facture.addPage();
facture.addPage();
const pdf = await facture.save();
/** Un « JPEG » abîmé : l'export ne doit pas échouer pour autant. */
const jpegAbime = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0]);

const types = await ok("listeTypesPaiement");
const cb = await ok("creerMoyenPaiement", { libelle: "CB Marie", typeId: types[0].id });
const sante = (await ok("listeCategories")).find((c: { nom: string }) => c.nom === "Santé").id;
const d1 = await ok("creerDepense", { date: "2026-10-03", libelle: "Pharmacie du Centre", montant: 2340, moyenId: cb, categorieIds: [sante], note: "Ordonnance du Dr Lefèvre", justificatifs: [await envoyer(png, "ticket.png", "image/png")] });
const d2 = await ok("creerDepense", { date: "2026-10-08", libelle: "Leroy Merlin / barre d'appui", montant: 5490, moyenId: cb, justificatifs: [await envoyer(pdf, "facture.pdf", "application/pdf")] });
const d3 = await ok("creerDepense", { date: "2026-10-12", libelle: "Coiffeuse", montant: 2500, moyenId: cb, justificatifs: [await envoyer(jpegAbime, "photo.jpg", "image/jpeg")] });
const d4 = await ok("creerDepense", { date: "2026-10-15", libelle: "Avoir", montant: -599, moyenId: cb });
const remb = await ok("creerRemboursement", {
  dateVirement: "2026-10-29",
  debut: "2026-10-01",
  fin: "2026-10-31",
  montantVire: 10000,
  depenseIds: [d1, d2, d3, d4],
  justificatifs: [await envoyer(png, "releve.png", "image/png")],
});
// Retouche d'un admin après la validation : elle doit figurer dans le dossier.
await ok("majDepense", d1, { montant: 2440 });

describe("exports", () => {
  test("dossier PDF : récapitulatif puis une page par photo, les pages des PDF annexés, une page pour l'annexe illisible", async () => {
    const r = await s.requete(`/api/exports/remboursements/${remb}/dossier`, { cookie });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toContain("remboursement-2026-10-29.pdf");
    const doc = await PDFDocument.load(new Uint8Array(await r.arrayBuffer()));
    // 1 page de récapitulatif + ticket.png (1) + facture.pdf (2) + photo.jpg illisible (1) + releve.png (1).
    expect(doc.getPageCount()).toBe(6);
    expect(doc.getTitle()).toBe("Remboursement du 29/10/2026");
  });

  test("ZIP : justificatifs renommés, CSV des dépenses (UTF-8, point-virgule), dossier PDF", async () => {
    const r = await s.requete(`/api/exports/remboursements/${remb}/justificatifs`, { cookie });
    expect(r.status).toBe(200);
    const contenu = unzipSync(new Uint8Array(await r.arrayBuffer()));
    expect(Object.keys(contenu).sort()).toEqual([
      "depenses.csv",
      "justificatifs/2026-10-03_Pharmacie du Centre_24,40.png",
      "justificatifs/2026-10-08_Leroy Merlin barre d'appui_54,90.pdf",
      "justificatifs/2026-10-12_Coiffeuse_25,00.jpg",
      "justificatifs/2026-10-29_virement_releve.png",
      "remboursement-2026-10-29.pdf",
    ]);
    // BOM UTF-8 en tête (Excel), puis les lignes.
    expect([...contenu["depenses.csv"].slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lignes = strFromU8(contenu["depenses.csv"].slice(3)).split("\r\n");
    expect(lignes[0]).toBe("Date;Libellé;Montant;Payé avec;Catégories;Note;Justificatifs");
    expect(lignes[1]).toBe("2026-10-03;Pharmacie du Centre;24,40;CB Marie;Santé;Ordonnance du Dr Lefèvre;2026-10-03_Pharmacie du Centre_24,40.png");
    expect(lignes[4]).toBe("2026-10-15;Avoir;-5,99;CB Marie;;;");
  });

  test("bilan annuel : chiffres et PDF", async () => {
    const b = await ok("bilanAnnuel", 2026);
    expect(b).toMatchObject({ annee: 2026, nbDepenses: 4, total: 2440 + 5490 + 2500 - 599, sansJustificatif: 1, totalVire: 10000 });
    expect(b.ecartCumule).toBe(10000 - (2440 + 5490 + 2500 - 599));
    expect(b.parMoyen).toEqual([{ libelle: "CB Marie", type: "Carte bancaire", nb: 4, total: 9831 }]);
    expect(b.parMois[9]).toBe(9831);
    expect(await ok("anneesDisponibles")).toEqual([2026]);
    const r = await s.requete("/api/exports/bilan/2026", { cookie });
    expect(r.status).toBe(200);
    expect((await PDFDocument.load(new Uint8Array(await r.arrayBuffer()))).getPageCount()).toBeGreaterThanOrEqual(1);
  });

  test("droits : lecture télécharge, sans session non ; remboursement inconnu : 404", async () => {
    const lecteur = await s.compte("lecteur-exports@famille.fr", "lecture");
    expect((await s.requete(`/api/exports/remboursements/${remb}/dossier`, { cookie: lecteur.cookie })).status).toBe(200);
    expect((await s.requete(`/api/exports/remboursements/${remb}/dossier`)).status).toBe(401);
    expect((await s.requete(`/api/exports/remboursements/${crypto.randomUUID()}/justificatifs`, { cookie })).status).toBe(404);
  });

  test("modifications après la validation : la retouche de l'admin, même dans la même seconde", async () => {
    const modifs = await modificationsUlterieures(remb, [d1, d2, d3, d4]);
    expect(modifs).toHaveLength(1);
    expect(modifs[0]).toMatchObject({ fonction: "majDepense", utilisateur: SUPER.email });
    expect(modifs[0].changements.replace(/\s/gu, " ")).toBe("montant : 23,40 € -> 24,40 €");
  });

  test("orientation EXIF d'un JPEG", () => {
    const exif = (valeur: number) =>
      new Uint8Array([
        0xff, 0xd8, 0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
        // TIFF gros-boutiste, premier IFD à l'octet 8
        0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
        // 1 entrée : 0x0112 (orientation), type SHORT, 1 valeur
        0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, valeur, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0xff, 0xd9,
      ]);
    expect(orientationJpeg(exif(6))).toBe(6);
    expect(orientationJpeg(exif(3))).toBe(3);
    expect(orientationJpeg(jpegAbime)).toBe(1);
    expect(orientationJpeg(png)).toBe(1);
  });
});
