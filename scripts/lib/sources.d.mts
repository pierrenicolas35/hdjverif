/**
 * Types du module des sources officielles (`scripts/lib/sources.mjs`),
 * consommé par les tests (`tests/referentiels.test.ts`) sous TypeScript strict.
 */

export interface Source {
  readonly libelle: string;
  readonly fichier: string;
  readonly url: string;
  readonly encodage: 'latin1' | 'utf8';
}

export const BASE_BDPM: string;
export const URL_CCAM_EPINGLEE: string;
export const API_DATAGOUV_CCAM: string;
export const SOURCES: Readonly<Record<string, Source>>;
export const CLES: readonly string[];

export function urlCcam(): Promise<string>;
export function telechargerSource(
  cle: string,
  options?: {
    repertoire?: string;
    rafraichir?: boolean;
    journaliser?: (message: string) => void;
  },
): Promise<string>;
export function lireSource(cle: string, chemin: string): string;
export function empreinteSources(chemins: Record<string, string>): string;
