# Conception

Décisions prises au cadrage (29 octobre 2026). Même socle technique que Custos Domus (Bun, Elysia, SQLite, Drizzle,
React, Mantine, TanStack), repris de son dépôt ; patte graphique prune sur fonds crème, pour ne pas confondre les deux
applications. Maquettes : https://claude.ai/artifact/J4q8hoFqLLvwTQuKzbTJUT (privées).

## Le besoin

Une personne s'occupe de ses parents âgés : courses, achats en ligne, pharmacie, rendez-vous. Elle paie avec ses propres
moyens de paiement puis, chaque mois, se rembourse par un virement depuis le compte des parents (elle a la procuration).
Elle veut tracer chaque dépense avec son justificatif pour pouvoir, en cas de problème (famille, notaire, juge des
tutelles), justifier chaque mouvement d'argent sorti du compte des parents.

## Modèle

```
Dépense ─┬─ Moyen de paiement ── Type de paiement
         ├─ Catégories (0..n)
         ├─ Justificatifs (0..n : photo JPEG, image, PDF)
         └─ Remboursement (0..1) ── Justificatifs (relevé du virement…)
```

- **Un seul foyer** : toute l'application concerne un foyer (« Jeanne & Robert »). Pas de notion de bénéficiaire, ni
  de dépense rattachée à l'un des deux parents. Nom du foyer et compte débité : table `parametre`.
