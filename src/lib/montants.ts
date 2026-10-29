/** Montants : entiers en centimes, partout (base, fonctions, navigateur) ; jamais de flottants. */

/** « 348,25 € », « −15,99 € ». */
export const euros = (centimes: number | null | undefined) =>
  centimes == null ? "" : (centimes / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

/** Saisie « 23,40 », « 23.4 », « -15,99 », « 1 250 » → centimes ; null si illisible. */
export function lireMontant(saisie: string): number | null {
  const s = saisie.replace(/[\s  €]/g, "").replace("−", "-").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
