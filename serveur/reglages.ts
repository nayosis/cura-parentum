/*
 * Réglages de l'installation, dans comptes.db
 * (comme les comptes : ni sauvegardés ni restaurés avec les données).
 */
import { baseComptes } from "./comptes";

export const lireReglage = (cle: string) => baseComptes().query<{ valeur: string }, [string]>("SELECT valeur FROM reglage WHERE cle = ?").get(cle)?.valeur ?? null;
export const ecrireReglage = (cle: string, valeur: string) =>
  baseComptes().query("INSERT INTO reglage (cle, valeur) VALUES (?, ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur").run(cle, valeur);
