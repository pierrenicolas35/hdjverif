/**
 * Règles de lecture et de qualification des référentiels officiels.
 *
 * Module **pur** : toutes les fonctions reçoivent le *contenu* des fichiers sources
 * (chaînes de caractères), jamais le réseau ni le disque. Il est donc directement
 * testable (voir `tests/referentiels.test.ts`) et rejouable à l'identique.
 *
 * Sources :
 *   • `CIS_bdpm.txt`       — spécialités commercialisées (BDPM, ANSM / Assurance Maladie).
 *   • `CIS_COMPO_bdpm.txt` — composition : c'est **la** source de la DCI (substances actives).
 *   • `CIS_CPD_bdpm.txt`   — conditions de prescription et de délivrance : c'est **la**
 *                            source officielle de la réserve hospitalière, via le libellé
 *                            « réservé à l'usage HOSPITALIER » (art. R. 5121-82 CSP).
 *   • `ccam-ameli.csv`     — nomenclature CCAM (modes d'accès).
 */

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

/** Minuscules sans accents, pour comparer des libellés officiels (encodés en latin-1). */
export function normaliser(texte) {
  return String(texte)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Découpe CSV minimale gérant les guillemets doubles. */
export function decouperCsv(ligne, separateur = ',') {
  const cellules = [];
  let courante = '';
  let enGuillemets = false;
  for (let i = 0; i < ligne.length; i += 1) {
    const ch = ligne[i];
    if (enGuillemets) {
      if (ch === '"') {
        if (ligne[i + 1] === '"') {
          courante += '"';
          i += 1;
        } else enGuillemets = false;
      } else courante += ch;
    } else if (ch === '"') enGuillemets = true;
    else if (ch === separateur) {
      cellules.push(courante);
      courante = '';
    } else courante += ch;
  }
  cellules.push(courante);
  return cellules;
}

/** Découpe un fichier tabulé de la BDPM en lignes de colonnes (lignes vides ignorées). */
function lignesTabulees(contenu) {
  return contenu
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => l.split('\t').map((c) => c.trim()));
}

/* ------------------------------------------------------------------ *
 * CIS_bdpm.txt — spécialités commercialisées
 * ------------------------------------------------------------------ */

/**
 * Spécialités effectivement commercialisées.
 * @returns {{cis: string, denomination: string, surveillanceRenforcee: boolean}[]}
 */
export function lireSpecialitesCommercialisees(contenu) {
  const specialites = [];
  for (const c of lignesTabulees(contenu)) {
    const cis = c[0] ?? '';
    const denomination = c[1] ?? '';
    const etatCommercialisation = c[6] ?? '';
    const surveillance = (c[c.length - 1] ?? '').trim();
    if (!cis || !denomination) continue;
    if (etatCommercialisation !== 'Commercialisée') continue;
    specialites.push({
      cis,
      denomination,
      surveillanceRenforcee: normaliser(surveillance).startsWith('oui'),
    });
  }
  return specialites;
}

/* ------------------------------------------------------------------ *
 * CIS_COMPO_bdpm.txt — composition (DCI réelle)
 * ------------------------------------------------------------------ */

/**
 * Substances actives par CIS (`nature` == « SA » ; les fractions thérapeutiques « FT »
 * sont écartées), dédoublonnées et dans l'ordre du fichier.
 * @returns {Map<string, string[]>}
 */
export function lireComposition(contenu) {
  const parCis = new Map();
  for (const c of lignesTabulees(contenu)) {
    const cis = c[0] ?? '';
    const substance = c[3] ?? '';
    const nature = c[6] ?? '';
    if (!cis || !substance || nature !== 'SA') continue;
    const liste = parCis.get(cis) ?? [];
    if (!liste.includes(substance)) liste.push(substance);
    parCis.set(cis, liste);
  }
  return parCis;
}

/** DCI affichable à partir des substances actives : « A + B », `null` si inconnue. */
export function dciDepuisSubstances(substances) {
  if (!substances || substances.length === 0) return null;
  return substances.join(' + ');
}

/* ------------------------------------------------------------------ *
 * CIS_CPD_bdpm.txt — conditions de prescription et de délivrance
 * ------------------------------------------------------------------ */

/** Libellé officiel de la réserve hospitalière (art. R. 5121-82 CSP). */
export const LIBELLE_RESERVE_HOSPITALIERE = "reserve a l'usage hospitalier";

/**
 * Libellés CPD par CIS.
 * @returns {Map<string, string[]>}
 */
export function lireCpd(contenu) {
  const parCis = new Map();
  for (const c of lignesTabulees(contenu)) {
    const cis = c[0] ?? '';
    const libelle = c[1] ?? '';
    if (!cis || !libelle) continue;
    const liste = parCis.get(cis) ?? [];
    liste.push(libelle);
    parCis.set(cis, liste);
  }
  return parCis;
}

