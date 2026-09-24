/**
 * Tests du référentiel ATIH (`scripts/lib/ghm.mjs`) et de son croisement avec la CCAM.
 *
 * DEUX NIVEAUX, ET POURQUOI
 *
 *   1. **hermétique** — fixtures écrites dans ce fichier et fichiers **versionnés** de `data/`
 *      (`data/atih/*.csv`, `data/ccam-complete-2025.csv`). Ces tests tournent partout, y
 *      compris en intégration continue, sans réseau ni cache.
 *
 *   2. **conditionnel** — croisement avec la **source libérale téléchargée**
 *      (`.cache/referentiels/ccam-ameli.csv`), qui n'est **pas versionnée** : la CI l'obtient à
 *      l'import des référentiels, pas à chaque `npm test`. Ces vérifications s'exécutent là où la
 *      source est présente (`npm run import:referentiels:controle` pour la reconstituer) et sont
 *      **ignorées ailleurs**, plutôt que de faire échouer la chaîne sur un fichier absent.
 *
 * Ce que les tests hermétiques couvrent malgré tout : la lecture des annexes, les quatre statuts
 * de classement, le rattachement des actes aux racines, la règle « un acte d'anesthésie n'est
 * jamais classant », la déduction du plateau technique lourd et les volumes du référentiel livré.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

import {
  ELIGIBILITE,
  TYPE_ACTE,
  classerActeHdj,
  enrichirActesAvecGhm,
  lireActesClassantsGhm,
  lireCsvPointVirgule,
  lireRacinesGhm,
} from '../scripts/lib/ghm.mjs';
import { construireActes, lireSurchargesCcam } from '../scripts/lib/referentiels.mjs';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const RACINES = `# commentaire ignoré
racine_ghm;cmd;categorie_majeure_ghm;ghm_court;admet_sejour_0_nuit;libelle
01C15;01;Groupes chirurgicaux;J;oui;Libérations du médian au canal carpien, en ambulatoire
06C08;06;Groupes chirurgicaux;;non;Appendicectomies compliquées
06K03;06;Groupes avec acte classant non opératoire;J;oui;Séjours comprenant une endoscopie digestive thérapeutique
14Z13;14;"Groupes ""médicaux""";T1;oui;Accouchements uniques par voie basse
01K06;01;Groupes avec acte classant non opératoire;J;oui;Affections du système nerveux sans acte opératoire avec anesthésie, en ambulatoire
`;

const CLASSANTS = `code_ccam;racines_ghm;cmds_classantes;reclassant_ghm_medical;libelle_ghm
AHPA009;01C15 08C60;01 08;non;libér. nf médian au canal carpien ab. direct
HHFA011;06C08;06;non;appendicectomie laparo
HHFE002;06K03;06;non;exérèse 1à 3polypes <1cm côlon
DELA001;01C15;05;oui;implant sc stimul card
JQGA002;14Z13;14;non;accouch. césarienne program.
`;

/**
 * Quatre lignes **réelles** du jeu « CCAM Ameli », réduites aux colonnes exploitées par
 * `lireCcam`. Elles couvrent les trois familles de mode d'accès qui commandent les indicateurs
 * CCAM : plateau lourd, réalisable en externe, et « autre moyen » (les deux à `false`).
 */
const CCAM_AMELI = `ccam,label,chapterCode,chapterLabel,topographie,topographieLabel,action,actionLabel,modeAccesLabel,familleLabel
AAFA002,"exérèse de tumeur intraparenchymateuse du cerveau, par craniotomie",01,"système nerveux central, périphérique et autonome",AA,encéphale,F,exciser,abord ouvert,chirurgie du cerveau
AAQM002,échographie transfontanellaire de l'encéphale,01,"système nerveux central, périphérique et autonome",AA,encéphale,Q,guider/enregistrer/examiner/mesurer,"acte par ultrasons, sans accès",échographie du système nerveux
AAQP002,"électroencéphalographie continue ambulatoire sur 8 dérivations ou plus, pendant au moins 24 heures [Holter EEG]",01,"système nerveux central, périphérique et autonome",AA,encéphale,Q,guider/enregistrer/examiner/mesurer,"acte par autre moyen, sans accès, ou non précisé",électroencéphalogramme (EEG)
ACHB001,"biopsie de lésion intracrânienne, par voie transcrânienne stéréotaxique",01,"système nerveux central, périphérique et autonome",AC,"intracrânien, localisations multiples ou sans précision",H,prélever,accès transpariétal,ponction et biopsie du système nerveux (cerveau)
`;

