/**
 * Tests unitaires du moteur décisionnel HDJ.
 *
 * Les 5 cas obligatoires du cahier des charges sont explicitement identifiés
 * par les blocs `Test 1` … `Test 5`.
 */

import { describe, expect, it } from 'vitest';

import { evaluerDossier, resultatCoherent } from '../src/core/rules-engine/index.js';
import type { ResultatAudit } from '../src/core/rules-engine/index.js';

import {
  CAS_CHIMIOTHERAPIE,
  CAS_DIABETE_CONFORME,
  CAS_DIABETE_DIET_NON_TRACEE,
  CAS_DIABETE_SANS_SYNTHESE,
  CAS_PERFUSION_FER,
  ACTE_BIO_COMPLEXE,
  IDE,
  dossier,
} from './fixtures.js';

/** Invariants applicables à tout résultat d'audit. */
function verifierInvariants(resultat: ResultatAudit): void {
  expect(resultat.synthese_audit).toContain(resultat.statut);
  expect(resultatCoherent(resultat)).toBe(true);
  if (resultat.statut === 'VALIDE_GHS') {
    expect(resultat.ghs_autorise).toBe(true);
    expect(resultat.piliers_valides.length).toBeGreaterThan(0);
    expect(resultat.motifs_blocage).toHaveLength(0);
    expect(resultat.porte_blocage).toBeNull();
  } else {
    expect(resultat.ghs_autorise).toBe(false);
    expect(resultat.motifs_blocage.length).toBeGreaterThan(0);
    expect(resultat.porte_blocage).not.toBeNull();
  }
}

describe('Moteur décisionnel HDJ — 5 portes séquentielles', () => {
  /* ---------------------------------------------------------------- *
   * Test 1 — cas conforme multidisciplinaire diabète
   * ---------------------------------------------------------------- */
  it('Test 1 — bilan diabète pluridisciplinaire (Médecin + IDE + Diététicien tracés) → VALIDE_GHS', () => {
    const resultat = evaluerDossier(CAS_DIABETE_CONFORME);

    expect(resultat.statut).toBe('VALIDE_GHS');
    expect(resultat.ghs_autorise).toBe(true);
    expect(resultat.severite).toBe('VERT');
    expect(resultat.piliers_valides).toContain('PILIER_3_PLURIPROFESSIONNALITE');
    expect(resultat.motifs_blocage).toHaveLength(0);
    expect(resultat.porte_blocage).toBeNull();

    // La durée (300 min ≥ 180) ne doit pas déclencher d'alerte.
    expect(resultat.alertes_controle.some((a) => a.includes('Durée < 3h'))).toBe(false);

    verifierInvariants(resultat);
  });

  /* ---------------------------------------------------------------- *
   * Test 2 — diététicienne sans note d'évolution tracée
   * ---------------------------------------------------------------- */
  it('Test 2 — diététicienne sans note tracée → REJET_VERS_ACE (pluridisciplinarité non justifiée)', () => {
    const resultat = evaluerDossier(CAS_DIABETE_DIET_NON_TRACEE);

    expect(resultat.statut).toBe('REJET_VERS_ACE');
    expect(resultat.ghs_autorise).toBe(false);
    expect(resultat.severite).toBe('ROUGE');
    expect(resultat.piliers_valides).toHaveLength(0);
    expect(resultat.porte_blocage).toBe('PORTE_4_DECISION');

    const pilier3 = resultat.piliers.find((p) => p.id === 'PILIER_3_PLURIPROFESSIONNALITE');
    expect(pilier3?.valide).toBe(false);
    expect(pilier3?.justifications.join(' ')).toContain('DIETETICIEN');

    expect(resultat.motifs_blocage.join(' ')).toContain('intensité');

    verifierInvariants(resultat);
  });

  /* ---------------------------------------------------------------- *
   * Test 3 — absence de synthèse médicale signée
   * ---------------------------------------------------------------- */
  it('Test 3 — absence de synthèse médicale signée → SUSPENDU_POUR_REGULARISATION', () => {
    const resultat = evaluerDossier(CAS_DIABETE_SANS_SYNTHESE);

    expect(resultat.statut).toBe('SUSPENDU_POUR_REGULARISATION');
    expect(resultat.ghs_autorise).toBe(false);
    expect(resultat.severite).toBe('ORANGE');
    expect(resultat.porte_blocage).toBe('PORTE_1_PREREQUIS');
    expect(resultat.motifs_blocage.join(' ')).toContain('synthèse médicale');

    // Les ressources étant suffisantes, le pilier 3 reste validé : la
    // régularisation est possible avant validation DIM.
    expect(resultat.piliers_valides).toContain('PILIER_3_PLURIPROFESSIONNALITE');

    verifierInvariants(resultat);
  });

  /* ---------------------------------------------------------------- *
   * Test 4 — perfusion simple de fer, sans surveillance continue
   * ---------------------------------------------------------------- */
  it('Test 4 — perfusion isolée de fer sans surveillance → REJET_VERS_ACE (acte isolé externe)', () => {
    const resultat = evaluerDossier(CAS_PERFUSION_FER);

    expect(resultat.statut).toBe('REJET_VERS_ACE');
    expect(resultat.ghs_autorise).toBe(false);
    expect(resultat.porte_blocage).toBe('PORTE_2_ACTE_ISOLE');
    expect(resultat.motifs_blocage.join(' ')).toContain('isolé');

    // Alerte qualité attendue : durée de présence 90 min < 180 min.
    expect(resultat.alertes_controle.join(' ')).toContain('Durée < 3h');

    verifierInvariants(resultat);
  });

  /* ---------------------------------------------------------------- *
   * Test 5 — séance de chimiothérapie
   * ---------------------------------------------------------------- */
  it('Test 5 — séance de chimiothérapie → REJET_VERS_FORFAIT_SEANCE', () => {
    const resultat = evaluerDossier(CAS_CHIMIOTHERAPIE);

    expect(resultat.statut).toBe('REJET_VERS_FORFAIT_SEANCE');
    expect(resultat.ghs_autorise).toBe(false);
    expect(resultat.porte_blocage).toBe('PORTE_0_CHAMP');
    expect(resultat.motifs_blocage.join(' ')).toContain('forfait de séance');

    verifierInvariants(resultat);
  });
});

