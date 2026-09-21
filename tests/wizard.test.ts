// @vitest-environment happy-dom
/**
 * Tests d'intégration de l'assistant pas-à-pas.
 *
 * Le référentiel Supabase est simulé (aucun appel réseau) : on vérifie le
 * parcours, la barre de progression, les boutons à bascule et la décision
 * restituée par le moteur.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ *
 * Référentiel simulé
 * ------------------------------------------------------------------ */

const ACTES: Record<string, unknown> = {
  ZZQL002: {
    code: 'ZZQL002',
    libelle: 'exploration fonctionnelle métabolique',
    acte_marqueur_hdj: false,
    exclusif_externe: false,
    necessite_plateau_lourd: false,
  },
  DEQP003: {
    code: 'DEQP003',
    libelle: 'électrocardiographie sur au moins douze dérivations',
    acte_marqueur_hdj: false,
    exclusif_externe: true,
    necessite_plateau_lourd: false,
  },
};

const MEDICAMENTS: readonly Record<string, unknown>[] = [
  {
    cis: '68201234',
    denomination: 'IMMUNOGLOBULINE HUMAINE NORMALE 5 g, solution pour perfusion',
    dci: 'IMMUNOGLOBULINE HUMAINE NORMALE',
    est_reserve_hospitaliere: true,
    est_liste_en_sus: true,
    surveillance_renforcee: false,
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

let fetchSimule: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  fetchSimule = vi.fn(async (entree: unknown, init?: { body?: string }) => {
    const url = String(entree);
    const corps = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};

    if (url.includes('rechercher_ccam')) return reponseJson([ACTES['ZZQL002']]);
    if (url.includes('acte_ccam')) return reponseJson([ACTES[String(corps['p_code'])]]);
    if (url.includes('rechercher_medicaments')) return reponseJson(MEDICAMENTS);
    return reponseJson([]);
  });
  vi.stubGlobal('fetch', fetchSimule);

  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const corps = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? '';
  document.body.innerHTML = corps.replace(/<script[\s\S]*?<\/script>/gi, '');

  await import('../src/ui/main.ts');
});

