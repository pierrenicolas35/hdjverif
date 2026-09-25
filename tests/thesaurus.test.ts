/**
 * Tests du thésaurus des synonymes (`scripts/lib/thesaurus.mjs`).
 *
 * Le thésaurus fonde **deux** choses à la fois, et c'est ce que ces tests protègent :
 *   1. l'indexation des actes CCAM à l'import (colonne `mots_cles`) ;
 *   2. l'élargissement de la requête dans l'application (`rechercher_ccam`,
 *      `rechercher_medicaments`, `synonymes_de`).
 *
 * Ils vérifient aussi l'**alignement** avec `supabase/thesaurus.sql` : la liste des mots
 * vides et le seuil des sigles y sont recopiés (le SQL ne peut pas importer un module
 * JavaScript) ; la porte de contrôle des tests compare les deux, faute de quoi la recherche
 * en ligne et le repli local ne chercheraient pas la même chose.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  LONGUEUR_MOT_SIGNIFICATIF,
  MOTS_VIDES,
  construireThesaurus,
  contientTerme,
  decouperRequete,
  estSigle,
  lireThesaurus,
  normaliserTerme,
  thesaurusDepuisCsv,
} from '../scripts/lib/thesaurus.mjs';

/** Thésaurus **versionné** : celui que l'application embarque et que l'import publie. */
const CSV = readFileSync('data/thesaurus-synonymes.csv', 'utf8');
const THESAURUS = thesaurusDepuisCsv(CSV);
const SQL = readFileSync('supabase/thesaurus.sql', 'utf8');

/* ------------------------------------------------------------------ *
 * 1. Normalisation et découpage
 * ------------------------------------------------------------------ */

describe('normalisation des termes', () => {
  it('retire accents et ligatures, et ramène les séparateurs à une espace', () => {
    expect(normaliserTerme('Électro-encéphalographie (EEG)')).toBe('electro encephalographie eeg');
    expect(normaliserTerme('œsophage ŒSOPHAGIEN')).toBe('oesophage oesophagien');
    expect(normaliserTerme('  Prothèse  de   hanche ')).toBe('prothese de hanche');
    expect(normaliserTerme('DEQP003')).toBe('deqp003');
    expect(normaliserTerme('')).toBe('');
    expect(normaliserTerme(null as unknown as string)).toBe('');
  });

  it('découpe une saisie en mots utiles, sans mots vides', () => {
    expect(decouperRequete('prothèse de hanche')).toEqual(['prothese', 'hanche']);
    expect(decouperRequete('IRM du cœur')).toEqual(['irm', 'coeur']);
    expect(decouperRequete('a de')).toEqual([]);
    expect(decouperRequete('DEQP003')).toEqual(['deqp003']);
  });
});

