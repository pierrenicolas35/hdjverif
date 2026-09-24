#!/usr/bin/env node
/**
 * Applique un script SQL du dépôt au projet Supabase, via l'API Management.
 *
 *   node scripts/appliquer-sql.mjs supabase/hdj-ghm.sql
 *   node scripts/appliquer-sql.mjs supabase/hdj-ghm.sql --verifier   # montre l'état après
 *
 * POURQUOI CE SCRIPT
 *   Le README documentait `psql < supabase/hdj-ghm.sql` : pratique sur un poste équipé, mais
 *   inutilisable là où PostgreSQL n'est pas installé. Le jeton **Management API**
 *   (`SUPABASE_ACCESS_TOKEN`, préfixe `sbp_`) permet d'exécuter le même script — c'est déjà
 *   lui qui fournit la clé `service_role` à l'import (`scripts/maj-referentiels.mjs`).
 *
 * SÉCURITÉ
 *   Le jeton est lu dans l'environnement ou dans les secrets de l'agent et n'est **jamais**
 *   affiché. Le script n'écrit rien d'autre que le SQL fourni : il n'ajoute ni ne supprime
 *   aucune donnée.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const REF_PROJET = process.env['SUPABASE_PROJECT_REF'] ?? 'wscfdjkahejquzptvaxg';

/** Lit le jeton Management API dans l'environnement, puis dans les secrets de l'agent. */
function jeton() {
  if (process.env['SUPABASE_ACCESS_TOKEN']) return process.env['SUPABASE_ACCESS_TOKEN'];
  for (const chemin of [
    join(homedir(), '.config-github/goose/secrets.yaml'),
    join(homedir(), '.config/goose/secrets.yaml'),
  ]) {
    if (!existsSync(chemin)) continue;
    const trouve = /SUPABASE_ACCESS_TOKEN:\s*(sbp_[A-Za-z0-9_]+)/.exec(readFileSync(chemin, 'utf8'));
    if (trouve) return trouve[1];
  }
  return null;
}

/** Exécute une requête SQL et rend le corps de la réponse. */
async function sql(requete, jetonApi) {
  const reponse = await fetch(
    `https://api.supabase.com/v1/projects/${REF_PROJET}/database/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${jetonApi}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: requete }),
      signal: AbortSignal.timeout(120000),
    },
  );
  const corps = await reponse.text();
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status} : ${corps.slice(0, 500)}`);
  return corps;
}

const fichier = process.argv[2];
if (!fichier) {
  console.error('usage : node scripts/appliquer-sql.mjs <fichier.sql> [--verifier]');
  process.exit(1);
}
const jetonApi = jeton();
if (!jetonApi) {
  console.error(
    'Jeton Management API introuvable. Renseigner SUPABASE_ACCESS_TOKEN (préfixe sbp_),\n' +
      'ou utiliser `psql < ' + fichier + '` sur un poste équipé de PostgreSQL.',
  );
  process.exit(1);
}

const contenu = readFileSync(fichier, 'utf8');
console.log(`[sql] ${fichier} → projet ${REF_PROJET}`);
await sql(contenu, jetonApi);
console.log(`[sql] appliqué (${contenu.split('\n').length} lignes)`);

if (process.argv.includes('--verifier')) {
  const colonnes = await sql(
    `select column_name, data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'referentiel_ccam'
      order by ordinal_position;`,
    jetonApi,
  );
  const vues = await sql(
    `select table_name from information_schema.views
      where table_schema = 'public' order by table_name;`,
    jetonApi,
  );
  console.log('[sql] colonnes de referentiel_ccam :', colonnes);
  console.log('[sql] vues publiques :', vues);
}
