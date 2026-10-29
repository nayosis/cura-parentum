import { Alert, Badge, Button, Card, Group, Stack, Table, Text, Title, UnstyledButton } from "@mantine/core";
import { IconChevronRight, IconDeviceDesktop, IconPaperclip, IconPlus } from "@tabler/icons-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { enAttente, listeRemboursements } from "../data/remboursements";
import { dateLisible } from "../lib/dates";
import { useEcran } from "../lib/ecran";
import { euros } from "../lib/montants";
import { peutEcrire } from "../lib/session";

type Ligne = Awaited<ReturnType<typeof listeRemboursements>>[number];

/** « +1,69 € », « −4,10 € », « sans écart ». */
export const ecartCourt = (ecart: number) => (ecart === 0 ? "sans écart" : `écart ${ecart > 0 ? "+" : ""}${euros(ecart)}`);

const plage = (r: Pick<Ligne, "debut" | "fin">) =>
  `${dateLisible(r.debut, { day: "numeric", month: "short" })} → ${dateLisible(r.fin, { day: "numeric", month: "short", year: "numeric" })}`;

/** Remboursements : ce qui attend, puis les virements du plus récent au plus ancien (lecture seule sur téléphone). */
export function Remboursements() {
  const { telephone } = useEcran();
  const naviguer = useNavigate();
  const { data: liste = [] } = useQuery({ queryKey: ["remboursements"], queryFn: () => listeRemboursements() });
  const { data: attente } = useQuery({ queryKey: ["enAttente"], queryFn: () => enAttente() });
  const ouvrir = (id: string) => naviguer({ to: "/remboursements/$id", params: { id } });

  return (
    <Stack p={telephone ? "md" : "xl"} gap="md" maw={1100}>
      <Group justify="space-between">
        <Title order={2}>Remboursements</Title>
        {peutEcrire() && !telephone && (
          <Button component={Link} to="/remboursements/nouveau" leftSection={<IconPlus size={16} />}>
            Nouveau remboursement
          </Button>
        )}
      </Group>

      {attente && attente.nb > 0 && (
        <Alert color="prune" variant="light" p="sm">
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">
              <b>{euros(attente.total)} en attente</b> · {attente.nb} dépense{attente.nb > 1 ? "s" : ""} non remboursée{attente.nb > 1 ? "s" : ""}
            </Text>
            <Button onClick={() => naviguer({ to: "/depenses", search: { statut: "a_rembourser" } })} variant="subtle" size="compact-sm">
              Voir
            </Button>
          </Group>
        </Alert>
      )}

      {telephone && peutEcrire() && (
        <UnstyledButton component={Link} to="/remboursements/nouveau">
          <Card withBorder padding="sm">
            <Group gap="sm" wrap="nowrap" c="dimmed">
              <IconDeviceDesktop size={20} />
              <Text size="sm" style={{ flex: 1 }}>
                Nouveau remboursement : sur ordinateur
              </Text>
              <IconChevronRight size={16} />
            </Group>
          </Card>
        </UnstyledButton>
      )}

      {liste.length === 0 ? (
        <Card withBorder>
          <Text c="dimmed" ta="center" py="lg">
            Aucun remboursement pour l'instant.
          </Text>
        </Card>
      ) : telephone ? (
        <Stack gap="xs">
          {liste.map((r) => (
            <UnstyledButton key={r.id} onClick={() => ouvrir(r.id)}>
              <Card withBorder padding="sm">
                <Group justify="space-between" wrap="nowrap">
                  <Text fw={600}>{dateLisible(r.dateVirement)}</Text>
                  <Text fw={700}>{euros(r.montantVire)}</Text>
                </Group>
                <Group justify="space-between" wrap="nowrap">
                  <Text size="xs" c="dimmed">
                    {plage(r)} · {r.nbDepenses} dépense{r.nbDepenses > 1 ? "s" : ""}
                  </Text>
                  <Text size="xs" c={r.ecart ? "orange.8" : "dimmed"}>
                    {ecartCourt(r.ecart)}
                  </Text>
                </Group>
              </Card>
            </UnstyledButton>
          ))}
        </Stack>
      ) : (
        <Card withBorder padding={0}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Virement</Table.Th>
                <Table.Th>Plage</Table.Th>
                <Table.Th>Dépenses</Table.Th>
                <Table.Th ta="right">Total coché</Table.Th>
                <Table.Th ta="right">Montant viré</Table.Th>
                <Table.Th>Écart</Table.Th>
                <Table.Th w={60} aria-label="Justificatifs" />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {liste.map((r) => (
                <Table.Tr key={r.id} className="ligne-cliquable" onClick={() => ouvrir(r.id)}>
                  <Table.Td fw={600}>{dateLisible(r.dateVirement)}</Table.Td>
                  <Table.Td c="dimmed">{plage(r)}</Table.Td>
                  <Table.Td>{r.nbDepenses}</Table.Td>
                  <Table.Td ta="right">{euros(r.total)}</Table.Td>
                  <Table.Td ta="right" fw={700}>
                    {euros(r.montantVire)}
                  </Table.Td>
                  <Table.Td>
                    {r.ecart === 0 ? (
                      <Text size="sm" c="dimmed">
                        sans écart
                      </Text>
                    ) : (
                      <Badge color="orange" variant="light" tt="none">
                        {r.ecart > 0 ? "+" : ""}
                        {euros(r.ecart)}
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td c="dimmed">
                    {r.nbJustificatifs > 0 && (
                      <Group gap={2}>
                        <IconPaperclip size={14} />
                        <Text size="sm">{r.nbJustificatifs}</Text>
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}
    </Stack>
  );
}
