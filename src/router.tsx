import { Outlet, createRootRoute, createRoute, createRouter, createBrowserHistory, redirect } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Layout } from "./components/Layout";
import { FournisseurSaisie } from "./lib/saisie";
import { SurOrdinateur } from "./components/SurOrdinateur";
import { Accueil } from "./pages/Accueil";
import { Depenses } from "./pages/Depenses";
import { FicheDepense } from "./pages/FicheDepense";
import { FicheRemboursement } from "./pages/FicheRemboursement";
import { NouveauRemboursement } from "./pages/NouveauRemboursement";
import { Parametres } from "./pages/Parametres";
import { Remboursements } from "./pages/Remboursements";
import { Sauvegarde } from "./pages/Sauvegarde";
import { Connexion } from "./pages/compte/Connexion";
import { Lien } from "./pages/compte/Lien";
import { Comptes } from "./pages/compte/Comptes";
import { Journal } from "./pages/compte/Journal";
import { estAdmin, peutEcrire, utilisateur } from "./lib/session";
import type { Statut } from "./data/depenses";
import { useEcran } from "./lib/ecran";

/** Pages trop denses pour un téléphone : on y invite à passer sur ordinateur ou tablette. */
const surOrdinateur = (Page: () => ReactNode, titre: string) =>
  function PageSurOrdinateur() {
    return useEcran().telephone ? <SurOrdinateur titre={titre} /> : <Page />;
  };

const racine = createRootRoute({ component: Outlet });

/** Pages publiques : connexion, choix du mot de passe par lien. */
export const connexionRoute = createRoute({
  getParentRoute: () => racine,
  path: "/connexion",
  component: Connexion,
  validateSearch: (s: Record<string, unknown>): { retour?: string; email?: string } => ({
    ...(typeof s.retour === "string" ? { retour: s.retour } : {}),
    ...(typeof s.email === "string" ? { email: s.email } : {}),
  }),
});
export const lienRoute = createRoute({ getParentRoute: () => racine, path: "/lien/$jeton", component: Lien });

/** Tout le reste demande d'être connecté. */
const application = createRoute({
  getParentRoute: () => racine,
  id: "application",
  component: () => (
    <FournisseurSaisie>
      <Layout />
    </FournisseurSaisie>
  ),
  beforeLoad: ({ location }) => {
    if (!utilisateur()) throw redirect({ to: "/connexion", search: { retour: location.href } });
  },
});
const reserveAdmin = () => {
  if (!estAdmin()) throw redirect({ to: "/" });
};

export const accueilRoute = createRoute({ getParentRoute: () => application, path: "/", component: Accueil });
type RechercheDepenses = { statut?: Statut; mois?: string; categorie?: string; moyen?: string; q?: string };
const STATUTS: Statut[] = ["toutes", "a_rembourser", "remboursees", "sans_justificatif"];
export const depensesRoute = createRoute({
  getParentRoute: () => application,
  path: "/depenses",
  component: Depenses,
  validateSearch: (s: Record<string, unknown>): RechercheDepenses => {
    const texte = (k: string) => (typeof s[k] === "string" && s[k] ? (s[k] as string) : undefined);
    return {
      statut: STATUTS.includes(s.statut as Statut) ? (s.statut as Statut) : undefined,
      mois: /^\d{4}-\d{2}$/.test(String(s.mois)) ? String(s.mois) : undefined,
      categorie: texte("categorie"),
      moyen: texte("moyen"),
      q: texte("q"),
    };
  },
});
export const ficheDepenseRoute = createRoute({ getParentRoute: () => application, path: "/depenses/$id", component: FicheDepense });
const remboursements = createRoute({ getParentRoute: () => application, path: "/remboursements", component: Remboursements });
const nouveauRemboursement = createRoute({
  getParentRoute: () => application,
  path: "/remboursements/nouveau",
  component: surOrdinateur(NouveauRemboursement, "Nouveau remboursement"),
  beforeLoad: () => {
    if (!peutEcrire()) throw redirect({ to: "/remboursements" });
  },
});
export const ficheRemboursementRoute = createRoute({ getParentRoute: () => application, path: "/remboursements/$id", component: FicheRemboursement });
const parametres = createRoute({ getParentRoute: () => application, path: "/parametres", component: surOrdinateur(Parametres, "Paramètres") });
const sauvegarde = createRoute({ getParentRoute: () => application, path: "/sauvegarde", component: surOrdinateur(Sauvegarde, "Sauvegarde"), beforeLoad: reserveAdmin });
const comptes = createRoute({ getParentRoute: () => application, path: "/comptes", component: surOrdinateur(Comptes, "Comptes"), beforeLoad: reserveAdmin });
const journal = createRoute({ getParentRoute: () => application, path: "/journal", component: surOrdinateur(Journal, "Journal"), beforeLoad: reserveAdmin });

export const router = createRouter({
  routeTree: racine.addChildren([connexionRoute, lienRoute, application.addChildren([accueilRoute, depensesRoute, ficheDepenseRoute, remboursements, nouveauRemboursement, ficheRemboursementRoute, parametres, sauvegarde, comptes, journal])]),
  history: createBrowserHistory(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
