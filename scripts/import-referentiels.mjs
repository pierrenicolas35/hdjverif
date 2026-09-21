#!/usr/bin/env node
/**
 * Import des référentiels officiels vers Supabase.
 *
 *   node scripts/import-referentiels.mjs
 *
 * Variables d'environnement :
 *   SUPABASE_URL              URL du projet (ex. https://xxxx.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY clé service_role (écriture ; ne jamais publier)
 *   CACHE_DIR                 répertoire de cache des sources (défaut .cache/referentiels)
 *
 * Sources :
 *   • Médicaments  : Base de données publique des médicaments (BDPM, ANSM/Assurance Maladie)
 *                    fichier CIS_bdpm.txt — compte CIS, dénomination, surveillance renforcée.
 *   • CCAM         : Nomenclature CCAM — jeu de données « CCAM Ameli » (data.gouv.fr / InterHop),
 *                    complété par une table de surcharge éditoriale locale.
 *
 * Les indicateurs `est_reserve_hospitaliere` et `est_liste_en_sus` sont posés à NULL
 * lorsqu'ils ne sont pas déterminés : NULL signifie « non déterminé » (à trancher par
 * la PUI / le DIM) et non « hors réserve ».
 */

import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE_DIR = process.env.CACHE_DIR ?? '.cache/referentiels';
const DATA_DIR = 'data';
const TAILLE_LOT = 500;

const URL_BDPM =
  'https://base-donnees-publique.medicaments.gouv.fr/download/file/CIS_bdpm.txt';
const URL_CCAM =
  'https://static.data.gouv.fr/resources/ccam-ameli/20250209-213212/interhop-actes-ameli.csv';

/* ------------------------------------------------------------------ *
 * Utilitaires
 * ------------------------------------------------------------------ */

const log = (...args) => console.log('[import]', ...args);

/** Normalisation pour la recherche par sous-chaîne (minuscules, sans accents). */
function normaliser(texte) {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

async function telecharger(url, fichier) {
  const chemin = join(CACHE_DIR, fichier);
  if (existsSync(chemin)) {
    log(`cache  : ${fichier}`);
    return chemin;
  }
  log(`téléch.: ${url}`);
  const reponse = await fetch(url, { headers: { 'User-Agent': 'hdjverif-import/1.0' } });
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status} sur ${url}`);
  const buffer = Buffer.from(await reponse.arrayBuffer());
  writeFileSync(chemin, buffer);
  log(`        ${fichier} (${(buffer.length / 1024).toFixed(0)} Ko)`);
  return chemin;
}

/* ------------------------------------------------------------------ *
 * Sources brutes
 * ------------------------------------------------------------------ */

/** Lit CIS_bdpm.txt (ISO-8859-1, tabulé) → { cis, denomination, surveillanceRenforcee }. */
function lireBdpm(chemin) {
  const contenu = readFileSync(chemin, 'latin1');
  const lignes = contenu.split(/\r?\n/).filter((l) => l.trim() !== '');
  const medicaments = [];

  for (const ligne of lignes) {
    const c = ligne.split('\t');
    const cis = (c[0] ?? '').trim();
    const denomination = (c[1] ?? '').trim();
    const etatCommercialisation = (c[6] ?? '').trim();
    const surveillance = (c[c.length - 1] ?? '').trim();
    if (!cis || !denomination) continue;
    if (etatCommercialisation !== 'Commercialisée') continue;

    medicaments.push({
      cis,
      denomination,
      surveillance_renforcee: surveillance.toLowerCase().startsWith('oui'),
    });
  }
  return medicaments;
}

/** Extrait une DCI approchée depuis la dénomination BDPM (« DCI, dosage, forme »). */
function extraireDci(denomination) {
  const premiere = denomination.split(',')[0]?.trim() ?? '';
  if (!premiere) return null;
  // Les dénominations « de marque » sont souvent suivies du dosage ; on ne
  // conserve que la partie alphabétique de tête.
  const sansDosage = premiere.replace(/\s+\d.*$/, '').trim();
  return sansDosage.length >= 3 ? sansDosage : null;
}

/** Lit la nomenclature CCAM (CSV) → actes exploitables. */
function lireCcam(chemin) {
  const contenu = readFileSync(chemin, 'utf8');
  const lignes = contenu.split(/\r?\n/);
  const entetes = decouperCsv(lignes[0], ',');
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
    if (codesVus.has(code)) continue; // la source comporte des doublons
    codesVus.add(code);
    actes.push({
      code,
      libelle,
      modeAcces: (ligneObj['modeAccesLabel'] ?? '').trim(),
    });
  }
  return actes;
}

/** Découpe CSV minimale gérant les guillemets doubles. */
function decouperCsv(ligne, separateur = ',') {
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

/* ------------------------------------------------------------------ *
 * Règles d'attribution
 * ------------------------------------------------------------------ */

/** Modes d'accès nécessitant une salle interventionnelle (plateau technique lourd). */
const MODES_PLATEAU_LOURD = new Set([
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
const MODES_EXTERNE = new Set([
  'acte par ultrasons, sans accès',
  'acte par rayons x, sans accès',
  'acte par remnographie sans accès',
]);

/** Charge la table de surcharge CCAM. */
function lireSurchargesCcam() {
  const chemin = join(DATA_DIR, 'ccam-overlay.csv');
  if (!existsSync(chemin)) return new Map();
  const lignes = readFileSync(chemin, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#'));
  const entetes = lignes.shift().split(';');
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

const boolOuNull = (v) => (v === 'true' ? true : v === 'false' ? false : null);

/** Charge les motifs « réserve hospitalière » (positifs et exclusions). */
function lireMotifsReserve() {
  const chemin = join(DATA_DIR, 'reserve-hospitaliere.dci.txt');
  const positifs = [];
  const exclusions = [];
  for (const brute of readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const ligne = brute.trim();
    if (!ligne || ligne.startsWith('#')) continue;
    if (ligne.startsWith('!')) exclusions.push(normaliser(ligne.slice(1)));
    else positifs.push(normaliser(ligne));
  }
  return { positifs, exclusions };
}

function estReserveHospitaliere(denomination, dci, motifs) {
  const cible = normaliser(`${denomination} ${dci ?? ''}`);
  if (motifs.exclusions.some((m) => cible.includes(m))) return false;
  if (motifs.positifs.some((m) => cible.includes(m))) return true;
  return null; // non déterminé
}

/* ------------------------------------------------------------------ *
 * Écriture Supabase
 * ------------------------------------------------------------------ */

async function ecrireSupabase(table, lignes, cleConflit) {
  const url = process.env.SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.');

  let ecrites = 0;
  for (let i = 0; i < lignes.length; i += TAILLE_LOT) {
    const lot = lignes.slice(i, i + TAILLE_LOT);
    const reponse = await fetch(`${url}/rest/v1/${table}?on_conflict=${cleConflit}`, {
      method: 'POST',
      headers: {
        apikey: cle,
        Authorization: `Bearer ${cle}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(lot),
    });
    if (!reponse.ok) {
      throw new Error(
        `Écriture ${table} échouée (HTTP ${reponse.status}) : ${await reponse.text()}`,
      );
    }
    ecrites += lot.length;
    process.stdout.write(`\r[import] ${table}: ${ecrites}/${lignes.length} lignes`);
  }
  process.stdout.write('\n');
}

