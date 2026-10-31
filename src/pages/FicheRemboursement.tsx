import { useState } from "react";
import { Alert, Anchor, Button, Card, Group, Modal, SimpleGrid, Stack, Table, Text, TextInput, Textarea, Title, UnstyledButton } from "@mantine/core";
import { IconArrowLeft, IconChevronRight, IconDownload, IconFileZip, IconPencil, IconTrash } from "@tabler/icons-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ficheRemboursement, majRemboursement, supprimerRemboursement } from "../data/remboursements";
import { ChampDate } from "../components/Champs";
import { EtatJustificatif } from "../components/EtatJustificatif";
import { Historique } from "../components/Historique";
import { Justificatifs } from "../components/Justificatifs";
import { dateLisible } from "../lib/dates";
import { useEcran } from "../lib/ecran";
import { euros, lireMontant } from "../lib/montants";
import { ecrire } from "../lib/query";
import { modals } from "@mantine/modals";
import { estAdmin, estSuperAdmin, peutEcrire } from "../lib/session";
import { ficheRemboursementRoute } from "../router";
import { libelleEcart } from "./NouveauRemboursement";

type Fiche = Awaited<ReturnType<typeof ficheRemboursement>>;

/** Correction par un admin : date, montant viré, note (les dépenses cochées ne changent pas). */
function ModalCorrection({ r, opened, onClose }: { r: Fiche; opened: boolean; onClose: () => void }) {
  const [v, setV] = useState({ dateVirement: r.dateVirement as string | null, montant: "", note: "" });
  const [cle, setCle] = useState<string | null>(null);
  const ouverture = opened ? r.modifieLe : null;
  if (ouverture !== cle) {
    setCle(ouverture);
    if (opened) setV({ dateVirement: r.dateVirement, montant: (r.montantVire / 100).toFixed(2).replace(".", ","), note: r.note ?? "" });
  }
  const vire = lireMontant(v.montant);
  const enregistrer = async () => {
    if (vire === null || !v.dateVirement) return;
    const ok = await ecrire(() => majRemboursement(r.id, { dateVirement: v.dateVirement!, montantVire: vire, note: v.note }, r.modifieLe));
    if (ok !== undefined) onClose();
  };
  return (
    <Modal opened={opened} onClose={onClose} title="Corriger le remboursement">
      <Stack>
        <Text size="sm" c="dimmed">
          Les dépenses cochées ne changent pas. La correction est journalisée.
        </Text>
        <ChampDate label="Date du virement" required value={v.dateVirement} onChange={(d) => setV({ ...v, dateVirement: d })} />
        <TextInput label="Montant viré" rightSection="€" inputMode="decimal" value={v.montant} onChange={(e) => setV({ ...v, montant: e.currentTarget.value })} error={v.montant && vire === null} />
        <Textarea label="Note" autosize minRows={2} value={v.note} onChange={(e) => setV({ ...v, note: e.currentTarget.value })} />
        <Button onClick={enregistrer} disabled={vire === null || vire <= 0 || !v.dateVirement}>
          Enregistrer
        </Button>
      </Stack>
    </Modal>
  );
}

function Chiffre({ label, valeur, accent }: { label: string; valeur: string; accent?: boolean }) {
  return (
    <Card padding="sm" bg={accent ? "var(--mantine-color-orange-light)" : "var(--t-fond-accent)"}>
      <Text size="xs" c={accent ? "orange.9" : "dimmed"}>
        {label}
      </Text>
      <Text fw={700} c={accent ? "orange.9" : undefined}>
        {valeur}
      </Text>
    </Card>
  );
}

