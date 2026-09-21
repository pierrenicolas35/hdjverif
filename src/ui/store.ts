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
 * Acte retenu par l'utilisateur, éventuellement issu du référentiel CCAM.
 * Volontairement mutable : l'assistant laisse l'utilisateur corriger les
 * caractéristiques proposées par le référentiel.
 */
export interface ActeChoisi {
  acte: ActeCCAM;
  /** Vrai si le libellé provient de la nomenclature (et non d'une saisie libre). */
  issuReferentiel: boolean;
  /** Valeur brute du référentiel, pour l'affichage pédagogique. */
  reference: ActeRef | null;
}

/** Médicament retenu par l'utilisateur, éventuellement issu du référentiel. */
export interface MedicamentChoisi {
  medicament: MedicamentUCD;
  issuReferentiel: boolean;
  reference: MedicamentRef | null;
  /** Traçabilité de la décision « réserve hospitalière » (référentiel ou arbitrage). */
  reserveSource: 'referentiel' | 'arbitrage';
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

  /** Identité du séjour. */
  identifiantSejour: string;
  dateSejour: string;

  /** Régime déterminé par les portes 0 (réponses aux deux questions de champ). */
  estSeance: boolean | null;
  estHorsMco: boolean | null;

  /** Porte 1. */
  estProgramme: boolean | null;
  lettreAdressage: boolean | null;
  syntheseMedicale: boolean | null;
  lettreLiaison: boolean | null;

  /** Porte 3. */
  actes: ActeChoisi[];
  medicaments: MedicamentChoisi[];
  intervenants: IntervenantSaisi[];

  /** Surveillance et durée. */
  surveillanceActive: boolean | null;
  dureePresenceMinutes: number;
}

const dateDuJour = (): string => new Date().toISOString().slice(0, 10);

export function etatInitial(): EtatAssistant {
  return {
    discipline: null,
    identifiantSejour: 'SEJ-2026-0001',
    dateSejour: dateDuJour(),
    estSeance: null,
    estHorsMco: null,
    estProgramme: null,
    lettreAdressage: null,
    syntheseMedicale: null,
    lettreLiaison: null,
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
  const reserveConnue = ref.est_reserve_hospitaliere !== null;
  return {
    issuReferentiel: true,
    reference: ref,
    reserveSource: reserveConnue ? 'referentiel' : 'arbitrage',
    medicament: {
      code_ucd: ref.cis,
      libelle: ref.denomination,
      // `null` = non déterminé dans le référentiel : l'utilisateur tranche, et
      // l'assistant l'y invite explicitement.
      reserve_hospitaliere: ref.est_reserve_hospitaliere ?? false,
      necessite_surveillance_continue: ref.surveillance_renforcee === true,
    },
  };
}

export function intervenantVide(): IntervenantSaisi {
  return {
    id: nouvelId('int'),
    profession: 'MEDECIN',
    note_evolution_tracee: false,
    acte_ou_atelier: '',
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
 * peut ainsi afficher un verdict provisoire à chaque étape.
 */
export function versDossier(etat: EtatAssistant): DossierHDJ {
  const intervenants: Intervenant[] = etat.intervenants
    .filter((i) => i.acte_ou_atelier.trim() !== '' || i.specialite_medicale?.trim())
    .map((i) => ({
      id: i.id,
      profession: i.profession,
      ...(i.specialite_medicale?.trim()
        ? { specialite_medicale: i.specialite_medicale.trim() }
        : {}),
      note_evolution_tracee: i.note_evolution_tracee,
      acte_ou_atelier: i.acte_ou_atelier.trim(),
    }));

  return {
    id_sejour: etat.identifiantSejour.trim() || 'SEJ-SANS-ID',
    regime_champ: regimeDe(etat),
    date_sejour: etat.dateSejour,
    duree_presence_minutes: etat.dureePresenceMinutes,
    est_programme: etat.estProgramme ?? false,
    lettre_adressage_presente: etat.lettreAdressage ?? false,
    synthese_medicale_tracee: etat.syntheseMedicale ?? false,
    lettre_liaison_remise: etat.lettreLiaison ?? false,
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
  IDE: 'IDE',
  DIETETICIEN: 'Diététicien(ne)',
  PSYCHOLOGUE: 'Psychologue',
  KINESITHERAPEUTE: 'Kinésithérapeute',
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
