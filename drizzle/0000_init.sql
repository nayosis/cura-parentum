CREATE TABLE `categorie` (
	`id` text PRIMARY KEY NOT NULL,
	`nom` text NOT NULL,
	`couleur` text DEFAULT 'gray' NOT NULL,
	`archivee` integer DEFAULT false NOT NULL,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL,
	`cree_par` text,
	`modifie_par` text,
	`modifie_le` text
);
--> statement-breakpoint
CREATE TABLE `depense` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`libelle` text NOT NULL,
	`montant` integer NOT NULL,
	`moyen_id` text NOT NULL,
	`note` text,
	`remboursement_id` text,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL,
	`cree_par` text,
	`modifie_par` text,
	`modifie_le` text,
	FOREIGN KEY (`moyen_id`) REFERENCES `moyen_paiement`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`remboursement_id`) REFERENCES `remboursement`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `depense_date_idx` ON `depense` (`date`);--> statement-breakpoint
CREATE INDEX `depense_remboursement_idx` ON `depense` (`remboursement_id`);--> statement-breakpoint
CREATE TABLE `depense_categorie` (
	`depense_id` text NOT NULL,
	`categorie_id` text NOT NULL,
	PRIMARY KEY(`depense_id`, `categorie_id`),
	FOREIGN KEY (`depense_id`) REFERENCES `depense`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`categorie_id`) REFERENCES `categorie`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `depense_categorie_categorie_idx` ON `depense_categorie` (`categorie_id`);--> statement-breakpoint
CREATE TABLE `journal` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quand` text NOT NULL,
	`utilisateur` text NOT NULL,
	`fonction` text NOT NULL,
	`cible` text,
	`resume` text,
	`avant` text,
	`apres` text
);
--> statement-breakpoint
CREATE INDEX `journal_quand_idx` ON `journal` (`quand`);--> statement-breakpoint
CREATE INDEX `journal_utilisateur_idx` ON `journal` (`utilisateur`);--> statement-breakpoint
CREATE INDEX `journal_cible_idx` ON `journal` (`cible`);--> statement-breakpoint
CREATE TABLE `justificatif` (
	`id` text PRIMARY KEY NOT NULL,
	`depense_id` text,
	`remboursement_id` text,
	`nom` text NOT NULL,
	`fichier` text NOT NULL,
	`mime` text NOT NULL,
	`taille` integer NOT NULL,
	`archive` integer DEFAULT false NOT NULL,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL,
	`cree_par` text,
	`modifie_par` text,
	`modifie_le` text,
	FOREIGN KEY (`depense_id`) REFERENCES `depense`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`remboursement_id`) REFERENCES `remboursement`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `justificatif_depense_idx` ON `justificatif` (`depense_id`);--> statement-breakpoint
CREATE INDEX `justificatif_remboursement_idx` ON `justificatif` (`remboursement_id`);--> statement-breakpoint
CREATE TABLE `moyen_paiement` (
	`id` text PRIMARY KEY NOT NULL,
	`libelle` text NOT NULL,
	`type_id` text NOT NULL,
	`archive` integer DEFAULT false NOT NULL,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL,
	`cree_par` text,
	`modifie_par` text,
	`modifie_le` text,
	FOREIGN KEY (`type_id`) REFERENCES `type_paiement`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `parametre` (
	`cle` text PRIMARY KEY NOT NULL,
	`valeur` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `remboursement` (
	`id` text PRIMARY KEY NOT NULL,
	`date_virement` text NOT NULL,
	`debut` text NOT NULL,
	`fin` text NOT NULL,
	`montant_vire` integer NOT NULL,
	`note` text,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL,
	`cree_par` text,
	`modifie_par` text,
	`modifie_le` text
);
--> statement-breakpoint
CREATE INDEX `remboursement_date_idx` ON `remboursement` (`date_virement`);--> statement-breakpoint
CREATE TABLE `type_paiement` (
	`id` text PRIMARY KEY NOT NULL,
	`libelle` text NOT NULL,
	`ordre` integer DEFAULT 0 NOT NULL,
	`cree_le` text DEFAULT (datetime('now')) NOT NULL,
	`cree_par` text,
	`modifie_par` text,
	`modifie_le` text
);
