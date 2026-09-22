/**
 * Sources officielles des référentiels : URL, téléchargement, empreinte.
 *
 * Isolé de l'import pour être partagé par deux usages :
 *   • `import-referentiels.mjs` — import complet vers Supabase ;
 *   • `maj-referentiels.mjs`    — mise à jour mensuelle, qui n'écrit que si les sources
 *     ont changé (comparaison d'empreinte SHA-256).
 *
 * Les fichiers sont mis en cache dans `.cache/referentiels/` ; `rafraichir` force leur
 * retéléchargement (utilisé par la mise à jour périodique).
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const BASE_BDPM = 'https://base-donnees-publique.medicaments.gouv.fr/download/file';

/** Version épinglée de la nomenclature CCAM (repli si data.gouv.fr est injoignable). */
export const URL_CCAM_EPINGLEE =
  'https://static.data.gouv.fr/resources/ccam-ameli/20250209-213212/interhop-actes-ameli.csv';

/** Jeu de données « CCAM Ameli » sur data.gouv.fr, pour découvrir la dernière version. */
export const API_DATAGOUV_CCAM = 'https://www.data.gouv.fr/api/1/datasets/ccam-ameli/';

export const SOURCES = {
  bdpm: {
    libelle: 'spécialités commercialisées',
    fichier: 'CIS_bdpm.txt',
    url: `${BASE_BDPM}/CIS_bdpm.txt`,
    encodage: 'latin1',
  },
  compo: {
    libelle: 'composition (DCI)',
    fichier: 'CIS_COMPO_bdpm.txt',
    url: `${BASE_BDPM}/CIS_COMPO_bdpm.txt`,
    encodage: 'latin1',
  },
  cpd: {
    libelle: 'conditions de prescription et de délivrance',
    fichier: 'CIS_CPD_bdpm.txt',
    url: `${BASE_BDPM}/CIS_CPD_bdpm.txt`,
    encodage: 'latin1',
  },
  ccam: {
    libelle: 'nomenclature CCAM',
    fichier: 'ccam-ameli.csv',
    url: URL_CCAM_EPINGLEE,
    encodage: 'utf8',
  },
};

export const CLES = ['bdpm', 'compo', 'cpd', 'ccam'];

/**
 * URL à jour de la nomenclature CCAM.
 *
 * La ressource est **datée** sur data.gouv.fr : on interroge l'API pour prendre la
 * dernière version publiée, et on retombe sur la version épinglée en cas d'échec
 * (hors ligne, API indisponible…).
 */
export async function urlCcam() {
  try {
    const reponse = await fetch(API_DATAGOUV_CCAM, {
      headers: { 'User-Agent': 'hdjverif-import/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!reponse.ok) return URL_CCAM_EPINGLEE;
    const donnees = await reponse.json();
    const ressources = (donnees?.resources ?? []).filter((r) => r?.url && r.url.endsWith('.csv'));
    if (ressources.length === 0) return URL_CCAM_EPINGLEE;
    const derniere = ressources.sort((a, b) =>
      String(b.last_modified ?? '').localeCompare(String(a.last_modified ?? '')),
    )[0];
    return derniere.url;
  } catch {
    return URL_CCAM_EPINGLEE;
  }
}

/**
 * Télécharge une source dans le cache local (sauf si déjà présente).
 * @returns {Promise<string>} chemin du fichier
 */
export async function telechargerSource(
  cle,
  { repertoire = '.cache/referentiels', rafraichir = false, journaliser = () => {} } = {},
) {
  const source = SOURCES[cle];
  if (!source) throw new Error(`Source inconnue : ${cle}`);
  const chemin = join(repertoire, source.fichier);

  if (!rafraichir && existsSync(chemin)) {
    journaliser(`cache   : ${source.fichier}`);
    return chemin;
  }

  const url = cle === 'ccam' ? await urlCcam() : source.url;
  journaliser(`téléch. : ${url}`);
  const reponse = await fetch(url, {
    headers: { 'User-Agent': 'hdjverif-import/1.0' },
    signal: AbortSignal.timeout(120000),
  });
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status} sur ${url}`);

  const buffer = Buffer.from(await reponse.arrayBuffer());
  // Garde-fou : une source tronquée ne doit jamais écraser un cache valide.
  if (buffer.length < 1024) throw new Error(`Source tronquée : ${source.fichier}`);

  mkdirSync(repertoire, { recursive: true });
  writeFileSync(chemin, buffer);
  journaliser(`         ${source.fichier} (${(buffer.length / 1024).toFixed(0)} Ko)`);
  return chemin;
}

/** Lit une source (encodage propre à chaque fichier). */
export function lireSource(cle, chemin) {
  return readFileSync(chemin, SOURCES[cle].encodage);
}

/** Empreinte SHA-256 des sources : deux empreintes égales = mêmes données d'entrée. */
export function empreinteSources(chemins) {
  const hash = createHash('sha256');
  for (const [cle, chemin] of Object.entries(chemins)) {
    hash.update(cle);
    hash.update(readFileSync(chemin));
  }
  return hash.digest('hex');
}
