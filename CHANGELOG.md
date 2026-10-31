# Journal des versions

## v0.4.0 · Justificatif déclaré absent

Pour les dépenses dont le ticket n'existe plus (ou n'a jamais existé), on peut maintenant le dire clairement plutôt que de laisser un trou.

**Nouveau**
- Déclarer un justificatif absent, avec un motif : **Perdu**, **Pas de ticket** (marché, espèces, petit commerçant) ou **Autre** (précision obligatoire).
- Trois façons de le faire :
  - à la saisie : case « Pas de justificatif », tant qu'aucune photo n'est jointe ;
  - sur la fiche d'une dépense : « Le déclarer absent », ou « Retirer la déclaration » ;
  - en lot depuis la liste des dépenses (ordinateur) : cocher les lignes, puis « Déclarer sans justificatif ».
- Un justificatif ajouté plus tard efface la déclaration.

**Changé**
- « Sans justificatif » ne compte plus que les vrais oublis.
- Les absences déclarées sont comptées à part, au tableau de bord et dans le bilan annuel (écran et PDF).
- Dans les listes, un badge gris indique le motif (« Perdu ») à la place du badge orange.
- Dossier PDF d'un remboursement : nouvelle rubrique « Justificatifs absents », avec le motif, qui l'a déclaré et quand. Le CSV du ZIP l'indique aussi.

**Droits**
- Sur une dépense déjà remboursée : admins seulement, comme toute retouche.
- Chaque déclaration est au journal, avec la fiche avant et après.

**Mise à jour**
- La base reçoit une migration (`0002_absence.sql`), appliquée automatiquement au démarrage.
- Une sauvegarde avant la mise à jour reste conseillée.

## v0.3.0 · Suppression d'un remboursement, boutons de saisie revus

**Nouveau**
- Le **super admin** peut supprimer un remboursement pour réparer une erreur de saisie (par exemple une mauvaise année) :
  - ses dépenses repassent « à rembourser » et redeviennent modifiables, dates comprises ;
  - ses justificatifs sont archivés, jamais effacés ;
  - le journal garde la fiche entière d'avant la suppression.
- On refait ensuite un remboursement avec les dépenses corrigées.

**Changé**
- Saisie d'une dépense :
  - « Enregistrer et saisir la suivante » est en premier et en couleur pleine ;
  - viennent ensuite **Annuler** (gris) et « Enregistrer et fermer ».
- Le journal affiche « Remboursement supprimé » et « Libellé renommé ».

## v0.2.0 · Libellés proposés à la saisie

**Nouveau**
- Sous le libellé, les **5 libellés les plus utilisés** sont proposés en pastilles.
- Dès qu'on tape, ne restent que ceux qui contiennent le texte, sans tenir compte des majuscules ni des accents (« hyp » trouve « Hyper U »).
- Choisir un libellé coche aussi les catégories habituelles de ce commerce.
- **Paramètres › Libellés** (admins) :
  - corriger une variante ou une faute (« Delaunay volaille » → « Delaunay Volailler ») sur toutes les dépenses concernées, remboursées comprises ;
  - chaque dépense renommée est au journal.

## v0.1.0 · Première version

Suivi des dépenses faites pour ses parents et des remboursements reçus par virement, avec les justificatifs pour pouvoir rendre des comptes.

**Dépenses**
- Saisie rapide sur téléphone : bouton central, photo du ticket, montant en grand, dernier moyen de paiement proposé, « Et une autre » pour enchaîner.
- Catégories, moyens de paiement et types paramétrables. Les montants négatifs servent aux avoirs.
- Justificatifs : photos (JPEG, PNG) et PDF, plusieurs par dépense. Ils ne sont jamais effacés, seulement retirés et archivés.
- Liste filtrable (période, statut, catégorie, moyen, recherche) et fiche détaillée.

**Remboursements**
- On choisit les dépenses couvertes, on saisit le montant viré, et l'écart s'affiche.
- On peut joindre les justificatifs du virement.
- Une dépense remboursée est verrouillée ; seul un admin peut encore la retoucher, et c'est journalisé.

**Tableau de bord**
- À rembourser, dépenses sans justificatif, dernier remboursement, dépensé dans l'année, répartition par catégorie.

**Exports**
- Dossier PDF par remboursement : récapitulatif, modifications ultérieures, justificatifs en annexe.
- ZIP des justificatifs, avec un CSV des dépenses.
- Bilan annuel en PDF.

**Preuve et comptes**
- Journal avant / après de chaque modification.
- Rôles lecture, écriture et admin. Le rôle lecture consulte les justificatifs et télécharge les dossiers.
- Sauvegardes manuelles et automatiques.
- Sur téléphone, les écrans lourds sont réservés à l'ordinateur : nouveau remboursement, paramètres, bilan, comptes.
