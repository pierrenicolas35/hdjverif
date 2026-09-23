// @vitest-environment happy-dom
// @vitest-environment-options {"url": "http://localhost"}
/**
 * Tests d'intégration de l'assistant.
 *
 * Le référentiel Supabase est simulé (aucun appel réseau) : on vérifie l'écran
 * d'accueil (trois entrées), le rappel affiché avant l'évaluation, le parcours
 * des cinq questions, le menu déroulant de discipline du volet d'aide, la
 * consultation des référentiels (recherche + arborescence CCAM) et la décision
 * en langage courant restituée par le moteur.
 */

import { readFileSync } from 'node:fs';

import { DISCIPLINES } from '../src/ui/pedagogie.js';
import { detailMaj, libelleMaj } from '../src/ui/referentiels.js';
import { resolve } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ *
 * Référentiel simulé
 * ------------------------------------------------------------------ */

const ACTE_ECG = {
  code: 'ZZQL002',
  libelle: 'exploration fonctionnelle métabolique',
  acte_marqueur_hdj: false,
  exclusif_externe: false,
  necessite_plateau_lourd: false,
};

const ACTE_LOURD = {
  code: 'HEQE001',
  libelle: 'endoscopie œso-gastro-duodénale par voie orale, avec biopsie',
  acte_marqueur_hdj: true,
  exclusif_externe: false,
  necessite_plateau_lourd: true,
};

const ACTES: Record<string, unknown> = {
  ZZQL002: ACTE_ECG,
  DEQP003: {
    code: 'DEQP003',
    libelle: 'électrocardiographie sur au moins douze dérivations',
    acte_marqueur_hdj: false,
    exclusif_externe: true,
    necessite_plateau_lourd: false,
  },
  HEQE001: ACTE_LOURD,
};

const MEDICAMENTS: readonly Record<string, unknown>[] = [
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
    cis: '64542736',
    denomination: 'REMICADE 100 mg, poudre pour solution à diluer pour perfusion',
    dci: 'INFLIXIMAB',
    est_reserve_hospitaliere: true,
    est_liste_en_sus: true,
    surveillance_particuliere: false,
    surveillance_renforcee: false,
  },
  {
    cis: '62345678',
    denomination: 'FER CARBOXYMALTOSE 100 mg/2 mL, solution injectable',
    dci: 'FER CARBOXYMALTOSE',
    // Valeur absente du référentiel : la source officielle ne tranche pas.
    est_reserve_hospitaliere: null,
    est_liste_en_sus: null,
    surveillance_particuliere: null,
    surveillance_renforcee: false,
  },
];

/** Arborescence CCAM simulée (chapitres → sous-thèmes → actes). */
const CHAPITRES = [
  { code: '01', libelle: 'système nerveux central, périphérique et autonome', actes: 1 },
  { code: '07', libelle: 'appareil digestif', actes: 1 },
];

const SOUS_CHAPITRES = [{ code: 'AA', libelle: 'œsophage, estomac et duodénum', actes: 1 }];

/** Suivi des mises à jour : dates distinctes pour les deux tables. */
const MAJ_REFERENTIELS: readonly Record<string, unknown>[] = [
  {
    nom: 'referentiel_ccam',
    libelle: 'Nomenclature CCAM',
    maj_le: '2026-02-09T21:33:08.000Z',
    lignes: 1969,
  },
  {
    nom: 'referentiel_medicaments',
    libelle: 'Médicaments (BDPM)',
    maj_le: '2026-09-22T10:52:32.000Z',
    lignes: 13609,
  },
];

function reponseJson(donnees: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => donnees,
    text: async () => JSON.stringify(donnees),
  } as unknown as Response;
}

