-- Justificatif déclaré absent (ticket perdu, pas de ticket…) : la dépense ne compte plus dans « sans justificatif ».
ALTER TABLE `depense` ADD `absence` text;
--> statement-breakpoint
ALTER TABLE `depense` ADD `absence_detail` text;
--> statement-breakpoint
ALTER TABLE `depense` ADD `absence_par` text;
--> statement-breakpoint
ALTER TABLE `depense` ADD `absence_le` text;
