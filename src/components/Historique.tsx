import { Card, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { appelApi } from "../lib/rpc";
import { DiffJournal } from "./DiffJournal";

type LigneJournal = { id: number; quand: string; utilisateur: string; fonction: string; avant: string | null; apres: string | null };

const ACTIONS: Record<string, string> = {
  creerDepense: "Création",
  majDepense: "Modification",
  supprimerDepense: "Suppression",
  ajouterJustificatifs: "Justificatif ajouté",
  retirerJustificatif: "Justificatif retiré",
  renommerJustificatif: "Justificatif renommé",
  declarerAbsence: "Justificatif déclaré absent",
  renommerLibelle: "Libellé renommé",
  supprimerRemboursement: "Remboursement supprimé",
  creerRemboursement: "Remboursement validé",
  majRemboursement: "Remboursement corrigé",
};

export const quand = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

/** Historique d'une dépense ou d'un remboursement (admins : le journal leur est réservé). */
export function Historique({ id }: { id: string }) {
  const { data } = useQuery({ queryKey: ["journal", "fiche", id], queryFn: () => appelApi<{ lignes: LigneJournal[] }>(`/api/journal?cible=${id}`) });
  const lignes = data?.lignes ?? [];
  return (
    <Card withBorder>
      <Title order={4} mb="xs">
        Historique
      </Title>
      <Stack gap="sm">
        {lignes.map((l) => (
          <div key={l.id}>
            <Text size="sm">
              <b>{ACTIONS[l.fonction] ?? l.fonction}</b>{" "}
              <Text span c="dimmed" size="xs">
                {quand(l.quand)} · {l.utilisateur}
              </Text>
            </Text>
            {!l.fonction.startsWith("creer") && <DiffJournal avant={l.avant} apres={l.apres} />}
          </div>
        ))}
      </Stack>
    </Card>
  );
}
