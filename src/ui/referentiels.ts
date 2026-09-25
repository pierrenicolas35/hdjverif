/**
 * Accès au référentiel Supabase (médicaments et actes CCAM).
 *
 * Aucune dépendance externe : appels PostgREST via `fetch`, avec repli local si
 * le référentiel est injoignable (l'application reste utilisable hors ligne).
 *
 * La recherche est **élargie par le thésaurus des synonymes** (`data/thesaurus-synonymes.csv`,
 * le fichier même qui alimente la base à l'import). L'élargissement est fait par la base quand
 * elle répond, et par le thésaurus embarqué dans le paquet quand elle ne répond pas : dans les
 * deux cas, chercher « scanner » trouve une « scanographie », chercher « anti-TNF » trouve un
 * « infliximab ».
 */

import thesaurusCsv from '../../data/thesaurus-synonymes.csv?raw';
import {
  construireThesaurus,
  contientTerme,
  lireThesaurus,
  normaliserTerme,
} from '../../scripts/lib/thesaurus.mjs';

import {
  DELAI_REQUETE_MS,
  MAJ_ACTIONS_URL,
  MAJ_SERVICE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  TAILLE_RESULTATS,
} from '../config.js';

/** Nombre d'élargissements proposés sous le champ de recherche. */
const TAILLE_SYNONYMES = 10;

/**
 * Thésaurus embarqué : il sert au repli local **et** à l'affichage des synonymes employés.
 * Construit une fois, au chargement du module.
 */
export const THESAURUS = construireThesaurus(lireThesaurus(thesaurusCsv));

/* ------------------------------------------------------------------ *
 * Modèles
 * ------------------------------------------------------------------ */

/** Spécialité pharmaceutique du référentiel. */
export interface MedicamentRef {
  readonly cis: string;
  readonly denomination: string;
  readonly dci: string | null;
  /** `null` = valeur absente du référentiel (non déterminée, à trancher par la PUI). */
  readonly est_reserve_hospitaliere: boolean | null;
  readonly est_liste_en_sus: boolean | null;
  /**
   * Libellé CPD « médicament nécessitant une surveillance particulière pendant le
   * traitement ». `null` = valeur absente du référentiel (non déterminée).
   */
  readonly surveillance_particuliere: boolean | null;
  /** Champ BDPM de pharmacovigilance (sans effet sur la décision). */
  readonly surveillance_renforcee: boolean | null;
}

/** Verdict d'éligibilité d'un acte au codage en hospitalisation de jour. */
export type EligibiliteHdj = 'oui' | 'sous condition' | 'non';

/** Acte de la nomenclature CCAM. */
export interface ActeRef {
  readonly code: string;
  readonly libelle: string;
  /**
   * Acte marqueur d'hospitalisation de jour : l'acte est classant et admet un séjour de
   * 0 nuit. Issu du croisement avec le Manuel des GHM — défini pour tous les actes.
   */
  readonly acte_marqueur_hdj: boolean | null;
  /** Acte réalisable en externe (mode d'accès CCAM) ; `null` = non renseigné. */
  readonly exclusif_externe: boolean | null;
  /** Plateau technique lourd ; `null` = non renseigné (hors jeu de données libéral). */
  readonly necessite_plateau_lourd: boolean | null;
  /** L'acte ouvre un GHS à lui seul (Manuel des GHM, annexes 8 et volume 2). */
  readonly acte_classant?: boolean | null;
  /** Verdict d'éligibilité au codage HDJ, défini pour tous les actes. */
  readonly eligibilite_hdj?: EligibiliteHdj | null;
  /** Motivation du verdict, reprise telle quelle du référentiel. */
  readonly motif_eligibilite_hdj?: string | null;
  /** Catégorie majeure de GHM (acte interventionnel, lourd non opératoire, reclassant…). */
  readonly type_acte?: string | null;
  /** Racines de GHM dans lesquelles l'acte classe. */
  readonly racines_ghm?: string | null;
  /** Chapitre d'arborescence (facultatif : renseigné par le référentiel). */
  readonly chapitre_code?: string | null;
  readonly chapitre_libelle?: string | null;
  readonly sous_chapitre_code?: string | null;
  readonly sous_chapitre_libelle?: string | null;
  /** Synonymes et vocabulaire courant indexés par la base. */
  readonly mots_cles?: string | null;
}