const FILE_AMELI = '.cache/referentiels/ccam-ameli.csv';
const CACHE_PRESENT = existsSync(FILE_AMELI);
const lireAmeli = () => readFileSync(FILE_AMELI, 'utf8');

const OUTILS = {
  ccam: () => readFileSync('data/ccam-complete-2025.csv', 'utf8'),
  surcharges: () => lireSurchargesCcam(readFileSync('data/ccam-overlay.csv', 'utf8')),
  racines: () => lireRacinesGhm(readFileSync('data/atih/racines-ghm-2025.csv', 'utf8')),
  classants: () => lireActesClassantsGhm(readFileSync('data/atih/actes-classants-ghm-2025.csv', 'utf8')),
};

/* ------------------------------------------------------------------ *
 * 1. Lecture des annexes ATIH
 * ------------------------------------------------------------------ */

const referentiel = () => ({
  racines: lireRacinesGhm(RACINES),
  actesClassants: lireActesClassantsGhm(CLASSANTS),
});

describe('lecture des fichiers ATIH', () => {
  it('ignore les commentaires et convertit les marqueurs « GHM courts »', () => {
    const racines = lireRacinesGhm(RACINES);
    expect(racines.size).toBe(5);
    expect(racines.get('01C15')).toMatchObject({
      cmd: '01',
      ghmCourt: 'J',
      admetSejourZeroNuit: true,
      categorieMajeure: 'Groupes chirurgicaux',
    });
    // Une racine chirurgicale sans marqueur n'admet aucun séjour de 0 nuit.
    expect(racines.get('06C08')).toMatchObject({ ghmCourt: '', admetSejourZeroNuit: false });
    expect(racines.get('14Z13')).toMatchObject({ ghmCourt: 'T1', admetSejourZeroNuit: true });
  });

  it('découpe les listes de racines et de CMD', () => {
    const actes = lireActesClassantsGhm(CLASSANTS);
    expect(actes.get('AHPA009')).toMatchObject({
      racines: ['01C15', '08C60'],
      cmds: ['01', '08'],
      reclassantMedical: false,
    });
    expect(actes.get('DELA001')?.reclassantMedical).toBe(true);
  });

  it('écarte les lignes vides', () => {
    const { lignes } = lireCsvPointVirgule('a;b\n\n1;2\n\n');
    expect(lignes).toEqual([{ a: '1', b: '2' }]);
  });

  it('respecte les guillemets : un libellé officiel peut contenir le séparateur', () => {
    // Le libellé contient le séparateur : il doit être entre guillemets **droits**.
    const { lignes } = lireCsvPointVirgule('code;libelle\nXX;"pose d\'une perfusion ; oxygène"\n');
    expect(lignes[0]).toEqual({ code: 'XX', libelle: "pose d'une perfusion ; oxygène" });
  });
});

/* ------------------------------------------------------------------ *
 * 2. Lecture de la nomenclature CCAM
 * ------------------------------------------------------------------ */