describe('Déterminisme et traçabilité du moteur', () => {
  it('produit un résultat identique pour un même dossier (pure fonction)', () => {
    const a = evaluerDossier(CAS_DIABETE_CONFORME);
    const b = evaluerDossier(CAS_DIABETE_CONFORME);
    expect(a).toEqual(b);
  });

  it('formule la décision en langage courant (GHS plein / intermédiaire)', () => {
    const resultat = evaluerDossier(CAS_DIABETE_CONFORME);
    expect(resultat.niveau_ghs).toBe('INTERMEDIAIRE');
    expect(resultat.libelle_decision).toBe('HDJ validée — facturation en GHS intermédiaire');
  });

  it('retient un GHS plein dès qu’une surveillance particulière est documentée', () => {
    const resultat = evaluerDossier(
      dossier({
        surveillance_active_documentee: true,
        actes_ccam: [ACTE_BIO_COMPLEXE],
        intervenants: [IDE],
      }),
    );
    expect(resultat.statut).toBe('VALIDE_GHS');
    expect(resultat.niveau_ghs).toBe('PLEIN');
    expect(resultat.libelle_decision).toBe('HDJ validée — facturation en GHS plein');
  });

  it('n’expose aucun niveau de GHS lorsque la facturation est écartée', () => {
    const resultat = evaluerDossier(CAS_PERFUSION_FER);
    expect(resultat.niveau_ghs).toBeNull();
    expect(resultat.libelle_decision).toBe(
      'Facturation en HDJ non validée — actes et consultations externes',
    );
  });

  it('génère une synthèse opposable citant l’instruction DGOS 2020/52', () => {
    const resultat = evaluerDossier(CAS_PERFUSION_FER);
    expect(resultat.synthese_audit).toContain('DGOS/R1/DSS/1A/2020/52');
    expect(resultat.synthese_audit).toContain('SSAH2007743J');
    expect(resultat.synthese_audit).toContain('PYRAMIDE DES 5 PORTES SÉQUENTIELLES');
    expect(resultat.synthese_audit).toContain('MOTIFS DE BLOCAGE');
    expect(resultat.constats.length).toBeGreaterThan(0);
  });

  it('signale que la densité n’est qu’indicative quand la porte 3 n’est pas atteinte', () => {
    const suspendu = evaluerDossier(CAS_DIABETE_SANS_SYNTHESE);
    expect(suspendu.synthese_audit).toContain('appréciation indicative');
    expect(suspendu.synthese_audit).toContain('Porte 3 non atteinte');

    const valide = evaluerDossier(CAS_DIABETE_CONFORME);
    expect(valide.synthese_audit).not.toContain('appréciation indicative');
  });
});
