/*
 * Petite mise en page de PDF (pdf-lib) : pages A4, titres, paragraphes, tableaux paginés, pied de page,
 * photos (orientation EXIF respectée) et PDF annexés. Polices standard (Helvetica) : le texte est ramené à WinAnsi.
 */
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

const A4: [number, number] = [595.28, 841.89];
const MARGE = 50;
const ENCRE = rgb(0.17, 0.14, 0.13);
const GRIS = rgb(0.42, 0.37, 0.34);
const FILET = rgb(0.85, 0.81, 0.77);
const PRUNE = rgb(0.48, 0.23, 0.37);

export type Colonne = { titre: string; largeur: number; droite?: boolean };

export class Redacteur {
  private constructor(
    readonly doc: PDFDocument,
    private police: PDFFont,
    private gras: PDFFont,
    private titreDocument: string,
  ) {}
  /** Page en cours ; créée au premier tracé (jamais de page blanche entre deux annexes). */
  private courante: PDFPage | null = null;
  private y = 0;
  /** Glyphes absents de WinAnsi (remplacés par « ? »). */
  private absents = new Map<string, boolean>();

  static async creer(titreDocument: string) {
    const doc = await PDFDocument.create();
    doc.setTitle(titreDocument);
    doc.setCreator("Cura Parentum");
    doc.setProducer("Cura Parentum");
    return new Redacteur(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold), titreDocument);
  }

  /** Texte compatible WinAnsi : espaces insécables fines, signe moins, flèches… */
  propre(t: string) {
    const s = t.replace(/[   ]/g, " ").replace(/−/g, "-").replace(/→/g, "->").replace(/[‘’]/g, "'");
    let r = "";
    for (const c of s) {
      if (!this.absents.has(c)) {
        try {
          this.police.widthOfTextAtSize(c, 10);
          this.absents.set(c, false);
        } catch {
          this.absents.set(c, true);
        }
      }
      r += this.absents.get(c) ? "?" : c;
    }
    return r;
  }

  private largeur = (t: string, taille: number, gras = false) => (gras ? this.gras : this.police).widthOfTextAtSize(t, taille);

  /** Coupe le texte à la largeur (avec « … »). */
  private tronquer(t: string, largeur: number, taille: number, gras = false) {
    let s = this.propre(t);
    if (this.largeur(s, taille, gras) <= largeur) return s;
    while (s.length > 1 && this.largeur(`${s}…`, taille, gras) > largeur) s = s.slice(0, -1);
    return `${s}…`;
  }

  /** Découpe un paragraphe en lignes de la largeur donnée. */
  private lignes(t: string, largeur: number, taille: number) {
    const sortie: string[] = [];
    for (const para of this.propre(t).split("\n")) {
      let ligne = "";
      for (const mot of para.split(/\s+/)) {
        const essai = ligne ? `${ligne} ${mot}` : mot;
        if (this.largeur(essai, taille) > largeur && ligne) {
          sortie.push(ligne);
          ligne = mot;
        } else ligne = essai;
      }
      sortie.push(ligne);
    }
    return sortie;
  }

  get largeurUtile() {
    return A4[0] - 2 * MARGE;
  }

  /** La page où écrire : la courante, ou une nouvelle. */
  private get page(): PDFPage {
    if (!this.courante) {
      this.courante = this.doc.addPage(A4);
      this.y = A4[1] - MARGE;
    }
    return this.courante;
  }

  /** La suite s'écrira sur une nouvelle page (créée au premier tracé). */
  nouvellePage() {
    this.courante = null;
  }

  /** Change de page s'il reste moins de `hauteur` points. */
  place(hauteur: number) {
    if (!this.courante || this.y - hauteur < MARGE + 20) {
      this.nouvellePage();
      void this.page;
    }
  }

  espace(h = 10) {
    this.y -= h;
  }

  titre(t: string, taille = 18) {
    this.place(taille + 12);
    this.page.drawText(this.propre(t), { x: MARGE, y: this.y - taille, size: taille, font: this.gras, color: ENCRE });
    this.y -= taille + 10;
  }

  sousTitre(t: string) {
    this.place(30);
    this.y -= 6;
    this.page.drawText(this.propre(t), { x: MARGE, y: this.y - 12, size: 12, font: this.gras, color: PRUNE });
    this.y -= 18;
  }

  texte(t: string, { taille = 10, gris = false, gras = false }: { taille?: number; gris?: boolean; gras?: boolean } = {}) {
    for (const l of this.lignes(t, this.largeurUtile, taille)) {
      this.place(taille + 4);
      this.page.drawText(l, { x: MARGE, y: this.y - taille, size: taille, font: gras ? this.gras : this.police, color: gris ? GRIS : ENCRE });
      this.y -= taille + 4;
    }
  }

  /** Paires libellé / valeur, sur deux colonnes. */
  champs(paires: [string, string][]) {
    for (const [l, v] of paires) {
      this.place(15);
      this.page.drawText(this.propre(l), { x: MARGE, y: this.y - 10, size: 10, font: this.police, color: GRIS });
      this.page.drawText(this.tronquer(v, this.largeurUtile - 150, 10, true), { x: MARGE + 150, y: this.y - 10, size: 10, font: this.gras, color: ENCRE });
      this.y -= 15;
    }
  }

  /** Tableau : en-tête répété à chaque page, cellules tronquées ; `total` : dernière ligne en gras. */
  tableau(colonnes: Colonne[], lignes: string[][], total?: string[]) {
    const taille = 9;
    const hauteur = 15;
    const xs: number[] = [];
    let x = MARGE;
    for (const c of colonnes) {
      xs.push(x);
      x += c.largeur;
    }
    const ecrire = (cellules: string[], gras: boolean, couleur = ENCRE) => {
      cellules.forEach((cell, i) => {
        const c = colonnes[i];
        const t = this.tronquer(cell, c.largeur - 6, taille, gras);
        const dx = c.droite ? c.largeur - 4 - this.largeur(t, taille, gras) : 2;
        this.page.drawText(t, { x: xs[i] + dx, y: this.y - 11, size: taille, font: gras ? this.gras : this.police, color: couleur });
      });
      this.y -= hauteur;
    };
    const filet = () => this.page.drawLine({ start: { x: MARGE, y: this.y }, end: { x: MARGE + this.largeurUtile, y: this.y }, thickness: 0.5, color: FILET });
    const entete = () => {
      ecrire(
        colonnes.map((c) => c.titre),
        true,
        GRIS,
      );
      filet();
    };
    this.place(hauteur * 3);
    entete();
    for (const l of lignes) {
      if (this.y - hauteur < MARGE + 20) {
        this.nouvellePage();
        entete();
      }
      ecrire(l, false);
    }
    if (total) {
      this.place(hauteur + 2);
      filet();
      ecrire(total, true);
    }
    this.y -= 6;
  }

  /** Page d'annexe : une image (JPEG ou PNG), avec son en-tête, tournée selon son orientation EXIF. */
  async imageAnnexe(entete: string, octets: Uint8Array, mime: string) {
    // L'image d'abord : illisible, elle échoue avant d'avoir commencé une page.
    const img = mime === "image/png" ? await this.doc.embedPng(octets) : await this.doc.embedJpg(octets);
    this.nouvellePage();
    this.texte(entete, { gras: true });
    this.espace(6);
    const orientation = mime === "image/jpeg" ? orientationJpeg(octets) : 1;
    const tournee = orientation === 6 || orientation === 8;
    // Taille affichée (après rotation), réduite pour tenir dans la place restante.
    const [lw, lh] = tournee ? [img.height, img.width] : [img.width, img.height];
    const echelle = Math.min(this.largeurUtile / lw, (this.y - MARGE) / lh, 1);
    const [w, h] = [img.width * echelle, img.height * echelle];
    const [aw, ah] = [lw * echelle, lh * echelle];
    const bas = this.y - ah;
    const gauche = MARGE + (this.largeurUtile - aw) / 2;
    if (orientation === 6) this.page.drawImage(img, { x: gauche, y: bas + ah, width: w, height: h, rotate: degrees(-90) });
    else if (orientation === 8) this.page.drawImage(img, { x: gauche + aw, y: bas, width: w, height: h, rotate: degrees(90) });
    else if (orientation === 3) this.page.drawImage(img, { x: gauche + aw, y: bas + ah, width: w, height: h, rotate: degrees(180) });
    else this.page.drawImage(img, { x: gauche, y: bas, width: w, height: h });
    this.y = bas - 10;
  }

  /** Annexe PDF : ses pages recopiées telles quelles, l'en-tête écrit en haut de la première. */
  async pdfAnnexe(entete: string, octets: Uint8Array) {
    const source = await PDFDocument.load(octets, { ignoreEncryption: true });
    const pages = await this.doc.copyPages(source, source.getPageIndices());
    pages.forEach((p, i) => {
      this.doc.addPage(p);
      const { height } = p.getSize();
      const t = this.tronquer(i === 0 ? entete : `${entete} (suite, page ${i + 1})`, p.getSize().width - 40, 8, true);
      p.drawRectangle({ x: 14, y: height - 22, width: this.largeur(t, 8, true) + 12, height: 14, color: rgb(1, 1, 1), opacity: 0.85 });
      p.drawText(t, { x: 20, y: height - 18, size: 8, font: this.gras, color: PRUNE });
    });
    // La suite reprend sur une page neuve.
    this.courante = null;
  }

  /** Annexe impossible à intégrer (format, fichier illisible) : une page qui le dit. */
  annexeAbsente(entete: string, raison: string) {
    this.nouvellePage();
    this.texte(entete, { gras: true });
    this.texte(raison, { gris: true });
  }

  /** Pied de page sur toutes les pages, puis les octets. */
  async terminer() {
    const toutes = this.doc.getPages();
    const pied = this.propre(`Cura Parentum · ${this.titreDocument}`);
    toutes.forEach((p, i) => {
      const n = `${i + 1} / ${toutes.length}`;
      p.drawText(pied, { x: 30, y: 18, size: 7, font: this.police, color: GRIS });
      p.drawText(n, { x: p.getSize().width - 30 - this.largeur(n, 7), y: 18, size: 7, font: this.police, color: GRIS });
    });
    return this.doc.save();
  }
}

