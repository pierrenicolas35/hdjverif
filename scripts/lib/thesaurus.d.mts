/**
 * Déclarations du thésaurus des synonymes (`scripts/lib/thesaurus.mjs`).
 * Consommé par l'application (`src/ui/referentiels.ts`) et les tests.
 */

/** Une ligne du fichier `data/thesaurus-synonymes.csv`. */
export interface EntreeThesaurus {
  /** Numéro de ligne dans le fichier (traçabilité des erreurs). */
  readonly ligne: number;
  readonly notion: string;
  readonly terme: string;
  readonly terme_normalise: string;
  readonly type: string;
  readonly domaine: string;
  readonly source: string;
}

/** Synonyme lisible proposé à l'usager (affichage, pastilles de recherche). */
export interface Synonyme {
  readonly terme: string;
  readonly terme_normalise: string;
  readonly notion: string;
  readonly type: string;
  readonly domaine: string;
}

export interface Thesaurus {
  readonly entrees: readonly EntreeThesaurus[];
  readonly notions: readonly string[];
  /** Termes normalisés à interroger pour une saisie (requête + synonymes). */
  elargir(terme: string, domaine?: string | null): string[];
  /** Synonymes lisibles des notions atteintes par une saisie. */
  synonymesDe(terme: string, domaine?: string | null): Synonyme[];
  /** Mots-clés normalisés à indexer pour un texte (colonne `mots_cles`). */
  motsClesPour(texte: string, domaines?: readonly string[]): string[];
  /** Lignes prêtes pour la table `public.thesaurus_synonymes`. */
  versLignesBase(): Omit<EntreeThesaurus, 'ligne'>[];
}

export declare const DOMAINES: readonly string[];
export declare const MOTS_VIDES: readonly string[];
export declare const LONGUEUR_MOT_SIGNIFICATIF: number;

export declare function normaliserTerme(texte: string): string;
export declare function estSigle(termeNormalise: string): boolean;
export declare function contientTerme(texteNormalise: string, termeNormalise: string): boolean;
export declare function decouperRequete(terme: string): string[];
export declare function lireThesaurus(contenu: string): EntreeThesaurus[];
export declare function construireThesaurus(entrees: readonly EntreeThesaurus[]): Thesaurus;
export declare function thesaurusDepuisCsv(contenu: string): Thesaurus;
