import { Badge, Box, Button, Card, Group, Select, SegmentedControl, Stack, Table, Text, TextInput, Title, UnstyledButton } from "@mantine/core";
import { MonthPickerInput } from "@mantine/dates";
import { IconPaperclip, IconPlus, IconSearch } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listeDepenses, type Statut } from "../data/depenses";
import { listeCategories, listeMoyensPaiement } from "../data/parametres";
import { dateLisible } from "../lib/dates";
import { useEcran } from "../lib/ecran";
import { euros } from "../lib/montants";
import { useNouvelleDepense } from "../lib/saisie";
import { peutEcrire } from "../lib/session";
import { depensesRoute } from "../router";

type Ligne = Awaited<ReturnType<typeof listeDepenses>>[number];

const STATUTS: { value: Statut; label: string }[] = [
  { value: "a_rembourser", label: "À rembourser" },
  { value: "remboursees", label: "Remboursées" },
  { value: "sans_justificatif", label: "Sans justificatif" },
  { value: "toutes", label: "Toutes" },
];

/** « 2026-10 » → premier et dernier jour du mois. */
function bornesMois(mois?: string) {
  if (!mois) return {};
  const [a, m] = mois.split("-").map(Number);
  const fin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  return { debut: `${mois}-01`, fin };
}

function Categories({ d }: { d: Ligne }) {
  return (
    <Group gap={4} wrap="wrap">
      {d.categories.map((c) => (
        <Badge key={c.id} color={c.couleur} variant="light" size="sm" tt="none">
          {c.nom}
        </Badge>
      ))}
    </Group>
  );
}

function SansJustificatif() {
  return (
    <Badge color="orange" variant="light" size="sm" tt="none">
      Sans justificatif
    </Badge>
  );
}

/** Téléphone : une carte par dépense. */
function Cartes({ depenses, ouvrir }: { depenses: Ligne[]; ouvrir: (id: string) => void }) {
  return (
    <Stack gap={0}>
      {depenses.map((d) => (
        <UnstyledButton key={d.id} onClick={() => ouvrir(d.id)} px={4} w="100%" style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
          <Group wrap="nowrap" gap="sm" py="sm">
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text fw={500} truncate>
                {d.libelle}
              </Text>
              <Text size="xs" c="dimmed">
                {dateLisible(d.date, { day: "numeric", month: "short" })} · {d.moyenLibelle}
              </Text>
            </Box>
            {d.nbJustificatifs === 0 && <Box w={8} h={8} bg="orange" style={{ borderRadius: 4 }} aria-label="Sans justificatif" />}
            <Text fw={600}>{euros(d.montant)}</Text>
          </Group>
        </UnstyledButton>
      ))}
    </Stack>
  );
}

