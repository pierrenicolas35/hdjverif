/**
 * API publique du moteur décisionnel HDJ.
 *
 * Point d'entrée unique : `evaluerDossier(dossier)` → `ResultatAudit`.
 * Aucune dépendance à l'UI : le moteur peut être embarqué tel quel dans un
 * back-office DIM, un script de contrôle T2A ou le front de cette application.
 *
 * @example
 * ```ts
 * import { evaluerDossier } from './core/rules-engine/index.js';
 *
 * const audit = evaluerDossier(dossier);
 * if (audit.ghs_autorise) { ... }
 * ```
 */

export { evaluerDossier, severiteDe, PORTES, libelleDecision } from './engine.js';

export { evaluerPorte0 } from './ports/porte0-champ.js';
export { evaluerPorte1 } from './ports/porte1-prerequis.js';
export { evaluerPorte2 } from './ports/porte2-acte-isole.js';
export { evaluerPiliers, evaluerPilier1, evaluerPilier2, evaluerPilier3 } from './ports/porte3-densite.js';
export { evaluerPorte4, alertesQualite, SEUIL_DUREE_ALERTE_MINUTES } from './ports/porte4-decision.js';
export type { IssuePorte } from './ports/types.js';

export { construireSynthese, resultatCoherent } from './synthese.js';
export type { ParametresSynthese } from './synthese.js';

export {
  INSTRUCTION_DGOS_2020_52,
  REFERENCES,
  libelleReference,
} from './references.js';
export type { CodeReference, EntreeReference, TexteReference } from './references.js';

export {
  CRITERES_CONTEXTE_PATIENT,
  LIBELLES_CONTEXTE_PATIENT,
  PROFESSIONS,
  PROFESSIONS_PARAMEDICALES,
  REGIMES_CHAMP,
} from './types.js';
export type {
  ActeCCAM,
  Constat,
  CritereContextePatient,
  DossierHDJ,
  EtapePorte,
  Intervenant,
  MedicamentUCD,
  NiveauGHS,
  PilierEvaluation,
  PilierId,
  PorteId,
  Profession,
  RegimeChamp,
  ResultatAudit,
  Severite,
  StatutAudit,
  StatutPorte,
} from './types.js';

export {
  contextePatientParticulier,
  denombrerInterventions,
  intervenantsActifs,
  niveauGhs,
  medicamentsReferenceIncomplete,
} from './helpers.js';
export { validerDossier, dossierValide } from './validation.js';
export type { ErreurValidation } from './validation.js';
