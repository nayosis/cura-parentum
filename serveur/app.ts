import { Elysia, t } from "elysia";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { DOSSIER_CLIENT, VERSION } from "./config";
import { exiger, routesAuth } from "./auth";
import { ErreurMetier } from "./erreurs";
import { cheminFichier } from "./fichiers";
import { executerRpc, FONCTIONS } from "./rpc";
import { fluxSauvegarde, manifeste, nomSauvegarde, restaurer, tailleDonnees } from "./sauvegarde";
import { baseCourante } from "./base";
import { diffuser, fluxEvenements } from "./evenements";
import { cibleDesArguments, instantane, journaliser, lireJournal } from "./journal";
import { etatMiseAJour } from "./miseAJour";
import { bilanPdf, dossierRemboursement, zipRemboursement } from "./exports";
import { cheminSauvegarde, etatSauvegardeAuto, listeSauvegardes, nomSauvegardeValide, sauvegardeDeNuit } from "./sauvegardeAuto";
import { SAUVEGARDES_CONSERVEES } from "./config";
import { contexteRequete } from "./tracabilite";
import { Conflit } from "../src/lib/conflit";

export { ErreurMetier };

/**
 * Fichiers acceptés : justificatifs PDF et photos. Pas de HEIC : le téléphone envoie du JPEG
 * (iOS convertit de lui-même quand le champ n'accepte pas image/heic), lisible partout et dans les PDF.
 */
const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const TAILLE_MAX_FICHIER = 50 * 1024 * 1024;

/** Fichier à télécharger (jamais mis en cache : il reflète l'état du moment). */
const telechargement = ({ octets, nom }: { octets: Uint8Array; nom: string }, type: string) =>
  new Response(new Blob([octets as Uint8Array<ArrayBuffer>]), {
    headers: { "content-type": type, "content-disposition": `attachment; filename="${nom}"`, "cache-control": "no-store" },
  });

