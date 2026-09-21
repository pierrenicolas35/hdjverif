/**
 * Génération de la synthèse d'audit — texte structuré et opposable en contrôle.
 */

import { INSTRUCTION_DGOS_2020_52 } from './references.js';
import type {
  Constat,
  DossierHDJ,
  EtapePorte,
  PilierEvaluation,
  ResultatAudit,
  StatutAudit,
  StatutPorte,
} from './types.js';

const LARGEUR = 78;
const REGLE = '='.repeat(LARGEUR);
const SEPARATEUR = '-'.repeat(LARGEUR);

export interface ParametresSynthese {
  readonly dossier: DossierHDJ;
  readonly statut: StatutAudit;
  readonly ghs_autorise: boolean;
  readonly date_evaluation: string;
  readonly piliers: readonly PilierEvaluation[];
  readonly motifs_blocage: readonly string[];
  readonly alertes_controle: readonly string[];
  readonly constats: readonly Constat[];
  readonly portes: readonly EtapePorte[];
}

/** Alignement d'un libellé sur la largeur de la fiche. */
function ligne(label: string, valeur: string, largeurLabel = 34): string {
  const points = Math.max(1, largeurLabel - label.length);
  return `  ${label} ${'.'.repeat(points)} ${valeur}`;
}

/** Rendu textuel d'un statut de porte. */
function marqueur(statut: StatutPorte): string {
  switch (statut) {
    case 'FRANCHIE':
      return '[OK]';
    case 'BLOQUANTE':
      return '[!!]';
    case 'NON_EVALUEE':
      return '[--]';
  }
}

/** Liste à puces, ou mention explicite d'absence. */
function puces(items: readonly string[], vide = 'Aucun.'): string {
  if (items.length === 0) return `  ${vide}`;
  return items.map((item) => `  • ${item}`).join('\n');
}

export function construireSynthese(params: ParametresSynthese): string {
  const {
    dossier,
    statut,
    ghs_autorise,
    date_evaluation,
    piliers,
    motifs_blocage,
    alertes_controle,
    constats,
    portes,
  } = params;

  const piliersValides = piliers.filter((p) => p.valide);
  const lignes: string[] = [];

  lignes.push(REGLE);
  lignes.push('  FICHE D’AUDIT DÉCISIONNEL — COTATION HDJ (GHS) vs ACTES EXTERNES (ACE)');
  lignes.push(`  Instruction N° ${INSTRUCTION_DGOS_2020_52.id} du ${INSTRUCTION_DGOS_2020_52.date}`);
  lignes.push(REGLE);
  lignes.push(ligne('Séjour', dossier.id_sejour));
  lignes.push(ligne('Date du séjour', dossier.date_sejour));
  lignes.push(ligne('Date d’évaluation', date_evaluation));
  lignes.push(ligne('Régime de champ', dossier.regime_champ));
  lignes.push(ligne('Durée de présence', `${dossier.duree_presence_minutes} min`));
  lignes.push(ligne('Séjour programmé', dossier.est_programme ? 'OUI' : 'NON'));
  lignes.push(ligne('Lettre d’adressage', dossier.lettre_adressage_presente ? 'PRÉSENTE' : 'ABSENTE'));
  lignes.push(ligne('Synthèse médicale signée', dossier.synthese_medicale_tracee ? 'TRACÉE' : 'ABSENTE'));
  lignes.push(ligne('Lettre de liaison remise', dossier.lettre_liaison_remise ? 'OUI' : 'NON'));
  lignes.push(
    ligne('Surveillance active documentée', dossier.surveillance_active_documentee ? 'OUI' : 'NON'),
  );

  lignes.push(SEPARATEUR);
  lignes.push(`  DÉCISION : ${statut}`);
  lignes.push(`  GHS facturable : ${ghs_autorise ? 'OUI' : 'NON'}`);
  lignes.push(
    `  Piliers validés : ${piliersValides.length}/${piliers.length} ` +
      `(${piliersValides.map((p) => p.id).join(', ') || 'aucun'})`,
  );

  lignes.push(SEPARATEUR);
  lignes.push('  PYRAMIDE DES 5 PORTES SÉQUENTIELLES');
  for (const etape of portes) {
    lignes.push(`  ${marqueur(etape.statut)} ${etape.libelle} — ${etape.statut}`);
  }

  lignes.push(SEPARATEUR);
  const porte3 = portes.find((p) => p.porte === 'PORTE_3_DENSITE');
  const densiteAtteinte = porte3?.statut === 'FRANCHIE' || porte3?.statut === 'BLOQUANTE';
  lignes.push(
    '  ÉVALUATION DE LA DENSITÉ EN RESSOURCES (PORTE 3)' +
      (densiteAtteinte ? '' : ' — appréciation indicative'),
  );
  if (piliers.length === 0) {
    lignes.push('  Non évaluée : une porte bloquante en amont interrompt l’analyse.');
  } else {
    if (!densiteAtteinte) {
      lignes.push(
        '  (Porte 3 non atteinte : les éléments ci-dessous sont fournis pour ' +
          'l’appréciation des ressources au titre de la porte 1.)',
      );
    }
    for (const pilier of piliers) {
      lignes.push(`  ${pilier.valide ? '[VALIDÉ]' : '[ÉCHEC ]'} ${pilier.libelle}`);
      for (const justification of pilier.justifications) {
        lignes.push(`        – ${justification}`);
      }
    }
  }

  lignes.push(SEPARATEUR);
  lignes.push('  MOTIFS DE BLOCAGE (OPPOSABLES)');
  lignes.push(puces(motifs_blocage));

  lignes.push(SEPARATEUR);
  lignes.push('  ALERTES QUALITÉ / CONTRÔLE T2A');
  lignes.push(puces(alertes_controle));

  lignes.push(SEPARATEUR);
  lignes.push('  CONSTATS ET RÉFÉRENCES NORMATIVES');
  if (constats.length === 0) {
    lignes.push('  Aucun.\n');
  } else {
    for (const c of constats) {
      lignes.push(`  • [${c.code}] ${c.message}`);
      lignes.push(`    ↳ ${c.porte} — ${c.reference}`);
    }
  }

  lignes.push(SEPARATEUR);
  lignes.push('  TEXTES DE RÉFÉRENCE');
  lignes.push(`  • Instruction N° ${INSTRUCTION_DGOS_2020_52.id} du ${INSTRUCTION_DGOS_2020_52.date},`);
  lignes.push(`    ${INSTRUCTION_DGOS_2020_52.titre}.`);
  lignes.push(`    NOR : ${INSTRUCTION_DGOS_2020_52.nor} — ${INSTRUCTION_DGOS_2020_52.publication}.`);
  lignes.push('  • Code de la sécurité sociale, art. L. 162-22-6 et R. 162-33-1.');
  lignes.push('  • Arrêté du 19 février 2015 modifié (art. 11 et 11 bis).');
  lignes.push(
    '  • En cas de divergence d’interprétation : dispositif de rescrit tarifaire (annexe 6).',
  );
  lignes.push(REGLE);

  return lignes.join('\n');
}

/** Vérifie l'invariant d'opposabilité du résultat produit. */
export function resultatCoherent(resultat: ResultatAudit): boolean {
  if (resultat.statut === 'VALIDE_GHS') {
    return resultat.ghs_autorise && resultat.piliers_valides.length > 0;
  }
  return !resultat.ghs_autorise;
}
