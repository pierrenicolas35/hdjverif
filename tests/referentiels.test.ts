/**
 * Tests du traitement des référentiels officiels (`scripts/lib/referentiels.mjs`).
 *
 * Le module est pur : les sources sont fournies sous forme de chaînes, ce qui permet de
 * vérifier la règle de détermination de la réserve hospitalière sans réseau ni fichiers.
 *
 * Règle vérifiée ici (elle fonde la colonne `est_reserve_hospitaliere` de Supabase) :
 *   1. libellé CPD « réservé à l'usage HOSPITALIER » → `true` ;
 *   2. CPD connu sans ce libellé → `false` ;
 *   3. CPD muet → `true` si un motif de la liste de travail correspond, sinon `false`.
 */

import { describe, expect, it } from 'vitest';

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as ref from '../scripts/lib/referentiels.mjs';
import { empreinteSources } from '../scripts/lib/sources.mjs';
import { thesaurusDepuisCsv } from '../scripts/lib/thesaurus.mjs';

/** Thésaurus versionné : il fonde les mots-clés des actes (colonne `mots_cles`). */
const THESAURUS = thesaurusDepuisCsv(readFileSync('data/thesaurus-synonymes.csv', 'utf8'));

/** Ligne de `CIS_bdpm.txt` (11 colonnes, tabulée). */
const ligneBdpm = (
  cis: string,
  denomination: string,
  etat = 'Commercialisée',
  surveillance = 'Non',
): string =>
  [
    cis,
    denomination,
    'comprimé',
    'orale',
    'Autorisation active',
    'Procédure nationale',
    etat,
    '01/01/2020',
    '3400930000000',
    'TITULAIRE',
    surveillance,
  ].join('\t');

/** Ligne de `CIS_COMPO_bdpm.txt` (8 colonnes, tabulée). */
const ligneCompo = (cis: string, substance: string, nature = 'SA'): string =>
  [cis, 'comprimé', '12345', substance, '100 mg', 'un comprimé', nature, '1'].join('\t');

/** Ligne de `CIS_CPD_bdpm.txt` (2 colonnes : CIS, libellé). */
const ligneCpd = (cis: string, libelle: string): string => `${cis}\t${libelle}`;

const BDPM = [
  ligneBdpm('11111111', 'REMICADE 100 mg, poudre pour solution à diluer pour perfusion'),
  ligneBdpm('22222222', 'DOLIPRANE 1000 mg, comprimé', 'Commercialisée', 'Oui'),
  ligneBdpm('33333333', 'MEDICAMENT RETIRE 10 mg, comprimé', 'Non commercialisée'),
  ligneBdpm('44444444', 'PRODUIT SANS CPD 250 mg, granulés'),
  ligneBdpm('55555555', 'DOPAMINE BOIRON, degré de dilution compris entre 3CH et 30CH'),
  ligneBdpm('66666666', 'MABTHERA 100 mg, solution à diluer pour perfusion'),
].join('\n');

const COMPO = [
  ligneCompo('11111111', 'INFLIXIMAB '),
  ligneCompo('22222222', 'PARACÉTAMOL'),
  ligneCompo('33333333', 'MOLÉCULE RETIRÉE'),
  ligneCompo('44444444', 'SUBSTANCE INCONNUE'),
  ligneCompo('55555555', 'DOPAMINE POUR PRÉPARATIONS HOMÉOPATHIQUES'),
  ligneCompo('11111111', 'INFLIXIMAB ', 'FT'),
  ligneCompo('11111111', 'INFLIXIMAB '),
  ligneCompo('66666666', 'RITUXIMAB'),
].join('\n');

const CPD = [
  ligneCpd('11111111', "réservé à l'usage HOSPITALIER"),
  ligneCpd('11111111', 'liste I'),
  ligneCpd('22222222', 'liste II'),
  ligneCpd('22222222', 'prescription en toutes lettres sur ordonnance sécurisée'),
  ligneCpd('66666666', 'prescription hospitalière'),
  ligneCpd('66666666', 'médicament nécessitant une surveillance particulière pendant le traitement'),
].join('\n');

const MOTIFS = ref.lireMotifsReserve(
  [
    '# commentaire',
    'oxygène',
    'dopamine',
    '!préparations homéopathiques',
    '!boiron',
  ].join('\n'),
);

