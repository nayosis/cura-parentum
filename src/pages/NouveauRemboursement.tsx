import { useState, type ReactNode } from "react";
import { EtatJustificatif, sansJustificatif } from "../components/EtatJustificatif";
import { ActionIcon, Alert, Anchor, Box, Button, Card, Checkbox, Divider, Group, SimpleGrid, Stack, Table, Text, TextInput, Textarea, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconArrowLeft, IconX } from "@tabler/icons-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { candidats, creerRemboursement, plageProposee } from "../data/remboursements";
import { ChampDate } from "../components/Champs";
import { BoutonsAjout, envoyerFichiers, Vignette } from "../components/Justificatifs";
import { aujourdhui, dateLisible } from "../lib/dates";
import type { FichierEnvoye } from "../lib/fichiers";
import { euros, lireMontant } from "../lib/montants";
import { ecrire } from "../lib/query";

type Candidat = Awaited<ReturnType<typeof candidats>>["dansPlage"][number];

/** Écart montant viré − total coché, en mots : positif = trop-perçu, négatif = manque. */
export function libelleEcart(ecart: number) {
  if (ecart === 0) return "sans écart";
  return ecart > 0 ? `trop-perçu de ${euros(ecart)}` : `manque ${euros(-ecart)}`;
}

function Section({ titre, couleur, lignes, decochees, basculer, tout }: {
  titre: ReactNode;
  couleur?: string;
  lignes: Candidat[];
  decochees: Set<string>;
  basculer: (id: string) => void;
  tout: (ids: string[], coche: boolean) => void;
}) {
  if (!lignes.length) return null;
  const ids = lignes.map((l) => l.id);
  const toutes = ids.every((id) => !decochees.has(id));
  return (
    <>
      <Table.Tr bg={couleur ?? "var(--t-fond-accent)"}>
        <Table.Td w={40}>
          <Checkbox aria-label="Tout cocher" checked={toutes} indeterminate={!toutes && ids.some((id) => !decochees.has(id))} onChange={() => tout(ids, !toutes)} />
        </Table.Td>
        <Table.Td colSpan={5}>
          <Text size="xs" fw={600} tt="uppercase" c="dimmed">
            {titre}
          </Text>
        </Table.Td>
      </Table.Tr>
      {lignes.map((d) => (
        <Table.Tr key={d.id} className="ligne-cliquable" onClick={() => basculer(d.id)} style={{ opacity: decochees.has(d.id) ? 0.55 : 1 }}>
          <Table.Td>
            <Checkbox aria-label={d.libelle} checked={!decochees.has(d.id)} onChange={() => basculer(d.id)} onClick={(e) => e.stopPropagation()} />
          </Table.Td>
          <Table.Td c="dimmed" w={100}>
            {dateLisible(d.date, { day: "2-digit", month: "2-digit", year: "numeric" })}
          </Table.Td>
          <Table.Td>{d.libelle}</Table.Td>
          <Table.Td c="dimmed">{d.moyenLibelle}</Table.Td>
          <Table.Td w={40} c="dimmed">
            <EtatJustificatif d={d} court />
          </Table.Td>
          <Table.Td ta="right" fw={600} style={{ whiteSpace: "nowrap" }}>
            {euros(d.montant)}
          </Table.Td>
        </Table.Tr>
      ))}
    </>
  );
}

/**
 * Nouveau remboursement (ordinateur, tablette) : la plage propose les dépenses non remboursées, toutes cochées,
 * et à part les oubliées d'avant la plage ; on saisit le montant viré, l'écart s'affiche ; on joint le relevé.
 */
