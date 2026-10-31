import { useState } from "react";
import { ActionIcon, Alert, Box, Button, Checkbox, Chip, Group, Modal, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconPlus, IconX } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { creerDepense, derniereSaisie, libellesFrequents, majDepense, type CategorieDeDepense } from "../data/depenses";
import { creerCategorie, listeCategories, listeMoyensPaiement } from "../data/parametres";
import type { Depense } from "../db/schema";
import type { Absence } from "../lib/absence";
import { aujourdhui } from "../lib/dates";
import { useEcran } from "../lib/ecran";
import type { FichierEnvoye } from "../lib/fichiers";
import { euros, lireMontant } from "../lib/montants";
import { ecrire } from "../lib/query";
import { ChampDate } from "./Champs";
import { BoutonsAjout, envoyerFichiers, Vignette } from "./Justificatifs";
import { ChoixAbsence, absenceValide } from "./ModalAbsence";
import { SuggestionsLibelle } from "./SuggestionsLibelle";

/** La dépense à modifier (absente : nouvelle dépense). */
export type DepenseAModifier = Depense & { categories: CategorieDeDepense[] };

type Saisie = { montant: string; avoir: boolean; date: string | null; libelle: string; categorieIds: string[]; moyenId: string | null; note: string; absence: Absence | null };

const vide = (moyenId: string | null): Saisie => ({ montant: "", avoir: false, date: aujourdhui(), libelle: "", categorieIds: [], moyenId, note: "", absence: null });

/** Montant affiché dans le champ : « 23,40 » (sans signe : l'avoir est une case à part). */
const enTexte = (centimes: number) => (Math.abs(centimes) / 100).toFixed(2).replace(".", ",");

/** Catégorie créée pendant la saisie (même nom = la catégorie existante). */
function NouvelleCategorie({ onCreee }: { onCreee: (id: string) => void }) {
  const [nom, setNom] = useState<string | null>(null);
  if (nom === null)
    return (
      <Chip checked={false} onChange={() => setNom("")} variant="outline" icon={<IconPlus size={12} />}>
        Nouvelle
      </Chip>
    );
  const valider = async () => {
    const id = await ecrire(() => creerCategorie({ nom }));
    if (id) onCreee(id);
    setNom(null);
  };
  return (
    <Group gap={4} wrap="nowrap">
      <TextInput
        size="xs"
        w={140}
        placeholder="Coiffure, taxi…"
        value={nom}
        onChange={(e) => setNom(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), valider())}
        aria-label="Nouvelle catégorie"
        autoFocus
      />
      <Button size="xs" onClick={valider} disabled={!nom.trim()}>
        Créer
      </Button>
      <ActionIcon variant="subtle" color="gray" onClick={() => setNom(null)} aria-label="Annuler">
        <IconX size={14} />
      </ActionIcon>
    </Group>
  );
}

/**
 * Saisie d'une dépense : montant en grand, photo du ticket, libellé, date, catégories et moyen de paiement en puces
 * (le dernier utilisé est proposé). En création, les justificatifs partent avec la dépense ; en modification,
 * ils se gèrent sur la fiche.
 */