/** Synonyme proposé sous le champ de recherche (« recherche élargie à… »). */
export interface SynonymeRef {
  readonly terme: string;
  readonly terme_normalise: string;
  readonly notion: string;
  readonly type: string;
  readonly domaine: string;
}

/** Date de mise à jour d'une table de référentiel. */
export interface MajReferentiel {
  readonly nom: string;
  readonly libelle: string;
  readonly maj_le: string;
  readonly lignes: number | null;
  /**
   * Dernier **contrôle** réussi des sources officielles, qu'il ait donné lieu à une
   * écriture ou non. C'est cette date — et non `maj_le` — qui dit si le référentiel est
   * suivi : `maj_le` ne bouge que lorsque les sources changent réellement.
   */
  readonly verifie_le?: string | null;
  /** `importe` (sources modifiées), `a_jour` (sources inchangées), `echec`, `inconnu`. */
  readonly etat_controle?: string | null;
  /** Message de la dernière tentative en échec, affiché tel quel à l'utilisateur. */
  readonly derniere_erreur?: string | null;
}

/** Nœud de l'arborescence CCAM (chapitre ou sous-thème) avec son nombre d'actes. */
export interface ThemeRef {
  readonly code: string;
  readonly libelle: string;
  readonly actes: number;
}

/** État de la liaison au référentiel. */
export type EtatReferentiel = 'inconnu' | 'connecte' | 'degrade';

let etat: EtatReferentiel = 'inconnu';

export function etatDuReferentiel(): EtatReferentiel {
  return etat;
}

export function libelleEtatReferentiel(): string {
  switch (etat) {
    case 'connecte':
      return 'Référentiel Supabase connecté';
    case 'degrade':
      return 'Référentiel injoignable — recherche locale de secours';
    default:
      return 'Référentiel : connexion en cours…';
  }
}

/* ------------------------------------------------------------------ *
 * Mises à jour du référentiel
 * ------------------------------------------------------------------ */

/**
 * Date de mise à jour de chaque table de référentiel (`referentiel_maj`).
 * Renvoie `null` si le suivi n'est pas disponible : l'en-tête affiche alors l'état
 * sans date, plutôt qu'aucune information.
 */
export async function dernieresMaj(): Promise<readonly MajReferentiel[] | null> {
  try {
    return await lireTable<MajReferentiel[]>(
      'referentiel_maj?select=nom,libelle,maj_le,lignes,verifie_le,etat_controle,derniere_erreur' +
        '&order=nom',
    );
  } catch {
    return null;
  }
}

const dateCourte = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-FR');
};

/**
 * Libellé compact des mises à jour, affiché à côté de l'état de la connexion :
 *   • même date pour les deux tables   → « MAJ 22/09/2026 » ;
 *   • dates distinctes                 → « MAJ médicaments 22/09/2026 · CCAM 12/02/2026 ».
 */
export function libelleMaj(majs: readonly MajReferentiel[] | null): string {
  if (!majs || majs.length === 0) return '';
  const dates = majs.map((m) => dateCourte(m.maj_le));
  if (dates.some((d) => d === '')) return '';
  if (dates.every((d) => d === dates[0])) return `MAJ ${dates[0]}`;
  return `MAJ ${majs
    .map((m) => `${nomCourt(m)} ${dateCourte(m.maj_le)}`)
    .join(' · ')}`;
}

/** Nom court d'une table pour l'affichage. */
function nomCourt(maj: MajReferentiel): string {
  return maj.nom === 'referentiel_medicaments' ? 'médicaments' : 'CCAM';
}

/** Détail complet, en infobulle de l'en-tête. */
export function detailMaj(majs: readonly MajReferentiel[] | null): string {
  if (!majs || majs.length === 0) return 'Dates de mise à jour indisponibles.';
  return majs
    .map((m) => {
      const horodatage = new Date(m.maj_le).toLocaleString('fr-FR');
      const volume = m.lignes === null ? '' : ` — ${m.lignes.toLocaleString('fr-FR')} lignes`;
      return `${m.libelle} : ${horodatage}${volume}`;
    })
    .join('\n');
}