describe('lecture de la nomenclature CCAM', () => {
  it('déduit le plateau technique lourd et le réalisable en externe du mode d’accès', () => {
    const actes = construireActes({ contenuCcam: CCAM_AMELI, surcharges: new Map() });
    expect(actes).toHaveLength(4);
    const par = new Map(actes.map((a) => [a.code, a]));
    expect(par.get('AAFA002')).toMatchObject({
      necessite_plateau_lourd: true,
      exclusif_externe: false,
    });
    expect(par.get('ACHB001')).toMatchObject({
      necessite_plateau_lourd: true,
      exclusif_externe: false,
    });
    expect(par.get('AAQM002')).toMatchObject({
      necessite_plateau_lourd: false,
      exclusif_externe: true,
    });
    // « autre moyen, sans accès, ou non précisé » : ni l'un ni l'autre.
    expect(par.get('AAQP002')).toMatchObject({
      necessite_plateau_lourd: false,
      exclusif_externe: false,
    });
  });

  it('construit l’arborescence : chapitre, sous-thème anatomique et mots-clés', () => {
    const actes = construireActes({ contenuCcam: CCAM_AMELI, surcharges: new Map() });
    const cranio = actes.find((a) => a.code === 'AAFA002');
    expect(cranio).toMatchObject({
      chapitre_code: '01',
      sous_chapitre_code: 'AA',
      sous_chapitre_libelle: 'encéphale',
    });
    expect(cranio?.mots_cles).toContain('chirurgie');
  });

  it('complète la nomenclature par les actes absents du périmètre libéral', () => {
    const ameli = construireActes({ contenuCcam: CCAM_AMELI, surcharges: new Map() });
    const complet = construireActes({
      contenuCcam: CCAM_AMELI,
      surcharges: new Map(),
      contenuCcamConsolides: OUTILS.ccam(),
    });
    expect(complet.length).toBeGreaterThan(ameli.length);
    // Aucun doublon, et les actes connus gardent libellé et indicateurs.
    expect(new Set(complet.map((a) => a.code)).size).toBe(complet.length);
    const par = new Map(complet.map((a) => [a.code, a]));
    for (const a of ameli) expect(par.get(a.code)).toMatchObject({ libelle: a.libelle });
    // Le chapitre 18, absent de la source libérale, est bien apporté.
    expect(par.get('ZZLP025')).toMatchObject({ chapitre_code: '18' });
    expect(par.get('ZZLP025')?.chapitre_libelle).toBe('gestes complémentaires et modificateurs');
  });
});

/* ------------------------------------------------------------------ *
 * 3. Classement HDJ d'un acte
 * ------------------------------------------------------------------ */