export function ModalDepense({ depense, opened, onClose }: { depense: DepenseAModifier | null; opened: boolean; onClose: () => void }) {
  const { telephone } = useEcran();
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: () => listeCategories(), enabled: opened });
  const { data: moyens = [] } = useQuery({ queryKey: ["moyens"], queryFn: () => listeMoyensPaiement(), enabled: opened });
  const { data: derniere } = useQuery({ queryKey: ["derniereSaisie"], queryFn: () => derniereSaisie(), enabled: opened && !depense });
  const { data: libelles = [] } = useQuery({ queryKey: ["libellesFrequents"], queryFn: () => libellesFrequents(), enabled: opened && !depense });
  const [v, setV] = useState<Saisie>(vide(null));
  const [fichiers, setFichiers] = useState<FichierEnvoye[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [cle, setCle] = useState<string | null>(null);

  // À l'ouverture : la dépense à modifier, ou une saisie vierge.
  const ouverture = opened ? (depense?.id ?? "nouvelle") : null;
  if (ouverture !== cle) {
    setCle(ouverture);
    setFichiers([]);
    if (opened)
      setV(
        depense
          ? {
              montant: enTexte(depense.montant),
              avoir: depense.montant < 0,
              date: depense.date,
              libelle: depense.libelle,
              categorieIds: depense.categories.map((c) => c.id),
              moyenId: depense.moyenId,
              note: depense.note ?? "",
              absence: null,
            }
          : vide(null),
      );
  }
  // Moyen proposé : le dernier utilisé, sinon le seul actif.
  const actifs = moyens.filter((m) => !m.archive || m.id === depense?.moyenId);
  const moyenId = v.moyenId ?? derniere?.moyenId ?? (actifs.length === 1 ? actifs[0].id : null);
  const visibles = categories.filter((c) => !c.archivee || v.categorieIds.includes(c.id));

  const centimes = lireMontant(v.montant);
  const montant = centimes === null ? null : v.avoir ? -Math.abs(centimes) : Math.abs(centimes);
  // Absence déclarée seulement sans photo : un justificatif joint l'emporte.
  const absence = fichiers.length ? null : v.absence;
  const valide = !!montant && !!v.date && !!v.libelle.trim() && !!moyenId && (!absence || absenceValide(absence));

  const ajouter = async (f: File[]) => {
    setEnvoi(true);
    try {
      const envoyes = await envoyerFichiers(f);
      setFichiers((d) => [...d, ...envoyes]);
    } finally {
      setEnvoi(false);
    }
  };

  const enregistrer = async (encore: boolean) => {
    if (!valide) return;
    const saisie = { date: v.date!, libelle: v.libelle, montant: montant!, moyenId: moyenId!, note: v.note, categorieIds: v.categorieIds };
    setEnCours(true);
    try {
      const ok = await ecrire<unknown>(() =>
        depense ? majDepense(depense.id, saisie, depense.modifieLe) : creerDepense({ ...saisie, absence, justificatifs: fichiers.map((f) => ({ fichier: f.fichier, nom: f.nom })) }),
      );
      if (ok === undefined) return;
      notifications.show({ color: "green", message: `${v.libelle.trim()} : ${euros(montant)}${fichiers.length ? ` · ${fichiers.length} justificatif${fichiers.length > 1 ? "s" : ""}` : ""}` });
      if (encore) {
        setFichiers([]);
        setV({ ...vide(moyenId), date: v.date });
      } else onClose();
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={depense ? "Modifier la dépense" : "Nouvelle dépense"} size="lg">
      <Stack gap="md">
        <Box ta="center">
          <Group justify="center" gap={6} align="baseline" wrap="nowrap">
            <TextInput
              aria-label="Montant"
              inputMode="decimal"
              placeholder="0,00"
              value={v.montant}
              onChange={(e) => setV({ ...v, montant: e.currentTarget.value })}
              error={v.montant && centimes === null}
              variant="unstyled"
              w={190}
              className="champ-montant"
              styles={{ input: { fontWeight: 700, textAlign: "right", height: 56 } }}
              data-autofocus
            />
            <Text fz={30} fw={600} c="dimmed">
              €
            </Text>
          </Group>
          <Checkbox
            mt={4}
            display="inline-block"
            label="Avoir (retour d'article, montant à déduire)"
            checked={v.avoir}
            onChange={(e) => setV({ ...v, avoir: e.currentTarget.checked })}
          />
        </Box>

        {!depense && (
          <Group gap="xs" align="center">
            {fichiers.map((f) => (
              <Box key={f.fichier} pos="relative">
                <Vignette doc={f} taille={64} />
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
            <BoutonsAjout onFichiers={ajouter} envoi={envoi} taille={telephone ? "md" : "sm"} />
            {fichiers.length === 0 && !v.absence && (
              <Text size="xs" c="dimmed">
                Ticket, facture : plusieurs photos pour un long ticket.
              </Text>
            )}
          </Group>
        )}
        {!depense && fichiers.length === 0 && (
          <Stack gap={6}>
            <Checkbox
              label="Pas de justificatif"
              checked={!!v.absence}
              onChange={(e) => setV({ ...v, absence: e.currentTarget.checked ? { motif: "perdu" } : null })}
            />
            {v.absence && <ChoixAbsence valeur={v.absence} onChange={(a) => setV({ ...v, absence: a })} />}
          </Stack>
        )}

        <Group grow align="flex-start">
          <TextInput label="Libellé" placeholder="Pharmacie du Centre" required value={v.libelle} onChange={(e) => setV({ ...v, libelle: e.currentTarget.value })} style={{ flexGrow: 2 }} />
          <ChampDate label="Date" required value={v.date} onChange={(d) => setV({ ...v, date: d })} />
        </Group>
        {!depense && (
          <SuggestionsLibelle
            libelles={libelles}
            saisie={v.libelle}
            // Les catégories habituelles s'ajoutent à celles déjà cochées.
            choisir={(l) => setV((x) => ({ ...x, libelle: l.libelle, categorieIds: [...new Set([...x.categorieIds, ...l.categorieIds])] }))}
          />
        )}

        <div>
          <Text size="sm" fw={500} mb={6}>
            Catégories
          </Text>
          <Group gap={6}>
            <Chip.Group multiple value={v.categorieIds} onChange={(ids) => setV({ ...v, categorieIds: ids })}>
              {visibles.map((c) => (
                <Chip key={c.id} value={c.id} color={c.couleur} size={telephone ? "md" : "sm"}>
                  {c.nom}
                </Chip>
              ))}
            </Chip.Group>
            <NouvelleCategorie onCreee={(id) => setV((x) => ({ ...x, categorieIds: [...x.categorieIds, id] }))} />
          </Group>
        </div>

        <div>
          <Text size="sm" fw={500} mb={6}>
            Payé avec
          </Text>
          {actifs.length === 0 ? (
            <Alert color="orange" p="xs">
              Aucun moyen de paiement : ajoutez-en dans les paramètres (sur ordinateur).
            </Alert>
          ) : (
            <Chip.Group value={moyenId ?? ""} onChange={(id) => setV({ ...v, moyenId: id })}>
              <Group gap={6}>
                {actifs.map((m) => (
                  <Chip key={m.id} value={m.id} size={telephone ? "md" : "sm"}>
                    {m.libelle}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          )}
        </div>

        <Textarea label="Note" placeholder="Facultatif" autosize minRows={1} value={v.note} onChange={(e) => setV({ ...v, note: e.currentTarget.value })} />

        {/* Saisie à la suite : l'action la plus fréquente est la plus visible ; Annuler, en gris, ferme sans rien enregistrer. */}
        <Stack gap="xs">
          {!depense && (
            <Button size={telephone ? "lg" : "md"} leftSection={<IconPlus size={18} />} onClick={() => enregistrer(true)} disabled={!valide || envoi} loading={enCours}>
              Enregistrer et saisir la suivante
            </Button>
          )}
          <Group grow>
            <Button variant="default" c="dimmed" size={telephone ? "lg" : "md"} onClick={onClose}>
              Annuler
            </Button>
            <Button
              variant={depense ? "filled" : "outline"}
              size={telephone ? "lg" : "md"}
              leftSection={<IconCheck size={18} />}
              onClick={() => enregistrer(false)}
              disabled={!valide || envoi}
              loading={enCours}
            >
              {depense ? "Enregistrer" : "Enregistrer et fermer"}
            </Button>
          </Group>
        </Stack>
      </Stack>
    </Modal>
  );
}
