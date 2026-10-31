import { Box, Button, Card, Group, Select, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { anneesDisponibles, bilanAnnuel } from "../data/bilan";
import { dateLisible } from "../lib/dates";
import { euros } from "../lib/montants";
import { bilanRoute } from "../router";

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const signe = (c: number) => (c === 0 ? "—" : `${c > 0 ? "+" : ""}${euros(c)}`);

function Chiffre({ label, valeur, detail }: { label: string; valeur: string; detail?: string }) {
  return (
    <Card withBorder padding="md">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fz={24} fw={700}>
        {valeur}
      </Text>
      {detail && (
        <Text size="xs" c="dimmed">
          {detail}
        </Text>
      )}
    </Card>
  );
}

/** Tableau à deux colonnes : libellé, montant ; barre discrète proportionnelle derrière le montant. */
function Repartition({ titre, lignes, note }: { titre: string; lignes: { libelle: string; detail?: string; total: number }[]; note?: string }) {
  const max = Math.max(1, ...lignes.map((l) => l.total));
  return (
    <Card withBorder>
      <Title order={4} mb="xs">
        {titre}
      </Title>
      {lignes.length === 0 ? (
        <Text size="sm" c="dimmed">
          Rien sur l'année.
        </Text>
      ) : (
        <Table verticalSpacing={4}>
          <Table.Tbody>
            {lignes.map((l) => (
              <Table.Tr key={l.libelle}>
                <Table.Td>
                  {l.libelle}
                  {l.detail && (
                    <Text span size="xs" c="dimmed">
                      {" "}
                      · {l.detail}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td w="40%">
                  <Box h={8} bg="prune.6" style={{ width: `${(Math.max(0, l.total) / max) * 100}%`, borderRadius: 4 }} />
                </Table.Td>
                <Table.Td ta="right" fw={600} w={110}>
                  {euros(l.total)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {note && (
        <Text size="xs" c="dimmed" mt="xs">
          {note}
        </Text>
      )}
    </Card>
  );
}

/** Bilan d'une année, à l'écran et en PDF : pour rendre des comptes. */
export function Bilan() {
  const naviguer = useNavigate({ from: "/bilan" });
  const { annee: demandee } = bilanRoute.useSearch();
  const { data: annees = [] } = useQuery({ queryKey: ["anneesDisponibles"], queryFn: () => anneesDisponibles() });
  const annee = demandee ?? annees[0] ?? new Date().getFullYear();
  const { data: b } = useQuery({ queryKey: ["bilan", annee], queryFn: () => bilanAnnuel(annee) });
  const choix = [...new Set([annee, ...annees])].sort((x, y) => y - x).map(String);

  return (
    <Stack p="xl" gap="lg" maw={1200}>
      <Group justify="space-between">
        <Group>
          <Title order={2}>Bilan annuel</Title>
          <Select data={choix} value={String(annee)} onChange={(a) => a && naviguer({ search: { annee: Number(a) } })} allowDeselect={false} w={110} aria-label="Année" />
        </Group>
        <Button component="a" href={`/api/exports/bilan/${annee}`} download leftSection={<IconDownload size={16} />}>
          Télécharger le PDF
        </Button>
      </Group>

      {b && (
        <>
          <SimpleGrid cols={{ base: 2, lg: 4 }}>
            <Chiffre label={`Dépensé en ${b.annee}`} valeur={euros(b.total)} detail={`${b.nbDepenses} dépense${b.nbDepenses > 1 ? "s" : ""}`} />
            <Chiffre
              label="Sans justificatif"
              valeur={String(b.sansJustificatif)}
              detail={b.absents ? `et ${b.absents} déclaré${b.absents > 1 ? "s" : ""} absent${b.absents > 1 ? "s" : ""}` : undefined}
            />
            <Chiffre label="Remboursé" valeur={euros(b.totalVire)} detail={`${b.remboursements.length} virement${b.remboursements.length > 1 ? "s" : ""}`} />
            <Chiffre label="Écart cumulé" valeur={signe(b.ecartCumule)} detail={b.ecartCumule > 0 ? "trop-perçu" : b.ecartCumule < 0 ? "manque" : undefined} />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" style={{ alignItems: "start" }}>
            <Repartition titre="Par mois" lignes={b.parMois.map((t, i) => ({ libelle: MOIS[i], total: t }))} />
            <Stack gap="lg">
              <Repartition
                titre="Par catégorie"
                lignes={b.parCategorie.map((c) => ({ libelle: c.nom, total: c.total }))}
                note="Une dépense à plusieurs catégories compte dans chacune."
              />
              <Repartition titre="Par moyen de paiement" lignes={b.parMoyen.map((m) => ({ libelle: m.libelle, detail: `${m.type}, ${m.nb} dépense${m.nb > 1 ? "s" : ""}`, total: m.total }))} />
            </Stack>
          </SimpleGrid>

          <Card withBorder padding={0}>
            <Title order={4} p="md" pb="xs">
              Remboursements de l'année
            </Title>
            <Table verticalSpacing="xs" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Virement</Table.Th>
                  <Table.Th>Plage</Table.Th>
                  <Table.Th ta="right">Dépenses</Table.Th>
                  <Table.Th ta="right">Total</Table.Th>
                  <Table.Th ta="right">Viré</Table.Th>
                  <Table.Th ta="right">Écart</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {b.remboursements.map((r) => (
                  <Table.Tr key={r.id} className="ligne-cliquable" onClick={() => naviguer({ to: "/remboursements/$id", params: { id: r.id } })}>
                    <Table.Td>{dateLisible(r.dateVirement)}</Table.Td>
                    <Table.Td c="dimmed">
                      {dateLisible(r.debut, { day: "numeric", month: "short" })} → {dateLisible(r.fin, { day: "numeric", month: "short" })}
                    </Table.Td>
                    <Table.Td ta="right">{r.nbDepenses}</Table.Td>
                    <Table.Td ta="right">{euros(r.total)}</Table.Td>
                    <Table.Td ta="right" fw={600}>
                      {euros(r.montantVire)}
                    </Table.Td>
                    <Table.Td ta="right" c={r.ecart ? "orange.8" : "dimmed"}>
                      {signe(r.ecart)}
                    </Table.Td>
                  </Table.Tr>
                ))}
                {b.remboursements.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={6} c="dimmed" ta="center">
                      Aucun remboursement cette année.
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Card>
        </>
      )}
    </Stack>
  );
}
