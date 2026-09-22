/**
 * Orchestrateur du moteur décisionnel HDJ.
 *
 * Évalue un `DossierHDJ` selon les 5 portes séquentielles définies par
 * l'Instruction N° DGOS/R1/DSS/1A/2020/52 et produit un `ResultatAudit`
 * opposable en contrôle T2A.
 *
 * Le moteur est PUREMENT FONCTIONNEL : pas de dépendance UI, DOM, réseau ou
 * horloge système. Deux dossiers identiques produisent toujours le même
 * résultat.
 */

import { niveauGhs } from './helpers.js';
import { evaluerPiliers } from './ports/porte3-densite.js';
import { evaluerPorte0 } from './ports/porte0-champ.js';
import { evaluerPorte1 } from './ports/porte1-prerequis.js';
import { evaluerPorte2 } from './ports/porte2-acte-isole.js';
import { alertesQualite, evaluerPorte4 } from './ports/porte4-decision.js';
import type { IssuePorte } from './ports/types.js';
import { construireSynthese } from './synthese.js';
import type {
  DossierHDJ,
  EtapePorte,
  NiveauGHS,
  PilierEvaluation,
  PorteId,
  ResultatAudit,
  Severite,
  StatutAudit,
  StatutPorte,
} from './types.js';

/** Définition ordonnée des portes (pour la pyramide décisionnelle). */
export const PORTES: readonly { readonly id: PorteId; readonly libelle: string }[] = [
  { id: 'PORTE_0_CHAMP', libelle: 'Porte 0 — Filtre de champ d’application' },
  {
    id: 'PORTE_1_PREREQUIS',
    libelle: 'Porte 1 — Prérequis médico-administratifs et traçabilité',
  },
  {
    id: 'PORTE_2_ACTE_ISOLE',
    libelle: 'Porte 2 — Exclusion des actes isolés réalisables en externe',
  },
  {
    id: 'PORTE_3_DENSITE',
    libelle: 'Porte 3 — Densité en ressources mobilisées',
  },
  { id: 'PORTE_4_DECISION', libelle: 'Porte 4 — Décision finale et alertes qualité' },
];

/** Sévérité UI associée à un statut. */
export function severiteDe(statut: StatutAudit): Severite {
  switch (statut) {
    case 'VALIDE_GHS':
      return 'VERT';
    case 'SUSPENDU_POUR_REGULARISATION':
      return 'ORANGE';
    default:
      return 'ROUGE';
  }
}

/**
 * Décision formulée en langage courant : c'est le libellé affiché au praticien,
 * en lieu et place des codes techniques du moteur.
 */
export function libelleDecision(
  statut: StatutAudit,
  niveau: NiveauGHS | null,
): string {
  switch (statut) {
    case 'VALIDE_GHS':
      return niveau === 'PLEIN'
        ? 'HDJ validée — facturation en GHS plein'
        : 'HDJ validée — facturation en GHS intermédiaire';
    case 'SUSPENDU_POUR_REGULARISATION':
      return 'HDJ à régulariser — pièce(s) manquante(s) au dossier';
    case 'REJET_VERS_ACE':
      return 'Facturation en HDJ non validée — actes et consultations externes';
    case 'REJET_VERS_FORFAIT_SEANCE':
      return 'Facturation en HDJ non validée — forfait de séance';
    case 'REJET_HORS_MCO':
      return 'Facturation en HDJ non validée — hors champ MCO';
    case 'REJET_NON_PROGRAMME':
      return 'Facturation en HDJ non validée — prise en charge non programmée';
  }
}

/** Construit la pyramide des portes jusqu'à l'indice `derniereEvaluee` inclus. */
function construirePortes(
  statuts: ReadonlyMap<PorteId, StatutPorte>,
): readonly EtapePorte[] {
  return PORTES.map((p) => ({
    porte: p.id,
    libelle: p.libelle,
    statut: statuts.get(p.id) ?? 'NON_EVALUEE',
  }));
}

