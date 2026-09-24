/**
 * Types du module de croisement ATIH (`scripts/lib/ghm.mjs`), consommé par les tests
 * (`tests/ghm.test.ts`) sous TypeScript strict.
 *
 * Rappel des marqueurs « GHM courts » (annexe 3 du Manuel des GHM) : `J` = GHM ambulatoire
 * strict (0 nuit) ; `T0`/`T1`/`T2` = très courte durée (0 jour, 0 à 1 jour, 0 à 2 jours).
 */

import type { ActeCcam } from './referentiels.d.mts';

/** Marqueur « GHM courts » d'une racine, ou chaîne vide. */
export type GhmCourt = 'J' | 'T0' | 'T1' | 'T2' | '';

export interface RacineGhm {
  readonly racine: string;
  readonly cmd: string;
  readonly categorieMajeure: string;
  readonly ghmCourt: GhmCourt;
  /** Vrai dès qu'un séjour de 0 nuit est décrit par la racine (J, T0, T1 ou T2). */
  readonly admetSejourZeroNuit: boolean;
  readonly libelle: string;
}

export interface FicheActeClassant {
  readonly racines: string[];
  readonly cmds: string[];
  readonly reclassantMedical: boolean;
  readonly libelleGhm: string;
}

export interface ReferentielGhm {
  readonly racines: Map<string, RacineGhm>;
  readonly actesClassants: Map<string, FicheActeClassant>;
}

/** Statut d'éligibilité — trois états, l'acte seul ne suffisant pas à trancher. */
export type EligibiliteHdj = 'oui' | 'sous condition' | 'non';

export interface ClassementHdj {
  readonly acteClassant: boolean;
  readonly racinesGhm: string[];
  readonly cmdClassantes: string[];
  readonly ghmAmbulatoireStrict: boolean;
  readonly admetSejourZeroNuit: boolean;
  readonly reclassantMedical: boolean;
  readonly typeActe: string;
  readonly eligibleHdj: EligibiliteHdj;
  readonly motifEligibilite: string;
  readonly plateauTechniqueLourdRequis: boolean | null;
  readonly environnementRequis: string;
  readonly commentairePmsi: string;
}

/** Colonnes ajoutées à `referentiel_ccam` (voir `supabase/hdj-ghm.sql`). */
export interface ActeCcamEnrichi extends ActeCcam, ClassementHdj {
  readonly acte_classant: boolean;
  readonly racines_ghm: string | null;
  readonly cmd_classantes: string | null;
  readonly ghm_ambulatoire_strict: boolean;
  readonly admet_sejour_0_nuit: boolean;
  readonly reclassant_ghm_medical: boolean;
  readonly type_acte: string;
  readonly eligible_hdj: boolean;
  readonly eligibilite_hdj: EligibiliteHdj;
  readonly motif_eligibilite_hdj: string;
  readonly environnement_requis: string;
  readonly commentaire_pmsi: string;
}

export declare const CATEGORIE_CHIRURGICALE: string;
export declare const CATEGORIE_NON_OPERATOIRE: string;
export declare const CATEGORIE_MEDICALE: string;

export declare const TYPE_ACTE: {
  readonly OPERATOIRE: string;
  readonly NON_OPERATOIRE: string;
  readonly RECLASSANT_MEDICAL: string;
  readonly NON_CLASSANT: string;
};

export declare const ELIGIBILITE: {
  readonly OUI: 'oui';
  readonly SOUS_CONDITION: 'sous condition';
  readonly NON: 'non';
};

export declare const MOTIF_ELIGIBILITE: {
  readonly NON_CLASSANT: string;
  readonly RECLASSANT: string;
  readonly SANS_GHM_0_NUIT: string;
  readonly SOUS_CONDITION: string;
  readonly OUI: string;
};

export declare function lireCsvPointVirgule(contenu: string): {
  entetes: string[];
  lignes: Record<string, string>[];
};

export declare function lireRacinesGhm(contenu: string): Map<string, RacineGhm>;

export declare function lireActesClassantsGhm(contenu: string): Map<string, FicheActeClassant>;

export declare function classerActeHdj(
  acte: { code: string; libelle: string; necessite_plateau_lourd?: boolean | null },
  referentiel: ReferentielGhm,
): ClassementHdj;

export declare function enrichirActesAvecGhm(
  actes: readonly ActeCcam[],
  referentiel: ReferentielGhm,
): ActeCcamEnrichi[];
