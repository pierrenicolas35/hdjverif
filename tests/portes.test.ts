/**
 * Tests de couverture porte par porte (au-delà des 5 cas obligatoires).
 */

import { describe, expect, it } from 'vitest';

import {
  denombrerInterventions,
  evaluerDossier,
  evaluerPilier2,
  evaluerPorte0,
  evaluerPorte2,
  dossierValide,
  validerDossier,
} from '../src/core/rules-engine/index.js';
import type { ActeCCAM, DossierHDJ } from '../src/core/rules-engine/index.js';

import {
  ACTE_BIO_COMPLEXE,
  ACTE_ECG,
  ACTE_FOGD,
  ACTE_PERFUSION_FER,
  DIETETICIEN,
  IDE,
  MEDECIN_CARDIO,
  MEDECIN_ENDOCRINO,
  PSYCHOLOGUE,
  UCD_ANTICORPS_MONOCLONAL,
  dossier,
  intervenant,
} from './fixtures.js';

const ACTE_BIO_COMPLEXE_2: ActeCCAM = {
  ...ACTE_BIO_COMPLEXE,
  code: 'ZZQL003',
  libelle: 'Épreuve métabolique dynamique (donnée de test)',
};

/* ================================================================== *
 * Porte 0 — filtre de champ
 * ================================================================== */

describe('Porte 0 — filtre de champ d’application', () => {
  it('dialyse → REJET_VERS_FORFAIT_SEANCE', () => {
    const resultat = evaluerDossier(dossier({ regime_champ: 'DIALYSE' }));
    expect(resultat.statut).toBe('REJET_VERS_FORFAIT_SEANCE');
    expect(resultat.porte_blocage).toBe('PORTE_0_CHAMP');
  });

  it('chimiothérapie → REJET_VERS_FORFAIT_SEANCE', () => {
    const resultat = evaluerDossier(dossier({ regime_champ: 'CHIMIOTHERAPIE' }));
    expect(resultat.statut).toBe('REJET_VERS_FORFAIT_SEANCE');
  });

  it('SMR → REJET_HORS_MCO', () => {
    const resultat = evaluerDossier(dossier({ regime_champ: 'SMR' }));
    expect(resultat.statut).toBe('REJET_HORS_MCO');
  });

  it('psychiatrie → REJET_HORS_MCO', () => {
    const resultat = evaluerDossier(dossier({ regime_champ: 'PSYCHIATRIE' }));
    expect(resultat.statut).toBe('REJET_HORS_MCO');
  });

  it('MCO général → porte 0 franchie', () => {
    expect(evaluerPorte0(dossier({ regime_champ: 'MCO_GENERAL' }))).toBeNull();
  });

  it('n’évalue pas les piliers lorsqu’une porte 0 bloque', () => {
    const resultat = evaluerDossier(dossier({ regime_champ: 'PSYCHIATRIE' }));
    expect(resultat.piliers).toHaveLength(0);
    expect(resultat.piliers_valides).toHaveLength(0);
  });
});

/* ================================================================== *
 * Porte 1 — prérequis médico-administratifs
 * ================================================================== */

describe('Porte 1 — prérequis médico-administratifs', () => {
  it('séjour non programmé → REJET_NON_PROGRAMME', () => {
    const resultat = evaluerDossier(
      dossier({
        est_programme: false,
        actes_ccam: [ACTE_FOGD],
        intervenants: [MEDECIN_ENDOCRINO, IDE, DIETETICIEN],
      }),
    );
    expect(resultat.statut).toBe('REJET_NON_PROGRAMME');
    expect(resultat.porte_blocage).toBe('PORTE_1_PREREQUIS');
  });

  it('lettre d’adressage manquante mais ressources présentes → SUSPENDU_POUR_REGULARISATION', () => {
    const resultat = evaluerDossier(
      dossier({
        lettre_adressage_presente: false,
        actes_ccam: [ACTE_ECG],
        intervenants: [MEDECIN_ENDOCRINO, IDE, DIETETICIEN],
      }),
    );
    expect(resultat.statut).toBe('SUSPENDU_POUR_REGULARISATION');
    expect(resultat.motifs_blocage.join(' ')).toContain('adressage');
  });

  it('documents manquants et aucune ressource → REJET_VERS_ACE', () => {
    const resultat = evaluerDossier(
      dossier({
        synthese_medicale_tracee: false,
        lettre_adressage_presente: false,
        actes_ccam: [],
        intervenants: [],
      }),
    );
    expect(resultat.statut).toBe('REJET_VERS_ACE');
  });

  it('tous les prérequis réunis → porte 1 franchie', () => {
    const resultat = evaluerDossier(
      dossier({
        actes_ccam: [ACTE_FOGD],
        intervenants: [MEDECIN_ENDOCRINO],
      }),
    );
    expect(resultat.statut).toBe('VALIDE_GHS');
  });
});

/* ================================================================== *
 * Porte 2 — acte isolé réalisable en externe
 * ================================================================== */