/* ------------------------------------------------------------------ *
 * Péremption du référentiel
 * ------------------------------------------------------------------ */

/**
 * Seuils d'alerte, en jours depuis le dernier **contrôle réussi** des sources.
 *
 * Les sources officielles (BDPM, nomenclature CCAM) évoluent au moins chaque mois ; le
 * contrôle est donc prévu mensuellement (cron du 1ᵉʳ). Un contrôle manqué n'est pas une
 * panne : au-delà du premier seuil on avertit, au-delà du second on considère le
 * référentiel comme périmé — deux contrôles consécutifs manqués.
 */
export const SEUIL_SURVEILLANCE_JOURS = 35;
export const SEUIL_PEREMPTION_JOURS = 62;

/** Gravité de l'état du référentiel, du plus sain au plus préoccupant. */
export type NiveauPeremption = 'a_jour' | 'a_surveiller' | 'perime' | 'echec' | 'inconnu';

/** Ce que l'application peut dire de la fraîcheur du référentiel. */
export interface PeremptionReferentiel {
  readonly niveau: NiveauPeremption;
  /** Ancienneté, en jours, du dernier contrôle réussi (ou du dernier import). */
  readonly jours: number | null;
  /** Sur quoi porte l'ancienneté : le contrôle des sources, ou l'import lui-même. */
  readonly reference: 'controle' | 'import' | null;
  /** Date de référence au format ISO, pour l'affichage. */
  readonly reference_le: string | null;
  /** Phrase affichée telle quelle : elle dit l'état, la date et la conséquence. */
  readonly message: string;
  /** Détail : erreur de la dernière tentative, ou rappel de la marche à suivre. */
  readonly detail: string;
}

const JOUR_MS = 24 * 60 * 60 * 1000;

const CONSEIL_MAJ =
  'Lancez la mise à jour des référentiels (bouton « Mettre à jour ») avant de conclure.';

/** Nombre de jours écoulés depuis une date ISO, ou `null` si la date est illisible. */
function joursDepuis(iso: string | null | undefined, maintenant: Date): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((maintenant.getTime() - date.getTime()) / JOUR_MS));
}

const dateFr = (iso: string): string => new Date(iso).toLocaleDateString('fr-FR');

/**
 * État de fraîcheur du référentiel, à partir du suivi `referentiel_maj`.
 *
 * Règle, volontairement pessimiste (on retient la table la plus ancienne) :
 *   1. une table en `echec` → alerte, quelle que soit la date ;
 *   2. sinon l'ancienneté se lit sur `verifie_le` (dernier contrôle réussi), et à défaut
 *      sur `maj_le` (date du dernier import) pour les bases non encore migrées ;
 *   3. ≤ 35 jours → à jour ; ≤ 62 jours → à surveiller ; au-delà → périmé ;
 *   4. suivi illisible ou absent → `inconnu` : l'application le dit, sans laisser croire
 *      que le référentiel est à jour.
 */