- **Dépense** : date, libellé, montant, catégories (facultatives), moyen de paiement, justificatifs, note.
  - **Montants en centimes** (entiers), partout. Un **montant négatif est un avoir** (retour d'article, remboursement
    de mutuelle perçu par l'aidant) : il vient en déduction du remboursement qui le coche.
  - **Sans justificatif** : permise (marché, pourboire, ticket perdu), mais signalée (badge, compteur au tableau de bord).
    Le justificatif peut être ajouté plus tard.
- **Moyen de paiement** : libellé (« CB Patrick », « Chéquier Roger », « Espèces ») et type. **Tous appartiennent à
  l'aidant** : toute dépense est à rembourser. Un moyen déjà utilisé ne se supprime pas, il s'archive (il disparaît de
  la saisie).
- **Types de paiement** : paramétrables ; Carte bancaire, Chèque, Espèces, Virement au départ (migration 0001).
- **Catégories** : liste des paramètres (couleur), dix courantes au départ (migration 0001). On peut en **créer une
  pendant la saisie** (même nom = la même) ; les paramètres permettent de la renommer, l'archiver ou la **fusionner**
  dans une autre.
- **Remboursement** : date du virement, plage (début, fin), dépenses cochées, montant viré, justificatifs, note.

## Règles du remboursement

- La plage **propose** les dépenses non remboursées de la période, toutes cochées ; on décoche ce qui n'est pas
  remboursé. Les dépenses **non remboursées d'avant la plage** (oubliées, saisies en retard) sont proposées à part.
  Ce sont les dépenses cochées qui comptent (`depense.remboursement_id`), pas la plage.
- On saisit le **montant viré** ; l'application affiche le total coché et **l'écart**. L'écart est seulement affiché
  (avec une note conseillée), **jamais reporté** sur le remboursement suivant.
- Une fois validé, les dépenses cochées sont **remboursées et verrouillées** : seul un admin peut encore les modifier
  (et c'est journalisé).
- **Pas d'annulation** d'un remboursement validé en V1 : écran de confirmation clair avant de valider.
- Création réservée à l'ordinateur ou à la tablette (il faut voir toute la liste).

## Justificatifs

- PDF et images (JPEG, PNG, WebP, GIF), 50 Mo au plus. **Pas de HEIC** : le champ d'envoi n'accepte pas `image/heic`,
  et iOS convertit alors de lui-même la photo en JPEG ; le serveur refuse le HEIC. Le JPEG se lit partout et s'insère
  dans les dossiers PDF.
- Un **ticket trop long** se photographie en plusieurs fois : plusieurs justificatifs, pas d'assemblage.
- **Jamais effacés** : retirer un justificatif l'archive (`justificatif.archive`) ; il reste consultable depuis le
  journal. Les fichiers envoyés mais jamais rattachés sont effacés au bout de 7 jours (sauvegarde de la nuit).

## Journal (preuve)

Décision : **très important**. Chaque création, modification ou suppression (dépense, justificatif, remboursement,
paramètres) est journalisée : qui, quand, quelle fonction, et **la fiche entière avant et après** (colonnes `avant`
et `apres` de `journal`, JSON). Le journal n'est ni modifiable ni effaçable depuis l'application. Une dépense remboursée
modifiée par un admin : l'historique de ses modifications figure en annexe du dossier PDF du remboursement.

## Exports

- **Dossier PDF par remboursement** : récapitulatif du virement (date, plage, montant viré, total, écart, note), tableau
  des dépenses, puis chaque justificatif en annexe. Le document à remettre à un tiers.
- **ZIP des justificatifs** : un CSV des dépenses et les fichiers renommés (`2026-10-03_Pharmacie_23,40.pdf`).
- **Bilan annuel** (PDF) : totaux par catégorie, par mois et par moyen de paiement, et écart cumulé des remboursements
  de l'année.

## Comptes

- Rôles globaux **lecture**, **écriture**, **admin** ; super admin défini dans `.env` ou créé au premier lancement ;
  invitations et réinitialisations par lien à usage unique (comme Custos Domus).
- **Lecture** (un frère, une sœur, un tuteur) : voit tout, **justificatifs et notes compris**, et **télécharge les
  dossiers PDF** ; ne modifie rien. Pas d'accès au journal ni aux comptes (admins).
- Un admin (non super) attribue lecture ou écriture ; seul le super admin nomme des admins.

## Téléphone et ordinateur

Seuils de Custos : téléphone < 768 px ≤ tablette < 1200 px ≤ ordinateur. Le téléphone est surtout un **terminal de
saisie**.

- Sur téléphone : **saisie rapide** (bouton central, photo directe, montant en grand, dernier moyen de paiement
  proposé), liste et fiche des dépenses (corriger, ajouter un justificatif), **remboursements en lecture**, tableau de
  bord.
- Réservés à l'ordinateur ou à la tablette (page « Cette page s'utilise sur un ordinateur ») : nouveau remboursement,
  paramètres, bilan annuel, exports, comptes, journal, sauvegarde.
- **Pas de saisie hors ligne** en V1 : on photographie le ticket et on saisit plus tard.

## Hors V1

Rappels (e-mail, notification, agenda) : retirés du socle Custos. Saisie hors ligne. Annulation d'un remboursement.
Report automatique de l'écart. OCR des tickets.

## Plan de la V1

1. Socle (fait) : infrastructure reprise de Custos Domus (comptes, sauvegarde, journal, mise à jour), rôle lecture,
   schéma V1 et valeurs de départ, thème prune, page Paramètres (foyer, moyens et types de paiement, catégories).
2. Dépenses et justificatifs (fait) : liste (filtres dans l'adresse : mois, statut, catégorie, moyen, recherche), fiche,
   saisie rapide (bouton « + » du téléphone, photo directe, dernier moyen de paiement proposé, « Et une autre »),
   avoirs, catégorie créée à la volée, verrouillage des dépenses remboursées (un justificatif peut toujours s'y
   ajouter) ; supprimer une dépense détache et archive ses justificatifs ; journal avant / après, historique de la
   dépense sur sa fiche (admins).
3. Remboursements : sélection des dépenses (plage + oubliées), montant viré et écart, justificatifs, liste et détail
   (lecture sur téléphone).
4. Tableau de bord : à rembourser, sans justificatif, dernier remboursement, dépensé dans l'année, par catégorie.
5. Exports : dossier PDF par remboursement (avec annexes et historique), ZIP des justificatifs, bilan annuel.
6. Publication : dépôt `nayosis/cura-parentum`, image ghcr.io, déploiement personnel sur `parentum.gouadon.fr`.
