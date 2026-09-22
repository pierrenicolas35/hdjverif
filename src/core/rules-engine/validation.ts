/**
 * Garde-fous d'exécution.
 *
 * Le moteur suppose un `DossierHDJ` bien formé. Cette validation, volontairement
 * légère et sans dépendance externe, sécurise la frontière d'entrée (formulaire
 * utilisateur, import de fichier, appel API).
 */

import { CRITERES_CONTEXTE_PATIENT, PROFESSIONS, REGIMES_CHAMP } from './types.js';
import type {
  CritereContextePatient,
  DossierHDJ,
  Profession,
  RegimeChamp,
} from './types.js';

export interface ErreurValidation {
  readonly champ: string;
  readonly message: string;
}

export function validerDossier(dossier: DossierHDJ): readonly ErreurValidation[] {
  const erreurs: ErreurValidation[] = [];
  const ajouter = (champ: string, message: string): void => {
    erreurs.push({ champ, message });
  };

  if (!REGIMES_CHAMP.includes(dossier.regime_champ as RegimeChamp)) {
    ajouter('regime_champ', `Régime de champ invalide : ${String(dossier.regime_champ)}.`);
  }

  if (
    !Number.isInteger(dossier.duree_presence_minutes) ||
    dossier.duree_presence_minutes < 0
  ) {
    ajouter(
      'duree_presence_minutes',
      'Durée de présence attendue en minutes (entier positif ou nul).',
    );
  }

  dossier.intervenants.forEach((intervenant, index) => {
    if (!PROFESSIONS.includes(intervenant.profession as Profession)) {
      ajouter(
        `intervenants[${index}].profession`,
        `Profession inconnue : ${String(intervenant.profession)}.`,
      );
    }
    if (intervenant.profession === 'MEDECIN' && !intervenant.specialite_medicale?.trim()) {
      ajouter(
        `intervenants[${index}].specialite_medicale`,
        'Spécialité médicale requise pour un médecin (nécessaire au pilier de pluriprofessionnalité).',
      );
    }
  });

  dossier.actes_ccam.forEach((acte, index) => {
    if (!acte.code?.trim()) ajouter(`actes_ccam[${index}].code`, 'Code CCAM requis.');
  });

  dossier.medicaments.forEach((medicament, index) => {
    if (!medicament.code_ucd?.trim()) {
      ajouter(`medicaments[${index}].code_ucd`, 'Code UCD requis.');
    }
  });

  dossier.contexte_patient.forEach((critere, index) => {
    if (!CRITERES_CONTEXTE_PATIENT.includes(critere as CritereContextePatient)) {
      ajouter(
        `contexte_patient[${index}]`,
        `Critère de contexte patient inconnu : ${String(critere)}.`,
      );
    }
  });

  return erreurs;
}

/** Vrai si le dossier est exploitable par le moteur. */
export function dossierValide(dossier: DossierHDJ): boolean {
  return validerDossier(dossier).length === 0;
}
