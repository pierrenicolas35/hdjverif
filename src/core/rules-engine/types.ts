/**
 * Moteur décisionnel HDJ — Modèle de données métier.
 *
 * Référentiel : Instruction N° DGOS/R1/DSS/1A/2020/52 du 10 septembre 2020
 * relative à la gradation des prises en charge ambulatoires et aux règles de
 * facturation des séjours d'hospitalisation de jour (HDJ / GHS) versus actes
 * et consultations externes (ACE).
 *
 * Ce module est PUR : aucune dépendance à l'UI, au DOM, au réseau ou à l'heure
 * système. Il est la seule source de vérité du vocabulaire métier.
 */

/* ------------------------------------------------------------------ *
 * A. Typologie des intervenants
 * ------------------------------------------------------------------ */

/** Professions reconnues pour la mobilisation de ressources humaines. */
export type Profession =
  | 'MEDECIN'
  | 'IDE'
  | 'DIETETICIEN'
  | 'PSYCHOLOGUE'
  | 'KINESITHERAPEUTE'
  | 'ASSISTANT_SOCIAL'
  | 'AUTRE_PARAMEDICAL';

/** Liste canonique (utile à l'UI et aux gardes d'exécution). */
export const PROFESSIONS: readonly Profession[] = [
  'MEDECIN',
  'IDE',
  'DIETETICIEN',
  'PSYCHOLOGUE',
  'KINESITHERAPEUTE',
  'ASSISTANT_SOCIAL',
  'AUTRE_PARAMEDICAL',
] as const;

/** Professions considérées comme paramédicales ou sociales (hors médecins). */
export const PROFESSIONS_PARAMEDICALES: readonly Profession[] = [
  'IDE',
  'DIETETICIEN',
  'PSYCHOLOGUE',
  'KINESITHERAPEUTE',
  'ASSISTANT_SOCIAL',
  'AUTRE_PARAMEDICAL',
] as const;

/**
 * Intervenant mobilisé sur le séjour.
 *
 * `note_evolution_tracee` est OBLIGATOIRE et déterminant : seule une
 * intervention se traduisant par une note clinique individualisée dans le
 * dossier du patient constitue une ressource opposable en contrôle T2A.
 */
export interface Intervenant {
  readonly id: string;
  readonly profession: Profession;
  /** Renseignée pour les médecins (ex. « Endocrinologie », « Cardiologie »). */
  readonly specialite_medicale?: string;
  /** Atteste d'une note clinique individualisée rédigée dans le dossier. */
  readonly note_evolution_tracee: boolean;
  /** Libellé de l'intervention ou de l'atelier réalisé. */
  readonly acte_ou_atelier: string;
}

/* ------------------------------------------------------------------ *
 * B. Actes et produits administrés
 * ------------------------------------------------------------------ */

/** Acte technique de la classification commune des actes médicaux. */
export interface ActeCCAM {
  readonly code: string;
  readonly libelle: string;
  /** Nécessite la mobilisation d'un plateau technique lourd. */
  readonly est_plateau_lourd: boolean;
  /** Réalisable en externe (cabinet, centre de santé, ville). */
  readonly est_realisable_externe: boolean;
}

/** Médicament ou produit de santé administré, identifié par son code UCD. */
export interface MedicamentUCD {
  readonly code_ucd: string;
  readonly libelle: string;
  /** Medicament à réserve hospitalière (PHU/PHU-rétrocession). */
  readonly reserve_hospitaliere: boolean;
  /** Administration imposant une surveillance clinique continue. */
  readonly necessite_surveillance_continue: boolean;
}

/* ------------------------------------------------------------------ *
 * C. Dossier de séjour HDJ
 * ------------------------------------------------------------------ */

/**
 * Régime de champ d'application. Détermine la Porte 0 : seules les prises en
 * charge MCO générales relèvent du champ de l'instruction.
 */
export type RegimeChamp =
  | 'MCO_GENERAL'
  | 'DIALYSE'
  | 'CHIMIOTHERAPIE'
  | 'SMR'
  | 'PSYCHIATRIE';

export const REGIMES_CHAMP: readonly RegimeChamp[] = [
  'MCO_GENERAL',
  'DIALYSE',
  'CHIMIOTHERAPIE',
  'SMR',
  'PSYCHIATRIE',
] as const;

