// @vitest-environment happy-dom
/**
 * Tests d'intégration de l'assistant pas-à-pas.
 *
 * Le référentiel Supabase est simulé (aucun appel réseau) : on vérifie le
 * parcours, la barre de progression, les boutons à bascule, l'adaptation des
 * exemples à la discipline choisie, et la décision restituée par le moteur.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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

beforeAll(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entree: unknown, init?: { body?: string }) => {
      const url = String(entree);
      const corps = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};

      if (url.includes('rechercher_ccam')) return reponseJson([ACTES['ZZQL002']]);
      if (url.includes('acte_ccam')) return reponseJson([ACTES[String(corps['p_code'])]]);
      if (url.includes('rechercher_medicaments')) {
        // Le référentiel ne sait pas chercher par CIS : une sélection doit
        // s'appuyer sur l'objet déjà renvoyé par la recherche textuelle.
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
const suivantActif = (): boolean =>
  document.querySelector<HTMLButtonElement>('[data-action="avancer"]')?.disabled === false;

function repondre(valeur: 'oui' | 'non'): void {
  cliquer(`.btn-oui-non[data-valeur="${valeur}"]`);
}

function suivant(): void {
  cliquer('[data-action="avancer"]');
}

function avancerAvecReponse(valeur: 'oui' | 'non'): void {
  repondre(valeur);
  suivant();
}

function choisirDiscipline(valeur: string): void {
  cliquer(`[data-action="discipline"][data-valeur="${valeur}"]`);
}

/** Retour à l'écran d'accueil depuis n'importe quel état. */
function retourAccueil(): void {
  cliquer('.btn-entete[data-action="recommencer"]');
  expect(questionCourante()).toContain('discipline');
}

const attendre = (ms: number): Promise<void> =>
  new Promise((resoudre) => setTimeout(resoudre, ms));

async function choisirPremiereSuggestion(action: string): Promise<void> {
  cliquer(`#zone-suggestions [data-action="${action}"]`);
  await attendre(60);
}

/* ------------------------------------------------------------------ *
 * Écran d'accueil : discipline clinique (et non profil par métier)
 * ------------------------------------------------------------------ */

