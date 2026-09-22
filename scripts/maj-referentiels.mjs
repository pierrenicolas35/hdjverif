#!/usr/bin/env node
/**
 * Mise à jour périodique (mensuelle) des référentiels Supabase — version **légère**.
 *
 *   node scripts/maj-referentiels.mjs              # ne fait rien si les sources n'ont pas changé
 *   node scripts/maj-referentiels.mjs --force      # réimporte même si l'empreinte est identique
 *   node scripts/maj-referentiels.mjs --verifier   # contrôle seul de la base publiée (aucune écriture)
 *
 * Principe : les sources officielles (BDPM + nomenclature CCAM) sont **téléchargées à neuf**,
 * puis comparées par empreinte SHA-256 à celles du dernier import réussi. Concrètement :
 *
 *   1. sources inchangées → aucune écriture, aucune écriture réseau sur Supabase (« léger ») ;
 *   2. sources modifiées  → import complet (`import-referentiels.mjs`) puis porte de contrôle
 *      (`verifier-referentiel.mjs`) ; l'empreinte n'est enregistrée qu'après un contrôle vert ;
 *   3. échec à n'importe quelle étape → code retour 1, empreinte précédente conservée, donc la
 *      prochaine exécution retentera l'import.
 *
 * La date de mise à jour effective est enregistrée dans `referentiel_maj`, que l'application
 * affiche dans son en-tête (« Référentiel connecté · MAJ jj/mm/aaaa ») : elle ne bouge donc
 * que lorsque les sources officielles changent réellement.
 *
 * Installation : tâche cron mensuelle (voir readme, § « Mise à jour mensuelle »).
 *
 * Clé d'écriture : `SUPABASE_SERVICE_ROLE_KEY` si elle est fournie, sinon le jeton
 * **Management API** `SUPABASE_ACCESS_TOKEN` permet de récupérer la clé `service_role`
 * (elle n'est jamais journalisée ni écrite sur le disque).
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { CLES, empreinteSources, telechargerSource } from './lib/sources.mjs';

const executer = promisify(execFile);

const REF_PROJET = process.env['SUPABASE_PROJECT_REF'] ?? 'wscfdjkahejquzptvaxg';
const URL_SUPABASE =
  process.env['SUPABASE_URL'] ?? `https://${REF_PROJET}.supabase.co`;
const CACHE_DIR = process.env['CACHE_DIR'] ?? '.cache/referentiels';
const ETAT = join(CACHE_DIR, 'derniere-maj.json');
const JOURNAL = process.env['JOURNAL_MAJ'] ?? '.cache/maj-referentiels.log';

const log = (...args) => console.log('[maj]', ...args);

/** Ajoute une ligne horodatée au journal de la mise à jour. */
function journaliser(message) {
  try {
    mkdirSync(join(JOURNAL, '..'), { recursive: true });
    const ligne = `${new Date().toISOString()}\t${message}\n`;
    writeFileSync(JOURNAL, existsSync(JOURNAL) ? readFileSync(JOURNAL, 'utf8') + ligne : ligne);
  } catch {
    // Le journal ne doit jamais faire échouer la mise à jour.
  }
}

/**
 * Récupère la clé `service_role` via le jeton Management API.
 * Le jeton est lu dans l'environnement ou dans les secrets de l'agent ; la clé n'est
 * jamais affichée.
 */
async function cleEcriture() {
  const directe = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (directe) return directe;

  const jeton =
    process.env['SUPABASE_ACCESS_TOKEN'] ?? jetonDepuisSecrets();
  if (!jeton) return null;

  const reponse = await fetch(
    `https://api.supabase.com/v1/projects/${REF_PROJET}/api-keys?reveal=true`,
    { headers: { Authorization: `Bearer ${jeton}` }, signal: AbortSignal.timeout(30000) },
  );
  if (!reponse.ok) throw new Error(`Récupération de la clé impossible (HTTP ${reponse.status})`);
  const cles = await reponse.json();
  return cles.find((c) => c.name === 'service_role')?.api_key ?? null;
}

/** Lit le jeton Management API dans les secrets de l'agent, sans jamais l'afficher. */
function jetonDepuisSecrets() {
  const candidats = [
    join(homedir(), '.config-github/goose/secrets.yaml'),
    join(homedir(), '.config/goose/secrets.yaml'),
  ];
  for (const chemin of candidats) {
    if (!existsSync(chemin)) continue;
    const trouve = /SUPABASE_ACCESS_TOKEN:\s*(sbp_[A-Za-z0-9_]+)/.exec(readFileSync(chemin, 'utf8'));
    if (trouve) return trouve[1];
  }
  return null;
}

/** Exécute un script Node du dépôt en héritant des variables d'environnement utiles. */
async function executerScript(script, env = {}) {
  const { stdout, stderr } = await executer(process.execPath, [script], {
    env: { ...process.env, ...env },
    maxBuffer: 32 * 1024 * 1024,
  });
  process.stdout.write(stdout);
  if (stderr.trim()) process.stderr.write(stderr);
}

async function principal() {
  const force = process.argv.includes('--force');
  const verifierSeul = process.argv.includes('--verifier');
  mkdirSync(CACHE_DIR, { recursive: true });

  if (verifierSeul) {
    log('contrôle seul de la base publiée.');
    await executerScript('scripts/verifier-referentiel.mjs', { SUPABASE_URL: URL_SUPABASE });
    return;
  }

  // 1. Sources officielles, retéléchargées à neuf.
  const chemins = {};
  for (const cle of CLES) {
    chemins[cle] = await telechargerSource(cle, {
      repertoire: CACHE_DIR,
      rafraichir: true,
      journaliser: log,
    });
  }

  const empreinte = empreinteSources(chemins);
  const etat = existsSync(ETAT) ? JSON.parse(readFileSync(ETAT, 'utf8')) : null;

  if (!force && etat?.empreinte === empreinte) {
    log(`sources inchangées depuis ${etat.date} — aucune écriture en base.`);
    journaliser(`sources inchangées (${empreinte.slice(0, 12)})`);
    return;
  }

  log(
    etat
      ? `sources modifiées (${etat.empreinte.slice(0, 12)} → ${empreinte.slice(0, 12)}) : import.`
      : `premier import référencé (${empreinte.slice(0, 12)}).`,
  );

  // 2. Clé d'écriture.
  const cle = await cleEcriture();
  if (!cle) {
    throw new Error(
      'Aucune clé d’écriture : fournir SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ACCESS_TOKEN.',
    );
  }

  // 3. Import puis porte de contrôle : l'empreinte n'est enregistrée qu'après un contrôle vert.
  await executerScript('scripts/import-referentiels.mjs', {
    SUPABASE_URL: URL_SUPABASE,
    SUPABASE_SERVICE_ROLE_KEY: cle,
    SOURCES_EMPREINTE: empreinte,
  });
  await executerScript('scripts/verifier-referentiel.mjs', { SUPABASE_URL: URL_SUPABASE });

  const nouvelEtat = {
    empreinte,
    date: new Date().toISOString().slice(0, 10),
    horodatage: new Date().toISOString(),
    importes: true,
  };
  writeFileSync(ETAT, `${JSON.stringify(nouvelEtat, null, 2)}\n`, 'utf8');
  log(`mise à jour terminée et contrôlée — empreinte ${empreinte.slice(0, 12)} enregistrée.`);
  journaliser(`import réussi et contrôlé (${empreinte.slice(0, 12)})`);
}

principal().catch((erreur) => {
  console.error('[maj] échec :', erreur.message);
  journaliser(`échec : ${erreur.message}`);
  process.exitCode = 1;
});
