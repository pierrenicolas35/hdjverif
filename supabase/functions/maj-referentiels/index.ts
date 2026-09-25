/**
 * Fonction Edge — mise à jour « un clic » des référentiels HDJ Vérif.
 *
 * Pourquoi une fonction Edge ? L'application est une page statique : elle ne détient que la
 * clé `anon`, qui est **refusée en écriture** par Row Level Security. Déclencher un import
 * depuis le navigateur supposerait donc d'y embarquer la clé `service_role` — ce qui n'est
 * jamais acceptable. La fonction, elle, garde la clé côté serveur et ne fait qu'une chose :
 * demander à GitHub d'exécuter le workflow `maj-referentiels.yml`, qui télécharge les sources
 * officielles, compare les empreintes et n'écrit en base que si elles ont changé.
 *
 * Cette fonction est **facultative** : sans elle, le bouton de l'application ouvre la page
 * GitHub Actions du workflow, où l'exécution est authentifiée par GitHub lui-même. Elle sert
 * à supprimer cette étape manuelle pour un référent DIM qui n'a pas de compte GitHub.
 *
 * Déploiement
 * -----------
 *   supabase functions deploy maj-referentiels --project-ref <ref>
 *   supabase secrets set GITHUB_TOKEN=github_pat_... CODE_MAJ=<code partagé> \
 *     --project-ref <ref>
 *
 * Secrets attendus
 * -----------------
 *   GITHUB_TOKEN  (obligatoire) jeton finement porté, limité au dépôt, avec la permission
 *                 « Actions : read and write » — il ne sert qu'à déclencher le workflow ;
 *   CODE_MAJ      (recommandé)  code partagé demandé par l'application avant tout
 *                 déclenchement. Sans lui, la fonction est ouverte à qui connaît son URL :
 *                 elle ne peut rien écrire directement, mais elle peut faire télécharger
 *                 les sources à GitHub ;
 *   GITHUB_REPO   (facultatif)  « propriétaire/dépôt », sinon `pierrenicolas35/hdjverif` ;
 *   GITHUB_REF    (facultatif)  branche du workflow, sinon `main` ;
 *   DELAI_MINUTES (facultatif)  délai minimal entre deux déclenchements, sinon 30.
 *
 * Réponse JSON : `{ ok, message, run }` — `run` est la page GitHub de l'exécution, que
 * l'application propose d'ouvrir pour en suivre le résultat.
 */

const REPO = Deno.env.get('GITHUB_REPO') ?? 'pierrenicolas35/hdjverif';
const WORKFLOW = 'maj-referentiels.yml';
const REF = Deno.env.get('GITHUB_REF') ?? 'main';
const DELAI_MINUTES = Number(Deno.env.get('DELAI_MINUTES') ?? '30');
const CODE_MAJ = Deno.env.get('CODE_MAJ') ?? '';

const URL_SUPABASE = Deno.env.get('SUPABASE_URL') ?? '';
const CLE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const json = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const pageActions = `https://github.com/${REPO}/actions/workflows/${WORKFLOW}`;

/**
 * Dernier contrôle enregistré en base, pour ne pas relancer dix fois de suite le même
 * téléchargement de 8 Mo. Le suivi est en lecture seule pour la clé publique : seule la
 * fonction, qui détient la clé de service, peut le lire ici.
 */
async function dernierControle(): Promise<string | null> {
  if (!URL_SUPABASE || !CLE_SERVICE) return null;
  try {
    const reponse = await fetch(
      `${URL_SUPABASE}/rest/v1/referentiel_maj?select=verifie_le&order=verifie_le.desc.nullslast&limit=1`,
      {
        headers: { apikey: CLE_SERVICE, Authorization: `Bearer ${CLE_SERVICE}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!reponse.ok) return null;
    const lignes = (await reponse.json()) as { verifie_le: string | null }[];
    return lignes[0]?.verifie_le ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (requete) => {
  if (requete.method !== 'POST') {
    return json({ ok: false, message: 'Méthode attendue : POST.' }, 405);
  }

  if (CODE_MAJ && requete.headers.get('x-code-maj') !== CODE_MAJ) {
    return json({ ok: false, message: 'Code de service absent ou incorrect.' }, 401);
  }

  const jeton = Deno.env.get('GITHUB_TOKEN');
  if (!jeton) {
    return json(
      {
        ok: false,
        message:
          'Aucun jeton GitHub configuré sur cette fonction : lancer la mise à jour depuis ' +
          'la page GitHub Actions.',
      },
      503,
    );
  }

  // Deux contrôles rapprochés téléchargeraient les mêmes sources pour rien.
  const dernier = await dernierControle();
  if (dernier && DELAI_MINUTES > 0) {
    const minutes = (Date.now() - new Date(dernier).getTime()) / 60000;
    if (minutes >= 0 && minutes < DELAI_MINUTES) {
      return json(
        {
          ok: false,
          message:
            `Un contrôle a déjà eu lieu il y a ${Math.round(minutes)} minute(s) : ` +
            'inutile de le relancer maintenant.',
          run: pageActions,
        },
        429,
      );
    }
  }

  const reponse = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jeton}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: REF, inputs: { force: 'false' } }),
      signal: AbortSignal.timeout(15000),
    },
  );

  if (reponse.status === 401 || reponse.status === 403) {
    return json({ ok: false, message: 'Jeton GitHub refusé par l’API.' }, 502);
  }
  if (!reponse.ok) {
    return json(
      { ok: false, message: `L’API GitHub a répondu HTTP ${reponse.status}.` },
      502,
    );
  }

  return json({
    ok: true,
    message:
      'Mise à jour lancée sur GitHub : les sources officielles sont retéléchargées et ' +
      'comparées, et rien n’est écrit en base si elles n’ont pas changé.',
    run: pageActions,
  });
});