describe('classement HDJ d’un acte', () => {
  const classer = (code: string, plateauLourd: boolean | null = false) =>
    classerActeHdj({ code, libelle: code, necessite_plateau_lourd: plateauLourd }, referentiel());

  it('acte classant sur une racine en « J » : éligible à l’HDJ', () => {
    const c = classer('AHPA009');
    expect(c.eligibleHdj).toBe(ELIGIBILITE.OUI);
    expect(c.typeActe).toBe(TYPE_ACTE.OPERATOIRE);
    expect(c.ghmAmbulatoireStrict).toBe(true);
    expect(c.commentairePmsi).toContain('01C15');
  });

  it('acte classant sans aucun GHM de 0 nuit : non éligible', () => {
    const c = classer('HHFA011');
    expect(c.acteClassant).toBe(true);
    expect(c.eligibleHdj).toBe(ELIGIBILITE.NON);
    expect(c.motifEligibilite).toContain('nuitée');
    expect(c.typeActe).toBe(TYPE_ACTE.OPERATOIRE);
  });

  it('acte non opératoire classant sur une racine en « J » : éligible', () => {
    const c = classer('HHFE002');
    expect(c.eligibleHdj).toBe(ELIGIBILITE.OUI);
    expect(c.typeActe).toBe(TYPE_ACTE.NON_OPERATOIRE);
  });

  it('acte reclassant en GHM médical (annexe 11) : non éligible, même avec une racine en « J »', () => {
    const c = classer('DELA001');
    expect(c.reclassantMedical).toBe(true);
    expect(c.eligibleHdj).toBe(ELIGIBILITE.NON);
    expect(c.typeActe).toBe(TYPE_ACTE.RECLASSANT_MEDICAL);
  });

  it('racine en très courte durée seulement : « sous condition », jamais « oui »', () => {
    const c = classer('JQGA002');
    expect(c.eligibleHdj).toBe(ELIGIBILITE.SOUS_CONDITION);
    expect(c.ghmAmbulatoireStrict).toBe(false);
    expect(c.admetSejourZeroNuit).toBe(true);
  });

  it('acte absent des listes classantes : non éligible, et aucun GHS ouvert', () => {
    const c = classer('DEQP003');
    expect(c.acteClassant).toBe(false);
    expect(c.eligibleHdj).toBe(ELIGIBILITE.NON);
    expect(c.typeActe).toBe(TYPE_ACTE.NON_CLASSANT);
    expect(c.racinesGhm).toEqual([]);
  });

  it('signale l’anesthésie quand le libellé de la racine la mentionne', () => {
    const actes = lireActesClassantsGhm(
      'code_ccam;racines_ghm;cmds_classantes;reclassant_ghm_medical;libelle_ghm\nZZXX001;01K06;01;non;essai\n',
    );
    const c = classerActeHdj(
      { code: 'ZZXX001', libelle: 'essai' },
      { racines: lireRacinesGhm(RACINES), actesClassants: actes },
    );
    expect(c.environnementRequis).toContain('Anesthésie');
  });

  it('déduit le plateau technique lourd du groupe chirurgical quand la CCAM est muette', () => {
    // Acte sans mode d'accès connu (chapitre 18, hôpital) : la racine fait foi.
    expect(classer('AHPA009', null).plateauTechniqueLourdRequis).toBe(true);
    // Hors de ce cas, la valeur reste absente — jamais convertie en « non ».
    expect(classer('HHFE002', null).plateauTechniqueLourdRequis).toBeNull();
    // Valeur CCAM connue : elle prime, y compris quand elle dit « non ».
    expect(classer('AHPA009', false).plateauTechniqueLourdRequis).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * 4. Référentiel livré (fichiers versionnés de data/)
 * ------------------------------------------------------------------ */

describe('référentiel livré (data/atih et data/ccam-complete-2025.csv)', () => {
  const racines = OUTILS.racines();
  const actesClassants = OUTILS.classants();
  const enrichis = enrichirActesAvecGhm(
    construireActes({
      contenuCcam: '',
      surcharges: OUTILS.surcharges(),
      contenuCcamConsolides: OUTILS.ccam(),
    }),
    { racines, actesClassants },
  );

  it('couvre les 679 racines de GHM et les 5 492 actes classants du manuel 2025', () => {
    expect(racines.size).toBe(679);
    expect(actesClassants.size).toBe(5492);
  });

  it('dénombre 152 GHM ambulatoires stricts et 395 racines admettant un séjour de 0 nuit', () => {
    expect([...racines.values()].filter((r) => r.ghmCourt === 'J')).toHaveLength(152);
    expect([...racines.values()].filter((r) => r.admetSejourZeroNuit)).toHaveLength(395);
  });

  it('apporte le chapitre 18 (gestes complémentaires et anesthésies)', () => {
    const ch18 = enrichis.filter((a) => a.chapitre_code === '18');
    expect(ch18).toHaveLength(148);
    expect(ch18.every((a) => a.chapitre_libelle === 'gestes complémentaires et modificateurs')).toBe(
      true,
    );
    // Les quatre niveaux d'anesthésie générale complémentaire, avec leur numéro.
    const par = new Map(enrichis.map((a) => [a.code, a]));
    for (const code of ['ZZLP025', 'ZZLP030', 'ZZLP042', 'ZZLP054']) {
      expect(par.get(code)?.libelle).toMatch(/niveau [1-9]$/);
    }
  });

  it('n’ouvre aucun GHS sur un acte d’anesthésie : il n’est jamais classant', () => {
    // Règle officielle (Manuel des GHM, volume 2) : les actes d'anesthésie portent le code
    // « activité » 4 et sont des gestes complémentaires — ils ne classent pas le séjour.
    const par = new Map(enrichis.map((a) => [a.code, a]));
    expect(par.get('ZZLP025')).toMatchObject({
      acte_classant: false,
      eligible_hdj: false,
      type_acte: TYPE_ACTE.NON_CLASSANT,
    });
  });

  it('classe toute la base : chaque acte reçoit un type et une éligibilité', () => {
    const types = new Set(Object.values(TYPE_ACTE));
    expect(enrichis.length).toBeGreaterThan(8000);
    for (const a of enrichis) {
      expect(types.has(a.type_acte)).toBe(true);
      expect(['oui', 'sous condition', 'non']).toContain(a.eligibilite_hdj);
      expect(a.libelle.length).toBeGreaterThan(0);
    }
    // Les volumes sont indépendants de la source libérale : ils ne dépendent que du manuel.
    expect(enrichis.filter((a) => a.acte_classant)).toHaveLength(5486);
    expect(enrichis.filter((a) => a.eligible_hdj)).toHaveLength(4254);
    expect(enrichis.filter((a) => a.eligibilite_hdj === ELIGIBILITE.SOUS_CONDITION)).toHaveLength(263);
    // Un acte classant chirurgical a toujours une valeur de plateau déterminée.
    for (const a of enrichis.filter((x) => x.type_acte === TYPE_ACTE.OPERATOIRE)) {
      expect(a.necessite_plateau_lourd).not.toBeNull();
    }
  });
});

/* ------------------------------------------------------------------ *
 * 5. Croisement avec la source libérale téléchargée (conditionnel)
 * ------------------------------------------------------------------ */

describe.skipIf(!CACHE_PRESENT)('source libérale CCAM Ameli (.cache/)', () => {
  // Les lectures sont paresseuses : Vitest évalue le corps du `describe` même lorsque la suite
  // est ignorée, et la source n'existe pas là où elle n'a pas été téléchargée.
  let memo: ReturnType<typeof calculer> | null = null;
  const calculer = () => {
    const enrichis = enrichirActesAvecGhm(
      construireActes({
        contenuCcam: lireAmeli(),
        surcharges: OUTILS.surcharges(),
        contenuCcamConsolides: OUTILS.ccam(),
      }),
      { racines: OUTILS.racines(), actesClassants: OUTILS.classants() },
    );
    return {
      enrichis,
      ameliSeul: construireActes({ contenuCcam: lireAmeli(), surcharges: OUTILS.surcharges() }),
      par: new Map(enrichis.map((a) => [a.code, a])),
    };
  };
  const donnees = () => (memo ??= calculer());

  it('n’altère pas les 1 969 actes déjà connus : libellé et indicateurs identiques', () => {
    const { ameliSeul, par } = donnees();
    expect(ameliSeul).toHaveLength(1969);
    for (const a of ameliSeul) {
      expect(par.get(a.code)).toMatchObject({
        libelle: a.libelle,
        necessite_plateau_lourd: a.necessite_plateau_lourd,
        exclusif_externe: a.exclusif_externe,
      });
    }
  });

  it('retrouve les proportions du périmètre libéral', () => {
    const { enrichis, ameliSeul } = donnees();
    const codes = new Set(ameliSeul.map((x) => x.code));
    const libéraux = enrichis.filter((a) => codes.has(a.code));
    expect(libéraux.filter((a) => a.acte_classant)).toHaveLength(1084);
    expect(libéraux.filter((a) => a.eligible_hdj)).toHaveLength(837);
  });

  it('tient les cas de référence du codage HDJ', () => {
    const { par } = donnees();
    // Libération du médian au canal carpien : 01C15, GHM ambulatoire strict.
    expect(par.get('AHPA009')).toMatchObject({ eligible_hdj: true, acte_classant: true });
    // Appendicectomie : classante, mais aucune racine de 0 nuit.
    expect(par.get('HHFA011')).toMatchObject({ eligible_hdj: false, acte_classant: true });
    // ECG : non classant (et non dénombrable — voir data/ccam-overlay.csv).
    expect(par.get('DEQP003')).toMatchObject({ eligible_hdj: false, acte_classant: false });
    // Césarienne : seulement des racines en très courte durée.
    expect(par.get('JQGA002')).toMatchObject({
      eligible_hdj: false,
      eligibilite_hdj: ELIGIBILITE.SOUS_CONDITION,
    });
  });
});
