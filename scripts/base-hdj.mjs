#!/usr/bin/env node
/**
 * Base des actes techniques valorisables en hospitalisation de jour.
 *
 *   node scripts/base-hdj.mjs
 *   node scripts/base-hdj.mjs --sortie data/atih/base-hdj-2025.csv
 *
 * Croise trois lectures officielles :
 *   • la **nomenclature CCAM** déjà importée (libellé exact, plateau technique lourd) ;
 *   • les **actes classants** du Manuel des GHM (annexes 8 et 11, volume 2) ;
 *   • les **racines de GHM** et leur marqueur « GHM courts » (annexes 2 et 3).
 *
 * Produit le tableau de restitution à six colonnes demandé par le codage :
 *   code_ccam | libelle | racine_ghm_type_acte | eligible_hdj |
 *   plateau_technique_lourd_requis | commentaire_pmsi
 *
 * Les colonnes détaillées (`acte_classant`, `racines_ghm`, `ghm_ambulatoire_strict`,
 * `admet_sejour_0_nuit`, `reclassant_ghm_medical`, `type_acte`) sont écrites en base par
 * `supabase/hdj-ghm.sql` : le fichier produit ici est la vue de lecture, l'application
 * interroge les colonnes.
 *
 * Un acte **absent** de `actes-classants-ghm-2025.csv` est un acte non classant : il
 * n'ouvre aucun GHS à lui seul. Il est conservé dans la table, avec ce statut explicite,
 * car l'assistant doit pouvoir répondre sur les actes que l'utilisateur lui soumet.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { construireActes, lireSurchargesCcam } from './lib/referentiels.mjs';
import { classerActeHdj, lireActesClassantsGhm, lireRacinesGhm, TYPE_ACTE } from './lib/ghm.mjs';

const args = process.argv.slice(2);
const option = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : defaut;
};

const CACHE = '.cache/referentiels/ccam-ameli.csv';
const RACINES = 'data/atih/racines-ghm-2025.csv';
const CLASSANTS = 'data/atih/actes-classants-ghm-2025.csv';
const SORTIE = option('sortie', 'data/atih/base-hdj-2025.csv');

const racines = lireRacinesGhm(readFileSync(RACINES, 'utf8'));
const actesClassants = lireActesClassantsGhm(readFileSync(CLASSANTS, 'utf8'));
const actes = construireActes({
  contenuCcam: readFileSync(CACHE, 'utf8'),
  surcharges: lireSurchargesCcam(readFileSync('data/ccam-overlay.csv', 'utf8')),
  contenuCcamConsolides: readFileSync('data/ccam-complete-2025.csv', 'utf8'),
});
const parCode = new Map(actes.map((a) => [a.code, a]));

// Univers = actes classants du Manuel des GHM + actes de la nomenclature CCAM importée.
const univers = [...new Set([...actesClassants.keys(), ...actes.map((a) => a.code)])].sort();

const lignes = univers.map((code) => {
  const acte = parCode.get(code) ?? { code, libelle: '', necessite_plateau_lourd: false };
  const c = classerActeHdj(acte, { actesClassants, racines });
  const libelle = acte.libelle || actesClassants.get(code)?.libelleGhm || '';
  return {
    code_ccam: code,
    libelle,
    libelle_source: acte.libelle ? 'CCAM' : 'Manuel des GHM (abrege)',
    racine_ghm: c.racinesGhm.join(' '),
    type_acte: c.typeActe,
    eligible_hdj: c.eligibleHdj,
    eligible_hdj_motif: c.motifEligibilite,
    // Valeur effective : celle de la CCAM quand elle existe, celle déduite du GHM sinon,
    // « non déterminé » lorsque les deux sources sont muettes.
    plateau_technique_lourd_requis:
      c.plateauTechniqueLourdRequis === null ? 'non déterminé'
        : c.plateauTechniqueLourdRequis ? 'oui' : 'non',
    environnement_requis: c.environnementRequis,
    commentaire_pmsi: c.commentairePmsi,
    acte_classant: c.acteClassant,
  };
});

/* ------------------------------------------------------------------ *
 * Restitution : tableau à six colonnes
 * ------------------------------------------------------------------ */