/** Vrai si l'un des libellés CPD est exactement le libellé de réserve hospitalière. */
export function porteReserveHospitaliere(libellesCpd) {
  return (libellesCpd ?? []).some((l) => normaliser(l).startsWith(LIBELLE_RESERVE_HOSPITALIERE));
}

/* ------------------------------------------------------------------ *
 * Liste de travail locale (secours)
 * ------------------------------------------------------------------ */

/**
 * Lit la liste de travail « réserve hospitalière ».
 * Les lignes `!motif` sont des **exclusions** (garde-fous contre les faux positifs).
 * @returns {{positifs: string[], exclusions: string[]}}
 */
export function lireMotifsReserve(contenu) {
  const positifs = [];
  const exclusions = [];
  for (const brute of contenu.split(/\r?\n/)) {
    const ligne = brute.trim();
    if (!ligne || ligne.startsWith('#')) continue;
    if (ligne.startsWith('!')) exclusions.push(normaliser(ligne.slice(1)));
    else positifs.push(normaliser(ligne));
  }
  return { positifs, exclusions };
}

/**
 * Qualifie une cible par la liste de travail locale.
 * Les exclusions ont la priorité (contrat du fichier) : elles forcent « hors réserve ».
 * @returns {boolean|null} `null` = aucun motif ne correspond.
 */
export function qualifierParListe(cible, motifs) {
  const texte = normaliser(cible);
  if (motifs.exclusions.some((m) => texte.includes(m))) return false;
  if (motifs.positifs.some((m) => texte.includes(m))) return true;
  return null;
}

/* ------------------------------------------------------------------ *
 * Détermination de la réserve hospitalière
 * ------------------------------------------------------------------ */

/**
 * Réserve hospitalière d'une spécialité.
 *
 * Règle de priorité (documentée dans le README) :
 *   1. le libellé CPD « réservé à l'usage HOSPITALIER » → `true` (source officielle) ;
 *   2. CPD connu **sans** ce libellé → `false` : la source officielle tranche « non » ;
 *   3. CPD inconnu → **inférence documentée** : l'absence de toute condition de prescription
 *      ou de délivrance vaut « hors réserve hospitalière » (une spécialité réservée à l'usage
 *      hospitalier porte nécessairement ce libellé). La liste de travail locale peut encore
 *      confirmer un `true` (produits sans condition CPD mais manifestement hospitaliers,
 *      ex. oxygène médicinal) ; ses exclusions protègent des faux positifs.
 *
 * @returns {boolean} `true` (réserve hospitalière), `false` (hors réserve, tranché ou inféré).
 */
export function determinerReserveHospitaliere({ libellesCpd, denomination, dci, motifs }) {
  if (porteReserveHospitaliere(libellesCpd)) return true;
  const cpdConnu = (libellesCpd ?? []).length > 0;
  if (cpdConnu) return false;
  const parListe = qualifierParListe(`${denomination ?? ''} ${dci ?? ''}`, motifs);
  return parListe ?? false;
}

/* ------------------------------------------------------------------ *
 * Assemblage du référentiel des médicaments
 * ------------------------------------------------------------------ */

/**
 * Construit les lignes de `referentiel_medicaments` à partir des trois sources BDPM.
 *
 * `est_liste_en_sus` : la liste en sus (arrêté) n'est pas déductible des sources
 * publiques utilisées ici. Elle est donc renseignée à `true` lorsque la spécialité
 * relève de la réserve hospitalière (approximation documentée) et laissée à `null`
 * sinon — « non déterminé », et non « hors liste », pour ne pas produire un faux « non ».
 *
 * @returns {{cis: string, denomination: string, dci: string|null,
 *            est_reserve_hospitaliere: boolean|null, est_liste_en_sus: boolean|null,
 *            surveillance_renforcee: boolean}[]}
 */
export function construireMedicaments({ contenuBdpm, contenuCompo, contenuCpd, motifs }) {
  const composition = lireComposition(contenuCompo);
  const cpd = lireCpd(contenuCpd);
  const origineReserve = { cpd: 0, liste: 0, infere: 0, cpdConnu: 0 };

  const lignes = lireSpecialitesCommercialisees(contenuBdpm).map((s) => {
    const substances = composition.get(s.cis);
    const dci = dciDepuisSubstances(substances);
    const libellesCpd = cpd.get(s.cis);
    const reserve = determinerReserveHospitaliere({
      libellesCpd,
      denomination: s.denomination,
      dci,
      motifs,
    });

    if ((libellesCpd ?? []).length > 0) origineReserve.cpdConnu += 1;

    if (porteReserveHospitaliere(libellesCpd)) origineReserve.cpd += 1;
    else if (reserve) origineReserve.liste += 1;
    else if ((libellesCpd ?? []).length === 0) origineReserve.infere += 1;

    return {
      cis: s.cis,
      denomination: s.denomination,
      dci,
      est_reserve_hospitaliere: reserve,
      est_liste_en_sus: reserve === true ? true : null,
      surveillance_renforcee: s.surveillanceRenforcee,
    };
  });

  return { lignes, origineReserve };
}

