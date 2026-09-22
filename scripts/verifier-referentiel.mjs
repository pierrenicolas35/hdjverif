#!/usr/bin/env node
/**
 * Contrôle du référentiel publié dans Supabase — **lecture seule**.
 *
 *   node scripts/verifier-referentiel.mjs
 *   node scripts/verifier-referentiel.mjs --url https://xxx.supabase.co --cle <clé anon>
 *
 * Utilise la clé publique `anon` (celle de l'application) : ce script ne peut rien
 * écrire, il sert de **porte de contrôle** après un import — il est le pendant, côté
 * données, de `scripts/controle-avant-rendu` pour les plannings.
 *
 * Vérifie :
 *   1. l'intégrité : nombre de spécialités, réserve déterminée, DCI renseignée ;
 *   2. les cas de référence (produits de HDJ / produits de ville) ;
 *   3. la recherche par **DCI** (`infliximab` → REMICADE), qui était cassée lorsque la
 *      colonne `dci` contenait le nom commercial.
 *
 * Code retour : 0 si tout est conforme, 1 sinon.
 */

const args = process.argv.slice(2);
const option = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : defaut;
};

// Valeurs par défaut = celles embarquées par l'application (src/config.ts). La clé
// `anon` est publique par conception ; les tables sont en lecture seule (RLS).
const URL_SUPABASE = option('url', process.env.SUPABASE_URL ?? 'https://wscfdjkahejquzptvaxg.supabase.co');
const CLE = option(
  'cle',
  process.env.SUPABASE_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzY2ZkamthaGVqcXV6cHR2YXhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDMwMjYsImV4cCI6MjEwNTU3OTAyNn0.Up3eqYWLlvezDQ6DvjvtlHV8Mifobs-Zn8KCwLD0_Z0',
);

const entetes = { apikey: CLE, Authorization: `Bearer ${CLE}` };

const erreurs = [];
const ligne = (ok, texte) => {
  if (!ok) erreurs.push(texte);
  console.log(`${ok ? '✓' : '✗'} ${texte}`);
};

/** Nombre de lignes correspondant à un filtre PostgREST (`select=cis` + count exact). */
async function compter(filtres = []) {
  const requete = new URL(`${URL_SUPABASE}/rest/v1/referentiel_medicaments`);
  requete.searchParams.set('select', 'cis');
  requete.searchParams.set('limit', '1');
  for (const f of filtres) requete.searchParams.append(f[0], f[1]);
  const reponse = await fetch(requete, {
    headers: { ...entetes, Prefer: 'count=exact' },
  });
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status} : ${await reponse.text()}`);
  const portee = reponse.headers.get('content-range') ?? '';
  const total = Number(portee.split('/')[1]);
  if (!Number.isFinite(total)) throw new Error(`Comptage illisible : « ${portee} »`);
  return total;
}

/** Récupère une spécialité par préfixe de dénomination. */
async function specialite(prefixe) {
  const requete = new URL(`${URL_SUPABASE}/rest/v1/referentiel_medicaments`);
  requete.searchParams.set('select', 'cis,denomination,dci,est_reserve_hospitaliere');
  requete.searchParams.set('denomination', `like.${prefixe}*`);
  requete.searchParams.set('limit', '1');
  const reponse = await fetch(requete, { headers: entetes });
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status} : ${await reponse.text()}`);
  const lignes = await reponse.json();
  return lignes[0] ?? null;
}

/** Appelle la fonction de recherche de l'application (insensible casse/accents). */
async function rechercher(terme) {
  const reponse = await fetch(`${URL_SUPABASE}/rest/v1/rpc/rechercher_medicaments`, {
    method: 'POST',
    headers: { ...entetes, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_terme: terme, p_limite: 12 }),
  });
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status} : ${await reponse.text()}`);
  return reponse.json();
}

/** Cas de référence : dénomination, état attendu de la réserve, motif. */
const CAS = [
  ['REMICADE', true, 'produit de HDJ (réserve hospitalière)'],
  ['AVASTIN', true, 'produit de HDJ (réserve hospitalière)'],
  ['KEYTRUDA', true, 'produit de HDJ (réserve hospitalière)'],
  ['OPDIVO', true, 'produit de HDJ (réserve hospitalière)'],
  ['DOLIPRANE', false, 'produit de ville'],
  ['EFFERALGAN', false, 'produit de ville'],
];

/** Recherches par DCI : terme saisi, DCI attendue dans les résultats. */
const RECHERCHES = [
  ['infliximab', 'INFLIXIMAB'],
  ['trastuzumab', 'TRASTUZUMAB'],
  ['pembrolizumab', 'PEMBROLIZUMAB'],
  ['paracétamol', 'PARACÉTAMOL'],
];

async function principal() {
  console.log(`Contrôle du référentiel : ${URL_SUPABASE}\n`);

  const total = await compter();
  const reserve = await compter([['est_reserve_hospitaliere', 'is.true']]);
  const hors = await compter([['est_reserve_hospitaliere', 'is.false']]);
  const indetermine = await compter([['est_reserve_hospitaliere', 'is.null']]);
  const sansDci = await compter([['dci', 'is.null']]);

  console.log('— Intégrité —');
  ligne(total > 13000, `${total} spécialités au référentiel`);
  ligne(reserve >= 600, `${reserve} spécialités en réserve hospitalière (CPD « usage HOSPITALIER »)`);
  ligne(
    indetermine === 0,
    `réserve hospitalière déterminée pour toutes les spécialités (${hors} hors réserve, ${indetermine} non déterminées)`,
  );
  ligne(
    total - sansDci >= 0.99 * total,
    `DCI renseignée pour ${total - sansDci}/${total} spécialités (${sansDci} sans DCI)`,
  );

  console.log('\n— Cas de référence —');
  for (const [prefixe, attendu, motif] of CAS) {
    const s = await specialite(prefixe);
    if (!s) {
      ligne(false, `${prefixe} : absent du référentiel`);
      continue;
    }
    ligne(
      s.est_reserve_hospitaliere === attendu,
      `${s.denomination.slice(0, 52)} → réserve=${s.est_reserve_hospitaliere} (attendu ${attendu} — ${motif})`,
    );
  }

  console.log('\n— Recherche par DCI (appel RPC de l’application) —');
  for (const [terme, dciAttendue] of RECHERCHES) {
    const resultats = await rechercher(terme);
    const trouve = resultats.some((r) => (r.dci ?? '').toUpperCase().includes(dciAttendue));
    ligne(
      trouve,
      `« ${terme} » → ${resultats.length} résultat(s)` +
        (trouve ? ` dont ${dciAttendue}` : ` — ${dciAttendue} NON trouvé`),
    );
  }

  console.log('');
  if (erreurs.length > 0) {
    console.error(`✗ ${erreurs.length} écart(s) : le référentiel n’est pas conforme.`);
    process.exitCode = 1;
    return;
  }
  console.log('✓ Référentiel conforme.');
}

principal().catch((erreur) => {
  console.error('[vérif] échec :', erreur.message);
  process.exitCode = 1;
});