describe('Porte 2 — exclusion des actes isolés réalisables en externe', () => {
  const base: DossierHDJ = dossier({
    actes_ccam: [ACTE_PERFUSION_FER],
    intervenants: [IDE],
  });

  it('un acte isolé, externe, sans surveillance et ≤ 1 intervenant actif → rejet', () => {
    const issue = evaluerPorte2(base);
    expect(issue?.statut).toBe('REJET_VERS_ACE');
  });

  it('la surveillance active documentée neutralise l’exclusion', () => {
    expect(
      evaluerPorte2({ ...base, surveillance_active_documentee: true }),
    ).toBeNull();
  });

  it('deux intervenants actifs neutralisent l’exclusion', () => {
    expect(
      evaluerPorte2({ ...base, intervenants: [IDE, MEDECIN_ENDOCRINO] }),
    ).toBeNull();
  });

  it('un intervenant non tracé ne compte pas comme intervenant actif', () => {
    const issue = evaluerPorte2({
      ...base,
      intervenants: [IDE, { ...MEDECIN_ENDOCRINO, note_evolution_tracee: false }],
    });
    expect(issue?.statut).toBe('REJET_VERS_ACE');
  });

  it('un acte non réalisable en externe neutralise l’exclusion', () => {
    expect(
      evaluerPorte2({ ...base, actes_ccam: [ACTE_BIO_COMPLEXE] }),
    ).toBeNull();
  });

  it('deux actes neutralisent l’exclusion', () => {
    expect(
      evaluerPorte2({ ...base, actes_ccam: [ACTE_PERFUSION_FER, ACTE_BIO_COMPLEXE] }),
    ).toBeNull();
  });
});

/* ================================================================== *
 * Porte 3 — piliers de densité
 * ================================================================== */

describe('Porte 3 — pilier 1 (soins / surveillance active)', () => {
  it('surveillance active documentée → pilier 1 validé', () => {
    const resultat = evaluerDossier(
      dossier({
        surveillance_active_documentee: true,
        actes_ccam: [ACTE_BIO_COMPLEXE],
        intervenants: [IDE],
      }),
    );
    expect(resultat.statut).toBe('VALIDE_GHS');
    expect(resultat.piliers_valides).toContain('PILIER_1_SOINS_SURVEILLANCE');
  });

  it('produit à réserve hospitalière → pilier 1 validé', () => {
    const resultat = evaluerDossier(
      dossier({
        actes_ccam: [ACTE_BIO_COMPLEXE],
        medicaments: [UCD_ANTICORPS_MONOCLONAL],
        intervenants: [MEDECIN_ENDOCRINO],
      }),
    );
    expect(resultat.statut).toBe('VALIDE_GHS');
    expect(resultat.piliers_valides).toContain('PILIER_1_SOINS_SURVEILLANCE');
  });
});

describe('Porte 3 — pilier 2 (plateau technique / actes coordonnés)', () => {
  it('acte sur plateau technique lourd → pilier 2 validé', () => {
    const resultat = evaluerDossier(
      dossier({ actes_ccam: [ACTE_FOGD], intervenants: [MEDECIN_ENDOCRINO] }),
    );
    expect(resultat.piliers_valides).toContain('PILIER_2_PLATEAU_TECHNIQUE');
  });

  it('deux actes CCAM dénombrables distincts → pilier 2 validé', () => {
    const resultat = evaluerDossier(
      dossier({
        actes_ccam: [ACTE_BIO_COMPLEXE, ACTE_BIO_COMPLEXE_2],
        intervenants: [MEDECIN_ENDOCRINO],
      }),
    );
    expect(resultat.piliers_valides).toContain('PILIER_2_PLATEAU_TECHNIQUE');
  });

  it('l’ECG DEQP003 n’est pas dénombrable (annexe 4, 2.b.iii)', () => {
    const evaluation = evaluerPilier2(
      dossier({ actes_ccam: [ACTE_ECG, ACTE_ECG], intervenants: [IDE] }),
    );
    expect(evaluation.valide).toBe(false);
  });
});

