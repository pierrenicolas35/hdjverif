/**
 * PORTE 2 — Exclusion des actes isolés réalisables en externe.
 *
 * Si — et seulement si — les quatre conditions suivantes sont réunies :
 *   1. un unique acte CCAM au dossier ;
 *   2. cet acte est réalisable en externe ;
 *   3. aucune surveillance active documentée ;
 *   4. au plus un intervenant actif (note d'évolution tracée) ;
 *
 * alors le séjour est requalifié en ACE (consultation / acte externe / CSO).
 *
 * Les actes associés à un forfait « sécurité environnement » ne peuvent en
 * principe donner lieu à facturation d'un GHS (annexe 4, point 2.b.i).
 */

import { intervenantsActifs } from '../helpers.js';
import type { DossierHDJ } from '../types.js';
import { constat, type IssuePorte } from './types.js';

const PORTE = 'PORTE_2_ACTE_ISOLE' as const;

export function evaluerPorte2(dossier: DossierHDJ): IssuePorte | null {
  if (dossier.actes_ccam.length !== 1) return null;

  const acte = dossier.actes_ccam[0];
  if (!acte) return null;
  if (!acte.est_realisable_externe) return null;
  if (dossier.surveillance_active_documentee) return null;
  if (intervenantsActifs(dossier).length > 1) return null;

  return {
    porte: PORTE,
    statut: 'REJET_VERS_ACE',
    motifs_blocage: [
      `Acte technique isolé réalisable en externe : ${acte.code} — ${acte.libelle}.`,
      "Aucune surveillance active documentée et un seul intervenant actif : la prise " +
        'en charge ne mobilise pas les moyens d’une structure d’hospitalisation de jour.',
      'Requalification obligatoire en acte et/ou consultation externe (ACE ou CSO).',
    ],
    constats: [
      constat(
        PORTE,
        'ACTE_ISOLE_REALISABLE_EXTERNE',
        `Un unique acte CCAM (${acte.code}) réalisable en externe, sans surveillance ` +
          'active documentée, ne peut justifier la facturation d’un GHS.',
        'PORTE_2_ACTE_ISOLE',
      ),
      constat(
        PORTE,
        'FORFAIT_SE',
        'Les actes associés à un forfait « sécurité environnement » relèvent en principe ' +
          'de la facturation externe.',
        'PORTE_2_FORFAIT_SE',
      ),
    ],
  };
}
