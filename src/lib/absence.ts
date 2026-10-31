/** Motifs d'un justificatif déclaré absent. */
export type MotifAbsence = "perdu" | "pas_de_ticket" | "autre";

export const MOTIFS_ABSENCE: { value: MotifAbsence; label: string }[] = [
  { value: "perdu", label: "Perdu" },
  { value: "pas_de_ticket", label: "Pas de ticket" },
  { value: "autre", label: "Autre" },
];

export type Absence = { motif: MotifAbsence; detail?: string | null };

/** « Perdu », « Autre : ticket illisible »… */
export function libelleAbsence(motif: MotifAbsence | null | undefined, detail?: string | null) {
  const l = MOTIFS_ABSENCE.find((m) => m.value === motif)?.label;
  if (!l) return null;
  return detail?.trim() ? `${l} : ${detail.trim()}` : l;
}