export function peremptionMaj(
  majs: readonly MajReferentiel[] | null,
  maintenant: Date = new Date(),
): PeremptionReferentiel {
  if (!majs || majs.length === 0) {
    return {
      niveau: 'inconnu',
      jours: null,
      reference: null,
      reference_le: null,
      message: 'Fraîcheur du référentiel inconnue : le suivi des mises à jour est indisponible.',
      detail:
        'La base est peut-être plus récente que ce que l’application peut en dire. ' +
        CONSEIL_MAJ,
    };
  }

  const enEchec = majs.find((m) => m.etat_controle === 'echec');
  if (enEchec) {
    const jours = joursDepuis(enEchec.verifie_le ?? enEchec.maj_le, maintenant);
    return {
      niveau: 'echec',
      jours,
      reference: enEchec.verifie_le ? 'controle' : 'import',
      reference_le: enEchec.verifie_le ?? enEchec.maj_le,
      message: 'La dernière mise à jour du référentiel a échoué : les données ont pu changer depuis.',
      detail: `${enEchec.derniere_erreur ?? 'Échec sans message.'} ${CONSEIL_MAJ}`,
    };
  }

  // Table la plus ancienne : c'est elle qui commande l'alerte.
  let plusAncienne: MajReferentiel | null = null;
  let joursMax = -1;
  let surControle = true;
  for (const maj of majs) {
    const surControleIci = Boolean(maj.verifie_le);
    const jours = joursDepuis(maj.verifie_le ?? maj.maj_le, maintenant);
    if (jours === null) continue;
    // À ancienneté égale, un contrôle est plus rassurant qu'un simple import : on ne
    // dégrade donc pas l'information en passant de l'un à l'autre.
    if (jours > joursMax || (jours === joursMax && surControleIci && !surControle)) {
      joursMax = jours;
      plusAncienne = maj;
      surControle = surControleIci;
    }
  }

  if (!plusAncienne || joursMax < 0) {
    return {
      niveau: 'inconnu',
      jours: null,
      reference: null,
      reference_le: null,
      message: 'Dates de référentiel illisibles : fraîcheur inconnue.',
      detail: CONSEIL_MAJ,
    };
  }

  const referenceLe = (surControle ? plusAncienne.verifie_le : plusAncienne.maj_le) ?? null;
  const reference = surControle ? 'controle' : 'import';
  const nom = plusAncienne.libelle;
  const base = {
    jours: joursMax,
    reference,
    reference_le: referenceLe,
  } as const;

  if (joursMax >= SEUIL_PEREMPTION_JOURS) {
    return {
      ...base,
      niveau: 'perime',
      message: surControle
        ? `Référentiel ${nom} non contrôlé depuis ${joursMax} jours ` +
          `(dernier contrôle : ${dateFr(referenceLe!)}).`
        : `Référentiel ${nom} importé il y a ${joursMax} jours ` +
          `(${dateFr(referenceLe!)}) et jamais recontrôlé depuis.`,
      detail:
        'Les sources officielles (BDPM, CCAM) ont pu changer : des actes ou des ' +
        `références manquent peut-être. ${CONSEIL_MAJ}`,
    };
  }

  if (joursMax >= SEUIL_SURVEILLANCE_JOURS) {
    return {
      ...base,
      niveau: 'a_surveiller',
      message:
        `Référentiel ${nom} contrôlé il y a ${joursMax} jours (${dateFr(referenceLe!)}) : ` +
        'le contrôle mensuel a été manqué.',
      detail: `Un seul contrôle a été manqué : les données restent vraisemblablement bonnes. ${CONSEIL_MAJ}`,
    };
  }

  return {
    ...base,
    niveau: 'a_jour',
    message: surControle
      ? `Référentiel contrôlé il y a ${joursMax} jour${joursMax > 1 ? 's' : ''} ` +
        `(${dateFr(referenceLe!)}).`
      : `Référentiel importé il y a ${joursMax} jour${joursMax > 1 ? 's' : ''} ` +
        `(${dateFr(referenceLe!)}), pas encore recontrôlé.`,
    detail: CONSEIL_MAJ,
  };
}

/** Vrai si l'état du référentiel mérite une bannière visible dans l'application. */
export function peremptionSignalee(peremption: PeremptionReferentiel): boolean {
  return (
    peremption.niveau === 'a_surveiller' ||
    peremption.niveau === 'perime' ||
    peremption.niveau === 'echec'
  );
}

/** Libellé court de l'état, pour le voyant d'en-tête. */
export function libellePeremption(peremption: PeremptionReferentiel): string {
  switch (peremption.niveau) {
    case 'a_surveiller':
      return 'à recontrôler';
    case 'perime':
      return 'périmé';
    case 'echec':
      return 'mise à jour en échec';
    default:
      return '';
  }
}

/* ------------------------------------------------------------------ *
 * Déclenchement de la mise à jour
 * ------------------------------------------------------------------ */