describe('sigles et mots entiers', () => {
  it('reconnaît un sigle court sans le chercher dans les mots', () => {
    // « AIT » (accident ischémique transitoire) est un mot de quatre lettres : le chercher
    // par inclusion le reconnaîtrait dans « traitement ».
    expect(estSigle('ait')).toBe(true);
    expect(estSigle('irm')).toBe(true);
    expect(estSigle('scanographie')).toBe(false);
    expect(estSigle('anti tnf')).toBe(false);

    const texte = ' traitement medical du patient ';
    expect(contientTerme(texte, 'ait')).toBe(false);
    expect(contientTerme(texte, 'traitement')).toBe(true);
  });

  it('cherche les termes longs par inclusion (compléments de mot)', () => {
    expect(contientTerme(' scanographie du thorax ', 'scanographie')).toBe(true);
    expect(contientTerme(' radiographie du thorax ', 'radio')).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * 2. Lecture du fichier versionné
 * ------------------------------------------------------------------ */

describe('lecture du fichier', () => {
  it('lit le thésaurus livré : notions fournies, domaines et sources renseignés', () => {
    expect(THESAURUS.entrees.length).toBeGreaterThan(200);
    expect(THESAURUS.notions.length).toBeGreaterThan(50);
    for (const entree of THESAURUS.entrees) {
      expect(entree.type).toBeTruthy();
      expect(entree.source).toBeTruthy();
      expect(['actes', 'medicaments', 'commun']).toContain(entree.domaine);
      expect(entree.terme_normalise).toBe(normaliserTerme(entree.terme));
    }
  });

  it('n’a aucune notion à un seul terme (elle n’élargirait rien)', () => {
    const parNotion = new Map<string, number>();
    for (const entree of THESAURUS.entrees) {
      parNotion.set(entree.notion, (parNotion.get(entree.notion) ?? 0) + 1);
    }
    expect([...parNotion].filter(([, n]) => n < 2).map(([notion]) => notion)).toEqual([]);
  });

  it('interdit qu’un terme appartienne à deux notions (l’élargissement doit rester prévisible)', () => {
    expect(() =>
      lireThesaurus(
        [
          'notion;terme;type;domaine;source',
          'premiere;scanner;vocabulaire courant;actes;usage courant',
          'premiere;tomodensitometrie;vocabulaire courant;actes;usage courant',
          'seconde;scanner;vocabulaire courant;actes;usage courant',
        ].join('\n'),
      ),
    ).toThrow(/déjà rattaché à la notion/);
  });

  it('refuse un terme en double dans la même notion', () => {
    expect(() =>
      lireThesaurus(
        [
          'notion;terme;type;domaine;source',
          'imagerie;IRM;sigle;actes;usage courant',
          'imagerie;irm;sigle;actes;usage courant',
        ].join('\n'),
      ),
    ).toThrow(/déjà présent/);
  });

  it('refuse un domaine inconnu, un nombre de colonnes inexact et un thésaurus vide', () => {
    const entete = 'notion;terme;type;domaine;source';
    expect(() => lireThesaurus([entete, 'x;terme;type;inconnu;source'].join('\n'))).toThrow(
      /domaine « inconnu » inconnu/,
    );
    expect(() => lireThesaurus([entete, 'x;terme;type;actes'].join('\n'))).toThrow(
      /4 colonne\(s\) au lieu de 5/,
    );
    expect(() => lireThesaurus([entete, '# que des commentaires'].join('\n'))).toThrow(
      /thésaurus vide/,
    );
  });
});

/* ------------------------------------------------------------------ *
 * 3. Élargissement d'une requête
 * ------------------------------------------------------------------ */

describe('élargissement de la requête', () => {
  it('relie le vocabulaire courant au libellé officiel', () => {
    expect(THESAURUS.elargir('scanner', 'actes')).toContain('scanographie');
    expect(THESAURUS.elargir('irm', 'actes')).toContain('remnographie');
    expect(THESAURUS.elargir('ecg', 'actes')).toContain('electrocardiogramme');
    expect(THESAURUS.elargir('fibro', 'actes')).toContain('endoscopie');
    expect(THESAURUS.elargir('ANTI-TNF', 'medicaments')).toContain('infliximab');
    expect(THESAURUS.elargir('immunoglobuline', 'medicaments')).toContain('ivig');
  });

  it('joint le syndrome au geste (aucun libellé CCAM ne porte « AVC »)', () => {
    const elargis = THESAURUS.elargir('avc', 'actes');
    expect(elargis).toContain('thrombectomie');
    expect(elargis).toContain('accident vasculaire cerebral');
  });

  it('interroge une notion entière d’un seul tenant, sans la découper', () => {
    // « anti-TNF » ne doit pas interroger « anti » : le mot, repris seul, ramènerait
    // l'immunoglobuline anti-lymphocytaire ou l'anti-inflammatoire.
    const elargis = THESAURUS.elargir('anti-tnf', 'medicaments');
    expect(elargis).toContain('anti tnf');
    expect(elargis).not.toContain('anti');
    expect(elargis).not.toContain('tnf');
  });

  it('interroge les mots d’une saisie qui n’est pas un terme du thésaurus', () => {
    const elargis = THESAURUS.elargir('prothese de hanche', 'actes');
    expect(elargis).toContain('prothese de hanche');
    expect(elargis).toContain('prothese totale de hanche');

    const deux = THESAURUS.elargir('biopsie du rein', 'actes');
    expect(deux).toContain('biopsie');
    expect(deux).toContain('rein');
    expect(deux).toContain('nephrectomie');
  });

  it('respecte le domaine : un terme de médicament n’élargit pas une recherche d’actes', () => {
    expect(THESAURUS.elargir('anti-tnf', 'actes')).not.toContain('infliximab');
    expect(THESAURUS.elargir('scanner', 'medicaments')).not.toContain('scanographie');
    // Le domaine « commun » sert aux deux (transfusion, dialyse, chimiothérapie…).
    expect(THESAURUS.elargir('dialyse', 'actes')).toContain('hemodialyse');
    expect(THESAURUS.elargir('dialyse', 'medicaments')).toContain('hemodialyse');
  });
});

describe('synonymes lisibles (affichage)', () => {
  it('rend les termes du thésaurus, sans ceux déjà écrits', () => {
    const synonymes = THESAURUS.synonymesDe('scanner', 'actes').map((s) => s.terme_normalise);
    // Le terme écrit n'est pas répété, mais ses synonymes le sont.
    expect(synonymes).toContain('tomodensitometrie');
    expect(synonymes).toContain('scanographie');
    expect(synonymes).not.toContain('scanner');
  });

  it('donne une notion, un type et un domaine pour chaque synonyme', () => {
    for (const synonyme of THESAURUS.synonymesDe('anti-tnf', 'medicaments')) {
      expect(synonyme.notion).toBeTruthy();
      expect(synonyme.type).toBeTruthy();
      expect(synonyme.domaine).toBe('medicaments');
    }
  });

  it('ne propose rien pour une saisie inconnue du thésaurus', () => {
    expect(THESAURUS.synonymesDe('xyzzy', 'actes')).toEqual([]);
    expect(THESAURUS.synonymesDe('de', 'actes')).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 4. Mots-clés indexés (colonne `mots_cles` des actes)
 * ------------------------------------------------------------------ */

describe('mots-clés d’un acte', () => {
  it('ajoute le vocabulaire courant au libellé officiel', () => {
    const mots = THESAURUS.motsClesPour(
      'remnographie [IRM] de l’encéphale, acte par remnographie sans accès',
    );
    expect(mots).toContain('irm');
    expect(mots).toContain('resonance magnetique');
  });

  it('n’enchaîne pas les notions (un mot-clé ajouté n’en déclenche pas d’autre)', () => {
    // « craniotomie » apporte « neurochirurgie » ; si « neurochirurgie » déclenchait à son
    // tour la notion « chirurgie », chaque acte de neurochirurgie hériterait de tout le
    // vocabulaire chirurgical — et le classement perdrait tout pouvoir discriminant.
    const mots = THESAURUS.motsClesPour('craniotomie');
    expect(mots).toContain('neurochirurgie');
    expect(mots).not.toContain('chirurgie');
  });

  it('n’injecte jamais une notion de médicament dans les mots-clés d’un acte', () => {
    const mots = THESAURUS.motsClesPour('infliximab, perfusion');
    expect(mots).toContain('perfusion');
    expect(mots).not.toContain('adalimumab');
  });

  it('ne reconnaît pas un sigle au milieu d’un mot', () => {
    expect(THESAURUS.motsClesPour('traitement par voie orale')).not.toContain(
      'accident vasculaire cerebral',
    );
  });
});

/* ------------------------------------------------------------------ *
 * 5. Alignement avec le SQL (source de vérité unique recopiée)
 * ------------------------------------------------------------------ */

describe('alignement avec supabase/thesaurus.sql', () => {
  const corpsMotsVides = /mots_vides_recherche\(\)[\s\S]*?select array\[([\s\S]*?)\];/.exec(SQL)?.[1] ?? '';

  it('déclare exactement les mêmes mots vides que la fonction SQL', () => {
    const enSql = [...corpsMotsVides.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(enSql.length).toBeGreaterThan(0);
    expect(enSql).toEqual([...MOTS_VIDES]);
  });

  it('utilise le même seuil de sigle que la fonction SQL', () => {
    expect(LONGUEUR_MOT_SIGNIFICATIF).toBe(5);
    expect(SQL).toContain(`length(mot) >= ${LONGUEUR_MOT_SIGNIFICATIF}`);
    expect(SQL).toContain("length(p_terme) <= 4");
  });

  it('déclare la table, la colonne de recherche et les deux recherches élargies', () => {
    expect(SQL).toContain('create table if not exists public.thesaurus_synonymes');
    expect(SQL).toContain('recherche_normalisee');
    expect(SQL).toContain('create or replace function public.normaliser_terme');
    expect(SQL).toContain('create function public.rechercher_ccam');
    expect(SQL).toContain('create function public.rechercher_medicaments');
    expect(SQL).toContain('create or replace function public.synonymes_de');
    // Les privilèges sont repris après chaque redéfinition (sinon retour au droit PUBLIC).
    expect(SQL).toContain('grant execute on function public.rechercher_ccam(text, integer) to anon, authenticated');
    expect(SQL).toContain('grant execute on function public.rechercher_medicaments(text, integer) to anon, authenticated');
  });
});

/* ------------------------------------------------------------------ *
 * 6. Constructions défensives
 * ------------------------------------------------------------------ */

describe('construction', () => {
  it('refuse un thésaurus vide et accepte les lignes de commentaire', () => {
    expect(() => construireThesaurus([])).not.toThrow();
    const entrees = lireThesaurus(
      ['# commentaire', '', 'notion;terme;type;domaine;source', 'a;un;x;actes;y', 'a;deux;x;actes;y'].join(
        '\n',
      ),
    );
    expect(entrees).toHaveLength(2);
    expect(construireThesaurus(entrees).notions).toEqual(['a']);
  });

  it('prépare les lignes de la table `public.thesaurus_synonymes`', () => {
    const lignes = THESAURUS.versLignesBase();
    expect(lignes.length).toBe(THESAURUS.entrees.length);
    expect(Object.keys(lignes[0]!).sort()).toEqual([
      'domaine',
      'notion',
      'source',
      'terme',
      'terme_normalise',
      'type',
    ]);
  });
});
