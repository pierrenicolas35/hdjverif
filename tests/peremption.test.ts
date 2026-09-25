/**
 * Tests de la règle de fraîcheur du référentiel (`peremptionMaj`).
 *
 * Cette règle est volontairement **pure** : elle reçoit les lignes de `referentiel_maj` et
 * une date, et rend un avis. On vérifie ici ce qu'un praticien doit pouvoir comprendre —
 * le référentiel est-il contrôlé, depuis quand, et que faut-il en conclure — sans réseau,
 * sans horloge réelle et sans navigateur.
 */

import { describe, expect, it } from 'vitest';

import {
  SEUIL_PEREMPTION_JOURS,
  SEUIL_SURVEILLANCE_JOURS,
  libellePeremption,
  peremptionMaj,
  peremptionSignalee,
  type MajReferentiel,
} from '../src/ui/referentiels.js';

/** Date de référence des tests : le calcul ne dépend jamais de l'horloge de la machine. */
const MAINTENANT = new Date('2026-09-25T10:00:00.000Z');

const ilYA = (jours: number): string =>
  new Date(MAINTENANT.getTime() - jours * 24 * 60 * 60 * 1000).toISOString();

const ligne = (champs: Partial<MajReferentiel> = {}): MajReferentiel => ({
  nom: 'referentiel_medicaments',
  libelle: 'Médicaments (BDPM)',
  maj_le: ilYA(10),
  lignes: 13609,
  verifie_le: ilYA(10),
  etat_controle: 'a_jour',
  derniere_erreur: null,
  ...champs,
});

describe('Péremption du référentiel — ancienneté du contrôle', () => {
  it('se tait quand le contrôle est récent', () => {
    const avis = peremptionMaj([ligne({ verifie_le: ilYA(3) })], MAINTENANT);

    expect(avis.niveau).toBe('a_jour');
    expect(avis.jours).toBe(3);
    expect(avis.reference).toBe('controle');
    expect(avis.message).toContain('contrôlé il y a 3 jours');
    expect(peremptionSignalee(avis)).toBe(false);
    expect(libellePeremption(avis)).toBe('');
  });

  it('avertit dès le premier contrôle mensuel manqué', () => {
    const avis = peremptionMaj([ligne({ verifie_le: ilYA(SEUIL_SURVEILLANCE_JOURS) })], MAINTENANT);

    expect(avis.niveau).toBe('a_surveiller');
    expect(avis.message).toContain('contrôle mensuel a été manqué');
    // Le message porte la conséquence, pas seulement la date.
    expect(avis.detail).toContain('restent vraisemblablement bonnes');
    expect(peremptionSignalee(avis)).toBe(true);
    expect(libellePeremption(avis)).toBe('à recontrôler');
  });

  it('déclare le référentiel périmé après deux contrôles manqués', () => {
    const avis = peremptionMaj([ligne({ verifie_le: ilYA(SEUIL_PEREMPTION_JOURS) })], MAINTENANT);

    expect(avis.niveau).toBe('perime');
    expect(avis.jours).toBe(SEUIL_PEREMPTION_JOURS);
    expect(avis.message).toContain('non contrôlé depuis 62 jours');
    expect(avis.message).toContain('25/07/2026');
    expect(avis.detail).toContain('ont pu changer');
    expect(libellePeremption(avis)).toBe('périmé');
  });

  it('ne signale rien un jour avant le seuil, et tout le jour du seuil', () => {
    const laVeille = peremptionMaj([ligne({ verifie_le: ilYA(34) })], MAINTENANT);
    const limite = peremptionMaj([ligne({ verifie_le: ilYA(35) })], MAINTENANT);
    const presque = peremptionMaj([ligne({ verifie_le: ilYA(61) })], MAINTENANT);

    expect(laVeille.niveau).toBe('a_jour');
    expect(limite.niveau).toBe('a_surveiller');
    expect(presque.niveau).toBe('a_surveiller');
  });

  it('retient la table la plus ancienne : elle seule commande l’alerte', () => {
    const avis = peremptionMaj(
      [
        ligne({ nom: 'referentiel_medicaments', libelle: 'Médicaments (BDPM)', verifie_le: ilYA(2) }),
        ligne({ nom: 'referentiel_ccam', libelle: 'Nomenclature CCAM', verifie_le: ilYA(90) }),
      ],
      MAINTENANT,
    );

    expect(avis.niveau).toBe('perime');
    expect(avis.jours).toBe(90);
    expect(avis.message).toContain('Nomenclature CCAM');
  });

  it('signale l’échec de la dernière tentative, quelle que soit la date', () => {
    const avis = peremptionMaj(
      [
        ligne({ etat_controle: 'echec', derniere_erreur: 'HTTP 502 sur CIS_bdpm.txt', verifie_le: ilYA(3) }),
      ],
      MAINTENANT,
    );

    expect(avis.niveau).toBe('echec');
    expect(avis.message).toContain('a échoué');
    expect(avis.detail).toContain('HTTP 502 sur CIS_bdpm.txt');
    expect(peremptionSignalee(avis)).toBe(true);
    expect(libellePeremption(avis)).toBe('mise à jour en échec');
  });
});

describe('Péremption du référentiel — suivi absent', () => {
  it('se replie sur la date d’import quand le contrôle n’a jamais été enregistré', () => {
    const avis = peremptionMaj(
      [ligne({ verifie_le: null, etat_controle: 'inconnu', maj_le: ilYA(80) })],
      MAINTENANT,
    );

    expect(avis.niveau).toBe('perime');
    expect(avis.reference).toBe('import');
    expect(avis.jours).toBe(80);
    expect(avis.message).toContain('jamais recontrôlé');
  });

  it('reste à jour sur la seule date d’import récente', () => {
    const avis = peremptionMaj([ligne({ verifie_le: null, maj_le: ilYA(5) })], MAINTENANT);

    expect(avis.niveau).toBe('a_jour');
    expect(avis.message).toContain('pas encore recontrôlé');
  });

  it('avoue l’ignorance plutôt que de rassurer à tort', () => {
    for (const suivi of [null, []]) {
      const avis = peremptionMaj(suivi, MAINTENANT);

      expect(avis.niveau).toBe('inconnu');
      expect(avis.jours).toBeNull();
      expect(avis.message).toContain('indisponible');
      // « Inconnu » n'est pas « à jour » : on ne signale pas, mais on propose la marche à suivre.
      expect(peremptionSignalee(avis)).toBe(false);
      expect(avis.detail).toContain('Lancez la mise à jour');
    }
  });

  it('résiste à une date illisible sans casser l’affichage', () => {
    const avis = peremptionMaj([ligne({ verifie_le: 'pas-une-date' })], MAINTENANT);

    expect(avis.niveau).toBe('inconnu');
    expect(avis.message).toContain('illisibles');
  });
});