/* ------------------------------------------------------------------ *
 * Programme
 * ------------------------------------------------------------------ */

async function principal() {
  mkdirSync(CACHE_DIR, { recursive: true });

  // --- Médicaments --------------------------------------------------
  const cheminBdpm = await telecharger(URL_BDPM, 'CIS_bdpm.txt');
  const bruts = lireBdpm(cheminBdpm);
  const motifs = lireMotifsReserve();

  const medicaments = bruts.map((m) => {
    const dci = extraireDci(m.denomination);
    const reserve = estReserveHospitaliere(m.denomination, dci, motifs);
    return {
      cis: m.cis,
      denomination: m.denomination,
      dci,
      est_reserve_hospitaliere: reserve,
      // Première approximation documentée : la réserve hospitalière et la liste
      // en sus coïncident pour l'essentiel des spécialités concernées. À affiner
      // par la PUI à partir de l'arrêté « liste en sus » en vigueur.
      est_liste_en_sus: reserve,
      surveillance_renforcee: m.surveillance_renforcee,
    };
  });

  const nbReserve = medicaments.filter((m) => m.est_reserve_hospitaliere === true).length;
  log(`médicaments : ${medicaments.length} lignes (${nbReserve} marquées réserve hospitalière, ` +
    `${medicaments.filter((m) => m.est_reserve_hospitaliere === null).length} non déterminées)`);

  // --- CCAM ---------------------------------------------------------
  const cheminCcam = await telecharger(URL_CCAM, 'ccam-ameli.csv');
  const actesBruts = lireCcam(cheminCcam);
  const surcharges = lireSurchargesCcam();

  const actes = actesBruts.map((a) => {
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

  log(
    `CCAM        : ${actes.length} actes ` +
      `(${actes.filter((a) => a.necessite_plateau_lourd).length} plateau lourd, ` +
      `${actes.filter((a) => a.exclusif_externe).length} externe)`,
  );

  if (process.argv.includes('--dry-run')) {
    log('mode --dry-run : aucune écriture.');
    log('exemple médicament :', JSON.stringify(medicaments[0]));
    log('exemple acte       :', JSON.stringify(actes[0]));
    return;
  }

  await ecrireSupabase('referentiel_medicaments', medicaments, 'cis');
  await ecrireSupabase('referentiel_ccam', actes, 'code');
  log('import terminé.');
}

principal().catch((erreur) => {
  console.error('[import] échec :', erreur.message);
  process.exitCode = 1;
});
