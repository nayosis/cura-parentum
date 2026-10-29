import { useState, type DragEvent } from "react";
import { ActionIcon, Anchor, Badge, Box, Button, Card, FileButton, Group, Image, Menu, Modal, Stack, Switch, Text, TextInput, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconArchive, IconCamera, IconDots, IconDownload, IconExternalLink, IconFileText, IconPaperclip, IconPencil, IconPhoto, IconUpload } from "@tabler/icons-react";
import { ajouterJustificatifs, renommerJustificatif, retirerJustificatif } from "../data/depenses";
import type { Justificatif } from "../db/schema";
import { tailleLisible } from "../lib/documents";
import { useEcran } from "../lib/ecran";
import { envoyerFichier, type FichierEnvoye, urlFichier } from "../lib/fichiers";
import { ecrire } from "../lib/query";

/** Ce que le serveur accepte. Sans image/heic, l'iPhone envoie ses photos en JPEG. */
export const ACCEPTE = "application/pdf,image/jpeg,image/png,image/webp,image/gif";

/** Envoie des fichiers un par un ; les échecs sont signalés, les réussites renvoyées. */
export async function envoyerFichiers(fichiers: File[]): Promise<FichierEnvoye[]> {
  const envoyes: FichierEnvoye[] = [];
  for (const f of fichiers) {
    try {
      if (/heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name)) throw new Error("Photo HEIC : réglez l'appareil photo sur « Le plus compatible » (JPEG), ou prenez la photo depuis l'application.");
      envoyes.push(await envoyerFichier(f));
    } catch (err) {
      notifications.show({ color: "red", title: f.name, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return envoyes;
}

/** Boutons d'ajout : photo (téléphone, appareil photo direct) et fichiers (PDF, images). */
export function BoutonsAjout({ onFichiers, envoi, taille = "xs" }: { onFichiers: (f: File[]) => void; envoi: boolean; taille?: "xs" | "sm" | "md" }) {
  const { tactile } = useEcran();
  return (
    <Group gap="xs">
      {tactile && (
        <FileButton onChange={(f) => f && onFichiers([f])} accept="image/jpeg,image/png" capture="environment">
          {(props) => (
            <Button {...props} size={taille} leftSection={<IconCamera size={16} />} disabled={envoi}>
              Photo
            </Button>
          )}
        </FileButton>
      )}
      <FileButton onChange={onFichiers} accept={ACCEPTE} multiple>
        {(props) => (
          <Button {...props} size={taille} variant={tactile ? "default" : "filled"} leftSection={<IconUpload size={16} />} loading={envoi}>
            {tactile ? "Fichier" : "Ajouter"}
          </Button>
        )}
      </FileButton>
    </Group>
  );
}

/** Aperçu d'un justificatif : image, PDF (sur ordinateur), sinon ouverture ou téléchargement. */
export function Apercu({ doc, onClose }: { doc: Pick<Justificatif, "nom" | "fichier" | "mime"> | null; onClose: () => void }) {
  // Les navigateurs des téléphones n'affichent pas un PDF dans une page : on l'ouvre dans sa propre visionneuse.
  const { tactile } = useEcran();
  return (
    <Modal opened={!!doc} onClose={onClose} title={doc?.nom} size="xl">
      {doc && (
        <Stack>
          {doc.mime === "application/pdf" && tactile ? (
            <Text c="dimmed">Ouvrez le PDF pour le lire.</Text>
          ) : doc.mime === "application/pdf" ? (
            <iframe src={urlFichier(doc.fichier)} title={doc.nom} style={{ width: "100%", height: "75dvh", border: 0, borderRadius: 6 }} />
          ) : (
            <Image src={urlFichier(doc.fichier)} alt={doc.nom} fit="contain" mah="75dvh" radius="sm" />
          )}
          <Group justify="flex-end">
            <Button variant="default" component="a" href={urlFichier(doc.fichier)} target="_blank" rel="noopener" leftSection={<IconExternalLink size={16} />}>
              {doc.mime === "application/pdf" && tactile ? "Ouvrir le PDF" : "Ouvrir dans un onglet"}
            </Button>
            <Button component="a" href={urlFichier(doc.fichier)} download={doc.nom} leftSection={<IconDownload size={16} />}>
              Télécharger
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

/** Vignette : la photo elle-même, ou une icône pour un PDF. */
export function Vignette({ doc, taille = 64 }: { doc: Pick<Justificatif, "nom" | "fichier" | "mime">; taille?: number }) {
  if (doc.mime.startsWith("image/")) return <Image src={urlFichier(doc.fichier)} alt="" w={taille} h={taille} radius="sm" fit="cover" style={{ flexShrink: 0 }} />;
  return (
    <Box w={taille} h={taille} bg="var(--t-fond-accent)" style={{ borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <IconFileText size={taille / 2.2} color="var(--mantine-color-prune-6)" />
    </Box>
  );
}

function renommer(doc: Justificatif) {
  let nom = doc.nom;
  modals.openConfirmModal({
    title: "Renommer le justificatif",
    children: <TextInput label="Nom" defaultValue={doc.nom} onChange={(e) => (nom = e.currentTarget.value)} data-autofocus />,
    labels: { confirm: "Enregistrer", cancel: "Annuler" },
    onConfirm: () => ecrire(() => renommerJustificatif(doc.id, nom)),
  });
}

function retirer(doc: Justificatif) {
  modals.openConfirmModal({
    title: `Retirer « ${doc.nom} » ?`,
    children: (
      <Text size="sm">
        Il n'est pas effacé : il reste visible ici (« Afficher les retirés ») et dans le journal, pour la preuve.
      </Text>
    ),
    labels: { confirm: "Retirer", cancel: "Annuler" },
    onConfirm: () => ecrire(() => retirerJustificatif(doc.id)),
  });
}

/**
 * Justificatifs d'une dépense (ou d'un remboursement) : vignettes, aperçu, ajout par bouton, glisser-déposer ou photo.
 * `modifiable` : retirer et renommer (une dépense remboursée ne l'est plus, sauf pour un admin) ; `ajout` : ajouter.
 */
export function Justificatifs({ cible, justificatifs, ajout, modifiable }: { cible: string; justificatifs: Justificatif[]; ajout: boolean; modifiable: boolean }) {
  const [envoi, setEnvoi] = useState(false);
  const [survol, setSurvol] = useState(false);
  const [apercu, setApercu] = useState<Justificatif | null>(null);
  const [retires, setRetires] = useState(false);
  const actifs = justificatifs.filter((j) => !j.archive);
  const affiches = retires ? justificatifs : actifs;
  const nbRetires = justificatifs.length - actifs.length;

  const envoyer = async (fichiers: File[]) => {
    if (!fichiers.length || !ajout) return;
    setEnvoi(true);
    try {
      const envoyes = await envoyerFichiers(fichiers);
      if (envoyes.length) await ecrire(() => ajouterJustificatifs(cible, envoyes.map((e) => ({ fichier: e.fichier, nom: e.nom }))));
    } finally {
      setEnvoi(false);
    }
  };
  const deposer = (e: DragEvent) => {
    e.preventDefault();
    setSurvol(false);
    envoyer([...e.dataTransfer.files]);
  };

  return (
    <Card
      withBorder
      onDragOver={(e) => {
        e.preventDefault();
        if (ajout) setSurvol(true);
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={deposer}
      style={survol ? { borderColor: "var(--mantine-color-prune-5)", background: "var(--t-fond-accent)" } : undefined}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconPaperclip size={18} />
          <Title order={4}>Justificatifs</Title>
          {actifs.length > 0 && (
            <Badge variant="light" color="gray">
              {actifs.length}
            </Badge>
          )}
        </Group>
        {ajout && <BoutonsAjout onFichiers={envoyer} envoi={envoi} />}
      </Group>

      {affiches.length === 0 ? (
        <Text size="sm" c="dimmed" py="md" ta="center">
          Aucun justificatif. {ajout && "Photographiez le ticket, ou ajoutez la facture (PDF, image)."}
        </Text>
      ) : (
        <Stack gap={0}>
          {affiches.map((j) => (
            <Group key={j.id} gap="sm" wrap="nowrap" py={8} style={{ borderTop: "1px solid var(--mantine-color-default-border)", opacity: j.archive ? 0.55 : 1 }}>
              <Anchor component="button" type="button" onClick={() => setApercu(j)} aria-label={`Voir ${j.nom}`}>
                <Vignette doc={j} taille={56} />
              </Anchor>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Anchor component="button" type="button" onClick={() => setApercu(j)} fw={500} size="sm" c="inherit" style={{ textAlign: "left", maxWidth: "100%" }} truncate>
                  {j.nom}
                </Anchor>
                <Text size="xs" c="dimmed">
                  {j.mime.startsWith("image/") ? <IconPhoto size={11} /> : <IconFileText size={11} />} {tailleLisible(j.taille)}
                  {j.archive && " · retiré"}
                </Text>
              </Box>
              <Menu position="bottom-end">
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" aria-label={`Actions sur ${j.nom}`}>
                    <IconDots size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconDownload size={14} />} component="a" href={urlFichier(j.fichier)} download={j.nom}>
                    Télécharger
                  </Menu.Item>
                  {modifiable && !j.archive && (
                    <>
                      <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => renommer(j)}>
                        Renommer
                      </Menu.Item>
                      <Menu.Item leftSection={<IconArchive size={14} />} onClick={() => retirer(j)}>
                        Retirer
                      </Menu.Item>
                    </>
                  )}
                </Menu.Dropdown>
              </Menu>
            </Group>
          ))}
        </Stack>
      )}
      {nbRetires > 0 && <Switch mt="sm" size="xs" label={`Afficher les retirés (${nbRetires})`} checked={retires} onChange={(e) => setRetires(e.currentTarget.checked)} />}
      <Apercu doc={apercu} onClose={() => setApercu(null)} />
    </Card>
  );
}
