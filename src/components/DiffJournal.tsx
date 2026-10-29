import { Code, Group, Stack, Text } from "@mantine/core";
import { euros } from "../lib/montants";

/** Colonnes techniques, jamais montrées dans un écart. */
const IGNOREES = new Set(["table", "id", "cree_le", "cree_par", "modifie_par", "modifie_le", "moyen_id", "type_id", "remboursement_id", "depense_id"]);

const LIBELLES: Record<string, string> = {
  date: "Date",
  libelle: "Libellé",
  montant: "Montant",
  moyen: "Payé avec",
  note: "Note",
  categories: "Catégories",
  justificatifs: "Justificatifs",
  depenses: "Dépenses",
  nom: "Nom",
  archive: "Retiré",
  archivee: "Archivée",
  couleur: "Couleur",
  fichier: "Fichier",
  mime: "Type",
  taille: "Taille",
  date_virement: "Date du virement",
  debut: "Début",
  fin: "Fin",
  montant_vire: "Montant viré",
  ordre: "Ordre",
};

type Fiche = Record<string, unknown>;

function lisible(cle: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if ((cle === "montant" || cle === "montant_vire") && typeof v === "number") return euros(v);
  if (cle === "archive" || cle === "archivee") return v ? "oui" : "non";
  if (cle === "categories" && Array.isArray(v)) return v.join(", ") || "—";
  if (cle === "justificatifs" && Array.isArray(v)) {
    const actifs = (v as { nom: string; archive: number }[]).filter((j) => !j.archive);
    return actifs.map((j) => j.nom).join(", ") || "aucun";
  }
  if (cle === "depenses" && Array.isArray(v)) {
    const total = (v as { montant: number }[]).reduce((t, d) => t + d.montant, 0);
    return `${v.length} dépense${v.length > 1 ? "s" : ""} (${euros(total)})`;
  }
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

const lire = (json: string | null): Fiche | null => (json ? (JSON.parse(json) as Fiche) : null);

/**
 * Ce qu'une écriture a changé : création (la fiche), suppression (ce qu'elle était), sinon les seuls champs modifiés,
 * ancienne valeur → nouvelle.
 */
export function DiffJournal({ avant: a, apres: b }: { avant: string | null; apres: string | null }) {
  const avant = lire(a);
  const apres = lire(b);
  if (!avant && !apres) return null;
  const cles = [...new Set([...Object.keys(avant ?? {}), ...Object.keys(apres ?? {})])].filter((k) => !IGNOREES.has(k));
  const lignes = cles
    .map((k) => ({ k, av: lisible(k, avant?.[k]), ap: lisible(k, apres?.[k]) }))
    .filter((l) => !avant || !apres || l.av !== l.ap)
    .filter((l) => (avant && apres) || (avant ? l.av : l.ap) !== "—");
  if (lignes.length === 0)
    return (
      <Text size="xs" c="dimmed">
        Aucun champ changé.
      </Text>
    );
  return (
    <Stack gap={2}>
      {lignes.map(({ k, av, ap }) => (
        <Group key={k} gap={6} wrap="nowrap" align="baseline">
          <Text size="xs" c="dimmed" w={110} style={{ flexShrink: 0 }}>
            {LIBELLES[k] ?? k}
          </Text>
          {avant && apres ? (
            <Text size="xs">
              <Code fz="xs" c="red.8" bg="red.0" style={{ textDecoration: "line-through" }}>
                {av}
              </Code>{" "}
              →{" "}
              <Code fz="xs" c="green.9" bg="green.0">
                {ap}
              </Code>
            </Text>
          ) : (
            <Text size="xs" td={apres ? undefined : "line-through"}>
              {apres ? ap : av}
            </Text>
          )}
        </Group>
      ))}
    </Stack>
  );
}
