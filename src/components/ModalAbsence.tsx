import { useState } from "react";
import { Button, Group, Modal, SegmentedControl, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { declarerAbsence } from "../data/depenses";
import { MOTIFS_ABSENCE, type Absence, type MotifAbsence } from "../lib/absence";
import { ecrire } from "../lib/query";

/** Choix du motif (et précision pour « Autre ») : utilisé à la saisie et pour déclarer après coup. */
export function ChoixAbsence({ valeur, onChange }: { valeur: Absence; onChange: (a: Absence) => void }) {
  return (
    <Stack gap="xs">
      <SegmentedControl fullWidth data={MOTIFS_ABSENCE} value={valeur.motif} onChange={(m) => onChange({ ...valeur, motif: m as MotifAbsence })} />
      {valeur.motif === "autre" && (
        <TextInput placeholder="Ticket illisible" aria-label="Pourquoi" value={valeur.detail ?? ""} onChange={(e) => onChange({ ...valeur, detail: e.currentTarget.value })} />
      )}
    </Stack>
  );
}

export const absenceValide = (a: Absence) => a.motif !== "autre" || !!a.detail?.trim();

/** Déclare le justificatif absent sur une ou plusieurs dépenses (celles qui en ont un sont laissées telles quelles). */
export function ModalAbsence({ ids, onClose, onFait }: { ids: string[] | null; onClose: () => void; onFait?: () => void }) {
  const [absence, setAbsence] = useState<Absence>({ motif: "perdu" });
  const n = ids?.length ?? 0;
  const declarer = async () => {
    if (!ids) return;
    const faites = await ecrire(() => declarerAbsence(ids, absence));
    if (faites === undefined) return;
    notifications.show({ color: "green", message: `Justificatif déclaré absent : ${faites} dépense${faites > 1 ? "s" : ""}` });
    onFait?.();
    onClose();
  };
  return (
    <Modal opened={!!ids} onClose={onClose} title={n > 1 ? `Déclarer ${n} dépenses sans justificatif` : "Déclarer le justificatif absent"}>
      <Stack>
        <ChoixAbsence valeur={absence} onChange={setAbsence} />
        <Text size="sm" c="dimmed">
          {n > 1 ? "Elles ne compteront plus" : "Elle ne comptera plus"} dans « sans justificatif ». La déclaration (qui, quand, pourquoi) figure au journal et
          dans le dossier du remboursement. Un justificatif ajouté plus tard l'efface.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={declarer} disabled={!absenceValide(absence)}>
            Déclarer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
