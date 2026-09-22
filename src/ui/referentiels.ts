/**
 * Accès au référentiel Supabase (médicaments et actes CCAM).
 *
 * Aucune dépendance externe : appels PostgREST via `fetch`, avec repli local si
 * le référentiel est injoignable (l'application reste utilisable hors ligne).
 */

import {
  DELAI_REQUETE_MS,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  TAILLE_RESULTATS,
} from '../config.js';

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

/** Acte de la nomenclature CCAM. */
export interface ActeRef {
  readonly code: string;
  readonly libelle: string;
  readonly acte_marqueur_hdj: boolean | null;
  readonly exclusif_externe: boolean | null;
  readonly necessite_plateau_lourd: boolean | null;
}

/** Date de mise à jour d'une table de référentiel. */
export interface MajReferentiel {
  readonly nom: string;
  readonly libelle: string;
  readonly maj_le: string;
  readonly lignes: number | null;
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
      'referentiel_maj?select=nom,libelle,maj_le,lignes&order=nom',
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

function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
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
    const cible = normaliser(requete);
    return MEDICAMENTS_SECOURS.filter(
      (m) =>
        normaliser(m.denomination).includes(cible) ||
        normaliser(m.dci ?? '').includes(cible),
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
    const cible = normaliser(requete);
    return ACTES_SECOURS.filter(
      (a) => normaliser(a.code).startsWith(cible) || normaliser(a.libelle).includes(cible),
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
  },
  {
    code: 'HEQE001',
    libelle: 'endoscopie œso-gastro-duodénale par voie orale, avec biopsie',
    acte_marqueur_hdj: true,
    exclusif_externe: false,
    necessite_plateau_lourd: true,
  },
  {
    code: 'AAFA002',
    libelle: 'exérèse de tumeur intraparenchymateuse du cerveau, par craniotomie',
    acte_marqueur_hdj: true,
    exclusif_externe: false,
    necessite_plateau_lourd: true,
  },
  {
    code: 'ACQK001',
    libelle: 'scanographie du crâne et de son contenu, sans injection de produit de contraste',
    acte_marqueur_hdj: false,
    exclusif_externe: true,
    necessite_plateau_lourd: false,
  },
];
