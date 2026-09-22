/**
 * Types du module de lecture des référentiels (`scripts/lib/referentiels.mjs`),
 * consommé par les tests (`tests/referentiels.test.ts`) sous TypeScript strict.
 */

export interface SpecialiteBdpm {
  readonly cis: string;
  readonly denomination: string;
  readonly surveillanceRenforcee: boolean;
}

export interface MotifsReserve {
  readonly positifs: string[];
  readonly exclusions: string[];
}

export interface LigneMedicament {
  readonly cis: string;
  readonly denomination: string;
  readonly dci: string | null;
  /** `null` = valeur absente du référentiel (non déterminée), jamais « hors réserve ». */
  readonly est_reserve_hospitaliere: boolean | null;
  readonly est_liste_en_sus: boolean | null;
  /** Libellé CPD « surveillance particulière pendant le traitement » (tri-état). */
  readonly surveillance_particuliere: boolean | null;
  readonly surveillance_renforcee: boolean;
}

export interface OrigineReserve {
  cpd: number;
  liste: number;
  indetermine: number;
  indetermineAvecCpd: number;
  cpdConnu: number;
}

export interface ActeCcam {
  readonly code: string;
  readonly libelle: string;
  readonly acte_marqueur_hdj: boolean | null;
  readonly exclusif_externe: boolean | null;
  readonly necessite_plateau_lourd: boolean | null;
}

export interface SurchargeCcam {
  readonly acte_marqueur_hdj: boolean | null;
  readonly exclusif_externe: boolean | null;
  readonly necessite_plateau_lourd: boolean | null;
}

export interface StatistiquesReserve {
  readonly total: number;
  readonly reserve: number;
  readonly hors: number;
  readonly indetermine: number;
  readonly avecDci: number;
  readonly listeEnSus: number;
  readonly surveillanceParticuliere: number;
}

export const LIBELLE_RESERVE_HOSPITALIERE: string;
export const LIBELLE_SURVEILLANCE_PARTICULIERE: string;
export const MODES_PLATEAU_LOURD: Set<string>;
export const MODES_EXTERNE: Set<string>;

export function normaliser(texte: string): string;
export function decouperCsv(ligne: string, separateur?: string): string[];
export function lireSpecialitesCommercialisees(contenu: string): SpecialiteBdpm[];
export function lireComposition(contenu: string): Map<string, string[]>;
export function dciDepuisSubstances(substances: string[] | undefined): string | null;
export function lireCpd(contenu: string): Map<string, string[]>;
export function porteReserveHospitaliere(libellesCpd: string[] | undefined): boolean;
export function determinerSurveillanceParticuliere(
  libellesCpd: string[] | undefined,
): boolean | null;
export function lireMotifsReserve(contenu: string): MotifsReserve;
export function qualifierParListe(cible: string, motifs: MotifsReserve): boolean | null;
export function determinerReserveHospitaliere(entree: {
  libellesCpd: string[] | undefined;
  denomination: string;
  dci: string | null;
  motifs: MotifsReserve;
}): boolean | null;
export function construireMedicaments(entree: {
  contenuBdpm: string;
  contenuCompo: string;
  contenuCpd: string;
  motifs: MotifsReserve;
}): { lignes: LigneMedicament[]; origineReserve: OrigineReserve };
export function lireCcam(contenu: string): { code: string; libelle: string; modeAcces: string }[];
export function construireActes(entree: {
  contenuCcam: string;
  surcharges: Map<string, SurchargeCcam>;
}): ActeCcam[];
export function lireSurchargesCcam(contenu: string): Map<string, SurchargeCcam>;
export function boolOuNull(v: string): boolean | null;
export function statistiquesReserve(lignes: LigneMedicament[]): StatistiquesReserve;
export function versCsv(lignes: Record<string, unknown>[], colonnes: string[]): string;
