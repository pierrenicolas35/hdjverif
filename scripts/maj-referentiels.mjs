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
 *   1. sources inchangées → aucune écriture des données, et une seule écriture de suivi (le
 *      « battement de cœur » : « sources recontrôlées aujourd'hui, inchangées ») ;
 *   2. sources modifiées  → import complet (`import-referentiels.mjs`) puis porte de contrôle
 *      (`verifier-referentiel.mjs`) ; l'empreinte n'est enregistrée qu'après un contrôle vert ;
 *   3. échec à n'importe quelle étape → code retour 1, empreinte précédente conservée, donc la
 *      prochaine exécution retentera l'import.
 *
 * Deux dates sont enregistrées dans `referentiel_maj`, que l'application affiche et
 * interprète dans son en-tête (« Référentiel connecté · MAJ jj/mm/aaaa ») :
 *   • `maj_le`      — dernière mise à jour **effective** : elle ne bouge que lorsque les
 *                     sources officielles changent réellement ;
 *   • `verifie_le`  — dernier contrôle **réussi**, qu'il ait fallu écrire ou non. C'est lui
 *                     qui manque quand la surveillance s'arrête : l'application avertit
 *                     alors l'utilisateur (« non contrôlé depuis N jours ») et propose de
 *                     relancer la mise à jour.
 * Un échec est enregistré (`etat_controle = echec` + message) sans toucher à `verifie_le`.
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

/**
 * Clé d'écriture si elle est disponible, sans jamais faire échouer l'appelant : le suivi
 * est un service rendu à l'application, pas une condition de la mise à jour.
 */
async function cleEcritureOuNull() {
  try {
    return await cleEcriture();
  } catch (erreur) {
    log(`clé d'écriture indisponible (${erreur.message}).`);
    return null;
  }
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

/**
 * Enregistre le « battement de cœur » du suivi : la date du dernier contrôle **réussi**
 * des sources officielles, même lorsqu'il n'y avait rien à écrire.
 *
 * C'est ce battement qui permet à l'application de distinguer « rien à mettre à jour »
 * de « plus personne ne contrôle » : sans lui, un référentiel parfaitement à jour et un
 * référentiel abandonné depuis six mois afficheraient la même date.
 *
 * En cas d'échec, `verifie_le` n'est **pas** touché (il date le dernier succès) : seuls
 * l'état et le message d'erreur changent, et l'application avertit l'utilisateur.
 */
async function marquerControle({ cle, etat, erreur = null }) {
  if (!cle) return;
  const corps = {
    etat_controle: etat,
    derniere_erreur: erreur,
    verifie_par: process.env['MAJ_DECLENCHEUR'] ?? 'manuel',
  };
  if (etat !== 'echec') corps.verifie_le = new Date().toISOString();

  try {
    const reponse = await fetch(`${URL_SUPABASE}/rest/v1/referentiel_maj?nom=like.*`, {
      method: 'PATCH',
      headers: {
        apikey: cle,
        Authorization: `Bearer ${cle}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(corps),
    });
    if (!reponse.ok) {
      log(`battement de cœur non enregistré (HTTP ${reponse.status}).`);
      journaliser(`battement non enregistré (HTTP ${reponse.status})`);
      return;
    }
    log(`suivi   : contrôle « ${etat} » daté du ${corps.verifie_le ?? 'dernier succès conservé'}.`);
  } catch (erreurReseau) {
    // Le suivi ne doit jamais faire échouer la mise à jour elle-même.
    log(`battement de cœur non enregistré (${erreurReseau.message}).`);
    journaliser(`battement non enregistré (${erreurReseau.message})`);
  }
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
    // Battement de cœur : les sources ont bien été recontrôlées aujourd'hui, même si les
    // données n'ont pas changé. C'est ce que l'application date dans son avertissement.
    await marquerControle({ cle: await cleEcritureOuNull(), etat: 'a_jour' });
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
  await marquerControle({ cle, etat: 'importe' });

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

principal().catch(async (erreur) => {
  console.error('[maj] échec :', erreur.message);
  journaliser(`échec : ${erreur.message}`);
  // Un échec est signalé à l'application (elle avertit l'utilisateur) : la date du
  // dernier succès n'est pas touchée, l'exécution suivante retentera l'import.
  await marquerControle({ cle: await cleEcritureOuNull(), etat: 'echec', erreur: erreur.message });
  process.exitCode = 1;
});
