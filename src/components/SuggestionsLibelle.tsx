import { Button, Group, Text } from "@mantine/core";
import type { libellesFrequents } from "../data/depenses";

export type Libelle = Awaited<ReturnType<typeof libellesFrequents>>[number];

/** Minuscules, sans accents ni espaces autour : « Épicerie » se trouve en tapant « epi ». */
export const normaliser = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .trim();

/**
 * Les 5 libellés à proposer : sans saisie, les plus fréquents ; sinon ceux qui contiennent le texte tapé,
 * ceux qui commencent par lui d'abord. Le libellé déjà tapé en entier n'est plus proposé.
 */
export function proposer(libelles: Libelle[], saisie: string) {
  const q = normaliser(saisie);
  return libelles
    .map((l) => ({ l, n: normaliser(l.libelle) }))
    .filter(({ n }) => n !== q && n.includes(q))
    .sort((a, b) => Number(b.n.startsWith(q)) - Number(a.n.startsWith(q)) || b.l.nb - a.l.nb)
    .slice(0, 5)
    .map(({ l }) => l);
}

/** Pastilles sous le champ libellé : un toucher remplit le libellé (et ses catégories habituelles). */
export function SuggestionsLibelle({ libelles, saisie, choisir }: { libelles: Libelle[]; saisie: string; choisir: (l: Libelle) => void }) {
  const propositions = proposer(libelles, saisie);
  if (!propositions.length) return null;
  return (
    <Group gap={6} mt={-8} wrap="wrap" aria-label="Libellés déjà utilisés">
      {!saisie.trim() && (
        <Text size="xs" c="dimmed">
          Fréquents :
        </Text>
      )}
      {propositions.map((l) => (
        <Button
          key={l.libelle}
          size="compact-sm"
          radius="xl"
          variant="default"
          fw={400}
          // Garde le focus (et le clavier du téléphone) dans le champ.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => choisir(l)}
        >
          {l.libelle}
        </Button>
      ))}
    </Group>
  );
}
