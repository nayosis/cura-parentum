import { Badge, Box, Button, Card, Checkbox, Group, Select, SegmentedControl, Stack, Table, Text, TextInput, Title, UnstyledButton } from "@mantine/core";
import { MonthPickerInput } from "@mantine/dates";
import { IconFileOff, IconPlus, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { EtatJustificatif, sansJustificatif } from "../components/EtatJustificatif";
import { ModalAbsence } from "../components/ModalAbsence";
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
            {sansJustificatif(d) && <Box w={8} h={8} bg="orange" style={{ borderRadius: 4 }} aria-label="Sans justificatif" />}
            <Text fw={600}>{euros(d.montant)}</Text>
          </Group>
        </UnstyledButton>
      ))}
    </Stack>
  );
}

/** Ordinateur : tableau. */
type Selection = { choisies: Set<string>; changer: (ids: string[], coche: boolean) => void };

function Tableau({ depenses, ouvrir, selection }: { depenses: Ligne[]; ouvrir: (id: string) => void; selection?: Selection }) {
  const nbChoisies = selection ? depenses.filter((d) => selection.choisies.has(d.id)).length : 0;
  return (
    <Table highlightOnHover verticalSpacing="sm">
      <Table.Thead>
        <Table.Tr>
          {selection && (
            <Table.Th w={40}>
              <Checkbox
                aria-label="Tout sélectionner"
                checked={nbChoisies === depenses.length}
                indeterminate={nbChoisies > 0 && nbChoisies < depenses.length}
                onChange={(e) => selection.changer(depenses.map((d) => d.id), e.currentTarget.checked)}
              />
            </Table.Th>
          )}
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
            {selection && (
              <Table.Td onClick={(e) => e.stopPropagation()}>
                <Checkbox aria-label={`Sélectionner ${d.libelle}`} checked={selection.choisies.has(d.id)} onChange={(e) => selection.changer([d.id], e.currentTarget.checked)} />
              </Table.Td>
            )}
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
              <EtatJustificatif d={d} />
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
  // Sur ordinateur : sélection pour déclarer des justificatifs absents en une fois (reprise d'anciennes dépenses).
  const [choisies, setChoisies] = useState<Set<string>>(new Set());
  const [absence, setAbsence] = useState<string[] | null>(null);
  const selection: Selection | undefined =
    peutEcrire() && !telephone
      ? {
          choisies,
          changer: (ids, coche) =>
            setChoisies((c) => {
              const n = new Set(c);
              for (const id of ids) {
                if (coche) n.add(id);
                else n.delete(id);
              }
              return n;
            }),
        }
      : undefined;
  const selectionnees = depenses.filter((d) => choisies.has(d.id));

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

      {selectionnees.length > 0 && (
        <Group gap="sm">
          <Text fw={500}>
            {selectionnees.length} sélectionnée{selectionnees.length > 1 ? "s" : ""}
          </Text>
          <Button variant="light" leftSection={<IconFileOff size={16} />} onClick={() => setAbsence(selectionnees.map((d) => d.id))}>
            Déclarer sans justificatif
          </Button>
          <Button variant="subtle" color="gray" onClick={() => setChoisies(new Set())}>
            Désélectionner
          </Button>
        </Group>
      )}
      <ModalAbsence ids={absence} onClose={() => setAbsence(null)} onFait={() => setChoisies(new Set())} />

      <Card withBorder padding={telephone ? "xs" : 0}>
        {depenses.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {isLoading ? "Chargement…" : "Aucune dépense ici."}
          </Text>
        ) : telephone ? (
          <Cartes depenses={depenses} ouvrir={ouvrir} />
        ) : (
          <Tableau depenses={depenses} ouvrir={ouvrir} selection={selection} />
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
