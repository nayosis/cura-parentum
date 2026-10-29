<p align="center">
  <img src="public/icone.svg" alt="" width="96" height="96">
</p>

<h1 align="center">Cura Parentum</h1>

<p align="center">
  <em>Le soin des parents</em> — logiciel libre de suivi des dépenses faites pour ses parents, justificatifs à l'appui.
</p>

On fait les courses de ses parents, on passe à la pharmacie, on commande un coussin sur internet, on paie avec sa
propre carte ; puis, chaque mois, on se rembourse par un virement depuis leur compte. Le jour où quelqu'un demande à
quoi a servi cet argent, Cura Parentum a gardé chaque dépense, avec le ticket ou la facture.

## Ce qu'on y trouve

- **Dépenses** : date, libellé, montant (négatif pour un avoir), catégories, moyen de paiement, note, et leurs
  justificatifs (photo du ticket, facture PDF). Saisie rapide depuis le téléphone, photo comprise.
- **Remboursements** : le virement que l'on se fait, avec les dépenses qu'il couvre, le montant viré et l'écart.
- **Justifier** : dossier PDF par remboursement (justificatifs en annexe), ZIP des justificatifs, bilan annuel.
- **Journal** : chaque modification, avant et après, par qui et quand.
- **Comptes** : admin, écriture, et lecture pour la famille qui consulte ; invitation par lien.
- **Sauvegardes** : une sauvegarde complète chaque nuit sur le serveur, téléchargeable et restaurable en un clic.

## Installer (Docker)

```bash
mkdir cura-parentum && cd cura-parentum
curl -O https://raw.githubusercontent.com/nayosis/cura-parentum/main/docker-compose.yml
docker compose up -d
```

Puis ouvrir `http://<serveur>:3000` : le premier compte créé est l'administrateur principal. Réglages facultatifs : voir
[.env.exemple](.env.exemple) ; derrière un reverse proxy HTTPS, voir [docker/nginx-exemple.conf](docker/nginx-exemple.conf).
Les sauvegardes de la nuit restent sur le même disque que les données : recopier le dossier `data/` ailleurs avec les
sauvegardes habituelles du serveur.

## Développement

```bash
bun install
cp .env.exemple .env      # puis choisir le super admin de développement
bun run dev               # interface : http://localhost:5183 (API sur le port 3220)
bun test
bun run type-check
bun run db:generate       # après modification de src/db/schema.ts → nouvelle migration dans drizzle/
```

Bun + Elysia + SQLite (Drizzle) côté serveur, React + Mantine côté interface, socle repris de
[Custos Domus](https://github.com/nayosis/custos-domus). Le navigateur appelle les fonctions de `src/data/` par leur nom
(`POST /api/rpc/:fonction`) ; le plugin Vite les remplace par des appels réseau. Conception détaillée :
[docs/conception.md](docs/conception.md).

## Licence

[AGPL-3.0-or-later](LICENSE).
