/**
 * PORTE 4 — Décision finale et alertes qualité.
 *
 *  - au moins un pilier validé (et Portes 1 & 2 franchies) → VALIDE_GHS ;
 *  - aucun pilier validé → REJET_VERS_ACE pour défaut d'intensité des
 *    ressources mobilisées.
 *
 * Alertes qualité non bloquantes (fonction `alertesQualite`) :
 *  - durée de présence < 180 minutes : vigilance T2A renforcée sur la densité ;
 *  - lettre de liaison non remise : traçabilité incomplète au dossier ;
 *  - réserve hospitalière absente du référentiel : valeur non déterminée, à confirmer
 *    par la pharmacie à usage intérieur — jamais convertie en « hors réserve ».
 */

import { denombrerInterventions, medicamentsReferenceIncomplete } from '../helpers.js';
import type { DossierHDJ, PilierEvaluation } from '../types.js';
import { constat, type IssuePorte } from './types.js';

const PORTE = 'PORTE_4_DECISION' as const;

/** Seuil d'alerte qualité sur la durée de présence (minutes). */
export const SEUIL_DUREE_ALERTE_MINUTES = 180;

/**
 * Alertes qualité, indépendantes du statut retenu. Restituées au contrôleur
 * sans jamais bloquer la décision.
 */
export function alertesQualite(dossier: DossierHDJ): readonly string[] {
  const alertes: string[] = [];

  if (dossier.duree_presence_minutes < SEUIL_DUREE_ALERTE_MINUTES) {
    alertes.push(
      'Durée < 3h : vigilance accrue en contrôle T2A sur la densité des soins ' +
        `(durée de présence déclarée : ${dossier.duree_presence_minutes} min pour un seuil ` +
        `d’alerte de ${SEUIL_DUREE_ALERTE_MINUTES} min).`,
    );
  }

  if (!dossier.lettre_liaison_remise) {
    alertes.push(
      'Lettre de liaison non remise : traçabilité incomplète au dossier du patient ' +
        '(mention requise à l’article R. 1112-1-2 du code de la santé publique).',
    );
  }

  const nonDetermines = medicamentsReferenceIncomplete(dossier);
  if (nonDetermines.length > 0) {
    alertes.push(
      'Réserve hospitalière absente du référentiel — valeur non déterminée pour : ' +
        nonDetermines
          .map((m) => `${m.libelle} (code ${m.code_ucd})`)
          .join(', ') +
        '. Cette absence n’est pas interprétée comme « hors réserve hospitalière » : ' +
        'elle ne justifie pas à elle seule les moyens mobilisés et demande la confirmation ' +
        'de la pharmacie à usage intérieur.',
    );
  }

  return alertes;
}

export function evaluerPorte4(
  dossier: DossierHDJ,
  piliers: readonly PilierEvaluation[],
): IssuePorte {
  const piliersValides = piliers.filter((p) => p.valide);

  if (piliersValides.length > 0) {
    const nbInterventions = denombrerInterventions(dossier);
    const constats = [
      constat(
        PORTE,
        'DENSITE_VALIDEE',
        `Au moins un pilier de densité validé (${piliersValides
          .map((p) => p.id)
          .join(', ')}) : la mobilisation des moyens de la structure d’hospitalisation ` +
          `de jour est établie (${nbInterventions} intervention(s) dénombrée(s) au sens ` +
          'de l’annexe 4, point 2.b.iii).',
        'PORTE_3_PLURIPROFESSIONNALITE',
      ),
      constat(
        PORTE,
        'TRACABILITE_OK',
        'Éléments de traçabilité permettant de caractériser l’hospitalisation de jour ' +
          'présents au dossier du patient.',
        'PORTE_4_TRACABILITE_DOSSIER',
      ),
    ];

    if (dossier.duree_presence_minutes < SEUIL_DUREE_ALERTE_MINUTES) {
      constats.push(
        constat(
          PORTE,
          'ALERTE_DUREE',
          'Durée de présence inférieure à 3 heures : alerte qualité non bloquante.',
          'PORTE_4_ALERTE_DUREE',
        ),
      );
    }

    return { porte: PORTE, statut: 'VALIDE_GHS', motifs_blocage: [], constats };
  }

  return {
    porte: PORTE,
    statut: 'REJET_VERS_ACE',
    motifs_blocage: [
      'Défaut d’intensité des ressources mobilisées : aucun des trois piliers de densité ' +
        'n’est validé.',
      'La prise en charge ne peut être facturée en GHS et relève des actes et ' +
        'consultations externes (ACE / CSO).',
    ],
    constats: [
      constat(
        PORTE,
        'AUCUN_PILIER_VALIDE',
        'Aucun pilier de densité (soins/surveillance, plateau technique, ' +
          'pluriprofessionnalité concertée) n’est satisfait.',
        'PORTE_3_PLURIPROFESSIONNALITE',
      ),
    ],
  };
}
