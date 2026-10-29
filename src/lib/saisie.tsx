import { createContext, useContext, useState, type ReactNode } from "react";
import { ModalDepense } from "../components/ModalDepense";

/** Ouvre la saisie d'une nouvelle dépense, de n'importe où (bouton « + » du téléphone, tableau de bord, liste). */
const Saisie = createContext<() => void>(() => {});
export const useNouvelleDepense = () => useContext(Saisie);

export function FournisseurSaisie({ children }: { children: ReactNode }) {
  const [ouverte, setOuverte] = useState(false);
  return (
    <Saisie.Provider value={() => setOuverte(true)}>
      {children}
      <ModalDepense depense={null} opened={ouverte} onClose={() => setOuverte(false)} />
    </Saisie.Provider>
  );
}
