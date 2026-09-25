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
  /** Texte de recherche normalisé et encadré d'espaces (index trigramme). */
  readonly recherche_normalisee: string;
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
  readonly chapitre_code: string | null;
  readonly chapitre_libelle: string | null;
  readonly sous_chapitre_code: string | null;
  readonly sous_chapitre_libelle: string | null;
  /** Synonymes et vocabulaire courant (recherche élargie). */
  readonly mots_cles: string | null;
  /** Texte de recherche normalisé et encadré d'espaces (colonne interrogée, index trigramme). */
  readonly recherche_normalisee: string;
  /** Libellé seul, normalisé et encadré d'espaces : sert à **classer** les résultats. */
  readonly libelle_normalisee: string;
}

/** Position d'un acte dans l'arborescence officielle CCAM (issue de `lireCcam`). */
export interface ActeCcamSource {
  readonly code: string;
  readonly libelle: string;
  readonly chapitreCode: string;
  readonly chapitreLabel: string;
  readonly topographie: string;
  readonly topographieLabel: string;
  readonly action: string;
  readonly actionLabel: string;
  readonly modeAcces: string;
  readonly modeAccesLabel: string;
  readonly famille: string;
  readonly familleLabel: string;
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
export function normaliserModeAcces(texte: string): string;
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
export function lireCcam(contenu: string): ActeCcamSource[];
export function motsClesActe(
  acte: {
    libelle: string;
    chapitreLabel?: string;
    topographieLabel?: string;
    actionLabel?: string;
    modeAccesLabel?: string;
    familleLabel?: string;
  },
  thesaurus: import('./thesaurus.mjs').Thesaurus,
): string;
export function construireActes(entree: {
  contenuCcam: string;
  surcharges: Map<string, SurchargeCcam>;
  /** Nomenclature consolidée (`data/ccam-complete-2025.csv`) : complète la source libérale. */
  contenuCcamConsolides?: string;
  /** Thésaurus des synonymes (`data/thesaurus-synonymes.csv`) : fonde la colonne `mots_cles`. */
  thesaurus: import('./thesaurus.mjs').Thesaurus;
}): ActeCcam[];
/** Nomenclature CCAM consolidée : chapitres 1 à 19, jeu libéral et libellés du manuel. */
export function lireActesCcamConsolides(
  contenu: string,
): Map<string, { libelle: string; chapitre: string; source: string }>;
/** Libellés des 19 chapitres de la CCAM (le chapitre 18 n'existe que dans la nomenclature ATIH). */
export declare const CHAPITRES_CCAM: Record<string, string>;
export function lireSurchargesCcam(contenu: string): Map<string, SurchargeCcam>;
export function boolOuNull(v: string): boolean | null;
export function statistiquesReserve(lignes: LigneMedicament[]): StatistiquesReserve;
export function versCsv(lignes: Record<string, unknown>[], colonnes: string[]): string;
