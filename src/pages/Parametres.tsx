import { useState } from "react";
import { ActionIcon, Badge, Button, Card, ColorSwatch, Group, Menu, Modal, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconArchive, IconDots, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import {
  creerCategorie, creerMoyenPaiement, creerTypePaiement, fusionnerCategories, lireFoyer, listeCategories, listeMoyensPaiement, listeTypesPaiement,
  majCategorie, majFoyer, majMoyenPaiement, majTypePaiement, supprimerCategorie, supprimerMoyenPaiement, supprimerTypePaiement,
} from "../data/parametres";
import { ecrire } from "../lib/query";
import { peutEcrire } from "../lib/session";

type Moyen = Awaited<ReturnType<typeof listeMoyensPaiement>>[number];
type TypeP = Awaited<ReturnType<typeof listeTypesPaiement>>[number];
type Cat = Awaited<ReturnType<typeof listeCategories>>[number];

/** Couleurs proposées aux catégories (couleurs Mantine). */
const COULEURS = ["gray", "red", "pink", "grape", "violet", "indigo", "blue", "cyan", "teal", "green", "lime", "yellow", "orange"];

/** Petite fenêtre à un champ (nouveau libellé, renommage). */
function demanderTexte(titre: string, label: string, initial: string, valider: (v: string) => Promise<unknown>) {
  let valeur = initial;
  modals.openConfirmModal({
    title: titre,
    children: <TextInput label={label} defaultValue={initial} onChange={(e) => (valeur = e.currentTarget.value)} data-autofocus />,
    labels: { confirm: "Enregistrer", cancel: "Annuler" },
    onConfirm: () => ecrire(() => valider(valeur)),
  });
}

function confirmerSuppression(titre: string, action: () => Promise<unknown>) {
  modals.openConfirmModal({ title: titre, labels: { confirm: "Supprimer", cancel: "Annuler" }, confirmProps: { color: "red" }, onConfirm: () => ecrire(action) });
}

function Foyer({ ecriture }: { ecriture: boolean }) {
  const { data: foyer } = useQuery({ queryKey: ["foyer"], queryFn: () => lireFoyer() });
  const [edition, setEdition] = useState<{ nom: string; compte: string } | null>(null);
  return (
    <Card withBorder>
      <Group justify="space-between" align="flex-start">
        <SimpleGrid cols={{ base: 1, sm: 2 }} style={{ flex: 1 }}>
          <div>
            <Text size="xs" c="dimmed">
              Foyer (pour qui sont les dépenses)
            </Text>
            <Text fw={600}>{foyer?.nom || "—"}</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">
              Compte débité par les remboursements
            </Text>
            <Text fw={600}>{foyer?.compte || "—"}</Text>
          </div>
        </SimpleGrid>
        {ecriture && foyer && (
          <Button variant="default" size="xs" onClick={() => setEdition({ ...foyer })}>
            Modifier
          </Button>
        )}
      </Group>
      <Modal opened={!!edition} onClose={() => setEdition(null)} title="Foyer">
        {edition && (
          <Stack>
            <TextInput label="Pour qui" placeholder="Jeanne & Robert" value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.currentTarget.value })} data-autofocus />
            <TextInput
              label="Compte débité"
              placeholder="Compte joint des parents, banque…"
              value={edition.compte}
              onChange={(e) => setEdition({ ...edition, compte: e.currentTarget.value })}
            />
            <Button onClick={async () => (await ecrire(() => majFoyer(edition))) !== undefined && setEdition(null)}>Enregistrer</Button>
          </Stack>
        )}
      </Modal>
    </Card>
  );
}

function ModalMoyen({ moyen, types, opened, onClose }: { moyen: Moyen | null; types: TypeP[]; opened: boolean; onClose: () => void }) {
  const [v, setV] = useState({ libelle: "", typeId: "" });
  const [cle, setCle] = useState<string | null>(null);
  const ouverture = opened ? (moyen?.id ?? "nouveau") : null;
  if (ouverture !== cle) {
    setCle(ouverture);
    if (opened) setV({ libelle: moyen?.libelle ?? "", typeId: moyen?.typeId ?? types[0]?.id ?? "" });
  }
  const enregistrer = async () => {
    const ok = await ecrire<unknown>(() => (moyen ? majMoyenPaiement(moyen.id, v, moyen.modifieLe) : creerMoyenPaiement(v)));
    if (ok !== undefined) onClose();
  };
  return (
    <Modal opened={opened} onClose={onClose} title={moyen ? "Modifier le moyen de paiement" : "Nouveau moyen de paiement"}>
      <Stack>
        <TextInput label="Libellé" placeholder="CB Marie, Chéquier Roger, Espèces…" required value={v.libelle} onChange={(e) => setV({ ...v, libelle: e.currentTarget.value })} data-autofocus />
        <Select label="Type" data={types.map((t) => ({ value: t.id, label: t.libelle }))} value={v.typeId} onChange={(t) => t && setV({ ...v, typeId: t })} allowDeselect={false} />
        <Button onClick={enregistrer} disabled={!v.libelle.trim() || !v.typeId}>
          Enregistrer
        </Button>
      </Stack>
    </Modal>
  );
}

