/**
 * Contrat commun aux portes du moteur décisionnel.
 *
 * Une porte renvoie soit `null` (franchissement : l'évaluation se poursuit),
 * soit une `IssuePorte` (arrêt immédiat avec statut, motifs et constats).
 */

import type { CodeReference } from '../references.js';
import { libelleReference } from '../references.js';
import type { Constat, PorteId, StatutAudit } from '../types.js';

export interface IssuePorte {
  readonly porte: PorteId;
  readonly statut: StatutAudit;
  readonly motifs_blocage: readonly string[];
  readonly constats: readonly Constat[];
}

/** Construit un constat opposable : code technique + référence normative. */
export function constat(
  porte: PorteId,
  code: string,
  message: string,
  reference: CodeReference,
): Constat {
  return { porte, code, message, reference: libelleReference(reference) };
}
