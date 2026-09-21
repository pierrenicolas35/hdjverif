/**
 * PORTE 1 — Prérequis médico-administratifs et traçabilité (obligations T2A).
 *
 * Conditions cumulatives :
 *   1. séjour programmé (`est_programme`) ;
 *   2. lettre d'adressage / demande médicale préalable présente
 *      (`lettre_adressage_presente`) ;
 *   3. synthèse médicale (compte-rendu ou lettre de sortie signé le jour même)
 *      tracée (`synthese_medicale_tracee`).
 *
 * Traitement des manquements :
 *  - séjour non programmé (ex. passage SAU direct) → REJET_NON_PROGRAMME ;
 *  - séjour programmé mais document manquant, les ressources de soins étant par
 *    ailleurs suffisantes → SUSPENDU_POUR_REGULARISATION (rattrapable avant
 *    validation DIM, évite un rejet sec) ;
 *  - séjour programmé, document manquant ET ressources insuffisantes →
 *    REJET_VERS_ACE (le manquement documentaire ne crée pas de droit à GHS).
 */

import type { DossierHDJ, PilierEvaluation } from '../types.js';
import { constat, type IssuePorte } from './types.js';

const PORTE = 'PORTE_1_PREREQUIS' as const;

/** Un manquement documentaire est-il opposable ? */
function prerequisComplets(dossier: DossierHDJ): boolean {
  return (
    dossier.est_programme &&
    dossier.lettre_adressage_presente &&
    dossier.synthese_medicale_tracee
  );
}

/** Libellés des pièces manquantes. */
function piecesManquantes(dossier: DossierHDJ): readonly string[] {
  const manquantes: string[] = [];
  if (!dossier.lettre_adressage_presente) {
    manquantes.push("lettre d'adressage / demande médicale préalable");
  }
  if (!dossier.synthese_medicale_tracee) {
    manquantes.push(
      'synthèse médicale signée le jour même (compte-rendu d’hospitalisation ou lettre de sortie)',
    );
  }
  return manquantes;
}

export function evaluerPorte1(
  dossier: DossierHDJ,
  piliers: readonly PilierEvaluation[],
): IssuePorte | null {
  if (prerequisComplets(dossier)) return null;

  // Cas 1 — absence totale de programmation.
  if (!dossier.est_programme) {
    return {
      porte: PORTE,
      statut: 'REJET_NON_PROGRAMME',
      motifs_blocage: [
        'Prise en charge non programmée : aucune convocation préalable ni objectif médical formalisé.',
        'Un passage non programmé (ex. admission via les urgences) ne peut être requalifié en séjour HDJ.',
      ],
      constats: [
        constat(
          PORTE,
          'HDJ_NON_PROGRAMMEE',
          "Absence de programmation préalable : la condition commune d'admission en " +
            "structure d'hospitalisation de jour n'est pas remplie.",
          'PORTE_1_PROGRAMMATION',
        ),
      ],
    };
  }

  // Cas 2 — séjour programmé, pièces manquantes.
  const manquantes = piecesManquantes(dossier);
  const ressourcesPresentes = piliers.some((p) => p.valide);

  if (ressourcesPresentes) {
    return {
      porte: PORTE,
      statut: 'SUSPENDU_POUR_REGULARISATION',
      motifs_blocage: [
        `Pièce(s) obligatoire(s) manquante(s) : ${manquantes.join(' ; ')}.`,
        'Séjour programmé et densité de ressources suffisante : régularisation ' +
          'possible avant validation DIM (pas de rejet sec).',
      ],
      constats: [
        constat(
          PORTE,
          'DOCUMENT_OBLIGATOIRE_MANQUANT',
          `Traçabilité incomplète au dossier du patient : ${manquantes.join(' ; ')}.`,
          'PORTE_1_TRACABILITE',
        ),
      ],
    };
  }

  // Cas 3 — séjour programmé, pièces manquantes ET ressources insuffisantes.
  return {
    porte: PORTE,
    statut: 'REJET_VERS_ACE',
    motifs_blocage: [
      `Pièce(s) obligatoire(s) manquante(s) : ${manquantes.join(' ; ')}.`,
      'Aucun pilier de densité validé : le manquement documentaire ne peut être ' +
        'compensé, la prise en charge relève des actes et consultations externes.',
    ],
    constats: [
      constat(
        PORTE,
        'DOCUMENT_OBLIGATOIRE_MANQUANT',
        `Traçabilité incomplète au dossier du patient : ${manquantes.join(' ; ')}.`,
        'PORTE_1_TRACABILITE',
      ),
      constat(
        PORTE,
        'AUCUNE_DENSITE',
        'Aucune ressource mobilisée ne caractérise une hospitalisation de jour.',
        'PORTE_1_STRUCTURE_HDJ',
      ),
    ],
  };
}
