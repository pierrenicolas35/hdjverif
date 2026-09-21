/**
 * Cas d'usage pré-remplis, alignés sur les tests unitaires obligatoires.
 * Permettent de vérifier le comportement du moteur en démonstration.
 */

import type { EtatApplication } from './store.js';

export interface Preset {
  readonly libelle: string;
  readonly description: string;
  readonly attendu: string;
  readonly etat: EtatApplication;
}

const ENTETE = {
  id_sejour: 'SEJ-2026-0001',
  date_sejour: '2026-04-15',
  duree_presence_minutes: 300,
  est_programme: true,
  lettre_adressage_presente: true,
  synthese_medicale_tracee: true,
  lettre_liaison_remise: true,
  surveillance_active_documentee: false,
} as const;

const ACTE_ECG = {
  code: 'DEQP003',
  libelle: 'Électrocardiographie sur au moins douze dérivations',
  est_plateau_lourd: false,
  est_realisable_externe: true,
} as const;

export const PRESETS: readonly Preset[] = [
  {
    libelle: '1 · Bilan diabète pluridisciplinaire conforme',
    description: 'Médecin endocrinologue + IDE + diététicienne, notes d’évolution tracées.',
    attendu: 'VALIDE_GHS',
    etat: {
      champs: { ...ENTETE, regime_champ: 'MCO_GENERAL' },
      actes_ccam: [{ ...ACTE_ECG }],
      medicaments: [
        {
          code_ucd: '3400893',
          libelle: 'Metformine 1000 mg',
          reserve_hospitaliere: false,
          necessite_surveillance_continue: false,
        },
      ],
      intervenants: [
        {
          id: 'p1-med',
          profession: 'MEDECIN',
          specialite_medicale: 'Endocrinologie',
          note_evolution_tracee: true,
          acte_ou_atelier: 'Consultation médicale de bilan diabétologique',
        },
        {
          id: 'p1-ide',
          profession: 'IDE',
          note_evolution_tracee: true,
          acte_ou_atelier: 'Surveillance des constantes et entretien éducatif',
        },
        {
          id: 'p1-diet',
          profession: 'DIETETICIEN',
          note_evolution_tracee: true,
          acte_ou_atelier: 'Atelier diététique individualisé',
        },
      ],
    },
  },
  {
    libelle: '2 · Idem, note diététique non tracée',
    description:
      'La diététicienne n’a pas rédigé de note d’évolution : la pluriprofessionnalité n’est pas opposable.',
    attendu: 'REJET_VERS_ACE',
    etat: {
      champs: { ...ENTETE, regime_champ: 'MCO_GENERAL' },
      actes_ccam: [{ ...ACTE_ECG }],
      medicaments: [],
      intervenants: [
        {
          id: 'p2-med',
          profession: 'MEDECIN',
          specialite_medicale: 'Endocrinologie',
          note_evolution_tracee: true,
          acte_ou_atelier: 'Consultation médicale de bilan diabétologique',
        },
        {
          id: 'p2-ide',
          profession: 'IDE',
          note_evolution_tracee: true,
          acte_ou_atelier: 'Surveillance des constantes et entretien éducatif',
        },
        {
          id: 'p2-diet',
          profession: 'DIETETICIEN',
          note_evolution_tracee: false,
          acte_ou_atelier: 'Atelier diététique individualisé',
        },
      ],
    },
  },
  {
    libelle: '3 · Absence de synthèse médicale signée',
    description: 'Séjour densément pourvu mais compte-rendu du jour non signé.',
    attendu: 'SUSPENDU_POUR_REGULARISATION',
    etat: {
      champs: { ...ENTETE, regime_champ: 'MCO_GENERAL', synthese_medicale_tracee: false },
      actes_ccam: [{ ...ACTE_ECG }],
      medicaments: [],
      intervenants: [
        {
          id: 'p3-med',
          profession: 'MEDECIN',
          specialite_medicale: 'Endocrinologie',
          note_evolution_tracee: true,
          acte_ou_atelier: 'Consultation médicale de bilan diabétologique',
        },
        {
          id: 'p3-ide',
          profession: 'IDE',
          note_evolution_tracee: true,
          acte_ou_atelier: 'Surveillance des constantes et entretien éducatif',
        },
        {
          id: 'p3-diet',
          profession: 'DIETETICIEN',
          note_evolution_tracee: true,
          acte_ou_atelier: 'Atelier diététique individualisé',
        },
      ],
    },
  },
  {
    libelle: '4 · Perfusion isolée de fer',
    description: 'Acte technique isolé, réaliste en externe, sans surveillance documentée.',
    attendu: 'REJET_VERS_ACE',
    etat: {
      champs: {
        ...ENTETE,
        regime_champ: 'MCO_GENERAL',
        duree_presence_minutes: 90,
      },
      actes_ccam: [
        {
          code: 'ZZQK001',
          libelle: 'Perfusion intraveineuse lente de fer',
          est_plateau_lourd: false,
          est_realisable_externe: true,
        },
      ],
      medicaments: [
        {
          code_ucd: '3400938',
          libelle: 'Fer carboxymaltose injectable',
          reserve_hospitaliere: false,
          necessite_surveillance_continue: false,
        },
      ],
      intervenants: [
        {
          id: 'p4-ide',
          profession: 'IDE',
          note_evolution_tracee: true,
          acte_ou_atelier: 'Pose de perfusion et surveillance immédiate',
        },
      ],
    },
  },
  {
    libelle: '5 · Séance de chimiothérapie',
    description: 'Prise en charge relevant d’un forfait de séance, hors critères de gradation.',
    attendu: 'REJET_VERS_FORFAIT_SEANCE',
    etat: {
      champs: { ...ENTETE, regime_champ: 'CHIMIOTHERAPIE', duree_presence_minutes: 180 },
      actes_ccam: [],
      medicaments: [
        {
          code_ucd: '3400999',
          libelle: 'Anticorps monoclonal — protocole de chimiothérapie',
          reserve_hospitaliere: true,
          necessite_surveillance_continue: true,
        },
      ],
      intervenants: [
        {
          id: 'p5-med',
          profession: 'MEDECIN',
          specialite_medicale: 'Oncologie',
          note_evolution_tracee: true,
          acte_ou_atelier: 'Prescription et surveillance du protocole',
        },
        {
          id: 'p5-ide',
          profession: 'IDE',
          note_evolution_tracee: true,
          acte_ou_atelier: 'Administration et surveillance continue',
        },
      ],
    },
  },
];
