/**
 * Jeux de données de test.
 *
 * NB : le code CCAM `DEQP003` (électrocardiographie sur au moins douze
 * dérivations) est issu du texte de l'instruction — il illustre le cas d'un
 * acte non dénombrable. Les autres codes CCAM/UCD sont des données de test
 * illustratives.
 */

import type {
  ActeCCAM,
  DossierHDJ,
  Intervenant,
  MedicamentUCD,
  Profession,
} from '../src/core/rules-engine/index.js';

/* ------------------------------------------------------------------ *
 * Actes CCAM
 * ------------------------------------------------------------------ */

export const ACTE_ECG: ActeCCAM = {
  code: 'DEQP003',
  libelle: 'Électrocardiographie sur au moins douze dérivations',
  est_plateau_lourd: false,
  est_realisable_externe: true,
};

export const ACTE_PERFUSION_FER: ActeCCAM = {
  code: 'ZZQK001',
  libelle: 'Perfusion intraveineuse lente de fer (donnée de test)',
  est_plateau_lourd: false,
  est_realisable_externe: true,
};

export const ACTE_FOGD: ActeCCAM = {
  code: 'HEQE001',
  libelle: 'Endoscopie œso-gastro-duodénale (donnée de test)',
  est_plateau_lourd: true,
  est_realisable_externe: false,
};

export const ACTE_BIO_COMPLEXE: ActeCCAM = {
  code: 'ZZQL002',
  libelle: 'Exploration fonctionnelle métabolique (donnée de test)',
  est_plateau_lourd: false,
  est_realisable_externe: false,
};

/* ------------------------------------------------------------------ *
 * Produits UCD
 * ------------------------------------------------------------------ */

export const UCD_METFORMINE: MedicamentUCD = {
  code_ucd: '3400893',
  libelle: 'Metformine 1000 mg comprimé (donnée de test)',
  reserve_hospitaliere: false,
  necessite_surveillance_continue: false,
};

export const UCD_FER_INJECTABLE: MedicamentUCD = {
  code_ucd: '3400938',
  libelle: 'Fer carboxymaltose injectable (donnée de test)',
  reserve_hospitaliere: false,
  necessite_surveillance_continue: false,
};

export const UCD_ANTICORPS_MONOCLONAL: MedicamentUCD = {
  code_ucd: '3400999',
  libelle: 'Anticorps monoclonal à réserve hospitalière (donnée de test)',
  reserve_hospitaliere: true,
  necessite_surveillance_continue: true,
};

/* ------------------------------------------------------------------ *
 * Intervenants
 * ------------------------------------------------------------------ */

let compteurIntervenant = 0;

export function intervenant(
  profession: Profession,
  options: Partial<Omit<Intervenant, 'profession'>> = {},
): Intervenant {
  compteurIntervenant += 1;
  const base: Intervenant = {
    id: `${profession.toLowerCase()}-${compteurIntervenant}`,
    profession,
    note_evolution_tracee: true,
    acte_ou_atelier: 'Intervention',
  };
  return { ...base, ...options, profession };
}

export const MEDECIN_ENDOCRINO = intervenant('MEDECIN', {
  id: 'med-endo',
  specialite_medicale: 'Endocrinologie',
  acte_ou_atelier: 'Consultation médicale de bilan diabétologique',
});

export const MEDECIN_CARDIO = intervenant('MEDECIN', {
  id: 'med-cardio',
  specialite_medicale: 'Cardiologie',
  acte_ou_atelier: 'Consultation cardiologique',
});

export const IDE = intervenant('IDE', {
  id: 'ide-1',
  acte_ou_atelier: 'Surveillance des constantes et entretien éducatif',
});

export const DIETETICIEN = intervenant('DIETETICIEN', {
  id: 'diet-1',
  acte_ou_atelier: 'Atelier diététique individualisé',
});

export const PSYCHOLOGUE = intervenant('PSYCHOLOGUE', {
  id: 'psy-1',
  acte_ou_atelier: 'Entretien psychologique',
});

/* ------------------------------------------------------------------ *
 * Fabrique de dossier
 * ------------------------------------------------------------------ */

export function dossier(partial: Partial<DossierHDJ> = {}): DossierHDJ {
  const base: DossierHDJ = {
    regime_champ: 'MCO_GENERAL',
    duree_presence_minutes: 240,
    est_programme: true,
    lettre_adressage_presente: true,
    synthese_medicale_tracee: true,
    lettre_liaison_remise: true,
    surveillance_active_documentee: false,
    contexte_patient: [],
    actes_ccam: [],
    medicaments: [],
    intervenants: [],
  };
  return { ...base, ...partial };
}

/* ------------------------------------------------------------------ *
 * Cas nominatifs
 * ------------------------------------------------------------------ */

/**
 * Cas conforme — bilan pluridisciplinaire de diabète (ETP structurée).
 * Médecin endocrinologue + IDE + diététicienne, notes d'évolution tracées.
 * Densité assurée par le seul pilier de pluriprofessionnalité concertée.
 */
export const CAS_DIABETE_CONFORME: DossierHDJ = dossier({
  duree_presence_minutes: 300,
  actes_ccam: [ACTE_ECG],
  medicaments: [UCD_METFORMINE],
  intervenants: [MEDECIN_ENDOCRINO, IDE, DIETETICIEN],
});

/** Idem, mais la diététicienne n'a pas tracé sa note d'évolution. */
export const CAS_DIABETE_DIET_NON_TRACEE: DossierHDJ = dossier({
  duree_presence_minutes: 300,
  actes_ccam: [ACTE_ECG],
  medicaments: [UCD_METFORMINE],
  intervenants: [
    MEDECIN_ENDOCRINO,
    IDE,
    { ...DIETETICIEN, note_evolution_tracee: false },
  ],
});

/** Idem cas conforme, mais aucune synthèse médicale signée le jour même. */
export const CAS_DIABETE_SANS_SYNTHESE: DossierHDJ = dossier({
  duree_presence_minutes: 300,
  synthese_medicale_tracee: false,
  actes_ccam: [ACTE_ECG],
  medicaments: [UCD_METFORMINE],
  intervenants: [MEDECIN_ENDOCRINO, IDE, DIETETICIEN],
});

/** Perfusion simple de fer, sans surveillance continue ni coordination. */
export const CAS_PERFUSION_FER: DossierHDJ = dossier({
  duree_presence_minutes: 90,
  actes_ccam: [ACTE_PERFUSION_FER],
  medicaments: [UCD_FER_INJECTABLE],
  intervenants: [IDE],
});

/** Séance de chimiothérapie injectée dans l'outil. */
export const CAS_CHIMIOTHERAPIE: DossierHDJ = dossier({
  regime_champ: 'CHIMIOTHERAPIE',
  duree_presence_minutes: 180,
  actes_ccam: [ACTE_PERFUSION_FER],
  medicaments: [UCD_ANTICORPS_MONOCLONAL],
  intervenants: [MEDECIN_ENDOCRINO, IDE],
});