const cellule = (v) => {
  const s = String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const colonnes = [
  'code_ccam',
  'libelle',
  'racine_ghm_type_acte',
  'eligible_hdj',
  'plateau_technique_lourd_requis',
  'commentaire_pmsi',
];
const corps = lignes.map((l) =>
  [
    l.code_ccam,
    l.libelle,
    l.racine_ghm ? `${l.racine_ghm} — ${l.type_acte}` : l.type_acte,
    l.eligible_hdj,
    l.plateau_technique_lourd_requis,
    l.commentaire_pmsi,
  ]
    .map(cellule)
    .join(';'),
);
mkdirSync(dirname(SORTIE), { recursive: true });
writeFileSync(
  SORTIE,
  [
    '# Base des actes techniques valorisables en HDJ — CCAM × Manuel des GHM MCO 2025.',
    '# Généré par `node scripts/base-hdj.mjs` — ne pas éditer à la main.',
    '# Sources : nomenclature CCAM (CCAM Ameli, data.gouv.fr) et Manuel des GHM 2025 (ATIH).',
    '# eligible_hdj : « oui » = GHM ambulatoire strict (0 nuit) dans une des racines de l’acte ;',
    '#   « sous condition » = pas de GHM ambulatoire strict mais racine en très courte durée',
    '#   (la recevabilité dépend alors du diagnostic principal) ; « non » = aucun séjour de 0 nuit,',
    '#   acte non classant, ou acte reclassant en GHM médical (annexe 11).',
    '# plateau_technique_lourd_requis : « oui » ou « non » viennent de la CCAM (mode d’accès) ou,',
    '#   à défaut, du groupe chirurgical de la racine de GHM ; « non déterminé » signale que les',
    '#   deux sources sont muettes (aucune valeur absente n’est convertie en « non »).',
    '# colonnes complètes (acte_classant, racines_ghm, ghm_ambulatoire_strict, type_acte…) :',
    '#   voir `supabase/hdj-ghm.sql` — ce fichier est la vue de lecture à six colonnes.',
    colonnes.join(';'),
    ...corps,
  ].join('\n') + '\n',
  'utf8',
);

/* ------------------------------------------------------------------ *
 * Synthèse à l'écran
 * ------------------------------------------------------------------ */
const compte = (cle) => {
  const c = new Map();
  for (const l of lignes) c.set(l[cle], (c.get(l[cle]) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
};
console.log(`[base-hdj] ${lignes.length} actes → ${SORTIE}`);
console.log(`  · classants (Manuel des GHM) : ${lignes.filter((l) => l.acte_classant).length}`);
console.log(`  · éligibles HDJ              : ${lignes.filter((l) => l.eligible_hdj === 'oui').length}`);
console.log('  · par type d’acte :');
for (const [t, n] of compte('type_acte')) console.log(`      ${String(n).padStart(5)}  ${t}`);
console.log('  · libellé trouvé dans la nomenclature CCAM :');
for (const [s, n] of compte('libelle_source')) console.log(`      ${String(n).padStart(5)}  ${s}`);

if (args.includes('--exemples')) {
  const parType = new Map();
  for (const l of lignes) {
    if (!parType.has(l.type_acte)) parType.set(l.type_acte, []);
    if (parType.get(l.type_acte).length < 8) parType.get(l.type_acte).push(l);
  }
  for (const t of Object.values(TYPE_ACTE)) {
    const ex = parType.get(t) ?? [];
    if (!ex.length) continue;
    console.log(`\n── ${t} ──`);
    for (const l of ex) {
      console.log(`  ${l.code_ccam}  ${l.libelle.slice(0, 62)}`);
      console.log(`      racines : ${l.racine_ghm || '—'} | HDJ : ${l.eligible_hdj_motif}`);
    }
  }
}
