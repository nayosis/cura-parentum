import { useState } from "react";
import { Alert, Anchor, Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconArrowLeft, IconLock, IconPencil, IconTrash } from "@tabler/icons-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ficheDepense, supprimerDepense } from "../data/depenses";
import { DiffJournal } from "../components/DiffJournal";
import { Justificatifs } from "../components/Justificatifs";
import { ModalDepense } from "../components/ModalDepense";
import { dateLisible } from "../lib/dates";
import { useEcran } from "../lib/ecran";
import { euros } from "../lib/montants";
import { ecrire } from "../lib/query";
import { appelApi } from "../lib/rpc";
import { estAdmin, peutEcrire } from "../lib/session";
import { ficheDepenseRoute } from "../router";

type LigneJournal = { id: number; quand: string; utilisateur: string; fonction: string; avant: string | null; apres: string | null };

const ACTIONS: Record<string, string> = {
  creerDepense: "Création",
  majDepense: "Modification",
  supprimerDepense: "Suppression",
  ajouterJustificatifs: "Justificatif ajouté",
  retirerJustificatif: "Justificatif retiré",
  renommerJustificatif: "Justificatif renommé",
};

const quand = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

/** Historique de la dépense (admins : le journal leur est réservé). */
function Historique({ id }: { id: string }) {
  const { data } = useQuery({ queryKey: ["journal", "depense", id], queryFn: () => appelApi<{ lignes: LigneJournal[] }>(`/api/journal?cible=${id}`) });
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
            {l.fonction !== "creerDepense" && <DiffJournal avant={l.avant} apres={l.apres} />}
          </div>
        ))}
      </Stack>
    </Card>
  );
}

/** Une dépense : montant, détails, justificatifs ; modifier, supprimer ; historique pour les admins. */
export function FicheDepense() {
  const { id } = ficheDepenseRoute.useParams();
  const { telephone } = useEcran();
  const naviguer = useNavigate();
  const { data: d, error } = useQuery({ queryKey: ["depense", id], queryFn: () => ficheDepense(id) });
  const [edition, setEdition] = useState(false);

  if (error)
    return (
      <Stack p="xl">
        <Alert color="orange">{error.message}</Alert>
        <Anchor component={Link} to="/depenses">
          Retour aux dépenses
        </Anchor>
      </Stack>
    );
  if (!d) return null;

  const remboursee = !!d.remboursementId;
  // Une dépense remboursée est verrouillée, sauf pour un admin ; on peut toujours y ajouter un justificatif.
  const modifiable = peutEcrire() && (!remboursee || estAdmin());
  const supprimer = () =>
    modals.openConfirmModal({
      title: `Supprimer « ${d.libelle} » ?`,
      children: <Text size="sm">La dépense disparaît des listes ; ses justificatifs sont gardés, et le journal garde la dépense entière.</Text>,
      labels: { confirm: "Supprimer", cancel: "Annuler" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        if ((await ecrire(() => supprimerDepense(d.id))) !== undefined) naviguer({ to: "/depenses" });
      },
    });

  return (
    <Stack p={telephone ? "md" : "xl"} gap="md" maw={900}>
      <Anchor component={Link} to="/depenses" size="sm">
        <Group gap={4}>
          <IconArrowLeft size={14} /> Dépenses
        </Group>
      </Anchor>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text size="sm" c="dimmed">
            {dateLisible(d.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </Text>
          <Title order={2}>{d.libelle}</Title>
          <Group gap={4} mt={6}>
            {d.categories.map((c) => (
              <Badge key={c.id} color={c.couleur} variant="light" tt="none">
                {c.nom}
              </Badge>
            ))}
          </Group>
        </div>
        <Text fz={30} fw={700} style={{ whiteSpace: "nowrap" }}>
          {euros(d.montant)}
        </Text>
      </Group>

      {remboursee && (
        <Alert color="gray" icon={<IconLock size={18} />} p="sm">
          Remboursée par le virement du {dateLisible(d.dateVirement)}.{" "}
          {estAdmin() ? "Vous pouvez encore la modifier (admin) ; c'est journalisé." : "Elle n'est plus modifiable."}
        </Alert>
      )}

      <Card withBorder>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
          <Text size="sm">
            <Text span c="dimmed">
              Payé avec :{" "}
            </Text>
            {d.moyenLibelle}
          </Text>
          <Text size="sm">
            <Text span c="dimmed">
              Statut :{" "}
            </Text>
            {d.montant < 0 ? "Avoir, " : ""}
            {remboursee ? "remboursée" : "à rembourser"}
          </Text>
          <Text size="sm" c="dimmed">
            Saisie par {d.creePar} le {quand(`${d.creeLe.replace(" ", "T")}Z`)}
          </Text>
          {d.modifieLe && (
            <Text size="sm" c="dimmed">
              Dernière écriture : {d.modifiePar}, le {quand(d.modifieLe)}
            </Text>
          )}
        </SimpleGrid>
        {d.note && (
          <Text size="sm" mt="sm" style={{ whiteSpace: "pre-wrap" }}>
            {d.note}
          </Text>
        )}
      </Card>

      <Justificatifs cible={d.id} justificatifs={d.justificatifs} ajout={peutEcrire()} modifiable={modifiable} />

      {modifiable && (
        <Group>
          <Button leftSection={<IconPencil size={16} />} onClick={() => setEdition(true)}>
            Modifier
          </Button>
          <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={supprimer}>
            Supprimer
          </Button>
        </Group>
      )}

      {estAdmin() && <Historique id={d.id} />}

      <ModalDepense depense={d} opened={edition} onClose={() => setEdition(false)} />
    </Stack>
  );
}
