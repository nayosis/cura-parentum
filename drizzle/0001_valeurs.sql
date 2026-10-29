-- Valeurs de départ : types de paiement et catégories courantes (modifiables dans les paramètres).
INSERT INTO type_paiement (id, libelle, ordre) VALUES ('5ebd1cef-f272-4edc-bcfe-48bd8bd7f0f6', 'Carte bancaire', 1);
--> statement-breakpoint
INSERT INTO type_paiement (id, libelle, ordre) VALUES ('b9380da5-fb1f-466d-b1c7-3424c4725f0f', 'Chèque', 2);
--> statement-breakpoint
INSERT INTO type_paiement (id, libelle, ordre) VALUES ('e70767ba-3bcc-444d-86a7-ca486f4582af', 'Espèces', 3);
--> statement-breakpoint
INSERT INTO type_paiement (id, libelle, ordre) VALUES ('da7a45cc-0505-4732-9b17-0c5f906776fb', 'Virement', 4);
--> statement-breakpoint
INSERT INTO categorie (id, nom, couleur) VALUES ('67439f66-e995-4e46-9288-bdb954d131f2', 'Courses', 'green');
--> statement-breakpoint
INSERT INTO categorie (id, nom, couleur) VALUES ('9c7d4704-3397-4b6d-9641-1f6884bfe82f', 'Pharmacie', 'blue');
--> statement-breakpoint
INSERT INTO categorie (id, nom, couleur) VALUES ('3ec122d1-af4b-40af-aaee-edbebf2c4606', 'Médecin', 'violet');
--> statement-breakpoint
INSERT INTO categorie (id, nom, couleur) VALUES ('5ad7a0f1-d57a-46fb-92e2-437aa5579b7b', 'Santé', 'pink');
--> statement-breakpoint
INSERT INTO categorie (id, nom, couleur) VALUES ('3a9a98c5-1005-457a-a543-131ec939ab19', 'Maison', 'orange');
--> statement-breakpoint
INSERT INTO categorie (id, nom, couleur) VALUES ('f2b71466-82a5-48a8-a7f8-54b0eb12d551', 'Soins', 'teal');
--> statement-breakpoint
INSERT INTO categorie (id, nom, couleur) VALUES ('74f99293-e24b-4de2-9466-d821c183883e', 'Vêtements', 'grape');
--> statement-breakpoint
INSERT INTO categorie (id, nom, couleur) VALUES ('5bf535bc-ff4c-45fa-94c8-153c1b315e72', 'Transport', 'cyan');
--> statement-breakpoint
INSERT INTO categorie (id, nom, couleur) VALUES ('871bc377-1136-4ee8-bc5d-f120f75100dd', 'Loisirs', 'yellow');
--> statement-breakpoint
INSERT INTO categorie (id, nom, couleur) VALUES ('3bafe2f2-217e-447c-8ed6-05c50051256c', 'Administratif', 'gray');
