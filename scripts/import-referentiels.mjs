#!/usr/bin/env node
/**
 * Import des référentiels officiels vers Supabase.
 *
 *   node scripts/import-referentiels.mjs                      # import réel (clé service_role requise)
 *   node scripts/import-referentiels.mjs --dry-run            # prépare, contrôle et n'écrit rien
 *   node scripts/import-referentiels.mjs --dry-run --export   # + export CSV de secours
 *   node scripts/import-referentiels.mjs --rafraichir         # retélécharge les sources officielles
 *
 * La mise à jour périodique (mensuelle) est assurée par `scripts/maj-referentiels.mjs`, qui
 * n'appelle cet import que si les sources ont changé.
 *
 * Variables d'environnement :
 *   SUPABASE_URL               URL du projet (ex. https://xxxx.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY  clé service_role (écriture ; ne jamais publier)
 *   CACHE_DIR                  répertoire de cache des sources (défaut .cache/referentiels)
 *
 * Le suivi des dates de mise à jour est enregistré dans `referentiel_maj` (une ligne par
 * table), lue par l'application pour afficher « Référentiel connecté · MAJ … ». La table se
 * crée avec `supabase/referentiel-maj.sql` ; son absence n'empêche pas l'import.
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

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  construireActes,
  construireMedicaments,
  lireMotifsReserve,
  lireSurchargesCcam,
  statistiquesReserve,
  versCsv,
} from './lib/referentiels.mjs';
import { lireSource, telechargerSource } from './lib/sources.mjs';
import {
  enrichirActesAvecGhm,
  lireActesClassantsGhm,
  lireRacinesGhm,
} from './lib/ghm.mjs';

const CACHE_DIR = process.env.CACHE_DIR ?? '.cache/referentiels';
const DATA_DIR = 'data';
const TAILLE_LOT = 500;

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
 * Téléchargement (cache local, partagé avec la mise à jour périodique)
 * ------------------------------------------------------------------ */

