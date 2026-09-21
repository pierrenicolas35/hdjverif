/**
 * État applicatif du formulaire et conversion vers le modèle métier du moteur.
 *
 * Aucune règle métier ici : le store ne fait que transporter et normaliser la
 * saisie. Toute la décision est prise par `core/rules-engine`.
 */

import type {
  ActeCCAM,
  DossierHDJ,
  Intervenant,
  MedicamentUCD,
  Profession,
  RegimeChamp,
} from '../core/rules-engine/index.js';

/** Champs scalaires du dossier saisis dans le formulaire. */
export interface ChampsAdministratifs {
  id_sejour: string;
  date_sejour: string;
  regime_champ: RegimeChamp;
  duree_presence_minutes: number;
  est_programme: boolean;
  lettre_adressage_presente: boolean;
  synthese_medicale_tracee: boolean;
  lettre_liaison_remise: boolean;
  surveillance_active_documentee: boolean;
}

/** État complet de l'écran. */
export interface EtatApplication {
  champs: ChampsAdministratifs;
  intervenants: Intervenant[];
  actes_ccam: ActeCCAM[];
  medicaments: MedicamentUCD[];
}

const dateDuJour = (): string => new Date().toISOString().slice(0, 10);

/** État initial : un séjour MCO programmé, plausible mais non renseigné. */
export function etatInitial(): EtatApplication {
  return {
    champs: {
      id_sejour: 'SEJ-2026-0001',
      date_sejour: dateDuJour(),
      regime_champ: 'MCO_GENERAL',
      duree_presence_minutes: 240,
      est_programme: true,
      lettre_adressage_presente: true,
      synthese_medicale_tracee: true,
      lettre_liaison_remise: true,
      surveillance_active_documentee: false,
    },
    intervenants: [],
    actes_ccam: [],
    medicaments: [],
  };
}

/** Éléments vides pour les ajouts dynamiques. */
export function intervenantVide(): Intervenant {
  return {
    id: `int-${crypto.randomUUID().slice(0, 8)}`,
    profession: 'MEDECIN',
    specialite_medicale: '',
    note_evolution_tracee: false,
    acte_ou_atelier: '',
  };
}

export function acteVide(): ActeCCAM {
  return {
    code: '',
    libelle: '',
    est_plateau_lourd: false,
    est_realisable_externe: false,
  };
}

export function medicamentVide(): MedicamentUCD {
  return {
    code_ucd: '',
    libelle: '',
    reserve_hospitaliere: false,
    necessite_surveillance_continue: false,
  };
}

/**
 * Convertit l'état du formulaire en `DossierHDJ` exploitable par le moteur.
 * Les entrées partiellement renseignées (ligne vide en cours de saisie) sont
 * ignorées afin de ne pas polluer l'évaluation temps réel.
 */
export function versDossier(etat: EtatApplication): DossierHDJ {
  const actes = etat.actes_ccam.filter((a) => a.code.trim() !== '');
  const medicaments = etat.medicaments.filter((m) => m.code_ucd.trim() !== '');
  const intervenants = etat.intervenants.filter(
    (i) => i.acte_ou_atelier.trim() !== '' || i.specialite_medicale?.trim(),
  );

  return {
    id_sejour: etat.champs.id_sejour.trim() || 'SEJ-SANS-ID',
    regime_champ: etat.champs.regime_champ,
    date_sejour: etat.champs.date_sejour,
    duree_presence_minutes: etat.champs.duree_presence_minutes,
    est_programme: etat.champs.est_programme,
    lettre_adressage_presente: etat.champs.lettre_adressage_presente,
    synthese_medicale_tracee: etat.champs.synthese_medicale_tracee,
    lettre_liaison_remise: etat.champs.lettre_liaison_remise,
    surveillance_active_documentee: etat.champs.surveillance_active_documentee,
    actes_ccam: actes,
    medicaments,
    intervenants,
  };
}

/** Libellés des professions pour l'interface. */
export const LIBELLES_PROFESSION: Readonly<Record<Profession, string>> = {
  MEDECIN: 'Médecin',
  IDE: 'Infirmier(ère) — IDE',
  DIETETICIEN: 'Diététicien(ne)',
  PSYCHOLOGUE: 'Psychologue',
  KINESITHERAPEUTE: 'Masseur-kinésithérapeute',
  ASSISTANT_SOCIAL: 'Assistant(e) social(e)',
  AUTRE_PARAMEDICAL: 'Autre paramédical',
};

/** Libellés des régimes de champ. */
export const LIBELLES_REGIME: Readonly<Record<RegimeChamp, string>> = {
  MCO_GENERAL: 'MCO général (champ de l’instruction)',
  DIALYSE: 'Dialyse (séance forfaitisée)',
  CHIMIOTHERAPIE: 'Chimiothérapie (séance forfaitisée)',
  SMR: 'SMR / SSR (hors champ MCO)',
  PSYCHIATRIE: 'Psychiatrie (hors champ MCO)',
};