/** Dossier soumis à l'évaluation du moteur. */
export interface DossierHDJ {
  readonly id_sejour: string;
  readonly regime_champ: RegimeChamp;
  /** Date ISO 8601 (YYYY-MM-DD) du séjour. */
  readonly date_sejour: string;
  /** Durée de présence effective du patient, en minutes. */
  readonly duree_presence_minutes: number;
  /** Convocation programmée avec objectif médical formalisé. */
  readonly est_programme: boolean;
  /** Demande médicale préalable / lettre d'adressage présente au dossier. */
  readonly lettre_adressage_presente: boolean;
  /** Compte-rendu ou lettre de sortie signé le jour même. */
  readonly synthese_medicale_tracee: boolean;
  /** Courrier de liaison remis au patient / médecin traitant. */
  readonly lettre_liaison_remise: boolean;
  /** Surveillance clinique rapprochée documentée par l'IDE. */
  readonly surveillance_active_documentee: boolean;
  readonly actes_ccam: readonly ActeCCAM[];
  readonly medicaments: readonly MedicamentUCD[];
  readonly intervenants: readonly Intervenant[];
}

/* ------------------------------------------------------------------ *
 * D. Résultat d'audit
 * ------------------------------------------------------------------ */

/**
 * Statuts de sortie du moteur.
 *
 * Les quatre statuts « socles » attendus par le cahier des charges sont
 * VALIDE_GHS, REJET_VERS_ACE, REJET_VERS_FORFAIT_SEANCE et
 * SUSPENDU_POUR_REGULARISATION. Deux issues supplémentaires sont produites par
 * les Portes 0 et 1 et sont donc modélisées explicitement :
 *  - REJET_HORS_MCO        : régime hors champ MCO (SMR, psychiatrie) ;
 *  - REJET_NON_PROGRAMME   : séjour non programmé (ex. passage SAU direct).
 */
export type StatutAudit =
  | 'VALIDE_GHS'
  | 'REJET_VERS_ACE'
  | 'REJET_VERS_FORFAIT_SEANCE'
  | 'SUSPENDU_POUR_REGULARISATION'
  | 'REJET_HORS_MCO'
  | 'REJET_NON_PROGRAMME';

/** Sévérité portée par le statut (pilotage de l'UI). */
export type Severite = 'VERT' | 'ORANGE' | 'ROUGE';

/** Identifiant de pilier de densité (Porte 3). */
export type PilierId =
  | 'PILIER_1_SOINS_SURVEILLANCE'
  | 'PILIER_2_PLATEAU_TECHNIQUE'
  | 'PILIER_3_PLURIPROFESSIONNALITE';

/** Portes franchies / bloquantes, pour la traçabilité de l'audit. */
export type PorteId =
  | 'PORTE_0_CHAMP'
  | 'PORTE_1_PREREQUIS'
  | 'PORTE_2_ACTE_ISOLE'
  | 'PORTE_3_DENSITE'
  | 'PORTE_4_DECISION';

/** Statut d'une porte dans la pyramide décisionnelle. */
export type StatutPorte = 'FRANCHIE' | 'BLOQUANTE' | 'NON_EVALUEE';

/** Étape de la pyramide des 5 portes (traçabilité de l'audit). */
export interface EtapePorte {
  readonly porte: PorteId;
  readonly libelle: string;
  readonly statut: StatutPorte;
}

/** Constat élémentaire, opposable, rattaché à une porte et à un article. */
export interface Constat {
  readonly porte: PorteId;
  readonly code: string;
  readonly message: string;
  /** Référence normative (article / alinéa de la circulaire). */
  readonly reference: string;
}

/** Détail d'évaluation d'un pilier de densité. */
export interface PilierEvaluation {
  readonly id: PilierId;
  readonly libelle: string;
  readonly valide: boolean;
  /** Justification(s) factuelle(s) de la validation ou de l'échec. */
  readonly justifications: readonly string[];
}

/** Sortie du moteur : audit décisionnel complet et opposable. */
export interface ResultatAudit {
  readonly id_sejour: string;
  readonly date_evaluation: string;
  readonly statut: StatutAudit;
  readonly severite: Severite;
  /** Le GHS est-il facturable ? */
  readonly ghs_autorise: boolean;
  /** Identifiants des piliers de densité effectivement validés. */
  readonly piliers_valides: readonly PilierId[];
  /** Motifs opposables de blocage / rejet. */
  readonly motifs_blocage: readonly string[];
  /** Alertes qualité non bloquantes en contrôle T2A. */
  readonly alertes_controle: readonly string[];
  /** Détail par pilier (traçabilité). */
  readonly piliers: readonly PilierEvaluation[];
  /** Constats élémentaires rattachés à la circulaire. */
  readonly constats: readonly Constat[];
  /** Porte ayant arrêté l'évaluation (le cas échéant). */
  readonly porte_blocage: PorteId | null;
  /** Détail de la pyramide des 5 portes (franchies / bloquante / non évaluées). */
  readonly portes: readonly EtapePorte[];
  /** Synthèse récapitulative structurée, en texte, opposable en contrôle. */
  readonly synthese_audit: string;
}
