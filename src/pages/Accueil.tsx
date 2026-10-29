import { Button, Card, Group, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconAdjustmentsHorizontal, IconHeart, IconPlus } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lireFoyer, listeMoyensPaiement } from "../data/parametres";
import { AvisMiseAJour } from "../components/MiseAJour";
import { peutEcrire } from "../lib/session";
import { useEcran } from "../lib/ecran";
import { useNouvelleDepense } from "../lib/saisie";

/** « Mardi 27 octobre 2026 ». */
function aujourdhuiLong() {
  const t = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Tableau de bord provisoire (socle) : en attendant les dépenses, il accueille et renvoie vers les paramètres.
 * Étape 4 : à rembourser, sans justificatif, dernier remboursement, dépensé dans l'année.
 */
export function Accueil() {
  const { telephone } = useEcran();
  const { data: foyer } = useQuery({ queryKey: ["foyer"], queryFn: () => lireFoyer() });
  const { data: moyens } = useQuery({ queryKey: ["moyens"], queryFn: () => listeMoyensPaiement() });
  const aConfigurer = moyens !== undefined && moyens.length === 0;
  const nouvelle = useNouvelleDepense();

  return (
    <Stack p={telephone ? "md" : "xl"} gap="lg" maw={1100}>
      <AvisMiseAJour />
      <Group justify="space-between">
        <div>
          <Title order={2}>{foyer?.nom ? `Pour ${foyer.nom}` : "Tableau de bord"}</Title>
          <Text c="dimmed" size="sm">
            {aujourdhuiLong()}
          </Text>
        </div>
        {peutEcrire() && !telephone && !aConfigurer && (
          <Button leftSection={<IconPlus size={16} />} onClick={nouvelle}>
            Nouvelle dépense
          </Button>
        )}
      </Group>
      {aConfigurer && (
        <Card withBorder padding="lg">
          <Group align="flex-start" wrap="nowrap">
            <ThemeIcon size={44} radius="md" variant="light">
              <IconHeart size={26} />
            </ThemeIcon>
            <Stack gap={4}>
              <Text fw={600}>Bienvenue dans Cura Parentum</Text>
              <Text size="sm" c="dimmed">
                Pour commencer, indiquez pour qui sont les dépenses et enregistrez vos moyens de paiement (CB, chéquier, espèces). Les
                catégories courantes sont déjà prêtes.
              </Text>
              {peutEcrire() && !telephone && (
                <Button component={Link} to="/parametres" mt="sm" leftSection={<IconAdjustmentsHorizontal size={16} />} w="fit-content">
                  Ouvrir les paramètres
                </Button>
              )}
            </Stack>
          </Group>
        </Card>
      )}
    </Stack>
  );
}