/** Résultat d'une demande de mise à jour, prêt à être affiché. */
export interface DeclenchementMaj {
  /** Vrai si la mise à jour a réellement été déclenchée. */
  readonly ok: boolean;
  /** `service` : déclenchée depuis l'application ; `actions` : à lancer par un humain. */
  readonly mode: 'service' | 'actions';
  readonly message: string;
  /** Page à ouvrir quand la mise à jour n'a pas pu être déclenchée d'ici. */
  readonly lien: string;
}

const REFUS_ACTIONS: DeclenchementMaj = {
  ok: false,
  mode: 'actions',
  message:
    'La mise à jour se lance depuis la page du workflow GitHub Actions (bouton « Run workflow ») : ' +
    'elle télécharge les sources officielles et n’écrit en base que si elles ont changé.',
  lien: MAJ_ACTIONS_URL,
};

/**
 * Demande une mise à jour des référentiels.
 *
 * Deux chemins, dans cet ordre :
 *   1. **service** (`MAJ_SERVICE_URL`, fonction Edge) : appel direct, sans secret dans le
 *      navigateur — la clé d'écriture reste côté serveur. Le `code` éventuel est un secret
 *      partagé stocké dans les secrets de la fonction ;
 *   2. **repli** : l'application renvoie vers le workflow GitHub Actions, où l'exécution
 *      est authentifiée par GitHub lui-même.
 *
 * Dans tous les cas l'écriture en base n'est jamais faite depuis le navigateur : la clé
 * `anon` y est refusée (Row Level Security en lecture seule).
 */
export async function declencherMajReferentiels(code = ''): Promise<DeclenchementMaj> {
  if (!MAJ_SERVICE_URL) return REFUS_ACTIONS;

  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), 30000);
  try {
    const reponse = await fetch(MAJ_SERVICE_URL, {
      method: 'POST',
      headers: { ...entetes(), ...(code ? { 'x-code-maj': code } : {}) },
      body: JSON.stringify({ demande: 'maj-referentiels' }),
      signal: controleur.signal,
    });
    if (reponse.status === 404) {
      return { ...REFUS_ACTIONS, message: 'Service de mise à jour non déployé : à lancer depuis GitHub Actions.' };
    }
    if (reponse.status === 401 || reponse.status === 403) {
      return {
        ok: false,
        mode: 'service',
        message: 'Code de service refusé : vérifiez le code de mise à jour, ou passez par GitHub Actions.',
        lien: MAJ_ACTIONS_URL,
      };
    }
    if (reponse.status === 429) {
      return {
        ok: false,
        mode: 'service',
        message: 'Une mise à jour vient d’être demandée : inutile de la relancer maintenant.',
        lien: MAJ_ACTIONS_URL,
      };
    }
    if (!reponse.ok) {
      return {
        ok: false,
        mode: 'service',
        message: `Le service de mise à jour a répondu HTTP ${reponse.status}.`,
        lien: MAJ_ACTIONS_URL,
      };
    }
    const corps = (await reponse.json().catch(() => ({}))) as { message?: string; run?: string };
    return {
      ok: true,
      mode: 'service',
      message:
        corps.message ??
        'Mise à jour lancée : les sources officielles sont retéléchargées et comparées ; ' +
          'rien n’est écrit si elles n’ont pas changé.',
      lien: corps.run ?? MAJ_ACTIONS_URL,
    };
  } catch {
    return {
      ok: false,
      mode: 'service',
      message: 'Service de mise à jour injoignable : à lancer depuis GitHub Actions.',
      lien: MAJ_ACTIONS_URL,
    };
  } finally {
    clearTimeout(minuteur);
  }
}

/* ------------------------------------------------------------------ *
 * Transport
 * ------------------------------------------------------------------ */

const entetes = (): HeadersInit => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