/** Ordinateur : tableau. */
function Tableau({ depenses, ouvrir }: { depenses: Ligne[]; ouvrir: (id: string) => void }) {
  return (
    <Table highlightOnHover verticalSpacing="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th w={110}>Date</Table.Th>
          <Table.Th>Libellé</Table.Th>
          <Table.Th>Catégories</Table.Th>
          <Table.Th>Paiement</Table.Th>
          <Table.Th w={150}>Justificatifs</Table.Th>
          <Table.Th ta="right">Montant</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {depenses.map((d) => (
          <Table.Tr key={d.id} className="ligne-cliquable" onClick={() => ouvrir(d.id)}>
            <Table.Td c="dimmed">{dateLisible(d.date, { day: "2-digit", month: "2-digit", year: "numeric" })}</Table.Td>
            <Table.Td fw={500}>
              {d.libelle}
              {d.remboursementId && (
                <Badge ml="xs" size="xs" variant="light" color="gray" tt="none">
                  remboursée
                </Badge>
              )}
            </Table.Td>
            <Table.Td>
              <Categories d={d} />
            </Table.Td>
            <Table.Td>{d.moyenLibelle}</Table.Td>
            <Table.Td>
              {d.nbJustificatifs === 0 ? (
                <SansJustificatif />
              ) : (
                <Group gap={4} c="dimmed">
                  <IconPaperclip size={14} />
                  <Text size="sm">{d.nbJustificatifs}</Text>
                </Group>
              )}
            </Table.Td>
            <Table.Td ta="right" fw={600} style={{ whiteSpace: "nowrap" }}>
              {euros(d.montant)}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/** Dépenses : filtres (gardés dans l'adresse), total, liste ; un clic ouvre la fiche. */
export function Depenses() {
  const { telephone } = useEcran();
  const recherche = depensesRoute.useSearch();
  const naviguer = useNavigate({ from: "/depenses" });
  const nouvelle = useNouvelleDepense();
  const statut = recherche.statut ?? "a_rembourser";
  const filtre = { ...bornesMois(recherche.mois), statut, categorieId: recherche.categorie, moyenId: recherche.moyen, recherche: recherche.q };
  const { data: depenses = [], isLoading } = useQuery({ queryKey: ["depenses", filtre], queryFn: () => listeDepenses(filtre) });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: () => listeCategories() });
  const { data: moyens = [] } = useQuery({ queryKey: ["moyens"], queryFn: () => listeMoyensPaiement() });
  const changer = (patch: Partial<typeof recherche>) => naviguer({ search: (s) => ({ ...s, ...patch }), replace: true });
  const ouvrir = (id: string) => naviguer({ to: "/depenses/$id", params: { id } });
  const total = depenses.reduce((t, d) => t + d.montant, 0);

  return (
    <Stack p={telephone ? "md" : "xl"} gap="md" maw={1300}>
      <Group justify="space-between">
        <Title order={2}>Dépenses</Title>
        {peutEcrire() && !telephone && (
          <Button leftSection={<IconPlus size={16} />} onClick={nouvelle}>
            Nouvelle dépense
          </Button>
        )}
      </Group>

      {telephone ? (
        <Select data={STATUTS} value={statut} onChange={(s) => s && changer({ statut: s as Statut })} allowDeselect={false} aria-label="Statut" />
      ) : (
        <Group gap="sm">
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder="Libellé, note…"
            aria-label="Rechercher"
            defaultValue={recherche.q}
            onChange={(e) => changer({ q: e.currentTarget.value || undefined })}
            w={220}
          />
          <MonthPickerInput
            placeholder="Toutes les périodes"
            aria-label="Mois"
            value={recherche.mois ? `${recherche.mois}-01` : null}
            onChange={(m) => changer({ mois: m ? String(m).slice(0, 7) : undefined })}
            clearable
            valueFormat="MMMM YYYY"
            w={190}
          />
          <Select
            placeholder="Toutes catégories"
            aria-label="Catégorie"
            data={categories.map((c) => ({ value: c.id, label: c.nom }))}
            value={recherche.categorie ?? null}
            onChange={(c) => changer({ categorie: c ?? undefined })}
            clearable
            searchable
            w={190}
          />
          <Select
            placeholder="Tous moyens"
            aria-label="Moyen de paiement"
            data={moyens.map((m) => ({ value: m.id, label: m.libelle }))}
            value={recherche.moyen ?? null}
            onChange={(m) => changer({ moyen: m ?? undefined })}
            clearable
            w={170}
          />
          <SegmentedControl data={STATUTS} value={statut} onChange={(s) => changer({ statut: s as Statut })} />
        </Group>
      )}

      <Card withBorder padding={telephone ? "xs" : 0}>
        {depenses.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {isLoading ? "Chargement…" : "Aucune dépense ici."}
          </Text>
        ) : telephone ? (
          <Cartes depenses={depenses} ouvrir={ouvrir} />
        ) : (
          <Tableau depenses={depenses} ouvrir={ouvrir} />
        )}
        {depenses.length > 0 && (
          <Group justify="space-between" px={telephone ? 4 : "md"} py="sm" style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
            <Text fw={600}>
              {depenses.length} dépense{depenses.length > 1 ? "s" : ""}
            </Text>
            <Text fw={700}>{euros(total)}</Text>
          </Group>
        )}
      </Card>
    </Stack>
  );
}