beforeAll(async () => {
  // happy-dom n'expose pas toujours `localStorage` : on en fournit un en mémoire pour
  // éprouver la mémorisation du rappel « ne plus afficher ».
  if (!window.localStorage) {
    const memoire = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (cle: string) => memoire.get(cle) ?? null,
        setItem: (cle: string, valeur: string) => {
          memoire.set(cle, valeur);
        },
        removeItem: (cle: string) => {
          memoire.delete(cle);
        },
        clear: () => {
          memoire.clear();
        },
      },
    });
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (entree: unknown, init?: { body?: string }) => {
      const url = String(entree);
      const corps = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};

      if (url.includes('referentiel_maj')) return reponseJson(MAJ_REFERENTIELS);
      if (url.includes('rechercher_ccam')) return reponseJson([ACTE_ECG]);
      // Attention : « sous_chapitres_ccam » contient « chapitres_ccam » — tester le plus spécifique d'abord.
      if (url.includes('sous_chapitres_ccam')) return reponseJson(SOUS_CHAPITRES);
      if (url.includes('chapitres_ccam')) return reponseJson(CHAPITRES);
      if (url.includes('actes_par_theme')) return reponseJson([ACTE_LOURD]);
      if (url.includes('acte_ccam')) return reponseJson([ACTES[String(corps['p_code'])]]);
      if (url.includes('rechercher_medicaments')) {
        const terme = String(corps['p_terme'] ?? '');
        return reponseJson(/^\d+$/.test(terme) ? [] : MEDICAMENTS);
      }
      return reponseJson([]);
    }),
  );

  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const corps = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? '';
  document.body.innerHTML = corps.replace(/<script[\s\S]*?<\/script>/gi, '');

  await import('../src/ui/main.ts');
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  // Le rappel « motifs hors champ » se mémorise : on repart d'un état vierge.
  try {
    window.localStorage?.clear();
  } catch {
    // Stockage local indisponible dans cet environnement : rien à réinitialiser.
  }
});

/* ------------------------------------------------------------------ *
 * Utilitaires
 * ------------------------------------------------------------------ */

