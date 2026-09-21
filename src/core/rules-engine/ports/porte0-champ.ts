/**
 * PORTE 0 — Filtre de champ d'application.
 *
 * Seules les prises en charge MCO générales relèvent du champ de l'instruction.
 *  - DIALYSE / CHIMIOTHERAPIE : prises en charge « séances » financées par un
 *    forfait de séance (GHS de séance), hors critères de l'instruction.
 *  - SMR / PSYCHIATRIE : hors champ MCO (financements propres).
 *
 * Porte bloquante : une issue non nulle interrompt l'évaluation.
 */

import type { DossierHDJ } from '../types.js';
import { constat, type IssuePorte } from './types.js';

export function evaluerPorte0(dossier: DossierHDJ): IssuePorte | null {
  const porte = 'PORTE_0_CHAMP' as const;

  switch (dossier.regime_champ) {
    case 'DIALYSE':
    case 'CHIMIOTHERAPIE':
      return {
        porte,
        statut: 'REJET_VERS_FORFAIT_SEANCE',
        motifs_blocage: [
          `Régime « ${dossier.regime_champ} » : la prise en charge relève d'une séance ` +
            'forfaitisée et non d\'un GHS évalué au titre de la gradation ambulatoire.',
          'Requalification obligatoire en forfait de séance dédié ' +
            '(séance de dialyse / forfait de séance de chimiothérapie).',
        ],
        constats: [
          constat(
            porte,
            'CHAMP_SEANCE_FORFAITISEE',
            `Régime ${dossier.regime_champ} : séance finançable via un GHS de séance, ` +
              "sans avoir à répondre aux critères de l'instruction.",
            'PORTE_0_SEANCE',
          ),
        ],
      };

    case 'SMR':
    case 'PSYCHIATRIE':
      return {
        porte,
        statut: 'REJET_HORS_MCO',
        motifs_blocage: [
          `Régime « ${dossier.regime_champ} » : prise en charge hors champ MCO.`,
          "L'instruction DGOS/R1/DSS/1A/2020/52 ne s'applique qu'aux établissements " +
            "ayant des activités de médecine, chirurgie, obstétrique et odontologie " +
            "ou une activité d'hospitalisation à domicile.",
        ],
        constats: [
          constat(
            porte,
            'CHAMP_HORS_MCO',
            `Régime ${dossier.regime_champ} : hors périmètre de l'instruction (champ MCO).`,
            'PORTE_0_HORS_MCO',
          ),
        ],
      };

    case 'MCO_GENERAL':
      return null;
  }
}
