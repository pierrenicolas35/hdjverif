#!/usr/bin/env node
/**
 * Import des référentiels officiels vers Supabase.
 *
 *   node scripts/import-referentiels.mjs                 # import réel (clé service_role requise)
 *   node scripts/import-referentiels.mjs --dry-run       # prépare, contrôle et n'écrit rien
 *   node scripts/import-referentiels.mjs --dry-run --export   # + export CSV de secours
 *
 * Variables d'environnement :
 *   SUPABASE_URL               URL du projet (ex. https://xxxx.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY  clé service_role (écriture ; ne jamais publier)
 *   CACHE_DIR                  répertoire de cache des sources (défaut .cache/referentiels)
 *
 * Sources (toutes officielles) :
 *   • Médicaments (BDPM, ANSM / Assurance Maladie) :
 *       - `CIS_bdpm.txt`       — spécialités commercialisées ;
 *       - `CIS_COMPO_bdpm.txt` — composition : alimente la **DCI** (`dci`) ;
 *       - `CIS_CPD_bdpm.txt`   — conditions de prescription et de délivrance : alimente
 *                                `est_reserve_hospitaliere` par le libellé officiel
 *                                « réservé à l'usage HOSPITALIER » (art. R. 5121-82 CSP).
 *   • CCAM (jeu de données « CCAM Ameli », data.gouv.fr / InterHop), complété par la
 *     table de surcharge éditoriale locale `data/ccam-overlay.csv`.
 *
 * Aucune valeur absente n'est convertie en refus : quand le CPD est muet (aucune condition de
 * prescription ni de délivrance), la valeur reste `NULL` — l'application l'affiche comme « non
 * déterminée » et demande la confirmation de la pharmacie à usage intérieur, sans jamais en
 * tirer un « hors réserve hospitalière » (doctrine du 22/09/2026).
 *
 * Contrôles : `--dry-run` rejoue les cas de référence (produits de HDJ, produits de ville,
 * rattrapage par la liste de travail) et l'intégrité des sources avant toute écriture ;
 * `node scripts/verifier-referentiel.mjs` contrôle ensuite la base publiée en lecture seule
 * (clé `anon`).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  construireActes,
  construireMedicaments,
  lireMotifsReserve,
  lireSurchargesCcam,
  statistiquesReserve,
  versCsv,
} from './lib/referentiels.mjs';

const CACHE_DIR = process.env.CACHE_DIR ?? '.cache/referentiels';
const DATA_DIR = 'data';
const TAILLE_LOT = 500;

const BASE_BDPM = 'https://base-donnees-publique.medicaments.gouv.fr/download/file';
const SOURCES = {
  bdpm: { url: `${BASE_BDPM}/CIS_bdpm.txt`, fichier: 'CIS_bdpm.txt', encodage: 'latin1' },
  compo: { url: `${BASE_BDPM}/CIS_COMPO_bdpm.txt`, fichier: 'CIS_COMPO_bdpm.txt', encodage: 'latin1' },
  cpd: { url: `${BASE_BDPM}/CIS_CPD_bdpm.txt`, fichier: 'CIS_CPD_bdpm.txt', encodage: 'latin1' },
  ccam: {
    url: 'https://static.data.gouv.fr/resources/ccam-ameli/20250209-213212/interhop-actes-ameli.csv',
    fichier: 'ccam-ameli.csv',
    encodage: 'utf8',
  },
};

/** Cas de référence : ce que le référentiel doit impérativement affirmer après import. */
const CAS_DE_REFERENCE = [
  { denomination: 'REMICADE', reserve: true, motif: 'produit de HDJ, réserve hospitalière (CPD)' },
  { denomination: 'AVASTIN', reserve: true, motif: 'produit de HDJ, réserve hospitalière (CPD)' },
  { denomination: 'KEYTRUDA', reserve: true, motif: 'produit de HDJ, réserve hospitalière (CPD)' },
  { denomination: 'OPDIVO', reserve: true, motif: 'produit de HDJ, réserve hospitalière (CPD)' },
  { denomination: 'IMMUNOGLOBULINE HUMAINE DE L', reserve: true, motif: 'immunoglobuline (CPD)' },
  { denomination: 'OXYGENE MEDICINAL', reserve: true, motif: 'rattrapé par la liste de travail' },
  { denomination: 'MABTHERA', reserve: false, motif: 'prescription hospitalière, hors réserve' },
  { denomination: 'DOLIPRANE', reserve: false, motif: 'produit de ville (CPD : liste II)' },
  { denomination: 'EFFERALGAN', reserve: false, motif: 'produit de ville (CPD)' },
  { denomination: 'GRANIONS', reserve: null, motif: 'CPD muet : valeur absente (non déterminée)' },
];