/* ------------------------------------------------------------------ *
 * Nomenclature CCAM
 * ------------------------------------------------------------------ */

/** Modes d'accès nécessitant une salle interventionnelle (plateau technique lourd). */
export const MODES_PLATEAU_LOURD = new Set([
  'abord ouvert',
  'accès transpariétal',
  'accès endoscopique transpariétal',
  'accès intraluminal transpariétal',
  'accès transorificiel',
  'accès endoscopique transorificiel',
  "acte par rayons x, avec accès autre qu'abord ouvert",
  "acte par ultrasons ou remnographie avec accès autre qu'abord ouvert",
]);

/** Modes d'accès d'imagerie réalisable hors plateau interventionnel. */
export const MODES_EXTERNE = new Set([
  'acte par ultrasons, sans accès',
  'acte par rayons x, sans accès',
  'acte par remnographie sans accès',
]);

/** Actes CCAM exploitables { code, libelle, modeAcces } (doublons de la source écartés). */
export function lireCcam(contenu) {
  const lignes = contenu.split(/\r?\n/);
  const entetes = decouperCsv(lignes[0] ?? '', ',');
  const actes = [];
  const codesVus = new Set();
  for (const ligne of lignes.slice(1)) {
    if (!ligne.trim()) continue;
    const c = decouperCsv(ligne, ',');
    const ligneObj = Object.fromEntries(entetes.map((h, i) => [h, c[i] ?? '']));
    const code = (ligneObj['ccam'] ?? '').trim();
    const libelle = (ligneObj['label'] ?? '').trim();
    const chapitre = (ligneObj['chapterCode'] ?? '').trim();
    if (code.length !== 7 || !libelle || !chapitre) continue;
    if (codesVus.has(code)) continue;
    codesVus.add(code);
    actes.push({ code, libelle, modeAcces: (ligneObj['modeAccesLabel'] ?? '').trim() });
  }
  return actes;
}

/** Lignes de `referentiel_ccam` : croisement nomenclature × surcharges éditoriales locales. */
export function construireActes({ contenuCcam, surcharges }) {
  return lireCcam(contenuCcam).map((a) => {
    const lourd = MODES_PLATEAU_LOURD.has(a.modeAcces);
    const externe = MODES_EXTERNE.has(a.modeAcces);
    const surcharge = surcharges.get(a.code);
    return {
      code: a.code,
      libelle: a.libelle,
      acte_marqueur_hdj: surcharge?.acte_marqueur_hdj ?? lourd,
      exclusif_externe: surcharge?.exclusif_externe ?? externe,
      necessite_plateau_lourd: surcharge?.necessite_plateau_lourd ?? lourd,
    };
  });
}

/** Charge la table de surcharge CCAM (`data/ccam-overlay.csv`, séparateur « ; »). */
export function lireSurchargesCcam(contenu) {
  const lignes = contenu
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#'));
  const entetes = (lignes.shift() ?? '').split(';');
  const surcharges = new Map();
  for (const ligne of lignes) {
    const c = ligne.split(';');
    const obj = Object.fromEntries(entetes.map((h, i) => [h, (c[i] ?? '').trim()]));
    if (!obj.code) continue;
    surcharges.set(obj.code, {
      acte_marqueur_hdj: boolOuNull(obj.acte_marqueur_hdj),
      exclusif_externe: boolOuNull(obj.exclusif_externe),
      necessite_plateau_lourd: boolOuNull(obj.necessite_plateau_lourd),
    });
  }
  return surcharges;
}

export const boolOuNull = (v) => (v === 'true' ? true : v === 'false' ? false : null);

/* ------------------------------------------------------------------ *
 * Diagnostics
 * ------------------------------------------------------------------ */

/** Compte les lignes par valeur de `est_reserve_hospitaliere`. */
export function statistiquesReserve(lignes) {
  return {
    total: lignes.length,
    reserve: lignes.filter((l) => l.est_reserve_hospitaliere === true).length,
    hors: lignes.filter((l) => l.est_reserve_hospitaliere === false).length,
    indetermine: lignes.filter((l) => l.est_reserve_hospitaliere === null).length,
    avecDci: lignes.filter((l) => l.dci !== null).length,
    listeEnSus: lignes.filter((l) => l.est_liste_en_sus === true).length,
  };
}

/** Rend un CSV (RFC 4180 minimal) pour un export de secours sans clé `service_role`. */
export function versCsv(lignes, colonnes) {
  const cellule = (v) => {
    if (v === null || v === undefined) return '';
    const t = String(v);
    return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const entete = colonnes.join(',');
  const corps = lignes.map((l) => colonnes.map((c) => cellule(l[c])).join(','));
  return [entete, ...corps].join('\n');
}