/** Orientation EXIF d'un JPEG (1 = droite ; 3, 6, 8 = tourné), 1 si absente ou illisible. */
export function orientationJpeg(o: Uint8Array): number {
  if (o[0] !== 0xff || o[1] !== 0xd8) return 1;
  let i = 2;
  while (i + 4 < o.length) {
    if (o[i] !== 0xff) return 1;
    const marqueur = o[i + 1];
    const longueur = (o[i + 2] << 8) | o[i + 3];
    if (marqueur === 0xe1 && o[i + 4] === 0x45 && o[i + 5] === 0x78 && o[i + 6] === 0x69 && o[i + 7] === 0x66) {
      const tiff = i + 10;
      const le = o[tiff] === 0x49;
      const u16 = (p: number) => (le ? o[p] | (o[p + 1] << 8) : (o[p] << 8) | o[p + 1]);
      const u32 = (p: number) => (le ? (o[p] | (o[p + 1] << 8) | (o[p + 2] << 16)) + o[p + 3] * 0x1000000 : o[p] * 0x1000000 + ((o[p + 1] << 16) | (o[p + 2] << 8) | o[p + 3]));
      const ifd = tiff + u32(tiff + 4);
      const n = u16(ifd);
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        if (e + 12 > o.length) return 1;
        if (u16(e) === 0x0112) return u16(e + 8) || 1;
      }
      return 1;
    }
    if (marqueur === 0xda) return 1;
    i += 2 + longueur;
  }
  return 1;
}
