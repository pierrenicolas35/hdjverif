/**
 * PORTE 3 — Évaluation de la densité en ressources mobilisées.
 *
 * Le séjour doit valider AU MOINS UN des trois piliers suivants :
 *
 *  1. Pilier Soins / surveillance active
 *     - surveillance active documentée, OU
 *     - administration d'un produit de la réserve hospitalière / nécessitant une
 *       surveillance continue, OU
 *     - contexte patient particulier (au moins une situation de vulnérabilité
 *       retenue au dossier).
 *
 *  2. Pilier Plateau technique lourd / actes coordonnés
 *     - au moins un acte `est_plateau_lourd`, OU
 *     - au moins deux actes CCAM dénombrables distincts (actes coordonnés sur un
 *       plateau technique) ; l'ECG DEQP003 est exclu du décompte (annexe 4,
 *       point 2.b.iii).
 *
 *  3. Pilier Pluriprofessionnalité concertée
 *     - seuls les intervenants ayant `note_evolution_tracee === true` comptent ;
 *     - option 3A : au moins 2 médecins de spécialités médicales distinctes ;
 *     - option 3B : au moins 1 médecin + au moins 2 intervenants
 *       paramédicaux/sociaux de professions distinctes.
 */

import {
  actesDenombrables,
  codesCcamDistincts,
  contextePatientParticulier,
  medecinsActifs,
  medicamentsSurveillanceParticuliere,
  professionsParamedicalesDistinctes,
  specialitesMedicalesDistinctes,
} from '../helpers.js';
import { LIBELLES_CONTEXTE_PATIENT } from '../types.js';
import type { DossierHDJ, PilierEvaluation } from '../types.js';

type Pilier = Omit<PilierEvaluation, 'id' | 'libelle'>;

const LIBELLES = {
  PILIER_1_SOINS_SURVEILLANCE: 'Pilier 1 — Soins / surveillance active',
  PILIER_2_PLATEAU_TECHNIQUE: 'Pilier 2 — Plateau technique lourd / actes coordonnés',
  PILIER_3_PLURIPROFESSIONNALITE: 'Pilier 3 — Pluriprofessionnalité concertée',
} as const;

/* ------------------------------------------------------------------ *
 * Pilier 1
 * ------------------------------------------------------------------ */

export function evaluerPilier1(dossier: DossierHDJ): Pilier {
  const justifications: string[] = [];
  const produits = medicamentsSurveillanceParticuliere(dossier);
  const contexte = contextePatientParticulier(dossier);
  const valide =
    dossier.surveillance_active_documentee || produits.length > 0 || contexte.length > 0;

  if (dossier.surveillance_active_documentee) {
    justifications.push(
      'Surveillance active documentée par l’IDE (constantes, tolérance, surveillance rapprochée).',
    );
  }

  if (contexte.length > 0) {
    justifications.push(
      `Contexte patient particulier : ${contexte
        .map((critere) => LIBELLES_CONTEXTE_PATIENT[critere])
        .join(' ; ')}.`,
    );
  }

  for (const produit of produits) {
    const motifs: string[] = [];
    if (produit.reserve_hospitaliere) motifs.push('réserve hospitalière');
    if (produit.necessite_surveillance_continue) {
      motifs.push('surveillance continue requise');
    }
    justifications.push(`${produit.code_ucd} — ${produit.libelle} (${motifs.join(', ')}).`);
  }

  if (!valide) {
    justifications.push(
      'Aucune surveillance active documentée, aucun contexte patient particulier et aucun ' +
        'produit à réserve hospitalière ou à surveillance continue administré.',
    );
  }

  return { valide, justifications };
}

/* ------------------------------------------------------------------ *
 * Pilier 2
 * ------------------------------------------------------------------ */