describe('Porte 3 — pilier 3 (pluriprofessionnalité concertée)', () => {
  it('option 3A — deux médecins de spécialités distinctes → validé', () => {
    const resultat = evaluerDossier(
      dossier({
        actes_ccam: [ACTE_BIO_COMPLEXE],
        intervenants: [MEDECIN_ENDOCRINO, MEDECIN_CARDIO],
      }),
    );
    expect(resultat.piliers_valides).toContain('PILIER_3_PLURIPROFESSIONNALITE');
  });

  it('option 3A — deux médecins de même spécialité → non validé', () => {
    const resultat = evaluerDossier(
      dossier({
        actes_ccam: [ACTE_BIO_COMPLEXE],
        intervenants: [
          MEDECIN_ENDOCRINO,
          intervenant('MEDECIN', { id: 'med-endo-2', specialite_medicale: 'Endocrinologie' }),
        ],
      }),
    );
    expect(resultat.statut).toBe('REJET_VERS_ACE');
  });

  it('option 3B — un médecin + deux professions paramédicales distinctes → validé', () => {
    const resultat = evaluerDossier(
      dossier({
        actes_ccam: [ACTE_ECG],
        intervenants: [MEDECIN_ENDOCRINO, IDE, PSYCHOLOGUE],
      }),
    );
    expect(resultat.piliers_valides).toContain('PILIER_3_PLURIPROFESSIONNALITE');
  });

  it('option 3B — un médecin + deux intervenants de même profession → non validé', () => {
    const resultat = evaluerDossier(
      dossier({
        actes_ccam: [ACTE_ECG],
        intervenants: [
          MEDECIN_ENDOCRINO,
          IDE,
          intervenant('IDE', { id: 'ide-2' }),
        ],
      }),
    );
    expect(resultat.statut).toBe('REJET_VERS_ACE');
    expect(resultat.porte_blocage).toBe('PORTE_4_DECISION');
  });

  it('option 3B — sans médecin coordonnateur → non validé', () => {
    const resultat = evaluerDossier(
      dossier({
        actes_ccam: [ACTE_ECG],
        intervenants: [IDE, DIETETICIEN],
      }),
    );
    expect(resultat.statut).toBe('REJET_VERS_ACE');
  });
});

/* ================================================================== *
 * Porte 4 — décision et alertes qualité
 * ================================================================== */

describe('Porte 4 — décision finale et alertes qualité', () => {
  it('aucun pilier validé → REJET_VERS_ACE pour défaut d’intensité', () => {
    const resultat = evaluerDossier(
      dossier({ actes_ccam: [ACTE_ECG], intervenants: [MEDECIN_ENDOCRINO, IDE] }),
    );
    expect(resultat.statut).toBe('REJET_VERS_ACE');
    expect(resultat.motifs_blocage.join(' ')).toContain('intensité');
  });

  it('durée < 180 min → alerte qualité non bloquante', () => {
    const resultat = evaluerDossier(
      dossier({
        duree_presence_minutes: 120,
        surveillance_active_documentee: true,
        actes_ccam: [ACTE_BIO_COMPLEXE],
        intervenants: [IDE],
      }),
    );
    expect(resultat.statut).toBe('VALIDE_GHS');
    expect(resultat.alertes_controle.join(' ')).toContain(
      'Durée < 3h : vigilance accrue en contrôle T2A sur la densité des soins',
    );
  });

  it('lettre de liaison non remise → alerte de traçabilité', () => {
    const resultat = evaluerDossier(
      dossier({
        lettre_liaison_remise: false,
        surveillance_active_documentee: true,
        actes_ccam: [ACTE_BIO_COMPLEXE],
        intervenants: [IDE],
      }),
    );
    // Alerte non bloquante : le séjour reste validé.
    expect(resultat.statut).toBe('VALIDE_GHS');
    expect(resultat.alertes_controle.join(' ')).toContain('Lettre de liaison non remise');
  });
});

/* ================================================================== *
 * Dénombrement des interventions (annexe 4, point 2.b.iii)
 * ================================================================== */

describe('Dénombrement des interventions', () => {
  it('compte actes + médecins de spécialités distinctes + paramédicaux tracés', () => {
    const nb = denombrerInterventions(
      dossier({
        actes_ccam: [ACTE_BIO_COMPLEXE, ACTE_BIO_COMPLEXE_2],
        intervenants: [MEDECIN_ENDOCRINO, MEDECIN_CARDIO, IDE, DIETETICIEN],
      }),
    );
    expect(nb).toBe(2 + 2 + 2);
  });

  it('ne compte pas l’ECG DEQP003 ni les intervenants non tracés', () => {
    const nb = denombrerInterventions(
      dossier({
        actes_ccam: [ACTE_ECG],
        intervenants: [MEDECIN_ENDOCRINO, { ...IDE, note_evolution_tracee: false }],
      }),
    );
    expect(nb).toBe(1);
  });
});

/* ================================================================== *
 * Validation d’entrée
 * ================================================================== */

describe('Validation du dossier', () => {
  it('accepte un dossier conforme', () => {
    expect(dossierValide(dossier({ intervenants: [MEDECIN_ENDOCRINO] }))).toBe(true);
  });

  it('rejette une date non ISO et une profession inconnue', () => {
    const invalide = {
      ...dossier(),
      date_sejour: '15/04/2026',
      intervenants: [{ ...IDE, profession: 'INCONNUE' }],
    } as unknown as DossierHDJ;
    const erreurs = validerDossier(invalide);
    expect(erreurs.map((e) => e.champ)).toContain('date_sejour');
    expect(erreurs.map((e) => e.champ)).toContain('intervenants[0].profession');
  });

  it('exige une spécialité pour un médecin', () => {
    const erreurs = validerDossier(
      dossier({ intervenants: [intervenant('MEDECIN', { id: 'med-spec' })] }),
    );
    expect(erreurs.map((e) => e.champ)).toContain('intervenants[0].specialite_medicale');
  });
});