/** Un remboursement : chiffres, note, justificatifs du virement, dépenses couvertes ; correction et historique (admins). */
export function FicheRemboursement() {
  const { id } = ficheRemboursementRoute.useParams();
  const { telephone } = useEcran();
  const naviguer = useNavigate();
  const { data: r, error } = useQuery({ queryKey: ["remboursement", id], queryFn: () => ficheRemboursement(id) });
  const [correction, setCorrection] = useState(false);

  if (error)
    return (
      <Stack p="xl">
        <Alert color="orange">{error.message}</Alert>
        <Anchor component={Link} to="/remboursements">
          Retour aux remboursements
        </Anchor>
      </Stack>
    );
  if (!r) return null;

  const supprimer = () =>
    modals.openConfirmModal({
      title: "Supprimer ce remboursement ?",
      children: (
        <Stack gap="xs">
          <Text size="sm">
            {r.depenses.length > 1
              ? `Ses ${r.depenses.length} dépenses repassent « à rembourser » et redeviennent modifiables (dates comprises).`
              : "Sa dépense repasse « à rembourser » et redevient modifiable (date comprise)."}{" "}
            Ses justificatifs sont archivés.
          </Text>
          <Text size="sm">
            Le virement de {euros(r.montantVire)} du {dateLisible(r.dateVirement)} ne sera plus justifié : refaites un remboursement avec les dépenses corrigées.
          </Text>
          <Text size="sm" c="dimmed">
            Le journal garde la fiche entière avant suppression.
          </Text>
        </Stack>
      ),
      labels: { confirm: "Supprimer", cancel: "Annuler" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        if ((await ecrire(() => supprimerRemboursement(r.id))) !== undefined) naviguer({ to: "/remboursements" });
      },
    });
  const ouvrir = (depense: string) => naviguer({ to: "/depenses/$id", params: { id: depense } });

  return (
    <Stack p={telephone ? "md" : "xl"} gap="md" maw={1000}>
      <Anchor component={Link} to="/remboursements" size="sm">
        <Group gap={4}>
          <IconArrowLeft size={14} /> Remboursements
        </Group>
      </Anchor>
      <Group justify="space-between" align="flex-start">
        <div>
          <Text size="sm" c="dimmed">
            Virement du {dateLisible(r.dateVirement, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </Text>
          <Title order={2}>
            Dépenses du {dateLisible(r.debut, { day: "numeric", month: "long" })} au {dateLisible(r.fin)}
          </Title>
        </div>
        {!telephone && (
          <Group gap="xs">
            <Button component="a" href={`/api/exports/remboursements/${r.id}/dossier`} download leftSection={<IconDownload size={16} />}>
              Dossier PDF
            </Button>
            <Button component="a" href={`/api/exports/remboursements/${r.id}/justificatifs`} download variant="default" leftSection={<IconFileZip size={16} />}>
              ZIP des justificatifs
            </Button>
            {estAdmin() && (
              <Button variant="subtle" leftSection={<IconPencil size={16} />} onClick={() => setCorrection(true)}>
                Corriger
              </Button>
            )}
            {estSuperAdmin() && (
              <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={supprimer}>
                Supprimer
              </Button>
            )}
          </Group>
        )}
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <Chiffre label={r.depenses.length > 1 ? `Total des ${r.depenses.length} dépenses` : "Total de la dépense"} valeur={euros(r.total)} />
        <Chiffre label="Montant viré" valeur={euros(r.montantVire)} />
        <Chiffre label="Écart" valeur={r.ecart === 0 ? "aucun" : `${r.ecart > 0 ? "+" : ""}${euros(r.ecart)}`} accent={r.ecart !== 0} />
        <Chiffre label="Plage" valeur={`${dateLisible(r.debut, { day: "2-digit", month: "2-digit" })} → ${dateLisible(r.fin, { day: "2-digit", month: "2-digit" })}`} />
      </SimpleGrid>
      {r.ecart !== 0 && (
        <Text size="sm" c="dimmed">
          {libelleEcart(r.ecart).replace(/^./, (c) => c.toUpperCase())} : affiché, non reporté.
        </Text>
      )}
      {r.note && (
        <Card withBorder padding="sm">
          <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
            <b>Note :</b> {r.note}
          </Text>
        </Card>
      )}

      <Justificatifs cible={r.id} justificatifs={r.justificatifs} ajout={peutEcrire()} modifiable={estAdmin()} />

      <Card withBorder padding={telephone ? "xs" : 0}>
        <Group justify="space-between" p={telephone ? 4 : "md"} pb="xs">
          <Title order={4}>Dépenses ({r.depenses.length})</Title>
          <Text size="sm" c="dimmed">
            remboursées, verrouillées
          </Text>
        </Group>
        {telephone ? (
          <Stack gap={0}>
            {r.depenses.map((d) => (
              <UnstyledButton key={d.id} onClick={() => ouvrir(d.id)} px={4} py="sm" style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
                <Group wrap="nowrap" gap="sm">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={500} truncate>
                      {d.libelle}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {dateLisible(d.date, { day: "numeric", month: "short" })} · {d.moyenLibelle}
                    </Text>
                  </div>
                  <Text size="sm" fw={600}>
                    {euros(d.montant)}
                  </Text>
                  <IconChevronRight size={14} color="var(--mantine-color-dimmed)" />
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        ) : (
          <Table highlightOnHover verticalSpacing={6}>
            <Table.Tbody>
              {r.depenses.map((d) => (
                <Table.Tr key={d.id} className="ligne-cliquable" onClick={() => ouvrir(d.id)}>
                  <Table.Td c="dimmed" w={110}>
                    {dateLisible(d.date, { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </Table.Td>
                  <Table.Td>{d.libelle}</Table.Td>
                  <Table.Td c="dimmed">{d.moyenLibelle}</Table.Td>
                  <Table.Td w={60} c="dimmed">
                    <EtatJustificatif d={d} court />
                  </Table.Td>
                  <Table.Td ta="right" fw={600}>
                    {euros(d.montant)}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      {estAdmin() && <Historique id={r.id} />}
      <ModalCorrection r={r} opened={correction} onClose={() => setCorrection(false)} />
    </Stack>
  );
}