afterAll(() => {
  vi.unstubAllGlobals();
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

/** Répond Oui ou Non à la question courante. */
function repondre(valeur: 'oui' | 'non'): void {
  cliquer(`.btn-oui-non[data-valeur="${valeur}"]`);
}

function suivant(): void {
  cliquer('[data-action="avancer"]');
}

/**
 * Revenir à l'écran d'accueil depuis n'importe quel état :
 * on remonte les questions puis on réinitialise.
 */
function retourAccueil(): void {
  // Le bouton « Recommencer » de l'en-tête est disponible depuis tout écran.
  cliquer('.btn-entete[data-action="recommencer"]');
  expect(questionCourante()).toContain('profil');
}

/** Choisit une discipline depuis l'écran d'accueil. */
function choisirDiscipline(valeur: string): void {
  cliquer(`[data-action="discipline"][data-valeur="${valeur}"]`);
}

/** Ajoute la première suggestion affichée (l'ajout est asynchrone). */
async function choisirPremiereSuggestion(action: string): Promise<void> {
  cliquer(`#zone-suggestions [data-action="${action}"]`);
  await attendre(60);
}

function avancerAvecReponse(valeur: 'oui' | 'non'): void {
  repondre(valeur);
  suivant();
}

const attendre = (ms: number): Promise<void> =>
  new Promise((resoudre) => setTimeout(resoudre, ms));

/* ------------------------------------------------------------------ *
 * Parcours
 * ------------------------------------------------------------------ */

describe('Assistant pas-à-pas — parcours complet', () => {
  it('démarre sur la question du profil', () => {
    expect(questionCourante()).toContain('profil');
    expect(document.querySelectorAll('[data-action="discipline"]')).toHaveLength(6);
  });

  it('bloque la navigation tant que la question n’est pas répondue', () => {
    const boutonSuivant = document.querySelector<HTMLButtonElement>('[data-action="avancer"]');
    expect(boutonSuivant?.disabled).toBe(true);
  });

  it('active le bouton après sélection et fait progresser la barre', () => {
    cliquer('[data-action="discipline"][data-valeur="DIM_TIM"]');
    const boutonSuivant = document.querySelector<HTMLButtonElement>('[data-action="avancer"]');
    expect(boutonSuivant?.disabled).toBe(false);

    const avant = document.getElementById('jauge')?.style.width;
    suivant();
    const apres = document.getElementById('jauge')?.style.width;
    expect(Number.parseFloat(apres ?? '0')).toBeGreaterThan(Number.parseFloat(avant ?? '0'));
  });

  it('affiche l’aide pédagogique adaptée à la discipline', () => {
    expect(texte('#aide')).toContain('DIM / TIM');
    expect(texte('#aide')).toContain('Pourquoi cette question');
    expect(texte('#aide')).toContain('Règle applicable');
  });

  it('conduit un séjour pluridisciplinaire conforme jusqu’à VALIDE_GHS', async () => {
    // Identification
    suivant();

    // Porte 0
    avancerAvecReponse('non'); // séance de dialyse / chimiothérapie
    avancerAvecReponse('non'); // SMR / psychiatrie

    // Porte 1
    avancerAvecReponse('oui'); // programmation
    avancerAvecReponse('oui'); // lettre d'adressage
    avancerAvecReponse('oui'); // synthèse signée
    avancerAvecReponse('oui'); // lettre de liaison

    // Porte 2/3 — actes
    const champActe = document.querySelector<HTMLInputElement>('#champ-recherche');
    expect(champActe).not.toBeNull();
    if (champActe) {
      champActe.value = 'exploration';
      champActe.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await attendre(450);
    expect(document.querySelectorAll('#zone-suggestions [data-action="suggestion-acte"]').length)
      .toBeGreaterThan(0);
    await choisirPremiereSuggestion('suggestion-acte');
    expect(document.querySelectorAll('[data-action="retirer-acte"]')).toHaveLength(1);
    expect(texte('.selection')).toContain('ZZQL002');
    suivant();

    // Porte 3 — médicament à réserve hospitalière
    const champMed = document.querySelector<HTMLInputElement>('#champ-recherche');
    if (champMed) {
      champMed.value = 'immunoglobuline';
      champMed.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await attendre(450);
    await choisirPremiereSuggestion('suggestion-medicament');
    expect(document.querySelectorAll('[data-action="retirer-medicament"]')).toHaveLength(1);
    expect(texte('.selection')).toContain('IMMUNOGLOBULINE');

    // La réserve hospitalière est reprise du référentiel et le bouton reste enfoncé.
    const boutonReserve = document.querySelector<HTMLElement>(
      '[data-action="med-reserve"][data-valeur="true"]',
    );
    expect(boutonReserve?.getAttribute('aria-pressed')).toBe('true');
    suivant();

    // Porte 3 — intervenants
    cliquer('[data-action="ajouter-intervenant"]');
    cliquer('[data-action="profession"][data-valeur="0:MEDECIN"]');
    const specialite = document.querySelector<HTMLInputElement>('[data-champ="specialite-0"]');
    if (specialite) {
      specialite.value = 'Endocrinologie';
      specialite.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const atelier0 = document.querySelector<HTMLInputElement>('[data-champ="atelier-0"]');
    if (atelier0) {
      atelier0.value = 'Consultation de bilan';
      atelier0.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Le bouton « Oui » de la note d'évolution doit s'enfoncer.
    cliquer('[data-action="note"][data-index="0"][data-valeur="true"]');
    expect(
      document
        .querySelector('[data-action="note"][data-index="0"][data-valeur="true"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    suivant();

    // Porte 3 — surveillance, puis durée
    avancerAvecReponse('oui');
    cliquer('[data-action="duree"][data-valeur="300"]');
    suivant();

    // Décision
    expect(texte('.statut')).toBe('VALIDE_GHS');
    expect(document.querySelector('.badge')?.className).toContain('VERT');
    expect(texte('#carte')).toContain('Pyramide des 5 portes');
    expect(document.querySelectorAll('.pyramide li')).toHaveLength(5);
    expect(texte('#carte')).toContain('DGOS/R1/DSS/1A/2020/52');
  });

  it('permet de revenir en arrière et de corriger une réponse', () => {
    expect(texte('.statut')).toBe('VALIDE_GHS'); // état laissé par le test précédent
    cliquer('[data-action="reculer"]');
    expect(questionCourante()).toContain('durée de présence');
    cliquer('[data-action="reculer"]');
    expect(questionCourante()).toContain('surveillance');
  });
});

/* ------------------------------------------------------------------ *
 * Raccourcis des portes 0
 * ------------------------------------------------------------------ */

describe('Assistant — raccourcis décisionnels', () => {
  beforeEach(() => {
    retourAccueil();
    expect(questionCourante()).toContain('profil');
    choisirDiscipline('PHARMACIE');
    suivant(); // identite
    suivant(); // champ_seance
  });

  it('un séance de chimiothérapie mène directement à REJET_VERS_FORFAIT_SEANCE', () => {
    repondre('oui');
    suivant();
    expect(texte('.statut')).toBe('REJET_VERS_FORFAIT_SEANCE');
    expect(texte('#carte')).toContain('forfait de séance');
  });

  it('le SMR mène directement à REJET_HORS_MCO', () => {
    repondre('non');
    suivant();
    repondre('oui');
    suivant();
    expect(texte('.statut')).toBe('REJET_HORS_MCO');
  });

  it('affiche le verdict provisoire dans l’en-tête', () => {
    repondre('non');
    const voyant = document.getElementById('voyant-verdict');
    expect(voyant?.className).toContain('verdict');
    expect(voyant?.textContent).toContain('REJET');
  });
});

/* ------------------------------------------------------------------ *
 * Volet pédagogique
 * ------------------------------------------------------------------ */

describe('Volet pédagogique', () => {
  it('propose des exemples différents selon la discipline', () => {
    retourAccueil();
    choisirDiscipline('PHARMACIE');
    suivant(); // identite : question « actes » non atteinte, on reste sur l'identification
    const aidePharmacie = texte('#aide');
    expect(aidePharmacie).toContain('Pharmacie à usage intérieur');

    cliquer('[data-action="reculer"]');
    choisirDiscipline('MEDECIN');
    const aideMedecin = texte('#aide');
    expect(aideMedecin).toContain('Médecin (prescripteur');
    expect(aideMedecin).not.toBe(aidePharmacie);
  });

  it('signale l’état du référentiel dans l’en-tête', () => {
    const voyant = document.getElementById('voyant-referentiel');
    expect(voyant?.textContent).toMatch(/Référentiel/);
  });

  it('adapte les exemples de la question « actes » à la discipline', () => {
    retourAccueil();
    choisirDiscipline('FACTURATION');
    suivant(); // identite
    suivant(); // champ_seance
    repondre('non');
    suivant(); // champ_hors_mco
    repondre('non');
    suivant(); // programmation
    repondre('oui');
    suivant(); // doc_adressage
    repondre('oui');
    suivant(); // doc_synthese
    repondre('oui');
    suivant(); // doc_liaison
    repondre('oui');
    suivant(); // actes

    expect(questionCourante()).toContain('acte(s) technique(s)');
    expect(texte('#aide')).toContain('acte isolé réalisable en externe se requalifie en ACE');
  });
});
