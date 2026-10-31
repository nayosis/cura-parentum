import { Badge, Group, Text, Tooltip } from "@mantine/core";
import { IconFileOff, IconPaperclip } from "@tabler/icons-react";
import { libelleAbsence, type MotifAbsence } from "../lib/absence";

type Etat = { nbJustificatifs: number; absence?: MotifAbsence | null; absenceDetail?: string | null };

/** Un vrai oubli : aucun justificatif et pas d'absence déclarée (ticket perdu…). */
export const sansJustificatif = (d: Etat) => d.nbJustificatifs === 0 && !d.absence;

/**
 * Justificatifs d'une dépense : leur nombre, l'absence déclarée (gris, avec le motif) ou l'oubli (orange).
 * `court` : pour les tableaux serrés (remboursements).
 */
export function EtatJustificatif({ d, court }: { d: Etat; court?: boolean }) {
  if (d.nbJustificatifs > 0)
    return (
      <Group gap={4} c="dimmed" wrap="nowrap">
        <IconPaperclip size={14} />
        {!court && <Text size="sm">{d.nbJustificatifs}</Text>}
      </Group>
    );
  const absence = libelleAbsence(d.absence, d.absenceDetail);
  if (absence)
    return court ? (
      <Tooltip label={`Justificatif absent : ${absence}`}>
        <Text size="xs" c="dimmed">
          absent
        </Text>
      </Tooltip>
    ) : (
      <Badge color="gray" variant="light" size="sm" tt="none" leftSection={<IconFileOff size={12} />} title={absence}>
        {libelleAbsence(d.absence)}
      </Badge>
    );
  return court ? (
    <Text size="xs" c="orange.8">
      aucun
    </Text>
  ) : (
    <Badge color="orange" variant="light" size="sm" tt="none">
      Sans justificatif
    </Badge>
  );
}
