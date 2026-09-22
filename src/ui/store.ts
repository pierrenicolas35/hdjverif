/**
 * État de l'assistant et conversion vers le modèle métier du moteur.
 *
 * Aucune règle métier ici : l'état ne fait que porter la saisie, la décision
 * reste entièrement prise par `core/rules-engine`.
 */

import type {
  ActeCCAM,
  DossierHDJ,
  Intervenant,
  MedicamentUCD,
  Profession,
  RegimeChamp,
} from '../core/rules-engine/index.js';
import type { ActeRef, MedicamentRef } from './referentiels.js';
import type { Discipline } from './pedagogie.js';

/* ------------------------------------------------------------------ *
 * Éléments enrichis par le référentiel
 * ------------------------------------------------------------------ */

/**
 * Acte retenu par l'utilisateur, issu du référentiel CCAM.
 *
 * Les caractéristiques de l'acte (plateau technique lourd, réalisation en
 * externe) sont reprises telles quelles de la nomenclature : elles ne sont
 * jamais redemandées à l'utilisateur.
 */
export interface ActeChoisi {
  acte: ActeCCAM;
  /** Vrai si le libellé provient de la nomenclature (et non d'une saisie libre). */
  issuReferentiel: boolean;
  /** Valeur brute du référentiel, pour l'affichage pédagogique. */
  reference: ActeRef | null;
}

/**
 * Médicament retenu par l'utilisateur, issu du référentiel.
 *
 * Le classement « réserve hospitalière » et la surveillance renforcée sont
 * repris du référentiel : ils ne sont jamais redemandés à l'utilisateur.
 */
export interface MedicamentChoisi {
  medicament: MedicamentUCD;
  issuReferentiel: boolean;
  reference: MedicamentRef | null;
}

/**
 * Intervenant en cours de saisie (version mutable de `Intervenant`).
 * `versDossier` le convertit en `Intervenant` immuable pour le moteur.
 */
export interface IntervenantSaisi {
  id: string;
  profession: Profession;
  specialite_medicale?: string;
  note_evolution_tracee: boolean;
  acte_ou_atelier: string;
}

/* ------------------------------------------------------------------ *
 * État global
 * ------------------------------------------------------------------ */

export interface EtatAssistant {
  /** Discipline déclarée à l'accueil (adapte les exemples pédagogiques). */
  discipline: Discipline | null;

  /** Régime déterminé par les portes 0 (réponses aux questions de champ). */
  estSeance: boolean | null;
  estHorsMco: boolean | null;

  /**
   * Porte 1 : les faits du dossier (programmation, demande médicale préalable,
   * synthèse du jour, lettre de liaison) ne sont pas portés par l'état.
   *
   * L'outil évalue une HDJ **en cours de programmation** : ces quatre éléments
   * sont acquis par construction et ne sont donc jamais demandés — voir
   * `versDossier()`. La valeur est fixée en un point unique.
   */

  /** Porte 3. */
  actes: ActeChoisi[];
  medicaments: MedicamentChoisi[];
  intervenants: IntervenantSaisi[];

  /** Surveillance et durée. */
  surveillanceActive: boolean | null;
  dureePresenceMinutes: number;
}

export function etatInitial(): EtatAssistant {
  return {
    discipline: null,
    estSeance: null,
    estHorsMco: null,
    actes: [],
    medicaments: [],
    intervenants: [],
    surveillanceActive: null,
    dureePresenceMinutes: 240,
  };
}

/* ------------------------------------------------------------------ *
 * Fabriques
 * ------------------------------------------------------------------ */

let compteur = 0;
const nouvelId = (prefixe: string): string => {
  compteur += 1;
  return `${prefixe}-${compteur}`;
};

export function acteChoisiDepuisReferentiel(ref: ActeRef): ActeChoisi {
  return {
    issuReferentiel: true,
    reference: ref,
    acte: {
      code: ref.code,
      libelle: ref.libelle,
      est_plateau_lourd: ref.necessite_plateau_lourd ?? false,
      est_realisable_externe: ref.exclusif_externe ?? false,
    },
  };
}

export function acteChoisiManuel(code: string, libelle: string): ActeChoisi {
  return {
    issuReferentiel: false,
    reference: null,
    acte: {
      code,
      libelle: libelle || 'Acte saisi manuellement',
      est_plateau_lourd: false,
      est_realisable_externe: false,
    },
  };
}