const log = (...args) => console.log('[import]', ...args);

/* ------------------------------------------------------------------ *
 * Téléchargement (avec cache local)
 * ------------------------------------------------------------------ */

async function recuperer(cle) {
  const source = SOURCES[cle];
  const chemin = join(CACHE_DIR, source.fichier);
  if (!existsSync(chemin)) {
    log(`téléch. : ${source.url}`);
    const reponse = await fetch(source.url, {
      headers: { 'User-Agent': 'hdjverif-import/1.0' },
    });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status} sur ${source.url}`);
    const buffer = Buffer.from(await reponse.arrayBuffer());
    if (buffer.length < 1024) throw new Error(`Source tronquée : ${source.fichier}`);
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(chemin, buffer);
    log(`         ${source.fichier} (${(buffer.length / 1024).toFixed(0)} Ko)`);
  } else {
    log(`cache   : ${source.fichier}`);
  }
  return readFileSync(chemin, source.encodage);
}

/* ------------------------------------------------------------------ *
 * Contrôles avant écriture
 * ------------------------------------------------------------------ */

/** Contrôle les cas de référence, la couverture et la présence des DCI. */
function controler(medicaments, origineReserve) {
  const stats = statistiquesReserve(medicaments);
  const constats = [];
  let erreurs = 0;

  for (const cas of CAS_DE_REFERENCE) {
    const cible = medicaments.find((m) => m.denomination.startsWith(cas.denomination));
    const obtenu = cible ? cible.est_reserve_hospitaliere : 'absent';
    const ok = obtenu === cas.reserve;
    if (!ok) erreurs += 1;
    constats.push(
      `${ok ? '✓' : '✗'} ${cas.denomination.padEnd(26)} réserve=${String(obtenu).padEnd(5)}` +
        ` (attendu ${cas.reserve} — ${cas.motif})`,
    );
  }

  // Intégrité des sources : une source tronquée doit arrêter l'import.
  if (origineReserve.cpdConnu < 10000) {
    erreurs += 1;
    constats.push(
      `✗ source CPD incomplète : ${origineReserve.cpdConnu} spécialités couvertes (< 10 000)`,
    );
  }
  if (stats.reserve < 600) {
    erreurs += 1;
    constats.push(`✗ source CPD incomplète : ${stats.reserve} produits de réserve (< 600)`);
  }
  // Invariant : aucun CPD renseigné ⇒ la valeur ne peut pas être absente.
  if (origineReserve.indetermineAvecCpd > 0) {
    erreurs += 1;
    constats.push(
      `✗ ${origineReserve.indetermineAvecCpd} spécialité(s) « non déterminée(s) » alors que le CPD est renseigné`,
    );
  }
  if (stats.surveillanceParticuliere < 1000) {
    erreurs += 1;
    constats.push(
      `✗ surveillance particulière : ${stats.surveillanceParticuliere} spécialités (< 1000)`,
    );
  }
  const couvertureDci = 100 * (stats.avecDci / stats.total);
  if (couvertureDci < 99) {
    erreurs += 1;
    constats.push(`✗ DCI manquante pour plus de 1 % des spécialités : vérifier CIS_COMPO`);
  }

  constats.push(
    `· réserve hospitalière : ${stats.reserve} oui · ${stats.hors} non · ` +
      `${stats.indetermine} valeur(s) absente(s) (CPD muet, affichée « non déterminée »)`,
  );
  constats.push(
    `· origine : libellé CPD officiel ${origineReserve.cpd} · liste de travail ${origineReserve.liste}` +
      ` · CPD muet ${origineReserve.indetermine}`,
  );
  constats.push(
    `· surveillance particulière (libellé CPD) : ${stats.surveillanceParticuliere} oui`,
  );
  constats.push(`· DCI renseignée : ${couvertureDci.toFixed(1)} % (${stats.avecDci}/${stats.total})`);
  constats.push(`· liste en sus (approximation) : ${stats.listeEnSus} oui`);

  const surveillanceAttendue = medicaments.find((m) => m.denomination.startsWith('MABTHERA'));
  const surveillanceOk = surveillanceAttendue?.surveillance_particuliere === true;
  if (!surveillanceOk) erreurs += 1;
  constats.push(
    `${surveillanceOk ? '✓' : '✗'} MABTHERA : surveillance particulière = ` +
      `${String(surveillanceAttendue?.surveillance_particuliere)} (attendu true — libellé CPD)`,
  );
  return { constats, erreurs, stats };
}

/* ------------------------------------------------------------------ *
 * Écriture Supabase
 * ------------------------------------------------------------------ */

async function ecrireSupabase(table, lignes, cleConflit) {
  const url = process.env.SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) {
    throw new Error(
      'SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis pour l’écriture.\n' +
        '  La clé service_role se lit dans le tableau de bord Supabase :\n' +
        '  Project Settings → API → service_role (secret). Ne jamais la publier.',
    );
  }

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

function exporter(lignes, colonnes, fichier) {
  const repertoire = join(CACHE_DIR, 'export');
  mkdirSync(repertoire, { recursive: true });
  const chemin = join(repertoire, fichier);
  writeFileSync(chemin, `${versCsv(lignes, colonnes)}\n`, 'utf8');
  log(`export  : ${chemin} (${lignes.length} lignes)`);
  return chemin;
}

/* ------------------------------------------------------------------ *
 * Programme
 * ------------------------------------------------------------------ */

async function principal() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const dryRun = process.argv.includes('--dry-run');

  // --- Médicaments --------------------------------------------------
  const [contenuBdpm, contenuCompo, contenuCpd] = await Promise.all([
    recuperer('bdpm'),
    recuperer('compo'),
    recuperer('cpd'),
  ]);
  const motifs = lireMotifsReserve(
    readFileSync(join(DATA_DIR, 'reserve-hospitaliere.dci.txt'), 'utf8'),
  );
  const { lignes: medicaments, origineReserve } = construireMedicaments({
    contenuBdpm,
    contenuCompo,
    contenuCpd,
    motifs,
  });

  const { constats, erreurs, stats } = controler(medicaments, origineReserve);
  log(`médicaments : ${stats.total} spécialités commercialisées`);
  for (const c of constats) log(`  ${c}`);
  if (erreurs > 0) throw new Error(`${erreurs} contrôle(s) en échec : la base n’a pas été modifiée.`);

  // --- CCAM ---------------------------------------------------------
  const contenuCcam = await recuperer('ccam');
  const surcharges = lireSurchargesCcam(readFileSync(join(DATA_DIR, 'ccam-overlay.csv'), 'utf8'));
  const actes = construireActes({ contenuCcam, surcharges });
  log(
    `CCAM        : ${actes.length} actes ` +
      `(${actes.filter((a) => a.necessite_plateau_lourd).length} plateau lourd, ` +
      `${actes.filter((a) => a.exclusif_externe).length} externe)`,
  );

  if (process.argv.includes('--export')) {
    const colonnesMedicaments = [
      'cis',
      'denomination',
      'dci',
      'est_reserve_hospitaliere',
      'est_liste_en_sus',
      'surveillance_particuliere',
      'surveillance_renforcee',
    ];
    exporter(medicaments, colonnesMedicaments, 'referentiel_medicaments.csv');
    exporter(
      actes,
      ['code', 'libelle', 'acte_marqueur_hdj', 'exclusif_externe', 'necessite_plateau_lourd'],
      'referentiel_ccam.csv',
    );
  }

  if (dryRun) {
    log('mode --dry-run : aucune écriture.');
    log(`exemple médicament : ${JSON.stringify(medicaments.find((m) => m.denomination.startsWith('REMICADE')))}`);
    log(`exemple acte       : ${JSON.stringify(actes[0])}`);
    return;
  }

  await ecrireSupabase('referentiel_medicaments', medicaments, 'cis');
  await ecrireSupabase('referentiel_ccam', actes, 'code');
  log('import terminé.');
  log('contrôle à rejouer : node scripts/verifier-referentiel.mjs');
}

principal().catch((erreur) => {
  console.error('[import] échec :', erreur.message);
  process.exitCode = 1;
});