function cliquer(selecteur: string): void {
  const noeud = document.querySelector<HTMLElement>(selecteur);
  if (!noeud) throw new Error(`Sélecteur introuvable : ${selecteur}`);
  noeud.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

const texte = (selecteur: string): string =>
  document.querySelector(selecteur)?.textContent?.trim() ?? '';

const questionCourante = (): string => texte('.question');

/** Répond à une question binaire (boutons Oui vert / Non rouge). */
function repondre(cle: string, valeur: 'oui' | 'non'): void {
  cliquer(`.btn-oui-non[data-cle="${cle}"][data-valeur="${valeur}"]`);
}

function suivant(): void {
  cliquer('[data-action="avancer"]');
}

function choisirProfession(valeur: string): void {
  cliquer(`[data-action="profession-bascule"][data-valeur="${valeur}"]`);
}

/** Retour à l'écran d'accueil depuis n'importe quel état. */
function allerAccueil(): void {
  cliquer('#bouton-entete');
  expect(questionCourante()).toContain('Que voulez-vous faire');
}

/** Lance l'évaluation en franchissant le rappel préalable. */
function demarrerEvaluation(): void {
  cliquer('[data-action="demarrer-evaluation"]');
  cliquer('[data-action="demarrer-confirme"]');
}

/** Accueil → rappel franchi → première question (actes). */
function atteindreActes(): void {
  allerAccueil();
  demarrerEvaluation();
  expect(questionCourante()).toContain('actes techniques');
}

const attendre = (ms: number): Promise<void> =>
  new Promise((resoudre) => setTimeout(resoudre, ms));

async function choisirPremiereSuggestion(action: string): Promise<void> {
  cliquer(`#zone-suggestions [data-action="${action}"]`);
  await attendre(60);
}

async function rechercher(terme: string): Promise<void> {
  const champ = document.querySelector<HTMLInputElement>('#champ-recherche');
  if (!champ) throw new Error('Champ de recherche introuvable');
  champ.value = terme;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  await attendre(420);
}

/** Choisit la discipline dans le menu déroulant du volet d'aide. */
function choisirDisciplineAide(valeur: string): void {
  const select = document.querySelector<HTMLSelectElement>('#select-discipline');
  if (!select) throw new Error('Menu déroulant des disciplines introuvable');
  select.value = valeur;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/* ------------------------------------------------------------------ *
 * Écran d'accueil : trois entrées
 * ------------------------------------------------------------------ */

describe('Écran d’accueil — trois entrées', () => {
  it('propose exactement trois boutons', () => {
    allerAccueil();
    expect(document.querySelectorAll('.btn-accueil')).toHaveLength(3);
  });

  it('place le calcul d’éligibilité au-dessus et en plus gros', () => {
    allerAccueil();
    const boutons = [...document.querySelectorAll<HTMLElement>('.btn-accueil')];
    expect(boutons[0]?.dataset['action']).toBe('demarrer-evaluation');
    expect(boutons[0]?.className).toContain('principal');
    expect(boutons[0]?.textContent).toContain('Calculer l’éligibilité d’une HDJ');
  });

  it('donne accès aux deux référentiels', () => {
    allerAccueil();
    const actions = [...document.querySelectorAll<HTMLElement>('.btn-accueil')].map(
      (b) => b.dataset['action'],
    );
    expect(actions).toContain('demarrer-evaluation');
    expect(actions).toContain('ouvrir-ccam');
    expect(actions).toContain('ouvrir-medicaments');
    expect(texte('#carte')).toContain('Référentiel des actes techniques (CCAM)');
    expect(texte('#carte')).toContain('Médicaments de la réserve hospitalière');
  });

  it('ne propose plus de choix de discipline en préambule', () => {
    allerAccueil();
    expect(document.querySelector('[data-action="discipline"]')).toBeNull();
    expect(texte('#carte')).not.toContain('Quelle est la discipline');
  });
});

/* ------------------------------------------------------------------ *
 * Rappel préalable : motifs hors champ
 * ------------------------------------------------------------------ */

describe('Rappel préalable — motifs qui échappent à l’HDJ', () => {
  it('affiche un rappel avant de permettre de débuter', () => {
    allerAccueil();
    cliquer('[data-action="demarrer-evaluation"]');

    const modale = document.querySelector('#modale');
    expect(modale?.className).toContain('ouvert');
    // L'évaluation n'a pas commencé : on est toujours sur l'accueil.
    expect(questionCourante()).toContain('Que voulez-vous faire');
  });

  it('cite les trois motifs et leurs justifications réglementaires', () => {
    allerAccueil();
    cliquer('[data-action="demarrer-evaluation"]');
    const modale = texte('#modale');

    expect(modale).toContain('ne relèvent pas de l’hospitalisation de jour');
    expect(modale).toContain('dialyse ou de chimiothérapie');
    expect(modale).toContain('SMR / SSR');
    expect(modale).toContain('psychiatrie');
    // Justifications : séance forfaitisée (annexe 4) et champ limité au MCO.
    expect(modale).toContain('Annexe 4, point 1');
    expect(modale).toContain('L. 162-22-6');
    expect(modale).toContain('quelle que soit');
  });

  it('démarre l’évaluation une fois le rappel accepté', () => {
    allerAccueil();
    demarrerEvaluation();
    expect(questionCourante()).toContain('actes techniques');
    expect(document.querySelector('#modale')?.className).not.toContain('ouvert');
  });

  it('permet de refermer le rappel sans démarrer', () => {
    allerAccueil();
    cliquer('[data-action="demarrer-evaluation"]');
    cliquer('[data-action="fermer-modale"]');
    expect(document.querySelector('#modale')?.className).not.toContain('ouvert');
    expect(questionCourante()).toContain('Que voulez-vous faire');
  });

  it('mémorise le choix « ne plus afficher »', () => {
    allerAccueil();
    cliquer('[data-action="demarrer-evaluation"]');
    const case_ = document.querySelector<HTMLInputElement>('#ne-plus-afficher');
    expect(case_).not.toBeNull();
    case_!.checked = true;
    cliquer('[data-action="demarrer-confirme"]');
    expect(questionCourante()).toContain('actes techniques');

    // De retour à l'accueil, le rappel ne s'interpose plus.
    allerAccueil();
    cliquer('[data-action="demarrer-evaluation"]');
    expect(document.querySelector('#modale')?.className).not.toContain('ouvert');
    expect(questionCourante()).toContain('actes techniques');
  });
});

/* ------------------------------------------------------------------ *
 * Simplicité de la saisie
 * ------------------------------------------------------------------ */

describe('Assistant — aucune donnée administrative', () => {
  it('ne demande ni numéro de séjour ni date, nulle part', () => {
    atteindreActes();
    expect(document.querySelector('[data-champ="identifiantSejour"]')).toBeNull();
    expect(document.querySelector('#champ-sejour')).toBeNull();
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(document.body.innerHTML).not.toContain('SEJ-');
    expect(texte('#carte')).not.toContain('Séjour');
  });

  it('ne pose plus la question du type de prise en charge', () => {
    atteindreActes();
    expect(document.querySelector('.btn-oui-non[data-cle="estSeance"]')).toBeNull();
    expect(document.querySelector('.btn-oui-non[data-cle="estHorsMco"]')).toBeNull();
    const corps = texte('#carte');
    expect(corps).not.toContain('séance de dialyse');
    expect(corps).not.toContain('SMR/SSR');
  });

  it('ne pose plus les questions dont la réponse est acquise en prospectif', () => {
    atteindreActes();
    for (const cle of ['estProgramme', 'lettreAdressage', 'syntheseMedicale', 'lettreLiaison']) {
      expect(document.querySelector(`.btn-oui-non[data-cle="${cle}"]`)).toBeNull();
    }
  });

  it('les boutons Oui sont verts et les boutons Non rouges', () => {
    allerAccueil();
    demarrerEvaluation();
    suivant(); // actes → médicaments
    suivant(); // médicaments → équipe
    suivant(); // équipe → surveillance et durée (seule question Oui/Non)
    const oui = document.querySelector<HTMLElement>('.btn-oui-non[data-valeur="oui"]');
    const non = document.querySelector<HTMLElement>('.btn-oui-non[data-valeur="non"]');
    expect(oui).not.toBeNull();
    expect(non).not.toBeNull();
    expect(oui?.dataset['valeur']).toBe('oui');
    expect(non?.dataset['valeur']).toBe('non');
  });
});

/* ------------------------------------------------------------------ *
 * Référentiels : aucune re-demande
 * ------------------------------------------------------------------ */

describe('Actes CCAM — caractéristiques reprises du référentiel', () => {
  it('ne redemande jamais les caractéristiques de l’acte', async () => {
    atteindreActes();
    await rechercher('exploration');
    await choisirPremiereSuggestion('suggestion-acte');

    expect(document.querySelectorAll('[data-action="retirer-acte"]')).toHaveLength(1);
    expect(texte('.selection')).toContain('ZZQL002');
    expect(texte('.element-meta')).toContain('plateau technique lourd');
    expect(texte('.element-meta')).toContain('repris du référentiel');
    expect(document.querySelector('[data-action="acte-plateau"]')).toBeNull();
    expect(document.querySelector('[data-action="acte-externe"]')).toBeNull();
  });
});

describe('Médicaments — réserve hospitalière issue du référentiel', () => {
  it('ne redemande pas si le produit relève de la réserve hospitalière', async () => {
    atteindreActes();
    suivant(); // médicaments
    await rechercher('immunoglobuline');
    await choisirPremiereSuggestion('suggestion-medicament');

    expect(document.querySelectorAll('[data-action="retirer-medicament"]')).toHaveLength(1);
    expect(texte('.element-meta')).toContain('Réserve hospitalière');
    expect(texte('.element-meta')).toContain('oui');
    expect(document.querySelector('[data-action="med-reserve"]')).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Intervenants
 * ------------------------------------------------------------------ */

describe('Intervenants — sélection par bascules de profession', () => {
  function atteindreIntervenants(): void {
    atteindreActes();
    suivant(); // médicaments
    suivant(); // intervenants
  }

  it('sélectionne puis désélectionne un intervenant au clic', () => {
    atteindreIntervenants();
    expect(questionCourante()).toContain('interviendront');

    const boutonIde = (): HTMLElement | null =>
      document.querySelector<HTMLElement>('[data-action="profession-bascule"][data-valeur="IDE"]');

    expect(boutonIde()?.getAttribute('aria-pressed')).toBe('false');
    choisirProfession('IDE');
    expect(boutonIde()?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelectorAll('[data-action="retirer-intervenant"]')).toHaveLength(1);

    choisirProfession('DIETETICIEN');
    expect(document.querySelectorAll('[data-action="retirer-intervenant"]')).toHaveLength(2);

    choisirProfession('IDE');
    expect(boutonIde()?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelectorAll('[data-action="retirer-intervenant"]')).toHaveLength(1);
  });

  it('ne demande ni spécialité ni note d’évolution : un rappel les remplace', () => {
    atteindreIntervenants();
    choisirProfession('MEDECIN');

    expect(document.querySelector('[data-action="note"]')).toBeNull();
    expect(document.querySelector('[data-champ^="specialite-"]')).toBeNull();

    const rappel = texte('.rappel-saisie');
    expect(rappel).toContain('Rappel');
    expect(rappel).toContain('note d’évolution');
    expect(rappel).toContain('réputée présente');
    expect(rappel).not.toContain('spécialités ou surspécialités distinctes');
  });

  it('rappelle la condition des deux spécialités dès qu’un second médecin est ajouté', () => {
    atteindreIntervenants();
    choisirProfession('MEDECIN');
    cliquer('[data-action="ajouter-medecin"]');

    expect(document.querySelectorAll('[data-action="retirer-intervenant"]')).toHaveLength(2);
    expect(texte('.rappel-saisie')).toContain('spécialités ou surspécialités distinctes');
    expect(document.querySelector('[data-action="ajouter-medecin"]')).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Parcours complet
 * ------------------------------------------------------------------ */

describe('Assistant — parcours complet', () => {
  it('conduit un séjour pluridisciplinaire conforme jusqu’à la décision lisible', () => {
    atteindreActes();
    suivant(); // médicaments
    suivant(); // intervenants

    choisirProfession('MEDECIN');
    choisirProfession('IDE');
    choisirProfession('DIETETICIEN');
    suivant(); // surveillance et durée

    repondre('surveillanceActive', 'non');
    cliquer('[data-action="duree"][data-valeur="300"]');
    suivant(); // contexte patient
    suivant(); // décision

    expect(texte('.statut')).toBe('HDJ validée — facturation en GHS intermédiaire');
    expect(document.querySelector('.badge')?.className).toContain('VERT');
    expect(texte('#carte')).toContain('Les 5 vérifications');
    expect(document.querySelectorAll('.pyramide li')).toHaveLength(5);
    expect(texte('#carte')).toContain('DGOS/R1/DSS/1A/2020/52');
    expect(document.querySelector('header .marque')).not.toBeNull();
  });

  it('retient un GHS plein lorsqu’un produit de la réserve hospitalière est administré', async () => {
    atteindreActes();
    suivant(); // médicaments
    await rechercher('immunoglobuline');
    await choisirPremiereSuggestion('suggestion-medicament');
    suivant(); // intervenants

    choisirProfession('IDE');
    suivant(); // surveillance et durée
    repondre('surveillanceActive', 'non');
    suivant(); // contexte patient
    suivant(); // décision

    expect(texte('.statut')).toBe('HDJ validée — facturation en GHS plein');
  });

  it('permet de revenir en arrière et de corriger une réponse', () => {
    cliquer('[data-action="reculer"]');
    expect(questionCourante()).toContain('situation de vulnérabilité');
    cliquer('[data-action="reculer"]');
    expect(questionCourante()).toContain('surveillance particulière');
    cliquer('[data-action="reculer"]');
    expect(questionCourante()).toContain('professionnels interviendront');
  });
});

/* ------------------------------------------------------------------ *
 * Contexte patient
 * ------------------------------------------------------------------ */

describe('Contexte patient — situations de vulnérabilité', () => {
  function atteindreContexte(): void {
    atteindreActes();
    suivant(); // médicaments
    suivant(); // équipe
    choisirProfession('MEDECIN');
    choisirProfession('IDE');
    choisirProfession('DIETETICIEN');
    suivant(); // surveillance et durée
    repondre('surveillanceActive', 'non');
    suivant(); // contexte patient
  }

  it('propose les situations de vulnérabilité énumérées par l’instruction', () => {
    atteindreContexte();
    expect(questionCourante()).toContain('situation de vulnérabilité');

    const boutons = [...document.querySelectorAll('[data-action="critere-contexte"]')];
    const valeurs = boutons.map((b) => (b as HTMLElement).dataset['valeur']);
    expect(valeurs).toEqual([
      'AGE',
      'HANDICAP',
      'PATHOLOGIE_PSYCHIATRIQUE',
      'ETAT_GRABATAIRE',
      'ANTECEDENTS',
      'PRECARITE_SOCIALE',
      'DIFFICULTES_COOPERATION',
      'SUSPICION_MALTRAITANCE',
      'PRISE_EN_CHARGE_URGENCE',
      'AUTRE_SITUATION',
    ]);
    expect(texte('#aide')).toContain('contexte patient');
  });

  it('une seule situation retenue suffit à obtenir un GHS plein', () => {
    atteindreContexte();
    suivant(); // décision, sans aucune situation retenue
    expect(texte('.statut')).toBe('HDJ validée — facturation en GHS intermédiaire');

    cliquer('[data-action="reculer"]'); // retour au contexte patient
    cliquer('[data-action="critere-contexte"][data-valeur="PRECARITE_SOCIALE"]');
    suivant(); // décision
    expect(texte('.statut')).toBe('HDJ validée — facturation en GHS plein');
    expect(texte('#carte')).toContain('Contexte patient particulier');
    expect(texte('#carte')).toContain('Précarité sociale');
  });
});

/* ------------------------------------------------------------------ *
 * Consultation du référentiel CCAM
 * ------------------------------------------------------------------ */

describe('Référentiel CCAM — soin lourd et arborescence', () => {
  it('ouvre la consultation depuis l’accueil', async () => {
    allerAccueil();
    cliquer('[data-action="ouvrir-ccam"]');
    expect(questionCourante()).toContain('soin lourd');
    await attendre(60);
    expect(texte('#arbre-ccam')).toContain('Parcourir par thématique');
  });

  it('cherche par mots-clés et qualifie le soin', async () => {
    allerAccueil();
    cliquer('[data-action="ouvrir-ccam"]');
    await rechercher('exploration');

    const ligne = document.querySelector('#zone-suggestions .acte-ligne');
    expect(ligne).not.toBeNull();
    expect(ligne?.textContent).toContain('ZZQL002');
    expect(ligne?.textContent).toContain('Plateau technique lourd');
    expect(ligne?.textContent).toContain('Soin non lourd');
  });

  it('parcourt l’arborescence chapitre → sous-thème → actes', async () => {
    allerAccueil();
    cliquer('[data-action="ouvrir-ccam"]');
    await attendre(60);

    // Chapitres (thématiques)
    const chapitres = [...document.querySelectorAll('#arbre-ccam [data-action="chapitre-ccam"]')];
    expect(chapitres).toHaveLength(2);
    expect(texte('#arbre-ccam')).toContain('appareil digestif');

    cliquer('[data-action="chapitre-ccam"][data-valeur="07"]');
    await attendre(60);
    expect(texte('#arbre-ccam')).toContain('œsophage, estomac et duodénum');

    cliquer('[data-action="sous-chapitre-ccam"][data-valeur="AA"]');
    await attendre(60);
    const acte = document.querySelector('#arbre-ccam .acte-ligne');
    expect(acte?.textContent).toContain('HEQE001');
    expect(acte?.textContent).toContain('Soin lourd : plateau technique mobilisé');

    // Retour par le fil d'Ariane
    cliquer('[data-action="arbre-racine"]');
    expect(document.querySelectorAll('#arbre-ccam [data-action="chapitre-ccam"]')).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ *
 * Consultation du référentiel des médicaments
 * ------------------------------------------------------------------ */

describe('Référentiel des médicaments — réserve hospitalière', () => {
  it('ouvre la consultation depuis l’accueil et cherche un produit', async () => {
    allerAccueil();
    cliquer('[data-action="ouvrir-medicaments"]');
    expect(questionCourante()).toContain('réserve hospitalière');

    await rechercher('immunoglobuline');
    const ligne = document.querySelector('#zone-suggestions .acte-ligne');
    expect(ligne?.textContent).toContain('IMMUNOGLOBULINE');
    expect(ligne?.textContent).toContain('Réserve hospitalière :');
    expect(ligne?.textContent).toContain('Produit de la réserve hospitalière');
  });

  it('n’interprète jamais une valeur absente comme « hors réserve »', async () => {
    allerAccueil();
    cliquer('[data-action="ouvrir-medicaments"]');
    await rechercher('fer');

    const lignes = [...document.querySelectorAll('#zone-suggestions .acte-ligne')];
    const fer = lignes
      .map((li) => li.textContent ?? '')
      .find((txt) => txt.includes('FER CARBOXYMALTOSE'));
    expect(fer).toBeDefined();
    expect(fer).toContain('valeur absente');
    expect(fer).toContain('à confirmer par la pharmacie');
  });
});

/* ------------------------------------------------------------------ *
 * Volet d'aide et menu déroulant de discipline
 * ------------------------------------------------------------------ */

describe('Volet d’aide', () => {
  it('est repliable (utile sur téléphone) et se déplie au clic', () => {
    allerAccueil();
    cliquer('[data-action="basculer-aide"]');
    expect(document.getElementById('aide')?.className).not.toContain('ouvert');

    cliquer('[data-action="basculer-aide"]');
    expect(document.getElementById('aide')?.className).toContain('ouvert');
  });

  it('signale l’état du référentiel dans l’en-tête', () => {
    expect(texte('#voyant-referentiel')).toMatch(/Référentiel/);
  });

  it('rappelle la règle applicable à chaque étape', () => {
    atteindreActes();
    expect(questionCourante()).toContain('actes techniques');
    expect(texte('#aide')).toContain('Pourquoi cette question');
    expect(texte('#aide')).toContain('Règle applicable');
    expect(texte('#aide')).toContain('Annexe 4');
    expect(texte('#aide')).toContain('Cas typiques');
  });

  it('propose un menu déroulant de disciplines, par ordre alphabétique', () => {
    atteindreActes();
    const options = [
      ...document.querySelectorAll<HTMLOptionElement>('#select-discipline option'),
    ];
    expect(options).toHaveLength(DISCIPLINES.length + 1);
    expect(options[0]?.value).toBe('');
    expect(options[0]?.textContent).toContain('Toutes disciplines');

    const libelles = options.slice(1).map((o) => o.textContent ?? '');
    expect(libelles).toEqual([...libelles].sort((a, b) => a.localeCompare(b, 'fr')));
  });

  it('adapte les cas typiques à la discipline choisie dans le menu', () => {
    atteindreActes();
    expect(texte('#aide')).toContain('Toutes disciplines');

    choisirDisciplineAide('GASTRO');
    expect(texte('#aide')).toContain('Gastro-entérologie et hépatologie');
    expect(texte('#aide')).toContain('Endoscopie œso-gastro-duodénale');

    choisirDisciplineAide('PSYCHIATRIE');
    expect(texte('#aide')).toContain('Psychiatrie et addictologie');
    expect(texte('#aide')).toContain('Hors champ');
    expect(texte('#aide')).not.toContain('Endoscopie œso-gastro-duodénale');
  });

  it('change de cas typique quand on change de question', () => {
    atteindreActes();
    choisirDisciplineAide('GASTRO');
    expect(texte('#aide')).toContain('Endoscopie œso-gastro-duodénale');

    suivant(); // médicaments
    const aideMedicaments = texte('#aide');
    expect(aideMedicaments).toContain('biothérapie digestive de réserve hospitalière');
    expect(aideMedicaments).not.toContain('Endoscopie œso-gastro-duodénale');
  });
});

/* ------------------------------------------------------------------ *
 * Référentiel — valeur absente et surveillance particulière
 * ------------------------------------------------------------------ */

describe('Référentiel — valeur absente et surveillance particulière', () => {
  it('affiche « valeur absente » sans conclure « hors réserve »', async () => {
    atteindreActes();
    suivant(); // médicaments
    await rechercher('fer');

    const suggestions = [...document.querySelectorAll('#zone-suggestions li')];
    const ligne = suggestions
      .map((li) => li.textContent ?? '')
      .find((txt) => txt.includes('FER CARBOXYMALTOSE'));
    expect(ligne).toBeDefined();
    expect(ligne).toContain('valeur absente');
    expect(ligne).not.toContain('· non');
  });

  it('signale la surveillance particulière issue du référentiel', async () => {
    atteindreActes();
    suivant(); // médicaments
    await rechercher('immunoglobuline');
    await choisirPremiereSuggestion('suggestion-medicament');

    expect(texte('.element-meta')).toContain('surveillance particulière liée au produit');
  });
});

/* ------------------------------------------------------------------ *
 * En-tête — dates de mise à jour
 * ------------------------------------------------------------------ */

describe('En-tête — dates de mise à jour des référentiels', () => {
  it('affiche la date de chaque base à côté de l’état de connexion', async () => {
    allerAccueil();
    await attendre(60);
    await attendre(60);

    const voyant = document.querySelector('#voyant-referentiel');
    expect(voyant?.textContent).toContain('Référentiel');
    expect(voyant?.textContent).toContain('médicaments 22/09/2026');
    expect(voyant?.textContent).toContain('CCAM 09/02/2026');
    expect(voyant?.getAttribute('title')).toMatch(/13\s*609 lignes/);
    expect(voyant?.getAttribute('title')).toMatch(/1\s*969 lignes/);
  });

  it('condense la date quand les deux bases ont la même mise à jour', () => {
    const memeDate = [
      { nom: 'referentiel_medicaments', libelle: 'Médicaments', maj_le: '2026-09-22T10:00:00Z', lignes: 10 },
      { nom: 'referentiel_ccam', libelle: 'CCAM', maj_le: '2026-09-22T09:00:00Z', lignes: 20 },
    ];
    expect(libelleMaj(memeDate)).toBe('MAJ 22/09/2026');
  });

  it('n’affiche aucune date si le suivi est indisponible', () => {
    expect(libelleMaj(null)).toBe('');
    expect(libelleMaj([])).toBe('');
    expect(detailMaj(null)).toContain('indisponibles');
  });
});

/* ------------------------------------------------------------------ *
 * Disciplines — jeu de données du menu
 * ------------------------------------------------------------------ */

describe('Disciplines — jeu proposé dans le menu déroulant', () => {
  it('en propose quatorze, sans doublon de libellé', () => {
    expect(DISCIPLINES.length).toBe(14);
    const libelles = DISCIPLINES.map((d) => d.libelle);
    expect(new Set(libelles).size).toBe(libelles.length);
  });

  it('les trie par ordre alphabétique', () => {
    const libelles = DISCIPLINES.map((d) => d.libelle);
    expect(libelles).toEqual([...libelles].sort((a, b) => a.localeCompare(b, 'fr')));
  });
});