export function evaluerPilier2(dossier: DossierHDJ): Pilier {
  const justifications: string[] = [];
  let valide = false;

  const actesLourds = actesDenombrables(dossier).filter((a) => a.est_plateau_lourd);
  if (actesLourds.length > 0) {
    valide = true;
    justifications.push(
      `Acte(s) sur plateau technique lourd : ${actesLourds
        .map((a) => `${a.code} (${a.libelle})`)
        .join(', ')}.`,
    );
  }

  const codes = codesCcamDistincts(dossier);
  if (codes.length >= 2) {
    valide = true;
    justifications.push(
      `${codes.length} actes CCAM dénombrables distincts : ${codes.join(', ')} ` +
        '— actes coordonnés sur un plateau technique.',
    );
  }

  if (!valide) {
    justifications.push(
      `Densité technique insuffisante : ${codes.length} acte(s) CCAM dénombrable(s) ` +
        'distinct(s), aucun acte sur plateau technique lourd.',
    );
  }

  return { valide, justifications };
}

/* ------------------------------------------------------------------ *
 * Pilier 3
 * ------------------------------------------------------------------ */

export function evaluerPilier3(dossier: DossierHDJ): Pilier {
  const justifications: string[] = [];

  const nbMedecins = medecinsActifs(dossier).length;
  const specialites = specialitesMedicalesDistinctes(dossier);
  const professionsParamedicales = professionsParamedicalesDistinctes(dossier);

  // Option 3A — au moins 2 médecins de spécialités distinctes.
  const option3A = nbMedecins >= 2 && specialites.length >= 2;
  if (option3A) {
    justifications.push(
      `${nbMedecins} médecins de spécialités distinctes avec note d’évolution tracée : ` +
        `${specialites.join(', ')}.`,
    );
  } else if (nbMedecins >= 2) {
    justifications.push(
      `${nbMedecins} médecins actifs mais une seule spécialité distincte renseignée ` +
        `(${specialites.length}) : option 3A non remplie.`,
    );
  }

  // Option 3B — 1 médecin + au moins 2 professions paramédicales/sociales distinctes.
  const option3B = nbMedecins >= 1 && professionsParamedicales.length >= 2;
  if (option3B) {
    justifications.push(
      `${nbMedecins} médecin(s) + ${professionsParamedicales.length} professions ` +
        `paramédicales/sociales distinctes avec note d’évolution tracée : ` +
        `${professionsParamedicales.join(', ')}.`,
    );
  } else {
    justifications.push(
      'Option 3B non remplie : il faut au moins 1 médecin et 2 professions ' +
        `paramédicales/sociales distinctes tracées (constaté : ${nbMedecins} médecin(s), ` +
        `${professionsParamedicales.length} profession(s) paramédicale(s)/sociale(s) ` +
        `${professionsParamedicales.length > 0 ? `[${professionsParamedicales.join(', ')}]` : ''}).`,
    );
  }

  const nonTraces = dossier.intervenants.filter((i) => !i.note_evolution_tracee);
  if (nonTraces.length > 0) {
    justifications.push(
      `${nonTraces.length} intervenant(s) exclu(s) du décompte faute de note d’évolution ` +
        'tracée dans le dossier : ' +
        nonTraces.map((i) => `${i.profession} (${i.acte_ou_atelier})`).join(', ') +
        '.',
    );
  }

  return { valide: option3A || option3B, justifications };
}

/* ------------------------------------------------------------------ *
 * Agrégation
 * ------------------------------------------------------------------ */

export function evaluerPiliers(dossier: DossierHDJ): readonly PilierEvaluation[] {
  return [
    { id: 'PILIER_1_SOINS_SURVEILLANCE', libelle: LIBELLES.PILIER_1_SOINS_SURVEILLANCE, ...evaluerPilier1(dossier) },
    { id: 'PILIER_2_PLATEAU_TECHNIQUE', libelle: LIBELLES.PILIER_2_PLATEAU_TECHNIQUE, ...evaluerPilier2(dossier) },
    { id: 'PILIER_3_PLURIPROFESSIONNALITE', libelle: LIBELLES.PILIER_3_PLURIPROFESSIONNALITE, ...evaluerPilier3(dossier) },
  ];
}
