/** Extension (choisie par le serveur à l'envoi) → type MIME servi. */
export const MIME_PAR_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/** Taille lisible : « 1,2 Mo ». */
export function tailleLisible(octets: number) {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 ** 2) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / 1024 ** 2).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}