describe('normalisation et découpage', () => {
  it('normalise casse et accents', () => {
    expect(ref.normaliser('Réservé à l’usage HOSPITALIER')).toBe('reserve a l’usage hospitalier');
  });

  it('découpe un CSV en respectant les guillemets', () => {
    expect(ref.decouperCsv('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
    expect(ref.decouperCsv('a,"b""c"', ',')).toEqual(['a', 'b"c']);
  });
});

describe('lecture de la BDPM', () => {
  it('ne retient que les spécialités commercialisées', () => {
    const specialites = ref.lireSpecialitesCommercialisees(BDPM);
    expect(specialites.map((s) => s.cis)).toEqual([
      '11111111',
      '22222222',
      '44444444',
      '55555555',
      '66666666',
    ]);
  });

  it('lit la surveillance renforcée', () => {
    const doliprane = ref.lireSpecialitesCommercialisees(BDPM).find((s) => s.cis === '22222222');
    expect(doliprane?.surveillanceRenforcee).toBe(true);
  });

  it('ne garde que les substances actives, dédoublonnées, dans l’ordre du fichier', () => {
    const composition = ref.lireComposition(COMPO);
    expect(composition.get('11111111')).toEqual(['INFLIXIMAB']);
  });

  it('compose la DCI : substance unique ou association', () => {
    expect(ref.dciDepuisSubstances(['INFLIXIMAB'])).toBe('INFLIXIMAB');
    expect(ref.dciDepuisSubstances(['LAMIVUDINE', 'ABACAVIR'])).toBe('LAMIVUDINE + ABACAVIR');
    expect(ref.dciDepuisSubstances(undefined)).toBeNull();
    expect(ref.dciDepuisSubstances([])).toBeNull();
  });
});

describe('réserve hospitalière : source officielle CPD', () => {
  it('reconnaît le libellé officiel sans tenir compte de la casse', () => {
    expect(ref.porteReserveHospitaliere(["réservé à l'usage HOSPITALIER", 'liste I'])).toBe(true);
    expect(ref.porteReserveHospitaliere(['liste I', 'prescription hospitalière'])).toBe(false);
    expect(ref.porteReserveHospitaliere(undefined)).toBe(false);
  });

  it('tranche `true` dès le libellé, `false` si le CPD est connu sans le libellé', () => {
    expect(
      ref.determinerReserveHospitaliere({
        libellesCpd: ["réservé à l'usage HOSPITALIER"],
        denomination: 'X',
        dci: null,
        motifs: MOTIFS,
      }),
    ).toBe(true);
    expect(
      ref.determinerReserveHospitaliere({
        libellesCpd: ['prescription hospitalière', 'liste I'],
        denomination: 'MABTHERA 100 mg, solution à diluer pour perfusion',
        dci: 'RITUXIMAB',
        motifs: MOTIFS,
      }),
    ).toBe(false);
  });

  it('ne laisse jamais la liste de travail contredire le CPD officiel', () => {
    // « oxygène » est dans la liste de travail : elle ne peut pas primer sur un CPD connu.
    expect(
      ref.determinerReserveHospitaliere({
        libellesCpd: ['liste II'],
        denomination: 'OXYGENE MEDICINAL 200 bar, gaz pour inhalation',
        dci: 'OXYGÈNE',
        motifs: MOTIFS,
      }),
    ).toBe(false);
  });
});

describe('liste de travail (CPD muet)', () => {
  it('rattrape un produit hospitalier sans condition CPD', () => {
    expect(
      ref.determinerReserveHospitaliere({
        libellesCpd: undefined,
        denomination: 'OXYGENE MEDICINAL 200 bar, gaz pour inhalation',
        dci: 'OXYGÈNE',
        motifs: MOTIFS,
      }),
    ).toBe(true);
  });

  it('donne la priorité aux exclusions (faux positifs par homonymie)', () => {
    expect(ref.qualifierParListe('DOPAMINE', MOTIFS)).toBe(true);
    expect(
      ref.qualifierParListe(
        'DOPAMINE BOIRON, degré de dilution compris entre 3CH et 30CH',
        MOTIFS,
      ),
    ).toBe(false);
    expect(ref.qualifierParListe('ASPIRINE', MOTIFS)).toBeNull();
  });
});

describe('surveillance particulière : libellé officiel du CPD', () => {
  it('reconnaît le libellé et distingue les trois états', () => {
    expect(
      ref.determinerSurveillanceParticuliere([
        'médicament nécessitant une surveillance particulière pendant le traitement',
      ]),
    ).toBe(true);
    expect(ref.determinerSurveillanceParticuliere(['liste I'])).toBe(false);
    expect(ref.determinerSurveillanceParticuliere(undefined)).toBeNull();
  });

  it('n’attribue aucune présomption à partir de l’absence de libellé', () => {
    // « surveillance renforcée » (pharmacovigilance) n’est plus détournée en
    // présomption de surveillance particulière.
    expect(ref.determinerSurveillanceParticuliere(['surveillance renforcée'])).toBe(false);
  });
});

describe('assemblage du référentiel des médicaments', () => {
  const { lignes, origineReserve } = ref.construireMedicaments({
    contenuBdpm: BDPM,
    contenuCompo: COMPO,
    contenuCpd: CPD,
    motifs: MOTIFS,
  });

  it('produit une ligne par spécialité commercialisée', () => {
    expect(lignes).toHaveLength(5);
    expect(origineReserve.cpdConnu).toBe(3);
  });

  it('renseigne la DCI réelle, jamais le nom commercial', () => {
    const remicade = lignes.find((m) => m.cis === '11111111');
    expect(remicade?.dci).toBe('INFLIXIMAB');
    expect(remicade?.denomination).toContain('REMICADE');
  });

  it('qualifie la réserve hospitalière sur les trois voies', () => {
    expect(lignes.find((m) => m.cis === '11111111')?.est_reserve_hospitaliere).toBe(true); // CPD
    expect(lignes.find((m) => m.cis === '22222222')?.est_reserve_hospitaliere).toBe(false); // CPD connu
    expect(lignes.find((m) => m.cis === '44444444')?.est_reserve_hospitaliere).toBeNull(); // CPD muet
  });

  it('laisse la valeur absente telle quelle quand le CPD est muet (jamais « hors réserve »)', () => {
    // Propre au CPD muet : aucune conclusion n'est tirée du silence de la source.
    expect(lignes.find((m) => m.cis === '44444444')?.est_liste_en_sus).toBeNull();
    // Les exclusions explicites de la liste de travail, elles, tranchent « non ».
    expect(lignes.find((m) => m.cis === '55555555')?.est_reserve_hospitaliere).toBe(false);
  });

  it('renseigne la surveillance particulière des trois états', () => {
    expect(lignes.find((m) => m.cis === '66666666')?.surveillance_particuliere).toBe(true);
    expect(lignes.find((m) => m.cis === '11111111')?.surveillance_particuliere).toBe(false);
    expect(lignes.find((m) => m.cis === '44444444')?.surveillance_particuliere).toBeNull();
  });

  it('n’affirme « liste en sus » que lorsque la réserve est établie', () => {
    expect(lignes.find((m) => m.cis === '11111111')?.est_liste_en_sus).toBe(true);
    expect(lignes.find((m) => m.cis === '22222222')?.est_liste_en_sus).toBeNull();
  });

  it('compte les trois états et la couverture', () => {
    const stats = ref.statistiquesReserve(lignes);
    expect(stats.reserve).toBe(1);
    expect(stats.hors).toBe(3);
    expect(stats.indetermine).toBe(1);
    expect(stats.avecDci).toBe(5);
    expect(stats.surveillanceParticuliere).toBe(1);
  });

  it('compte l’origine des décisions et l’invariant du CPD', () => {
    expect(origineReserve.cpd).toBe(1);
    expect(origineReserve.liste).toBe(0);
    expect(origineReserve.indetermine).toBe(1);
    // Aucune valeur absente ne peut provenir d'une spécialité dont le CPD est renseigné.
    expect(origineReserve.indetermineAvecCpd).toBe(0);
  });
});

describe('nomenclature CCAM', () => {
  const CCAM = [
    'ccam,label,chapterCode,chapterLabel,topographie,topographieLabel,actionLabel,modeAccesLabel,familleLabel',
    '"AAFA002","exérèse de tumeur intraparenchymateuse du cerveau, par craniotomie","01","système nerveux central","AA","encéphale","exciser","abord ouvert","chirurgie du cerveau"',
    '"DEQP003","électrocardiographie sur au moins douze dérivations","04","appareil circulatoire","","","enregistrer","acte par ultrasons, sans accès","électrocardiographie"',
    '"ZZZ999","code invalide","01","système nerveux central","","","","",""',
    '"AAFA002","doublon de la source","01","système nerveux central","","","","",""',
  ].join('\n');

  it('écarte les codes invalides et les doublons', () => {
    const actes = ref.lireCcam(CCAM);
    expect(actes.map((a) => a.code)).toEqual(['AAFA002', 'DEQP003']);
  });

  it('conserve la position de chaque acte dans l’arborescence officielle', () => {
    const acte = ref.lireCcam(CCAM)[0]!;
    expect(acte.chapitreCode).toBe('01');
    expect(acte.chapitreLabel).toBe('système nerveux central');
    expect(acte.topographieLabel).toBe('encéphale');
    expect(acte.modeAccesLabel).toBe('abord ouvert');
  });

  it('dérive le plateau lourd et l’exclusivité externe du mode d’accès', () => {
    const actes = ref.construireActes({ contenuCcam: CCAM, surcharges: new Map(), thesaurus: THESAURUS });
    expect(actes[0]).toMatchObject({
      code: 'AAFA002',
      libelle: 'exérèse de tumeur intraparenchymateuse du cerveau, par craniotomie',
      acte_marqueur_hdj: true,
      exclusif_externe: false,
      necessite_plateau_lourd: true,
      chapitre_code: '01',
      chapitre_libelle: 'système nerveux central',
      sous_chapitre_code: 'AA',
      sous_chapitre_libelle: 'encéphale',
    });
    expect(actes[1]?.exclusif_externe).toBe(true);
  });

  it('replie le sous-thème sur le chapitre quand le site anatomique manque', () => {
    const actes = ref.construireActes({ contenuCcam: CCAM, surcharges: new Map(), thesaurus: THESAURUS });
    // DEQP003 n'a pas de topographie : son chapitre devient son sous-thème.
    expect(actes[1]?.sous_chapitre_code).toBe('04');
    expect(actes[1]?.sous_chapitre_libelle).toBe('appareil circulatoire');
  });

  it('construit des mots-clés « grand public » à partir du libellé et des axes', () => {
    const mots = ref.motsClesActe(
      {
        libelle: 'remnographie [IRM] de l’encéphale',
        chapitreLabel: 'système nerveux central',
        topographieLabel: 'encéphale',
        actionLabel: 'examiner',
        modeAccesLabel: 'acte par remnographie sans accès',
        familleLabel: 'IRM du système nerveux',
      },
      THESAURUS,
    );
    expect(mots).toContain('irm');
    expect(mots).toContain('resonance magnetique');
    // Chaque acte reçoit des mots-clés (colonne non vide).
    const actes = ref.construireActes({ contenuCcam: CCAM, surcharges: new Map(), thesaurus: THESAURUS });
    expect(actes[0]?.mots_cles).toBeTruthy();
    expect(actes[0]?.mots_cles).toContain('ablation');
    expect(actes[0]?.mots_cles).toContain('neurochirurgie');
  });

  it('prépare les textes de recherche des actes (indexés en trigrammes)', () => {
    const actes = ref.construireActes({
      contenuCcam: CCAM,
      surcharges: new Map(),
      thesaurus: THESAURUS,
    });
    const cranio = actes[0]!;
    // Texte de recherche : normalisé, encadré d'espaces, libellé + mots-clés + code.
    expect(cranio.recherche_normalisee.startsWith(' ')).toBe(true);
    expect(cranio.recherche_normalisee.endsWith(' ')).toBe(true);
    expect(cranio.recherche_normalisee).toContain('exerese de tumeur');
    expect(cranio.recherche_normalisee).toContain('ablation');
    expect(cranio.recherche_normalisee).toContain('aafa002');

    // Libellé seul : il sert au **classement**. Il porte le libellé officiel mais pas les
    // mots-clés — sans quoi « prothèse totale de hanche » et « hanche » ne se
    // distingueraient plus, tous deux porteurs de tous les synonymes de la notion.
    expect(cranio.libelle_normalisee.startsWith(' ')).toBe(true);
    expect(cranio.libelle_normalisee).toContain('exerese de tumeur');
    expect(cranio.libelle_normalisee).not.toContain('ablation');
    expect(cranio.libelle_normalisee).not.toContain('aafa002');
  });

  it('prépare le texte de recherche des médicaments (dénomination et DCI)', () => {
    const { lignes } = ref.construireMedicaments({
      contenuBdpm: ligneBdpm('12345678', 'REMICADE 100 mg, poudre pour perfusion'),
      contenuCompo: ligneCompo('12345678', 'INFLIXIMAB'),
      contenuCpd: ligneCpd('12345678', "réservé à l'usage HOSPITALIER"),
      motifs: ref.lireMotifsReserve(''),
    });
    const remicade = lignes[0]!;
    expect(remicade.recherche_normalisee.startsWith(' ')).toBe(true);
    expect(remicade.recherche_normalisee).toContain('remicade 100 mg');
    expect(remicade.recherche_normalisee).toContain('infliximab');
  });

  it('reconnaît un mode d’accès malgré l’apostrophe typographique de la source', () => {
    // La nomenclature écrit « autre qu’abord ouvert » avec une apostrophe courbe :
    // sans normalisation, ces 150 actes seraient classés « non lourds » à tort.
    expect(ref.normaliserModeAcces('acte par rayons x, avec accès autre qu’abord ouvert')).toBe(
      "acte par rayons x, avec accès autre qu'abord ouvert",
    );
    const ccam = [
      'ccam,label,chapterCode,modeAccesLabel',
      '"EBQH006","scanographie des vaisseaux cervicaux","04","acte par rayons x, avec accès autre qu’abord ouvert"',
    ].join('\n');
    const actes = ref.construireActes({ contenuCcam: ccam, surcharges: new Map(), thesaurus: THESAURUS });
    expect(actes[0]?.necessite_plateau_lourd).toBe(true);
    expect(actes[0]?.acte_marqueur_hdj).toBe(true);
  });

  it('applique les surcharges éditoriales locales', () => {
    const surcharges = ref.lireSurchargesCcam(
      ['code;acte_marqueur_hdj;exclusif_externe;necessite_plateau_lourd', 'DEQP003;true;true;false'].join(
        '\n',
      ),
    );
    expect(surcharges.get('DEQP003')).toEqual({
      acte_marqueur_hdj: true,
      exclusif_externe: true,
      necessite_plateau_lourd: false,
    });
    const actes = ref.construireActes({ contenuCcam: CCAM, surcharges, thesaurus: THESAURUS });
    expect(actes[1]?.acte_marqueur_hdj).toBe(true);
  });
});

describe('export CSV de secours', () => {
  it('protège les séparateurs et les guillemets, écrit NULL pour l’absence', () => {
    const csv = ref.versCsv(
      [{ cis: '1', denomination: 'A, "B"', dci: null }],
      ['cis', 'denomination', 'dci'],
    );
    expect(csv).toBe('cis,denomination,dci\n1,"A, ""B""",');
  });
});

describe('mise à jour périodique : empreinte des sources', () => {
  const ecrire = (nom: string, contenu: string): string => {
    const chemin = join(
      mkdtempSync(join(tmpdir(), 'hdjverif-sources-')),
      nom,
    );
    writeFileSync(chemin, contenu, 'utf8');
    return chemin;
  };

  it('donne la même empreinte pour les mêmes sources', () => {
    const a = empreinteSources({ bdpm: ecrire('a.txt', 'CIS\tDENOMINATION\n') });
    const b = empreinteSources({ bdpm: ecrire('b.txt', 'CIS\tDENOMINATION\n') });
    expect(a).toBe(b);
  });

  it('change d’empreinte dès qu’une source est modifiée', () => {
    const avant = empreinteSources({ bdpm: ecrire('c.txt', 'CIS\tA\n') });
    const apres = empreinteSources({ bdpm: ecrire('d.txt', 'CIS\tB\n') });
    expect(avant).not.toBe(apres);
  });

  it('distingue les sources par leur clé', () => {
    const contenu = ecrire('e.txt', 'CIS\tA\n');
    const autre = ecrire('f.txt', 'CIS\tA\n');
    expect(empreinteSources({ bdpm: contenu })).not.toBe(empreinteSources({ compo: autre }));
  });
});