/** Télécharge (ou réutilise) une source officielle ; `--rafraichir` force le retéléchargement. */
async function recuperer(cle, rafraichir) {
  const chemin = await telechargerSource(cle, {
    repertoire: CACHE_DIR,
    rafraichir,
    journaliser: log,
  });
  return lireSource(cle, chemin);
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

/**
 * Enregistre la date de mise à jour effective des deux référentiels.
 * Une table de suivi absente ou inaccessible ne fait pas échouer l'import : elle est
 * simplement signalée.
 */
async function enregistrerMaj(entrees) {
  const url = process.env.SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return;

  const reponse = await fetch(`${url}/rest/v1/referentiel_maj?on_conflict=nom`, {
    method: 'POST',
    headers: {
      apikey: cle,
      Authorization: `Bearer ${cle}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(entrees),
  });
  if (!reponse.ok) {
    log(
      `suivi des mises à jour non enregistré (HTTP ${reponse.status}) : ` +
        'appliquer supabase/referentiel-maj.sql',
    );
    return;
  }
  log(`suivi  : ${entrees.map((e) => e.libelle).join(', ')} datés du ${entrees[0].maj_le}`);
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
  const rafraichir = process.argv.includes('--rafraichir');

  // --- Médicaments --------------------------------------------------
  const [contenuBdpm, contenuCompo, contenuCpd] = await Promise.all([
    recuperer('bdpm', rafraichir),
    recuperer('compo', rafraichir),
    recuperer('cpd', rafraichir),
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
  const contenuCcam = await recuperer('ccam', rafraichir);
  const surcharges = lireSurchargesCcam(readFileSync(join(DATA_DIR, 'ccam-overlay.csv'), 'utf8'));
  const actes = construireActes({
    contenuCcam,
    surcharges,
    // Nomenclature CCAM consolidée : elle seule porte le chapitre 18 (gestes complémentaires
    // et anesthésies) et les actes hospitaliers absents du périmètre libéral.
    contenuCcamConsolides: readFileSync(join(DATA_DIR, 'ccam-complete-2025.csv'), 'utf8'),
  });

  // Référentiel ATIH (Manuel des GHM MCO) : ce que la nomenclature CCAM ne porte pas —
  // actes classants, racine de GHM, catégorie majeure et GHM ambulatoire strict (0 nuit).
  const racinesGhm = lireRacinesGhm(readFileSync(join(DATA_DIR, 'atih', 'racines-ghm-2025.csv'), 'utf8'));
  const actesClassantsGhm = lireActesClassantsGhm(
    readFileSync(join(DATA_DIR, 'atih', 'actes-classants-ghm-2025.csv'), 'utf8'),
  );
  if (racinesGhm.size < 600 || actesClassantsGhm.size < 5000) {
    throw new Error(
      `référentiel ATIH incomplet (${racinesGhm.size} racines, ${actesClassantsGhm.size} actes ` +
        'classants) — import interrompu.',
    );
  }
  const enrichis = enrichirActesAvecGhm(actes, { racines: racinesGhm, actesClassants: actesClassantsGhm });
  log(
    `CCAM        : ${actes.length} actes ` +
      `(${enrichis.filter((a) => a.necessite_plateau_lourd).length} plateau lourd, ` +
      `${enrichis.filter((a) => a.exclusif_externe).length} externe)`,
  );
  const classants = enrichis.filter((a) => a.acte_classant);
  const eligiblesHdj = enrichis.filter((a) => a.eligible_hdj);
  log(
    `  · Manuel des GHM 2025 : ${racinesGhm.size} racines · ` +
      `${classants.length} actes classants · ${eligiblesHdj.length} en GHM ambulatoire strict`,
  );
  if (classants.length < 5000) {
    throw new Error(`croisement ATIH suspect : ${classants.length} actes classants (< 5 000).`);
  }

  // Intégrité de l'arborescence : sans chapitres ni mots-clés, la navigation par
  // thématique et la recherche élargie de l'application seraient privées de données.
  const chapitres = new Set(actes.map((a) => a.chapitre_code).filter(Boolean));
  const sansMotsCles = actes.filter((a) => !a.mots_cles).length;
  log(
    `  · arborescence : ${chapitres.size} chapitres · ` +
      `${new Set(actes.map((a) => a.sous_chapitre_code).filter(Boolean)).size} sous-thèmes · ` +
      `${actes.length - sansMotsCles} actes porteurs de mots-clés`,
  );
  if (chapitres.size < 18) {
    throw new Error(
      `arborescence CCAM incomplète : ${chapitres.size} chapitres (< 18) — import interrompu.`,
    );
  }

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
      enrichis,
      [
        'code',
        'libelle',
        'acte_marqueur_hdj',
        'exclusif_externe',
        'necessite_plateau_lourd',
        'chapitre_code',
        'chapitre_libelle',
        'sous_chapitre_code',
        'sous_chapitre_libelle',
        'mots_cles',
        'acte_classant',
        'racines_ghm',
        'cmd_classantes',
        'ghm_ambulatoire_strict',
        'admet_sejour_0_nuit',
        'reclassant_ghm_medical',
        'type_acte',
        'eligible_hdj',
        'eligibilite_hdj',
        'motif_eligibilite_hdj',
        'environnement_requis',
      ],
      'referentiel_ccam.csv',
    );
  }

  if (dryRun) {
    log('mode --dry-run : aucune écriture.');
    log(`exemple médicament : ${JSON.stringify(medicaments.find((m) => m.denomination.startsWith('REMICADE')))}`);
    log(`exemple acte       : ${JSON.stringify(actes[0])}`);
    return;
  }

  const horodatage = new Date().toISOString();
  const empreinte = process.env.SOURCES_EMPREINTE ?? null;
  await ecrireSupabase('referentiel_medicaments', medicaments, 'cis');
  await ecrireSupabase('referentiel_ccam', enrichis, 'code');
  await enregistrerMaj([
    {
      nom: 'referentiel_medicaments',
      libelle: 'Médicaments (BDPM)',
      maj_le: horodatage,
      lignes: medicaments.length,
      empreinte,
      source: 'BDPM — CIS_bdpm, CIS_COMPO, CIS_CPD',
    },
    {
      nom: 'referentiel_ccam',
      libelle: 'Nomenclature CCAM',
      maj_le: horodatage,
      lignes: actes.length,
      empreinte,
      source: 'CCAM Ameli — data.gouv.fr',
    },
  ]);
  log('import terminé.');
  log('contrôle à rejouer : node scripts/verifier-referentiel.mjs');
}

principal().catch((erreur) => {
  console.error('[import] échec :', erreur.message);
  process.exitCode = 1;
});