export function medicamentChoisiDepuisReferentiel(ref: MedicamentRef): MedicamentChoisi {
  return {
    issuReferentiel: true,
    reference: ref,
    medicament: {
      code_ucd: ref.cis,
      libelle: ref.denomination,
      // Le référentiel fait foi. Une valeur absente n'est pas interprétée comme
      // une exclusion : elle est traitée comme « hors réserve hospitalière »,
      // sans interroger à nouveau l'utilisateur.
      reserve_hospitaliere: ref.est_reserve_hospitaliere === true,
      necessite_surveillance_continue: ref.surveillance_renforcee === true,
    },
  };
}

/**
 * Crée un intervenant pour la profession choisie.
 *
 * La note d'évolution est considérée tracée par défaut : l'utilisateur la
 * décoche explicitement (bouton « Non ») lorsqu'aucune note n'a été rédigée.
 */
export function intervenantPourProfession(profession: Profession): IntervenantSaisi {
  return {
    id: nouvelId('int'),
    profession,
    note_evolution_tracee: true,
    acte_ou_atelier: '',
    ...(profession === 'MEDECIN' ? { specialite_medicale: '' } : {}),
  };
}

/* ------------------------------------------------------------------ *
 * Conversion vers le moteur
 * ------------------------------------------------------------------ */

/** Régime de champ déduit des réponses aux portes 0. */
export function regimeDe(etat: EtatAssistant): RegimeChamp {
  if (etat.estSeance) return 'CHIMIOTHERAPIE';
  if (etat.estHorsMco) return 'SMR';
  return 'MCO_GENERAL';
}

/**
 * Construit le `DossierHDJ` soumis au moteur.
 *
 * Les valeurs non encore renseignées sont volontairement neutres : l'assistant
 * peut ainsi afficher une décision à mesure de la saisie.
 *
 * Les quatre faits de la porte 1 sont réputés acquis : l'outil sert à vérifier
 * la facturabilité d'une HDJ **que l'on veut programmer**, donc d'une prise en
 * charge programmée dont la demande médicale préalable est au dossier, la
 * synthèse signée le jour même et la lettre de liaison remise au patient. Les
 * demander reviendrait à poser des questions dont la réponse est « oui » par
 * construction.
 */
export function versDossier(etat: EtatAssistant): DossierHDJ {
  const intervenants: Intervenant[] = etat.intervenants.map((i) => ({
    id: i.id,
    profession: i.profession,
    ...(i.specialite_medicale?.trim()
      ? { specialite_medicale: i.specialite_medicale.trim() }
      : {}),
    note_evolution_tracee: i.note_evolution_tracee,
    acte_ou_atelier: i.acte_ou_atelier.trim() || LIBELLES_PROFESSION[i.profession],
  }));

  return {
    regime_champ: regimeDe(etat),
    duree_presence_minutes: etat.dureePresenceMinutes,
    // Acquis par construction sur une HDJ en cours de programmation (porte 1).
    est_programme: true,
    lettre_adressage_presente: true,
    synthese_medicale_tracee: true,
    lettre_liaison_remise: true,
    surveillance_active_documentee: etat.surveillanceActive ?? false,
    actes_ccam: etat.actes.map((a) => a.acte),
    medicaments: etat.medicaments.map((m) => m.medicament),
    intervenants,
  };
}

/* ------------------------------------------------------------------ *
 * Libellés
 * ------------------------------------------------------------------ */

export const LIBELLES_PROFESSION: Readonly<Record<Profession, string>> = {
  MEDECIN: 'Médecin',
  IDE: 'Infirmier(ère)',
  KINESITHERAPEUTE: 'Kinésithérapeute',
  DIETETICIEN: 'Diététicien(ne)',
  PSYCHOLOGUE: 'Psychologue',
  ASSISTANT_SOCIAL: 'Assistant(e) social(e)',
  AUTRE_PARAMEDICAL: 'Autre paramédical',
};

export const LIBELLES_REGIME: Readonly<Record<RegimeChamp, string>> = {
  MCO_GENERAL: 'MCO général',
  DIALYSE: 'Dialyse (séance)',
  CHIMIOTHERAPIE: 'Chimiothérapie (séance)',
  SMR: 'SMR / SSR',
  PSYCHIATRIE: 'Psychiatrie',
};

/** Libellé lisible de l'état d'un booléen nullable. */
export function libelleBooleen(
  valeur: boolean | null,
  oui = 'Oui',
  non = 'Non',
  inconnu = 'Non déterminé',
): string {
  if (valeur === null) return inconnu;
  return valeur ? oui : non;
}
