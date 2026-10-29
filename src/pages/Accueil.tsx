import { useState, type ReactNode } from "react";
import { Alert, Box, Button, Card, Group, SegmentedControl, SimpleGrid, Stack, Text, ThemeIcon, Title, UnstyledButton } from "@mantine/core";
import { IconAdjustmentsHorizontal, IconAlertTriangle, IconChevronRight, IconHeart, IconPlus } from "@tabler/icons-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lireFoyer, listeMoyensPaiement } from "../data/parametres";
import { tableauDeBord, type TotalCategorie } from "../data/tableauDeBord";
import { AvisMiseAJour } from "../components/MiseAJour";
import { dateLisible } from "../lib/dates";
import { useEcran } from "../lib/ecran";
import { euros } from "../lib/montants";
import { useNouvelleDepense } from "../lib/saisie";
import { peutEcrire } from "../lib/session";
import { ecartCourt } from "./Remboursements";

type Donnees = Awaited<ReturnType<typeof tableauDeBord>>;

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « Mardi 27 octobre 2026 ». */
function aujourdhuiLong() {
  const t = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Chiffre clé cliquable : libellé, valeur, précision. `accent` : la tuile principale (à rembourser). */
function Tuile({ label, valeur, detail, onClick, accent, alerte }: { label: string; valeur: ReactNode; detail: ReactNode; onClick?: () => void; accent?: boolean; alerte?: boolean }) {
  const contenu = (
    <Card withBorder={!accent} padding="md" bg={accent ? "prune.6" : undefined} className={onClick ? "tuile" : undefined} h="100%">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Text size="sm" c={accent ? "prune.0" : "dimmed"}>
          {label}
        </Text>
        {alerte && <IconAlertTriangle size={18} color="var(--mantine-color-orange-7)" aria-hidden />}
      </Group>
      <Text fz={28} fw={700} lh={1.2} mt={4} c={accent ? "white" : alerte ? "orange.8" : undefined}>
        {valeur}
      </Text>
      <Text size="xs" c={accent ? "prune.0" : "dimmed"} mt={2} truncate>
        {detail}
      </Text>
    </Card>
  );
  return onClick ? (
    <UnstyledButton onClick={onClick} style={{ display: "block" }}>
      {contenu}
    </UnstyledButton>
  ) : (
    contenu
  );
}

/**
 * Dépenses par catégorie : une barre par catégorie, d'une seule couleur (la longueur porte le montant, le nom est écrit),
 * de la plus grosse à la plus petite. Survol : le montant exact et la part du total.
 */
function BarresCategories({ categories }: { categories: TotalCategorie[] }) {
  const max = Math.max(1, ...categories.map((c) => c.total));
  const somme = categories.reduce((t, c) => t + Math.max(0, c.total), 0);
  if (!categories.length)
    return (
      <Text size="sm" c="dimmed" py="sm">
        Aucune dépense sur la période.
      </Text>
    );
  return (
    <Stack gap={8} role="list">
      {categories.map((c) => (
        <Group
          key={c.id ?? "sans"}
          gap="sm"
          wrap="nowrap"
          role="listitem"
          title={`${c.nom} : ${euros(c.total)}${somme ? ` (${Math.round((Math.max(0, c.total) / somme) * 100)} %)` : ""}`}
        >
          <Text size="sm" w={110} truncate>
            {c.nom}
          </Text>
          <Box style={{ flex: 1, height: 10, background: "var(--t-fond-doux)", borderRadius: 4, overflow: "hidden" }}>
            <Box h="100%" bg="prune.6" style={{ width: `${(Math.max(0, c.total) / max) * 100}%`, borderRadius: 4 }} />
          </Box>
          <Text size="sm" fw={600} w={90} ta="right">
            {euros(c.total)}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}

function Categories({ t }: { t: Donnees }) {
  const [periode, setPeriode] = useState<"mois" | "annee">("mois");
  const libelleMois = MOIS[Number(t.jour.slice(5, 7)) - 1];
  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <Title order={4}>Par catégorie</Title>
        <SegmentedControl
          size="xs"
          value={periode}
          onChange={(v) => setPeriode(v as "mois" | "annee")}
          data={[
            { value: "mois", label: libelleMois.charAt(0).toUpperCase() + libelleMois.slice(1) },
            { value: "annee", label: String(t.annee.annee) },
          ]}
        />
      </Group>
      <BarresCategories categories={periode === "mois" ? t.categoriesMois : t.categoriesAnnee} />
      <Text size="xs" c="dimmed" mt="sm">
        Une dépense à plusieurs catégories compte dans chacune.
      </Text>
    </Card>
  );
}

function DernieresDepenses({ t, ouvrir }: { t: Donnees; ouvrir: (id: string) => void }) {
  return (
    <Card withBorder>
      <Group justify="space-between" mb="xs">
        <Title order={4}>Dernières dépenses</Title>
        <Button component={Link} to="/depenses" variant="subtle" size="compact-sm">
          Tout voir
        </Button>
      </Group>
      {t.dernieresDepenses.length === 0 ? (
        <Text size="sm" c="dimmed" py="sm">
          Aucune dépense pour l'instant.
        </Text>
      ) : (
        <Stack gap={0}>
          {t.dernieresDepenses.map((d) => (
            <UnstyledButton key={d.id} onClick={() => ouvrir(d.id)} py={10} style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
              <Group wrap="nowrap" gap="sm">
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={500} truncate>
                    {d.libelle}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {dateLisible(d.date, { day: "numeric", month: "short" })} · {d.moyenLibelle}
                  </Text>
                </Box>
                {d.nbJustificatifs === 0 && (
                  <Text size="xs" fw={600} c="orange.8">
                    sans justificatif
                  </Text>
                )}
                <Text size="sm" fw={600} style={{ whiteSpace: "nowrap" }}>
                  {euros(d.montant)}
                </Text>
              </Group>
            </UnstyledButton>
          ))}
        </Stack>
      )}
    </Card>
  );
}

function RemboursementsRecents({ t, ouvrir }: { t: Donnees; ouvrir: (id: string) => void }) {
  return (
    <Card withBorder>
      <Group justify="space-between" mb="xs">
        <Title order={4}>Remboursements récents</Title>
        <Button component={Link} to="/remboursements" variant="subtle" size="compact-sm">
          Tout voir
        </Button>
      </Group>
      {t.remboursementsRecents.length === 0 ? (
        <Text size="sm" c="dimmed" py="sm">
          Aucun remboursement pour l'instant.
        </Text>
      ) : (
        <Stack gap={0}>
          {t.remboursementsRecents.map((r) => (
            <UnstyledButton key={r.id} onClick={() => ouvrir(r.id)} py={10} style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}>
              <Group justify="space-between" wrap="nowrap">
                <div>
                  <Text size="sm" fw={500}>
                    {dateLisible(r.dateVirement)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {r.nbDepenses} dépense{r.nbDepenses > 1 ? "s" : ""}
                  </Text>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Text size="sm" fw={600}>
                    {euros(r.montantVire)}
                  </Text>
                  <Text size="xs" c={r.ecart ? "orange.8" : "dimmed"}>
                    {ecartCourt(r.ecart)}
                  </Text>
                </div>
              </Group>
            </UnstyledButton>
          ))}
        </Stack>
      )}
    </Card>
  );
}

/** Tableau de bord : à rembourser, sans justificatif, dernier remboursement, dépensé dans l'année, catégories, derniers mouvements. */
export function Accueil() {
  const { telephone } = useEcran();
  const naviguer = useNavigate();
  const nouvelle = useNouvelleDepense();
  const { data: foyer } = useQuery({ queryKey: ["foyer"], queryFn: () => lireFoyer() });
  const { data: moyens } = useQuery({ queryKey: ["moyens"], queryFn: () => listeMoyensPaiement() });
  const { data: t } = useQuery({ queryKey: ["tableauDeBord"], queryFn: () => tableauDeBord() });
  const aConfigurer = moyens !== undefined && moyens.length === 0;
  const versDepenses = (statut: "a_rembourser" | "sans_justificatif") => naviguer({ to: "/depenses", search: { statut } });
  const ouvrirDepense = (id: string) => naviguer({ to: "/depenses/$id", params: { id } });
  const ouvrirRemboursement = (id: string) => naviguer({ to: "/remboursements/$id", params: { id } });

  return (
    <Stack p={telephone ? "md" : "xl"} gap="lg" maw={1200}>
      <AvisMiseAJour />
      <Group justify="space-between">
        <div>
          <Title order={2}>{foyer?.nom ? `Pour ${foyer.nom}` : "Tableau de bord"}</Title>
          <Text c="dimmed" size="sm">
            {aujourdhuiLong()}
          </Text>
        </div>
        {peutEcrire() && !telephone && !aConfigurer && (
          <Group gap="xs">
            <Button component={Link} to="/remboursements/nouveau" variant="default">
              Nouveau remboursement
            </Button>
            <Button leftSection={<IconPlus size={16} />} onClick={nouvelle}>
              Nouvelle dépense
            </Button>
          </Group>
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

      {t && telephone && (
        <>
          <Tuile
            accent
            label="À rembourser"
            valeur={euros(t.aRembourser.total)}
            detail={t.aRembourser.nb ? `${t.aRembourser.nb} dépense${t.aRembourser.nb > 1 ? "s" : ""} depuis le ${dateLisible(t.aRembourser.depuis)}` : "Tout est remboursé"}
            onClick={() => versDepenses("a_rembourser")}
          />
          {t.sansJustificatif.nb > 0 && (
            <UnstyledButton onClick={() => versDepenses("sans_justificatif")}>
              <Alert color="orange" variant="light" p="sm" icon={<IconAlertTriangle size={18} />}>
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm">
                    <b>
                      {t.sansJustificatif.nb} dépense{t.sansJustificatif.nb > 1 ? "s" : ""}
                    </b>{" "}
                    sans justificatif
                  </Text>
                  <IconChevronRight size={16} />
                </Group>
              </Alert>
            </UnstyledButton>
          )}
          <DernieresDepenses t={t} ouvrir={ouvrirDepense} />
          <Categories t={t} />
        </>
      )}

      {t && !telephone && (
        <>
          <SimpleGrid cols={{ base: 2, lg: 4 }} spacing="md">
            <Tuile
              accent
              label="À rembourser"
              valeur={euros(t.aRembourser.total)}
              detail={t.aRembourser.nb ? `${t.aRembourser.nb} dépense${t.aRembourser.nb > 1 ? "s" : ""} depuis le ${dateLisible(t.aRembourser.depuis)}` : "Tout est remboursé"}
              onClick={() => versDepenses("a_rembourser")}
            />
            <Tuile
              label="Sans justificatif"
              valeur={t.sansJustificatif.nb}
              alerte={t.sansJustificatif.nb > 0}
              detail={t.sansJustificatif.nb ? `dont ${t.sansJustificatif.aRembourser} à rembourser` : "Toutes les dépenses sont justifiées"}
              onClick={() => versDepenses("sans_justificatif")}
            />
            <Tuile
              label="Dernier remboursement"
              valeur={t.dernierRemboursement ? euros(t.dernierRemboursement.montantVire) : "—"}
              detail={t.dernierRemboursement ? `le ${dateLisible(t.dernierRemboursement.dateVirement)} · ${ecartCourt(t.dernierRemboursement.ecart)}` : "Aucun pour l'instant"}
              onClick={t.dernierRemboursement ? () => ouvrirRemboursement(t.dernierRemboursement!.id) : undefined}
            />
            <Tuile label={`Dépensé en ${t.annee.annee}`} valeur={euros(t.annee.total)} detail={`en moyenne ${euros(t.annee.moyenneMensuelle)} par mois`} />
          </SimpleGrid>
          <Group align="flex-start" gap="lg" wrap="wrap">
            <Box style={{ flex: "3 1 480px", minWidth: 0 }}>
              <DernieresDepenses t={t} ouvrir={ouvrirDepense} />
            </Box>
            <Stack gap="lg" style={{ flex: "2 1 320px", minWidth: 0 }}>
              <Categories t={t} />
              <RemboursementsRecents t={t} ouvrir={ouvrirRemboursement} />
            </Stack>
          </Group>
        </>
      )}
    </Stack>
  );
}