describe('Écran d’accueil — choix d’une discipline clinique', () => {
  it('demande une discipline et non un métier', () => {
    expect(questionCourante()).toContain('discipline');
    expect(questionCourante()).not.toContain('profil');
  });

  it('propose les disciplines cliniques, pas les professions', () => {
    const boutons = [...document.querySelectorAll('[data-action="discipline"]')];
    expect(boutons).toHaveLength(14);

    const valeurs = boutons.map((b) => (b as HTMLElement).dataset['valeur']);
    expect(valeurs).toContain('ENDOCRINOLOGIE');
    expect(valeurs).toContain('CARDIOLOGIE');
    expect(valeurs).toContain('PEDIATRIE');
    // Plus aucune entrée de type métier.
    expect(valeurs).not.toContain('MEDECIN');
    expect(valeurs).not.toContain('DIM_TIM');
    expect(valeurs).not.toContain('PHARMACIE');
  });

  it('n’impose pas le choix : la navigation reste possible sans discipline', () => {
    expect(suivantActif()).toBe(true);
  });

  it('affiche des exemples généraux tant qu’aucune discipline n’est choisie', () => {
    expect(texte('#aide')).toContain('Toutes disciplines');
  });

  it('adapte les cas affichés à la discipline sélectionnée', () => {
    choisirDiscipline('ENDOCRINOLOGIE');
    const aide = texte('#aide');
    expect(aide).toContain('Endocrinologie, diabétologie, nutrition');
    expect(aide).toContain('Relève du GHS');

    choisirDiscipline('PSYCHIATRIE');
    const aidePsy = texte('#aide');
    expect(aidePsy).toContain('Psychiatrie et addictologie');
    expect(aidePsy).toContain('Hors champ');
    expect(aidePsy).not.toBe(aide);
  });

  it('permet de désélectionner la discipline en re-cliquant', () => {
    choisirDiscipline('PSYCHIATRIE');
    expect(texte('#aide')).not.toContain('Psychiatrie et addictologie');
  });

  it('fait progresser la barre de progression', () => {
    const avant = document.getElementById('jauge')?.style.width ?? '0';
    suivant();
    const apres = document.getElementById('jauge')?.style.width ?? '0';
    expect(Number.parseFloat(apres)).toBeGreaterThan(Number.parseFloat(avant));
  });

  it('bloque désormais la navigation tant que la question n’est pas répondue', () => {
    // Étape « identification » : la saisie doit être complète.
    expect(questionCourante()).toContain('séjour');
    expect(suivantActif()).toBe(true); // pré-rempli

    suivant();
    expect(questionCourante()).toContain('séance de dialyse');
    expect(suivantActif()).toBe(false);
    repondre('oui');
    expect(suivantActif()).toBe(true);
    repondre('non');
    expect(suivantActif()).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Parcours complet
 * ------------------------------------------------------------------ */

describe('Assistant — parcours complet', () => {
  it('conduit un séjour pluridisciplinaire conforme jusqu’à VALIDE_GHS', async () => {
    retourAccueil();
    choisirDiscipline('ENDOCRINOLOGIE');
    suivant(); // identification
    suivant(); // champ d'application

    // Porte 0
    avancerAvecReponse('non'); // séance dialyse / chimiothérapie
    avancerAvecReponse('non'); // SMR / psychiatrie

    // Porte 1
    avancerAvecReponse('oui'); // programmation
    avancerAvecReponse('oui'); // lettre d'adressage
    avancerAvecReponse('oui'); // synthèse signée
    avancerAvecReponse('oui'); // lettre de liaison

    // Porte 2/3 — actes
    await attendre(0);
    const champActe = document.querySelector<HTMLInputElement>('#champ-recherche');
    if (champActe) {
      champActe.value = 'exploration';
      champActe.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await attendre(420);
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
    await attendre(420);
    await choisirPremiereSuggestion('suggestion-medicament');
    expect(document.querySelectorAll('[data-action="retirer-medicament"]')).toHaveLength(1);
    expect(texte('.element-meta')).toContain('CIS 68201234');
    expect(
      document
        .querySelector('[data-action="med-reserve"][data-valeur="true"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    suivant();

    // Porte 3 — intervenants
    cliquer('[data-action="ajouter-intervenant"]');
    cliquer('[data-action="profession"][data-valeur="0:MEDECIN"]');
    const specialite = document.querySelector<HTMLInputElement>('[data-champ="specialite-0"]');
    if (specialite) {
      specialite.value = 'Endocrinologie';
      specialite.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const atelier = document.querySelector<HTMLInputElement>('[data-champ="atelier-0"]');
    if (atelier) {
      atelier.value = 'Consultation de bilan';
      atelier.dispatchEvent(new Event('input', { bubbles: true }));
    }
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

    // Garde-fou de nommage : `.marque` désigne l'en-tête, `.marqueur` la pyramide.
    // Leur collision cassait la mise en page responsive.
    expect(document.querySelectorAll('.pyramide .marqueur')).toHaveLength(5);
    expect(document.querySelector('.pyramide .marque')).toBeNull();
    expect(document.querySelector('header .marque')).not.toBeNull();
  });

  it('conserve les exemples de la discipline jusqu’au résultat', () => {
    expect(texte('#aide')).toContain('Endocrinologie, diabétologie, nutrition');
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
  function preparer(discipline: string): void {
    retourAccueil();
    choisirDiscipline(discipline);
    suivant(); // identification
    suivant(); // champ d'application
  }

  it('une séance de chimiothérapie mène directement à REJET_VERS_FORFAIT_SEANCE', () => {
    preparer('ONCOLOGIE');
    repondre('oui');
    suivant();
    expect(texte('.statut')).toBe('REJET_VERS_FORFAIT_SEANCE');
    expect(texte('#carte')).toContain('forfait de séance');
  });

  it('le SMR mène directement à REJET_HORS_MCO', () => {
    preparer('NEPHROLOGIE');
    repondre('non');
    suivant();
    repondre('oui');
    suivant();
    expect(texte('.statut')).toBe('REJET_HORS_MCO');
  });

  it('affiche le verdict provisoire dans l’en-tête', () => {
    preparer('CARDIOLOGIE');
    repondre('non');
    const voyant = document.getElementById('voyant-verdict');
    expect(voyant?.className).toContain('verdict');
    expect(voyant?.textContent).toContain('REJET');
  });
});

/* ------------------------------------------------------------------ *
 * Volet d'aide
 * ------------------------------------------------------------------ */

describe('Volet d’aide', () => {
  it('est repliable (utile sur téléphone) et se déplie au clic', () => {
    retourAccueil();
    const aide = document.getElementById('aide');
    expect(aide?.className).not.toContain('ouvert');

    cliquer('[data-action="basculer-aide"]');
    expect(aide?.className).toContain('ouvert');

    cliquer('[data-action="basculer-aide"]');
    expect(aide?.className).not.toContain('ouvert');
  });

  it('signale l’état du référentiel dans l’en-tête', () => {
    expect(texte('#voyant-referentiel')).toMatch(/Référentiel/);
  });

  it('rappelle la règle applicable à chaque étape', () => {
    retourAccueil();
    choisirDiscipline('GASTRO');
    suivant(); // identification
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
    expect(texte('#aide')).toContain('Pourquoi cette question');
    expect(texte('#aide')).toContain('Règle applicable');
    expect(texte('#aide')).toContain('Annexe 4');
    expect(texte('#aide')).toContain('Cas typiques');
    expect(texte('#aide')).toContain('Gastro-entérologie et hépatologie');
  });
});