interface ParametresFinalisation {
  readonly dossier: DossierHDJ;
  readonly issue: IssuePorte;
  readonly piliers: readonly PilierEvaluation[];
  readonly portes: readonly EtapePorte[];
}

function finaliser(params: ParametresFinalisation): ResultatAudit {
  const { dossier, issue, piliers, portes } = params;
  const piliersValides = piliers.filter((p) => p.valide).map((p) => p.id);
  const alertes = alertesQualite(dossier);
  const ghsAutorise = issue.statut === 'VALIDE_GHS';
  const niveau = ghsAutorise ? niveauGhs(dossier) : null;

  return {
    statut: issue.statut,
    libelle_decision: libelleDecision(issue.statut, niveau),
    niveau_ghs: niveau,
    severite: severiteDe(issue.statut),
    ghs_autorise: ghsAutorise,
    piliers_valides: piliersValides,
    motifs_blocage: issue.motifs_blocage,
    alertes_controle: alertes,
    piliers,
    constats: issue.constats,
    porte_blocage: ghsAutorise ? null : issue.porte,
    portes,
    synthese_audit: construireSynthese({
      dossier,
      statut: issue.statut,
      libelle_decision: libelleDecision(issue.statut, niveau),
      niveau_ghs: niveau,
      ghs_autorise: ghsAutorise,
      piliers,
      motifs_blocage: issue.motifs_blocage,
      alertes_controle: alertes,
      constats: issue.constats,
      portes,
    }),
  };
}

/**
 * Évalue un dossier de séjour HDJ.
 *
 * Les portes sont évaluées séquentiellement : la première porte bloquante
 * interrompt le processus et les portes suivantes sont marquées NON_EVALUEE.
 */
export function evaluerDossier(dossier: DossierHDJ): ResultatAudit {
  const statuts = new Map<PorteId, StatutPorte>();

  // ---------------------------------------------------------------- Porte 0
  const issue0 = evaluerPorte0(dossier);
  if (issue0) {
    statuts.set('PORTE_0_CHAMP', 'BLOQUANTE');
    return finaliser({ dossier, issue: issue0, piliers: [], portes: construirePortes(statuts) });
  }
  statuts.set('PORTE_0_CHAMP', 'FRANCHIE');

  // Évaluation des piliers (nécessaire aux Portes 1, 3 et 4).
  const piliers = evaluerPiliers(dossier);

  // ---------------------------------------------------------------- Porte 1
  const issue1 = evaluerPorte1(dossier, piliers);
  if (issue1) {
    statuts.set('PORTE_1_PREREQUIS', 'BLOQUANTE');
    return finaliser({ dossier, issue: issue1, piliers, portes: construirePortes(statuts) });
  }
  statuts.set('PORTE_1_PREREQUIS', 'FRANCHIE');

  // ---------------------------------------------------------------- Porte 2
  const issue2 = evaluerPorte2(dossier);
  if (issue2) {
    statuts.set('PORTE_2_ACTE_ISOLE', 'BLOQUANTE');
    return finaliser({ dossier, issue: issue2, piliers, portes: construirePortes(statuts) });
  }
  statuts.set('PORTE_2_ACTE_ISOLE', 'FRANCHIE');

  // ---------------------------------------------------------------- Porte 3
  statuts.set('PORTE_3_DENSITE', piliers.some((p) => p.valide) ? 'FRANCHIE' : 'BLOQUANTE');

  // ---------------------------------------------------------------- Porte 4
  const issue4 = evaluerPorte4(dossier, piliers);
  statuts.set(
    'PORTE_4_DECISION',
    issue4.statut === 'VALIDE_GHS' ? 'FRANCHIE' : 'BLOQUANTE',
  );

  return finaliser({ dossier, issue: issue4, piliers, portes: construirePortes(statuts) });
}
