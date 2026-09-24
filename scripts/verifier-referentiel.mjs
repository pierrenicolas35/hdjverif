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
 *   1. l'intégrité : nombre de spécialités, réserve hospitalière et surveillance particulière
 *      déterminées, DCI renseignée ;
 *   2. les cas de référence (produits de HDJ / produits de ville) ;
 *   3. la recherche par **DCI** (`infliximab` → REMICADE), qui était cassée lorsque la
 *      colonne `dci` contenait le nom commercial ;
 *   4. la colonne `surveillance_particuliere` (libellé CPD) et la doctrine de la valeur
 *      absente : une spécialité hors CPD reste « non déterminée » (`null`), jamais « non » ;
 *   5. le suivi des mises à jour (`referentiel_maj`), affiché dans l'en-tête de l'application :
 *      chaque table doit porter une date et un volume cohérents.
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

/**
 * Nombre de lignes correspondant à un filtre PostgREST (`select` + count exact).
 *
 * `colonneCle` sert aussi de colonne de sélection : `cis` pour les médicaments, `code`
 * pour la nomenclature CCAM.
 */
async function compter(filtres = [], table = 'referentiel_medicaments', colonneCle = 'cis') {
  const requete = new URL(`${URL_SUPABASE}/rest/v1/${table}`);
  requete.searchParams.set('select', colonneCle);
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
  requete.searchParams.set(
    'select',
    'cis,denomination,dci,est_reserve_hospitaliere,surveillance_particuliere',
  );
  requete.searchParams.set('denomination', `like.${prefixe}*`);
  requete.searchParams.set('limit', '1');
  const reponse = await fetch(requete, { headers: entetes });
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status} : ${await reponse.text()}`);
  const lignes = await reponse.json();
  return lignes[0] ?? null;
}

/** Lecture simple d'une table (PostgREST, clé `anon`). */
async function lireTable(chemin) {
  const reponse = await fetch(`${URL_SUPABASE}/rest/v1/${chemin}`, { headers: entetes });
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status} : ${await reponse.text()}`);
  return reponse.json();
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