export function NouveauRemboursement() {
  const naviguer = useNavigate();
  const { data: proposee } = useQuery({ queryKey: ["plageProposee"], queryFn: () => plageProposee() });
  const [plage, setPlage] = useState<{ debut: string | null; fin: string | null } | null>(null);
  const p = plage ?? proposee ?? null;
  const plageValide = !!p?.debut && !!p?.fin && p.debut <= p.fin;
  const { data } = useQuery({ queryKey: ["candidats", p?.debut, p?.fin], queryFn: () => candidats(p!.debut!, p!.fin!), enabled: plageValide });
  const [decochees, setDecochees] = useState<Set<string>>(new Set());
  const [dateVirement, setDateVirement] = useState<string | null>(aujourdhui());
  const [montant, setMontant] = useState("");
  const [note, setNote] = useState("");
  const [fichiers, setFichiers] = useState<FichierEnvoye[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const toutes = [...(data?.avant ?? []), ...(data?.dansPlage ?? [])];
  const cochees = toutes.filter((d) => !decochees.has(d.id));
  const total = cochees.reduce((t, d) => t + d.montant, 0);
  const vire = lireMontant(montant);
  const ecart = vire === null ? null : vire - total;
  const nbSansJustificatif = cochees.filter(sansJustificatif).length;
  const valide = cochees.length > 0 && !!dateVirement && plageValide && vire !== null && vire > 0;

  const basculer = (id: string) =>
    setDecochees((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const tout = (ids: string[], coche: boolean) =>
    setDecochees((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (coche) n.delete(id);
        else n.add(id);
      }
      return n;
    });

  const ajouter = async (f: File[]) => {
    setEnvoi(true);
    try {
      const envoyes = await envoyerFichiers(f);
      setFichiers((d) => [...d, ...envoyes]);
    } finally {
      setEnvoi(false);
    }
  };

  const valider = () =>
    modals.openConfirmModal({
      title: "Valider le remboursement ?",
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Virement de <b>{euros(vire)}</b> le {dateLisible(dateVirement)} pour <b>{cochees.length}</b> dépense{cochees.length > 1 ? "s" : ""} ({euros(total)}),{" "}
            {libelleEcart(ecart ?? 0)}.
          </Text>
          <Text size="sm" c="dimmed">
            Ces dépenses deviendront « remboursées » et ne seront plus modifiables (sauf par un admin). Un remboursement validé ne s'annule pas.
          </Text>
        </Stack>
      ),
      labels: { confirm: "Valider", cancel: "Revoir" },
      onConfirm: async () => {
        setEnCours(true);
        try {
          const id = await ecrire(() =>
            creerRemboursement({
              dateVirement: dateVirement!,
              debut: p!.debut!,
              fin: p!.fin!,
              montantVire: vire!,
              note,
              depenseIds: cochees.map((d) => d.id),
              justificatifs: fichiers.map((f) => ({ fichier: f.fichier, nom: f.nom })),
            }),
          );
          if (id) naviguer({ to: "/remboursements/$id", params: { id } });
        } finally {
          setEnCours(false);
        }
      },
    });

  return (
    <Stack p="xl" gap="lg" maw={1300}>
      <div>
        <Anchor component={Link} to="/remboursements" size="sm">
          <Group gap={4}>
            <IconArrowLeft size={14} /> Remboursements
          </Group>
        </Anchor>
        <Title order={2} mt={4}>
          Nouveau remboursement
        </Title>
      </div>

      <Group align="flex-start" gap="lg" wrap="wrap">
        <Stack gap="lg" style={{ flex: "3 1 560px", minWidth: 0 }}>
          <Card withBorder>
            <SimpleGrid cols={{ base: 1, sm: 4 }}>
              <ChampDate label="Date du virement" required value={dateVirement} onChange={setDateVirement} />
              <ChampDate
                label="Plage : du"
                required
                value={p?.debut ?? null}
                onChange={(d) => {
                  setPlage({ debut: d, fin: p?.fin ?? null });
                  setDecochees(new Set());
                }}
              />
              <ChampDate
                label="au"
                required
                value={p?.fin ?? null}
                onChange={(f) => {
                  setPlage({ debut: p?.debut ?? null, fin: f });
                  setDecochees(new Set());
                }}
              />
              <TextInput
                label="Montant viré"
                required
                inputMode="decimal"
                placeholder="0,00"
                rightSection="€"
                value={montant}
                onChange={(e) => setMontant(e.currentTarget.value)}
                error={montant && vire === null}
                styles={{ input: { fontWeight: 700 } }}
              />
            </SimpleGrid>
            {p?.debut && p?.fin && p.debut > p.fin && (
              <Text size="sm" c="red" mt="xs">
                La plage commence après sa fin.
              </Text>
            )}
          </Card>

          <Card withBorder padding={0}>
            <Group justify="space-between" p="md" pb="xs">
              <Title order={4}>Dépenses remboursées</Title>
              <Text size="sm" c="dimmed">
                Décochez ce qui n'est pas remboursé par ce virement.
              </Text>
            </Group>
            {toutes.length === 0 ? (
              <Text c="dimmed" ta="center" py="xl">
                {plageValide ? "Aucune dépense non remboursée jusqu'à la fin de la plage." : "Choisissez la plage."}
              </Text>
            ) : (
              <Table verticalSpacing={6}>
                <Table.Tbody>
                  <Section titre={`Dans la plage · non remboursées (${data?.dansPlage.length ?? 0})`} lignes={data?.dansPlage ?? []} decochees={decochees} basculer={basculer} tout={tout} />
                  <Section
                    titre={`Avant la plage · oubliées des remboursements précédents (${data?.avant.length ?? 0})`}
                    couleur="var(--mantine-color-orange-light)"
                    lignes={data?.avant ?? []}
                    decochees={decochees}
                    basculer={basculer}
                    tout={tout}
                  />
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </Stack>

        <Stack gap="lg" style={{ flex: "1 1 300px", minWidth: 0, position: "sticky", top: 16 }}>
          <Card withBorder>
            <Title order={4} mb="sm">
              Rapprochement
            </Title>
            <Stack gap={6}>
              <Group justify="space-between">
                <Text c="dimmed">Dépenses cochées</Text>
                <Text>{cochees.length}</Text>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed">Total coché</Text>
                <Group gap={6}>
                  <Text fw={600}>{euros(total)}</Text>
                  {cochees.length > 0 && (
                    <Anchor component="button" type="button" size="xs" onClick={() => setMontant((total / 100).toFixed(2).replace(".", ","))}>
                      reprendre
                    </Anchor>
                  )}
                </Group>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed">Montant viré</Text>
                <Text fw={600}>{vire === null ? "—" : euros(vire)}</Text>
              </Group>
              <Divider />
              <Group justify="space-between" align="baseline">
                <Text fw={600}>Écart</Text>
                <Text fz={22} fw={700} c={ecart ? "orange.8" : undefined}>
                  {ecart === null ? "—" : `${ecart > 0 ? "+" : ""}${euros(ecart)}`}
                </Text>
              </Group>
              {ecart !== null && ecart !== 0 && (
                <Text size="sm" c="dimmed">
                  {ecart > 0 ? "Trop-perçu" : "Manque"} : il est seulement affiché, jamais reporté. Une note pour l'expliquer est conseillée.
                </Text>
              )}
              {nbSansJustificatif > 0 && (
                <Alert color="orange" p="xs" mt="xs">
                  {nbSansJustificatif} dépense{nbSansJustificatif > 1 ? "s" : ""} cochée{nbSansJustificatif > 1 ? "s" : ""} sans justificatif.
                </Alert>
              )}
            </Stack>
          </Card>

          <Card withBorder>
            <Stack gap="md">
              <div>
                <Text size="sm" fw={500} mb={6}>
                  Justificatifs du virement
                </Text>
                <Group gap="xs">
                  {fichiers.map((f) => (
                    <Box key={f.fichier} pos="relative">
                      <Vignette doc={f} taille={56} />
                      <ActionIcon
                        size="xs"
                        radius="xl"
                        pos="absolute"
                        top={-6}
                        right={-6}
                        color="dark"
                        aria-label={`Enlever ${f.nom}`}
                        onClick={() => setFichiers((d) => d.filter((x) => x.fichier !== f.fichier))}
                      >
                        <IconX size={10} />
                      </ActionIcon>
                    </Box>
                  ))}
                  <BoutonsAjout onFichiers={ajouter} envoi={envoi} />
                </Group>
                <Text size="xs" c="dimmed" mt={4}>
                  Relevé de compte, capture de l'avis de virement…
                </Text>
              </div>
              <Textarea label="Note" placeholder="Arrondi, dépense reportée au mois suivant…" autosize minRows={2} value={note} onChange={(e) => setNote(e.currentTarget.value)} />
              <Button size="md" onClick={valider} disabled={!valide || envoi} loading={enCours}>
                Valider le remboursement
              </Button>
            </Stack>
          </Card>
        </Stack>
      </Group>
    </Stack>
  );
}