async function appelerRpc<T>(
  fonction: string,
  corps: Record<string, unknown>,
): Promise<T> {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_REQUETE_MS);
  try {
    const reponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fonction}`, {
      method: 'POST',
      headers: entetes(),
      body: JSON.stringify(corps),
      signal: controleur.signal,
    });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const donnees = (await reponse.json()) as T;
    etat = 'connecte';
    return donnees;
  } catch (erreur) {
    etat = 'degrade';
    throw erreur;
  } finally {
    clearTimeout(minuteur);
  }
}

/** Lecture simple d'une table du référentiel (PostgREST, clé `anon`). */
async function lireTable<T>(chemin: string): Promise<T> {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_REQUETE_MS);
  try {
    const reponse = await fetch(`${SUPABASE_URL}/rest/v1/${chemin}`, {
      headers: entetes(),
      signal: controleur.signal,
    });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const donnees = (await reponse.json()) as T;
    etat = 'connecte';
    return donnees;
  } catch (erreur) {
    etat = 'degrade';
    throw erreur;
  } finally {
    clearTimeout(minuteur);
  }
}

/** Vérifie que le référentiel répond (appelé au démarrage). */
export async function verifierReferentiel(): Promise<boolean> {
  try {
    await appelerRpc<ActeRef[]>('rechercher_ccam', { p_terme: 'DEQP003', p_limite: 1 });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Recherches (avec repli local)
 * ------------------------------------------------------------------ */

/** Texte de recherche d'une fiche de secours : normalisé et encadré d'espaces. */
function texteDeSecours(...parties: readonly (string | null | undefined)[]): string {
  return ` ${normaliserTerme(parties.filter(Boolean).join(' '))} `;
}

/**
 * Fiches de secours classées pour une saisie : le thésaurus élargit la requête, puis les
 * fiches sont ordonnées par nombre de mots reconnus — même logique que la base (mots écrits
 * d'abord, synonymes ensuite).
 */
function classerSecours<T>(
  fiches: readonly T[],
  texte: (fiche: T) => string,
  requete: string,
  domaine: 'actes' | 'medicaments',
): readonly T[] {
  const ecrits = THESAURUS.elargir(requete, domaine);
  return fiches
    .map((fiche) => {
      const cible = texte(fiche);
      return { fiche, score: ecrits.filter((terme) => contientTerme(cible, terme)).length };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || texte(a.fiche).length - texte(b.fiche).length)
    .map(({ fiche }) => fiche);
}

/** Synonymes d'une saisie : proposés par la base, ou par le thésaurus embarqué. */
export async function synonymesDe(
  terme: string,
  domaine: 'actes' | 'medicaments',
): Promise<readonly SynonymeRef[]> {
  const requete = terme.trim();
  if (requete.length < 2) return [];
  try {
    return await appelerRpc<SynonymeRef[]>('synonymes_de', {
      p_terme: requete,
      p_domaine: domaine,
      p_limite: TAILLE_SYNONYMES,
    });
  } catch {
    return THESAURUS.synonymesDe(requete, domaine).slice(0, TAILLE_SYNONYMES);
  }
}

/** Recherche de spécialités pharmaceutiques. */
export async function rechercherMedicaments(
  terme: string,
  limite = TAILLE_RESULTATS,
): Promise<readonly MedicamentRef[]> {
  const requete = terme.trim();
  if (requete.length < 2) return [];

  try {
    return await appelerRpc<MedicamentRef[]>('rechercher_medicaments', {
      p_terme: requete,
      p_limite: limite,
    });
  } catch {
    return classerSecours(
      MEDICAMENTS_SECOURS,
      (m) => texteDeSecours(m.denomination, m.dci, m.cis),
      requete,
      'medicaments',
    ).slice(0, limite);
  }
}

/** Recherche d'actes CCAM (code ou libellé). */
export async function rechercherActesCcam(
  terme: string,
  limite = TAILLE_RESULTATS,
): Promise<readonly ActeRef[]> {
  const requete = terme.trim();
  if (requete.length < 2) return [];

  try {
    return await appelerRpc<ActeRef[]>('rechercher_ccam', {
      p_terme: requete,
      p_limite: limite,
    });
  } catch {
    return classerSecours(
      ACTES_SECOURS,
      (a) => texteDeSecours(a.code, a.libelle, a.mots_cles),
      requete,
      'actes',
    ).slice(0, limite);
  }
}

/** Récupère un acte CCAM par son code exact. */
export async function acteParCode(code: string): Promise<ActeRef | null> {
  const requete = code.trim();
  if (!requete) return null;
  try {
    const resultats = await appelerRpc<ActeRef[]>('acte_ccam', { p_code: requete });
    return resultats[0] ?? null;
  } catch {
    return ACTES_SECOURS.find((a) => a.code.toLowerCase() === requete.toLowerCase()) ?? null;
  }
}

/* ------------------------------------------------------------------ *
 * Arborescence CCAM (chapitres → sous-thèmes → actes)
 * ------------------------------------------------------------------ */

/** Chapitres de la nomenclature (thématiques), triés par code. */
export async function chapitresCcam(): Promise<readonly ThemeRef[]> {
  try {
    return await appelerRpc<ThemeRef[]>('chapitres_ccam', {});
  } catch {
    return chapitresDeSecours();
  }
}

/** Sous-thèmes (sites anatomiques) d'un chapitre. */
export async function sousChapitresCcam(chapitre: string): Promise<readonly ThemeRef[]> {
  try {
    return await appelerRpc<ThemeRef[]>('sous_chapitres_ccam', { p_chapitre: chapitre });
  } catch {
    return sousChapitresDeSecours(chapitre);
  }
}

/** Actes d'un chapitre, éventuellement restreints à un sous-thème. */
export async function actesParTheme(
  chapitre: string,
  sousChapitre: string | null,
  limite = 200,
): Promise<readonly ActeRef[]> {
  try {
    return await appelerRpc<ActeRef[]>('actes_par_theme', {
      p_chapitre: chapitre,
      p_sous_chapitre: sousChapitre,
      p_limite: limite,
    });
  } catch {
    return ACTES_SECOURS.filter((a) => a.chapitre_code === chapitre).slice(0, limite);
  }
}

/* ------------------------------------------------------------------ *
 * Repli local (référentiel de secours embarqué)
 * ------------------------------------------------------------------ */

const MEDICAMENTS_SECOURS: readonly MedicamentRef[] = [
  {
    cis: '68201234',
    denomination: 'IMMUNOGLOBULINE HUMAINE NORMALE 5 g, solution pour perfusion',
    dci: 'IMMUNOGLOBULINE HUMAINE NORMALE',
    est_reserve_hospitaliere: true,
    est_liste_en_sus: true,
    surveillance_particuliere: true,
    surveillance_renforcee: false,
  },
  {
    cis: '67123456',
    denomination: 'INFLIXIMAB 100 mg, poudre pour solution à diluer pour perfusion',
    dci: 'INFLIXIMAB',
    est_reserve_hospitaliere: true,
    est_liste_en_sus: true,
    surveillance_particuliere: false,
    surveillance_renforcee: true,
  },
  {
    cis: '66789012',
    denomination: 'RISDIPLAM 0,75 mg/mL, solution buvable',
    dci: 'RISDIPLAM',
    est_reserve_hospitaliere: true,
    est_liste_en_sus: true,
    surveillance_particuliere: false,
    surveillance_renforcee: false,
  },
  {
    cis: '64555123',
    denomination: 'PARACETAMOL 1 g, comprimé',
    dci: 'PARACETAMOL',
    est_reserve_hospitaliere: false,
    est_liste_en_sus: false,
    surveillance_particuliere: false,
    surveillance_renforcee: false,
  },
  {
    cis: '62345678',
    denomination: 'FER CARBOXYMALTOSE 100 mg/2 mL, solution injectable',
    dci: 'FER CARBOXYMALTOSE',
    est_reserve_hospitaliere: true,
    est_liste_en_sus: null,
    surveillance_particuliere: false,
    surveillance_renforcee: false,
  },
];

const ACTES_SECOURS: readonly ActeRef[] = [
  {
    code: 'DEQP003',
    libelle: 'électrocardiographie sur au moins douze dérivations',
    acte_marqueur_hdj: false,
    exclusif_externe: true,
    necessite_plateau_lourd: false,
    acte_classant: false,
    eligibilite_hdj: 'non',
    motif_eligibilite_hdj:
      'non — acte non classant : il n’ouvre pas de GHS à lui seul (ACE ou forfait de séance)',
    type_acte: 'Acte non classant',
    racines_ghm: null,
    chapitre_code: '04',
    chapitre_libelle: 'appareil circulatoire',
    sous_chapitre_code: 'CV',
    sous_chapitre_libelle: 'cœur',
    mots_cles: 'ecg electrocardiogramme',
  },
  {
    code: 'HEQE001',
    libelle: 'endoscopie œso-gastro-duodénale par voie orale, avec biopsie',
    acte_marqueur_hdj: true,
    exclusif_externe: false,
    necessite_plateau_lourd: true,
    acte_classant: true,
    eligibilite_hdj: 'oui',
    motif_eligibilite_hdj:
      'oui — GHM ambulatoire strict (0 nuit) : l’acte peut valider un GHS d’HDJ à lui seul',
    type_acte: 'Acte lourd non opératoire',
    racines_ghm: '06K04 06K05',
    chapitre_code: '07',
    chapitre_libelle: 'appareil digestif',
    sous_chapitre_code: 'DG',
    sous_chapitre_libelle: 'œsophage, estomac et duodénum',
    mots_cles: 'endoscopie fibroscopie gastroscopie estomac biopsie prelevement',
  },
  {
    code: 'AAFA002',
    libelle: 'exérèse de tumeur intraparenchymateuse du cerveau, par craniotomie',
    acte_marqueur_hdj: false,
    exclusif_externe: false,
    necessite_plateau_lourd: true,
    acte_classant: true,
    eligibilite_hdj: 'non',
    motif_eligibilite_hdj:
      'non — aucune racine de cet acte ne décrit de séjour de 0 nuit : au moins une nuitée requise',
    type_acte: 'Acte interventionnel classant',
    racines_ghm: '01C03 01C04 01C11 01C12 17C06',
    chapitre_code: '01',
    chapitre_libelle: 'système nerveux central, périphérique et autonome',
    sous_chapitre_code: 'AA',
    sous_chapitre_libelle: 'encéphale',
    mots_cles: 'exerese ablation retrait excision tumeur',
  },
  {
    code: 'ACQK001',
    libelle: 'scanographie du crâne et de son contenu, sans injection de produit de contraste',
    acte_marqueur_hdj: false,
    exclusif_externe: true,
    necessite_plateau_lourd: false,
    acte_classant: false,
    eligibilite_hdj: 'non',
    motif_eligibilite_hdj:
      'non — acte non classant : il n’ouvre pas de GHS à lui seul (ACE ou forfait de séance)',
    type_acte: 'Acte non classant',
    racines_ghm: null,
    chapitre_code: '01',
    chapitre_libelle: 'système nerveux central, périphérique et autonome',
    sous_chapitre_code: 'AA',
    sous_chapitre_libelle: 'encéphale',
    mots_cles: 'scanner tdm tomodensitometrie',
  },
];

/* ------------------------------------------------------------------ *
 * Arborescence de secours (calculée depuis le repli local)
 * ------------------------------------------------------------------ */

function chapitresDeSecours(): readonly ThemeRef[] {
  const parChapitre = new Map<string, { libelle: string; actes: number }>();
  for (const acte of ACTES_SECOURS) {
    const code = acte.chapitre_code;
    if (!code) continue;
    const entree = parChapitre.get(code) ?? { libelle: acte.chapitre_libelle ?? '', actes: 0 };
    entree.actes += 1;
    parChapitre.set(code, entree);
  }
  return [...parChapitre]
    .map(([code, valeur]) => ({ code, libelle: valeur.libelle, actes: valeur.actes }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

function sousChapitresDeSecours(chapitre: string): readonly ThemeRef[] {
  const parSousChapitre = new Map<string, { libelle: string; actes: number }>();
  for (const acte of ACTES_SECOURS.filter((a) => a.chapitre_code === chapitre)) {
    const code = acte.sous_chapitre_code;
    if (!code) continue;
    const entree =
      parSousChapitre.get(code) ?? { libelle: acte.sous_chapitre_libelle ?? '', actes: 0 };
    entree.actes += 1;
    parSousChapitre.set(code, entree);
  }
  return [...parSousChapitre]
    .map(([code, valeur]) => ({ code, libelle: valeur.libelle, actes: valeur.actes }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle));
}