export function creerApp() {
  return (
    // Restauration : une sauvegarde complète (base + images) peut peser lourd.
    new Elysia({ serve: { maxRequestBodySize: 4 * 1024 ** 3 } })
      .onError(({ code, error, set }) => {
        if (error instanceof ErreurMetier) {
          set.status = error.statut;
          return { erreur: error.message, details: error.details };
        }
        if (error instanceof Conflit) {
          set.status = 409;
          return { erreur: error.message, details: { par: error.par, le: error.le } };
        }
        if (code === "VALIDATION") {
          set.status = 422;
          return { erreur: "Requête invalide" };
        }
        if (code === "NOT_FOUND") {
          set.status = 404;
          return { erreur: "Introuvable" };
        }
        const message = error instanceof Error ? error.message : String(error);
        console.error(error);
        set.status = 500;
        return { erreur: message };
      })

      // --- Santé (contrôle Docker) : ne révèle rien
      .get("/api/sante", () => ({ ok: true, version: VERSION }))

      // --- Connexion, liens, comptes ; utilisateur de la session pour toutes les routes suivantes
      .use(routesAuth)

      // --- Nouvelle version disponible ? (compte connecté)
      .get("/api/mise-a-jour", ({ utilisateur }) => {
        exiger(utilisateur, "lecture");
        return etatMiseAJour();
      })

      // --- Fonctions métier : lectures pour tout compte connecté, écritures pour le rôle écriture ; seules les écritures sont journalisées
      .post(
        "/api/rpc/:nom",
        async ({ params, body, utilisateur, request }) => {
          const f = FONCTIONS.get(params.nom);
          const u = exiger(utilisateur, "lecture");
          if (!f) throw new ErreurMetier(`Fonction inconnue : ${params.nom}`, 404);
          if (f.droit === "ecriture") exiger(u, "ecriture");
          // Identifiant de l'onglet appelant : il ne se recharge pas pour ses propres écritures.
          const client = request.headers.get("x-client") ?? undefined;
          // La fiche visée, telle qu'elle était avant l'écriture (pour le journal).
          const cible = f.droit === "ecriture" ? cibleDesArguments(body.args) : null;
          const avant = cible ? instantane(cible) : null;
          const admin = u.super || u.role === "admin";
          const resultat = await contexteRequete.run({ utilisateur: u.email, admin, client }, () => executerRpc(params.nom, body.args));
          if (f.droit === "ecriture") {
            journaliser(u.email, params.nom, body.args, resultat, avant);
            diffuser({ type: "modification", par: u.email, fonction: params.nom, client });
          }
          return { resultat };
        },
        { body: t.Object({ args: t.Array(t.Unknown()) }) },
      )

      // --- Fichiers (envoyés ici, puis rattachés par la fonction RPC qui crée le justificatif)
      .post(
        "/api/fichiers",
        async ({ body, utilisateur }) => {
          exiger(utilisateur, "ecriture");
          const fichier = body.fichier;
          const ext = EXTENSIONS[fichier.type];
          if (!ext) throw new ErreurMetier("Seuls les PDF et les images (jpg, png, webp, gif) sont acceptés. Une photo HEIC doit être envoyée en JPEG.");
          if (fichier.size > TAILLE_MAX_FICHIER) throw new ErreurMetier("Fichier trop lourd (50 Mo au plus).");
          const nom = `${crypto.randomUUID()}.${ext}`;
          await Bun.write(cheminFichier(nom), fichier);
          return { fichier: nom, mime: fichier.type, taille: fichier.size, nom: fichier.name };
        },
        { body: t.Object({ fichier: t.File() }) },
      )
      .get("/api/fichiers/:nom", ({ params, set, utilisateur }) => {
        exiger(utilisateur, "lecture");
        const chemin = cheminFichier(params.nom);
        if (!existsSync(chemin)) throw new ErreurMetier("Fichier introuvable", 404);
        // Les fichiers ne changent jamais (nom unique) : cache long, mais privé.
        set.headers["cache-control"] = "private, max-age=31536000, immutable";
        return Bun.file(chemin);
      })

      // --- Mise à jour en direct et journal des modifications
      .get("/api/evenements", ({ utilisateur, request }) => {
        exiger(utilisateur, "lecture");
        return new Response(fluxEvenements(request.signal), {
          headers: { "content-type": "text/event-stream", "cache-control": "no-cache", "x-accel-buffering": "no" },
        });
      })
      .get(
        "/api/journal",
        ({ utilisateur, query }) => {
          exiger(utilisateur, "admin");
          return {
            lignes: lireJournal({ utilisateur: query.utilisateur, depuis: query.depuis, avant: query.avant ? Number(query.avant) : undefined, cible: query.cible }),
          };
        },
        { query: t.Object({ utilisateur: t.Optional(t.String()), depuis: t.Optional(t.String()), avant: t.Optional(t.String()), cible: t.Optional(t.String()) }) },
      )

      // --- Exports pour justifier (rôle lecture compris) : dossier PDF et ZIP d'un remboursement, bilan annuel
      .get("/api/exports/remboursements/:id/dossier", async ({ params, utilisateur }) => {
        const u = exiger(utilisateur, "lecture");
        return telechargement(await dossierRemboursement(params.id, u.email), "application/pdf");
      })
      .get("/api/exports/remboursements/:id/justificatifs", async ({ params, utilisateur }) => {
        const u = exiger(utilisateur, "lecture");
        return telechargement(await zipRemboursement(params.id, u.email), "application/zip");
      })
      .get("/api/exports/bilan/:annee", async ({ params, utilisateur }) => {
        const u = exiger(utilisateur, "lecture");
        return telechargement(await bilanPdf(Number(params.annee), u.email), "application/pdf");
      })

      // --- Sauvegardes : téléchargement (admins), restauration (super admin)
      .get("/api/sauvegarde/infos", ({ utilisateur }) => {
        exiger(utilisateur, "admin");
        return { compteurs: manifeste(baseCourante(), "infos").compteurs, taille: tailleDonnees() };
      })
      .get("/api/sauvegarde", ({ utilisateur }) => {
        exiger(utilisateur, "admin");
        return new Response(fluxSauvegarde(), {
          headers: {
            "content-type": "application/zip",
            "content-disposition": `attachment; filename="${nomSauvegarde()}"`,
            "cache-control": "no-store",
          },
        });
      })
      // Sauvegardes automatiques (dossier data/sauvegardes) : liste, téléchargement, sauvegarde immédiate
      .get("/api/sauvegarde/automatiques", ({ utilisateur }) => {
        exiger(utilisateur, "admin");
        return { sauvegardes: listeSauvegardes(), derniere: etatSauvegardeAuto(), conservees: SAUVEGARDES_CONSERVEES };
      })
      .post("/api/sauvegarde/automatiques", async ({ utilisateur }) => {
        exiger(utilisateur, "admin");
        const e = await sauvegardeDeNuit(new Date(), "manuelle");
        if (e.erreur) throw new ErreurMetier(e.erreur, 500);
        return { nom: e.nom, taille: e.taille };
      })
      .get("/api/sauvegarde/automatiques/:nom", ({ utilisateur, params }) => {
        exiger(utilisateur, "admin");
        if (!nomSauvegardeValide(params.nom) || !existsSync(cheminSauvegarde(params.nom))) throw new ErreurMetier("Sauvegarde introuvable", 404);
        return new Response(Bun.file(cheminSauvegarde(params.nom)), {
          headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${params.nom}"`, "cache-control": "no-store" },
        });
      })
      .post("/api/sauvegarde/automatiques/:nom/restaurer", async ({ utilisateur, params }) => {
        const u = exiger(utilisateur, "admin");
        if (!u.super) throw new ErreurMetier("Seul le super admin peut restaurer une sauvegarde.", 403);
        if (!nomSauvegardeValide(params.nom) || !existsSync(cheminSauvegarde(params.nom))) throw new ErreurMetier("Sauvegarde introuvable", 404);
        try {
          const r = await restaurer(Bun.file(cheminSauvegarde(params.nom)));
          diffuser({ type: "restauration", par: u.email });
          return r;
        } catch (e) {
          throw new ErreurMetier((e as Error).message);
        }
      })
      .post(
        "/api/sauvegarde/restaurer",
        async ({ utilisateur, body }) => {
          const u = exiger(utilisateur, "admin");
          if (!u.super) throw new ErreurMetier("Seul le super admin peut restaurer une sauvegarde.", 403);
          try {
            const r = await restaurer(body.fichier);
            diffuser({ type: "restauration", par: u.email });
            return r;
          } catch (e) {
            throw new ErreurMetier((e as Error).message);
          }
        },
        { body: t.Object({ fichier: t.File() }) },
      )

      // --- Front compilé (production) : fichiers, sinon index.html pour le routeur
      .get("/*", ({ path, set }) => {
        if (path.startsWith("/api/")) throw new ErreurMetier("Introuvable", 404);
        const fichier = normalize(join(DOSSIER_CLIENT, decodeURIComponent(path)));
        if (fichier.startsWith(DOSSIER_CLIENT) && extname(fichier) && existsSync(fichier)) {
          if (path.startsWith("/assets/")) set.headers["cache-control"] = "public, max-age=31536000, immutable";
          return Bun.file(fichier);
        }
        const index = join(DOSSIER_CLIENT, "index.html");
        if (!existsSync(index)) throw new ErreurMetier("Front non compilé (bun run build)", 404);
        set.headers["cache-control"] = "no-cache";
        return Bun.file(index);
      })
  );
}