/** Appelle une fonction RPC du référentiel CCAM. */
async function rpcCcam(fonction, corps) {
  const reponse = await fetch(`${URL_SUPABASE}/rest/v1/rpc/${fonction}`, {
    method: 'POST',
    headers: { ...entetes, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
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
  // Nomenclature CCAM : elle porte désormais les actes de la CCAM descriptive (chapitres 1 à 19)
  // et non plus seulement les actes tarifés en libéral.
  const totalCcam = await compter([], 'referentiel_ccam', 'code');
  const classantsCcam = await compter([['acte_classant', 'is.true']], 'referentiel_ccam', 'code');
  const eligiblesHdj = await compter([['eligible_hdj', 'is.true']], 'referentiel_ccam', 'code');
  const reserve = await compter([['est_reserve_hospitaliere', 'is.true']]);
  const hors = await compter([['est_reserve_hospitaliere', 'is.false']]);
  const indetermine = await compter([['est_reserve_hospitaliere', 'is.null']]);
  const sansDci = await compter([['dci', 'is.null']]);
  const surveillance = await compter([['surveillance_particuliere', 'is.true']]);
  const surveillanceIndeterminee = await compter([['surveillance_particuliere', 'is.null']]);

  console.log('— Intégrité —');
  ligne(totalCcam >= 8000, `${totalCcam} actes à la nomenclature CCAM`);
  ligne(
    classantsCcam >= 5000 && eligiblesHdj > 4000,
    `croisement ATIH : ${classantsCcam} actes classants, ${eligiblesHdj} éligibles à l'HDJ`,
  );
  ligne(total > 13000, `${total} spécialités au référentiel`);
  ligne(reserve >= 600, `${reserve} spécialités en réserve hospitalière (CPD « usage HOSPITALIER »)`);
  ligne(
    hors > 9000 && indetermine < 2000,
    `réserve hospitalière : ${reserve} oui, ${hors} non, ${indetermine} valeur(s) absente(s) ` +
      '(absence = CPD muet, affichée « non déterminée », jamais convertie en « non »)',
  );
  ligne(
    surveillance >= 1000,
    `surveillance particulière (libellé CPD) : ${surveillance} spécialités ` +
      `(${surveillanceIndeterminee} valeur(s) absente(s))`,
  );
  ligne(
    total - sansDci >= 0.99 * total,
    `DCI renseignée pour ${total - sansDci}/${total} spécialités (${sansDci} sans DCI)`,
  );

  console.log('\n— Doctrine de la valeur absente —');
  const sansCpd = await specialite('GRANIONS');
  if (!sansCpd) {
    ligne(false, 'GRANIONS : absent du référentiel');
  } else {
    ligne(
      sansCpd.est_reserve_hospitaliere === null,
      `spécialité hors CPD (${sansCpd.denomination.slice(0, 40)}) → ` +
        `réserve=${String(sansCpd.est_reserve_hospitaliere)} (attendu null : valeur absente)`,
    );
  }
  const mabthera = await specialite('MABTHERA');
  ligne(
    mabthera?.surveillance_particuliere === true,
    `MABTHERA (rituximab) → surveillance_particuliere=${String(
      mabthera?.surveillance_particuliere,
    )} (attendu true : libellé CPD)`,
  );

  console.log('\n— Suivi des mises à jour (affiché dans l’en-tête) —');
  let suivi = [];
  try {
    suivi = await lireTable('referentiel_maj?select=nom,libelle,maj_le,lignes&order=nom');
  } catch (erreur) {
    ligne(false, `table referentiel_maj inaccessible (${erreur.message})`);
  }
  for (const nom of ['referentiel_ccam', 'referentiel_medicaments']) {
    const ligneSuivi = suivi.find((s) => s.nom === nom);
    if (!ligneSuivi) {
      ligne(false, `${nom} : aucune date de mise à jour enregistrée`);
      continue;
    }
    const quand = new Date(ligneSuivi.maj_le);
    const volume = nom === 'referentiel_medicaments' ? total : totalCcam;
    ligne(
      !Number.isNaN(quand.getTime()) && ligneSuivi.lignes === volume,
      `${ligneSuivi.libelle} → mise à jour du ${quand.toLocaleDateString('fr-FR')} ` +
        `(${ligneSuivi.lignes} lignes)`,
    );
  }

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

  console.log('\n— Recherche CCAM élargie et arborescence —');
  // Vocabulaire courant : le référentiel parle de « scanographie » et de
  // « remnographie » là où l'utilisateur cherche « scanner » et « IRM ».
  const scan = await rpcCcam('rechercher_ccam', { p_terme: 'scanner', p_limite: 5 });
  ligne(
    scan.some((a) => a.libelle.toLowerCase().includes('scanographie')),
    `« scanner » → ${scan.length} résultat(s) — correspondance par vocabulaire courant`,
  );
  const irm = await rpcCcam('rechercher_ccam', { p_terme: 'irm', p_limite: 5 });
  ligne(
    irm.some((a) => /remnographie|irm/i.test(a.libelle)),
    `« irm » → ${irm.length} résultat(s) — correspondance par vocabulaire courant`,
  );

  const chapitres = await rpcCcam('chapitres_ccam', {});
  const totalChapitres = chapitres.reduce((somme, c) => somme + c.actes, 0);
  ligne(
    chapitres.length >= 15 && totalChapitres > 1500,
    `arborescence : ${chapitres.length} chapitres, ${totalChapitres} actes classés`,
  );
  const chapitre07 = chapitres.find((c) => c.code === '07');
  const sousChapitres = await rpcCcam('sous_chapitres_ccam', { p_chapitre: '07' });
  ligne(
    Boolean(chapitre07) && sousChapitres.length > 1,
    `chapitre « ${chapitre07?.libelle ?? '07'} » → ${sousChapitres.length} sous-thèmes`,
  );
  const actesThemes = await rpcCcam('actes_par_theme', {
    p_chapitre: '07',
    p_sous_chapitre: sousChapitres[0]?.code ?? null,
    p_limite: 5,
  });
  ligne(
    actesThemes.length > 0,
    `sous-thème « ${sousChapitres[0]?.libelle ?? '—'} » → ${actesThemes.length} acte(s) listé(s)`,
  );

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
