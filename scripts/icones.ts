/*
 * Génère les icônes PNG à partir du dessin de public/icone.svg : bun scripts/icones.ts
 * (à relancer si le dessin change ; les PNG sont versionnés).
 *  - icone-192/512 : l'icône telle quelle (Android, installation) ;
 *  - icone-maskable-512 : fond plein, dessin réduit dans la zone sûre (Android la découpe en cercle, goutte…) ;
 *  - apple-touch-icon : fond plein, iOS arrondit lui-même les coins.
 */
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PUBLIC = join(import.meta.dir, "..", "public");
const svg = readFileSync(join(PUBLIC, "icone.svg"), "utf8");
const fond = svg.match(/<rect[^>]*fill="([^"]+)"/)![1];
const motif = svg.replace(/^[\s\S]*?<rect[^>]*\/>/, "").replace(/<\/svg>\s*$/, "");

const dessin = (contenu: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${contenu}</svg>`;
const reduite = (echelle: number) => `<g transform="translate(32 32) scale(${echelle}) translate(-32 -31.5)">${motif}</g>`;

const icones: [string, string, number][] = [
  ["icone-192.png", svg, 192],
  ["icone-512.png", svg, 512],
  ["icone-maskable-512.png", dessin(`<rect width="64" height="64" fill="${fond}"/>${reduite(0.8)}`), 512],
  ["apple-touch-icon.png", dessin(`<rect width="64" height="64" fill="${fond}"/>${reduite(0.9)}`), 180],
];

for (const [nom, source, taille] of icones) {
  const png = new Resvg(source, { fitTo: { mode: "width", value: taille } }).render().asPng();
  writeFileSync(join(PUBLIC, nom), png);
  console.log(`${nom} (${taille} px, ${png.length} octets)`);
}