function Moyens({ ecriture }: { ecriture: boolean }) {
  const { data: moyens = [] } = useQuery({ queryKey: ["moyens"], queryFn: () => listeMoyensPaiement() });
  const { data: types = [] } = useQuery({ queryKey: ["types"], queryFn: () => listeTypesPaiement() });
  const [edition, setEdition] = useState<{ moyen: Moyen | null } | null>(null);
  return (
    <Card withBorder>
      <Group justify="space-between" mb="xs">
        <Title order={4}>Moyens de paiement</Title>
        {ecriture && (
          <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setEdition({ moyen: null })}>
            Ajouter
          </Button>
        )}
      </Group>
      <Table verticalSpacing="xs">
        <Table.Tbody>
          {moyens.map((m) => (
            <Table.Tr key={m.id} c={m.archive ? "dimmed" : undefined}>
              <Table.Td fw={500}>{m.libelle}</Table.Td>
              <Table.Td>{m.typeLibelle}</Table.Td>
              <Table.Td c="dimmed" fz="sm">
                {m.nbDepenses} dépense{m.nbDepenses > 1 ? "s" : ""}
              </Table.Td>
              <Table.Td>{m.archive && <Badge variant="light" color="gray">Archivé</Badge>}</Table.Td>
              <Table.Td w={40}>
                {ecriture && (
                  <Menu position="bottom-end">
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" aria-label={`Actions sur ${m.libelle}`}>
                        <IconDots size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEdition({ moyen: m })}>
                        Modifier
                      </Menu.Item>
                      <Menu.Item leftSection={<IconArchive size={14} />} onClick={() => ecrire(() => majMoyenPaiement(m.id, { archive: !m.archive }, m.modifieLe))}>
                        {m.archive ? "Réactiver" : "Archiver"}
                      </Menu.Item>
                      {m.nbDepenses === 0 && (
                        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => confirmerSuppression(`Supprimer « ${m.libelle} » ?`, () => supprimerMoyenPaiement(m.id))}>
                          Supprimer
                        </Menu.Item>
                      )}
                    </Menu.Dropdown>
                  </Menu>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {moyens.length === 0 && (
        <Text size="sm" c="dimmed" py="sm">
          Aucun moyen de paiement : ajoutez vos cartes, chéquiers et les espèces.
        </Text>
      )}
      <Text size="xs" c="dimmed" mt="xs">
        Un moyen déjà utilisé ne se supprime pas : on l'archive, il disparaît de la saisie.
      </Text>
      <ModalMoyen moyen={edition?.moyen ?? null} types={types} opened={!!edition} onClose={() => setEdition(null)} />
    </Card>
  );
}

function Types({ ecriture }: { ecriture: boolean }) {
  const { data: types = [] } = useQuery({ queryKey: ["types"], queryFn: () => listeTypesPaiement() });
  return (
    <Card withBorder>
      <Group justify="space-between" mb="xs">
        <Title order={4}>Types de paiement</Title>
        {ecriture && (
          <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => demanderTexte("Nouveau type de paiement", "Libellé", "", (libelle) => creerTypePaiement({ libelle }))}>
            Ajouter
          </Button>
        )}
      </Group>
      <Stack gap={0}>
        {types.map((t) => (
          <Group key={t.id} py={6} wrap="nowrap" style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
            <Text style={{ flex: 1 }}>{t.libelle}</Text>
            <Text size="sm" c="dimmed">
              {t.nbMoyens ? `${t.nbMoyens} moyen${t.nbMoyens > 1 ? "s" : ""}` : "aucun"}
            </Text>
            {ecriture && (
              <Group gap={4}>
                <ActionIcon variant="subtle" color="gray" aria-label={`Renommer ${t.libelle}`} onClick={() => demanderTexte("Renommer le type", "Libellé", t.libelle, (libelle) => majTypePaiement(t.id, { libelle }, t.modifieLe))}>
                  <IconPencil size={16} />
                </ActionIcon>
                {t.nbMoyens === 0 && (
                  <ActionIcon variant="subtle" color="red" aria-label={`Supprimer ${t.libelle}`} onClick={() => confirmerSuppression(`Supprimer « ${t.libelle} » ?`, () => supprimerTypePaiement(t.id))}>
                    <IconTrash size={16} />
                  </ActionIcon>
                )}
              </Group>
            )}
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

function ModalCategorie({ cat, opened, onClose }: { cat: Cat | null; opened: boolean; onClose: () => void }) {
  const [v, setV] = useState({ nom: "", couleur: "gray" });
  const [cle, setCle] = useState<string | null>(null);
  const ouverture = opened ? (cat?.id ?? "nouveau") : null;
  if (ouverture !== cle) {
    setCle(ouverture);
    if (opened) setV({ nom: cat?.nom ?? "", couleur: cat?.couleur ?? "gray" });
  }
  const enregistrer = async () => {
    const ok = await ecrire<unknown>(() => (cat ? majCategorie(cat.id, v, cat.modifieLe) : creerCategorie(v)));
    if (ok !== undefined) onClose();
  };
  return (
    <Modal opened={opened} onClose={onClose} title={cat ? "Modifier la catégorie" : "Nouvelle catégorie"}>
      <Stack>
        <TextInput label="Nom" required value={v.nom} onChange={(e) => setV({ ...v, nom: e.currentTarget.value })} data-autofocus />
        <div>
          <Text size="sm" fw={500} mb={6}>
            Couleur
          </Text>
          <Group gap={6}>
            {COULEURS.map((c) => (
              <ColorSwatch
                key={c}
                component="button"
                type="button"
                aria-label={c}
                color={`var(--mantine-color-${c}-5)`}
                onClick={() => setV({ ...v, couleur: c })}
                style={{ cursor: "pointer", outline: v.couleur === c ? "2px solid var(--mantine-color-text)" : undefined, outlineOffset: 2 }}
              />
            ))}
          </Group>
        </div>
        <Button onClick={enregistrer} disabled={!v.nom.trim()}>
          Enregistrer
        </Button>
      </Stack>
    </Modal>
  );
}

function ModalFusion({ categories, opened, onClose }: { categories: Cat[]; opened: boolean; onClose: () => void }) {
  const [source, setSource] = useState<string | null>(null);
  const [cible, setCible] = useState<string | null>(null);
  const data = categories.map((c) => ({ value: c.id, label: `${c.nom} (${c.nbDepenses})` }));
  const fusionner = async () => {
    if (!source || !cible) return;
    if ((await ecrire(() => fusionnerCategories(source, cible))) !== undefined) {
      setSource(null);
      setCible(null);
      onClose();
    }
  };
  return (
    <Modal opened={opened} onClose={onClose} title="Fusionner deux catégories">
      <Stack>
        <Select label="Catégorie à faire disparaître" data={data} value={source} onChange={setSource} searchable />
        <Select label="Ses dépenses passent dans" data={data.filter((d) => d.value !== source)} value={cible} onChange={setCible} searchable />
        <Button onClick={fusionner} disabled={!source || !cible}>
          Fusionner
        </Button>
      </Stack>
    </Modal>
  );
}

function Categories({ ecriture }: { ecriture: boolean }) {
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: () => listeCategories() });
  const [edition, setEdition] = useState<{ cat: Cat | null } | null>(null);
  const [fusion, setFusion] = useState(false);
  return (
    <Card withBorder>
      <Group justify="space-between" mb="xs">
        <Title order={4}>Catégories</Title>
        {ecriture && (
          <Group gap="xs">
            <Button size="xs" variant="default" onClick={() => setFusion(true)} disabled={categories.length < 2}>
              Fusionner…
            </Button>
            <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => setEdition({ cat: null })}>
              Ajouter
            </Button>
          </Group>
        )}
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xs" verticalSpacing={0}>
        {categories.map((c) => (
          <Group key={c.id} py={6} wrap="nowrap" style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
            <Badge color={c.couleur} variant="light" style={{ opacity: c.archivee ? 0.5 : 1 }}>
              {c.nom}
            </Badge>
            <Text size="sm" c="dimmed" style={{ flex: 1 }}>
              {c.nbDepenses} dépense{c.nbDepenses > 1 ? "s" : ""}
              {c.archivee && " · archivée"}
            </Text>
            {ecriture && (
              <Menu position="bottom-end">
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" aria-label={`Actions sur ${c.nom}`}>
                    <IconDots size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEdition({ cat: c })}>
                    Modifier
                  </Menu.Item>
                  <Menu.Item leftSection={<IconArchive size={14} />} onClick={() => ecrire(() => majCategorie(c.id, { archivee: !c.archivee }, c.modifieLe))}>
                    {c.archivee ? "Réactiver" : "Archiver"}
                  </Menu.Item>
                  {c.nbDepenses === 0 && (
                    <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => confirmerSuppression(`Supprimer « ${c.nom} » ?`, () => supprimerCategorie(c.id))}>
                      Supprimer
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        ))}
      </SimpleGrid>
      <ModalCategorie cat={edition?.cat ?? null} opened={!!edition} onClose={() => setEdition(null)} />
      <ModalFusion categories={categories} opened={fusion} onClose={() => setFusion(false)} />
    </Card>
  );
}

/** Foyer, moyens et types de paiement, catégories. Lecture seule pour le rôle lecture. */
export function Parametres() {
  const ecriture = peutEcrire();
  return (
    <Stack p="xl" gap="lg" maw={1200}>
      <Group justify="space-between">
        <Title order={2}>Paramètres</Title>
        {!ecriture && (
          <Badge variant="light" color="gray">
            Lecture seule
          </Badge>
        )}
      </Group>
      <Foyer ecriture={ecriture} />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" style={{ alignItems: "start" }}>
        <Moyens ecriture={ecriture} />
        <Types ecriture={ecriture} />
      </SimpleGrid>
      <Categories ecriture={ecriture} />
    </Stack>
  );
}
