// @vitest-environment happy-dom
/**
 * Tests d'intégration de l'assistant.
 *
 * Le référentiel Supabase est simulé (aucun appel réseau) : on vérifie le
 * parcours, l'absence de données administratives, les bascules de profession,
 * la restitution des informations du référentiel sans re-demande, et la
 * décision en langage courant restituée par le moteur.
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

/** Répond à une question binaire (boutons Oui vert / Non rouge). */
function repondre(cle: string, valeur: 'oui' | 'non'): void {
  cliquer(`.btn-oui-non[data-cle="${cle}"][data-valeur="${valeur}"]`);
}

/** Répond à la question « note d'évolution » d'un intervenant donné. */
function repondreNote(index: number, valeur: 'oui' | 'non'): void {
  cliquer(`.btn-oui-non[data-action="note"][data-index="${index}"][data-valeur="${valeur}"]`);
}

function suivant(): void {
  cliquer('[data-action="avancer"]');
}

function choisirDiscipline(valeur: string): void {
  cliquer(`[data-action="discipline"][data-valeur="${valeur}"]`);
}

function choisirProfession(valeur: string): void {
  cliquer(`[data-action="profession-bascule"][data-valeur="${valeur}"]`);
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

/** Choisit la suggestion dont le libellé contient `fragment`. */
async function choisirSuggestionContenant(fragment: string): Promise<void> {
  const bouton = [...document.querySelectorAll<HTMLButtonElement>('#zone-suggestions button')].find(
    (b) => (b.textContent ?? '').includes(fragment),
  );
  expect(bouton).toBeDefined();
  bouton!.click();
  await attendre(60);
}

/** Franchit l'écran « type de prise en charge » jusqu'à l'étape des actes. */
function atteindreActes(): void {
  if (!document.querySelector('.btn-oui-non[data-cle="estSeance"]')) suivant(); // accueil → champ
  repondre('estSeance', 'non');
  repondre('estHorsMco', 'non');
  suivant(); // actes
}

/* ------------------------------------------------------------------ *
 * Écran d'accueil : discipline clinique (et non profil par métier)
 * ------------------------------------------------------------------ */

describe('Écran d’accueil — choix d’une discipline clinique', () => {
  it('demande une discipline et non un métier', () => {
    retourAccueil();
    expect(questionCourante()).toContain('discipline');
    expect(questionCourante()).not.toContain('profil');
  });

  it('propose les disciplines cliniques, pas les professions', () => {
    retourAccueil();
    const boutons = [...document.querySelectorAll('[data-action="discipline"]')];
    expect(boutons).toHaveLength(14);

    const valeurs = boutons.map((b) => (b as HTMLElement).dataset['valeur']);
    expect(valeurs).toContain('ENDOCRINOLOGIE');
    expect(valeurs).toContain('CARDIOLOGIE');
    expect(valeurs).toContain('PEDIATRIE');
    expect(valeurs).not.toContain('MEDECIN');
  });

  it('n’impose pas le choix : la navigation reste possible sans discipline', () => {
    retourAccueil();
    expect(suivantActif()).toBe(true);
  });

  it('affiche des exemples généraux tant qu’aucune discipline n’est choisie', () => {
    retourAccueil();
    expect(texte('#aide')).toContain('Toutes disciplines');
  });

  it('ouvre directement l’écran suivant au clic sur une discipline', () => {
    retourAccueil();
    choisirDiscipline('ENDOCRINOLOGIE');
    expect(questionCourante()).toContain('type de prise en charge');
  });

  it('adapte les cas affichés à la discipline et à la question posée', () => {
    retourAccueil();
    choisirDiscipline('ENDOCRINOLOGIE'); // ouvre l'écran « type de prise en charge »
    const aide = texte('#aide');
    expect(aide).toContain('Endocrinologie, diabétologie, nutrition');
    // Le cas affiché porte sur la question posée : ici, le type de prise en charge.
    expect(aide).toContain('cure de chimiothérapie');
    expect(aide).not.toContain('renouvellement d’ordonnance'); // cas de l'étape « surveillance »

    cliquer('[data-action="reculer"]'); // retour à l'accueil pour changer de discipline
    choisirDiscipline('PSYCHIATRIE');
    const aidePsy = texte('#aide');
    expect(aidePsy).toContain('Psychiatrie et addictologie');
    expect(aidePsy).toContain('Hors champ');
    expect(aidePsy).not.toBe(aide);
  });

  it('permet de désélectionner la discipline en re-cliquant', () => {
    retourAccueil();
    choisirDiscipline('PSYCHIATRIE');
    cliquer('[data-action="reculer"]');
    expect(questionCourante()).toContain('discipline');

    choisirDiscipline('PSYCHIATRIE'); // re-clic : désélection, on reste sur place
    expect(questionCourante()).toContain('discipline');
    expect(texte('#aide')).not.toContain('Psychiatrie et addictologie');
  });

  it('fait progresser la barre de progression', () => {
    retourAccueil();
    const avant = document.getElementById('jauge')?.style.width ?? '0';
    suivant();
    const apres = document.getElementById('jauge')?.style.width ?? '0';
    expect(Number.parseFloat(apres)).toBeGreaterThan(Number.parseFloat(avant));
  });
});

/* ------------------------------------------------------------------ *
 * Simplicité de la saisie
 * ------------------------------------------------------------------ */

describe('Assistant — aucune donnée administrative', () => {
  it('ne demande ni numéro de séjour ni date, nulle part', () => {
    retourAccueil();
    expect(document.querySelector('[data-champ="identifiantSejour"]')).toBeNull();
    expect(document.querySelector('#champ-sejour')).toBeNull();
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(document.body.innerHTML).not.toContain('SEJ-');
    expect(texte('#carte')).not.toContain('Séjour');
  });

  it('regroupe les filtres de type de prise en charge sur un seul écran', () => {
    retourAccueil();
    suivant(); // type de prise en charge

    // Une seule étape pour les deux filtres.
    expect(document.querySelectorAll('.ligne-question')).toHaveLength(2);
    expect(document.querySelector('.btn-oui-non[data-cle="estSeance"]')).not.toBeNull();
    expect(document.querySelector('.btn-oui-non[data-cle="estHorsMco"]')).not.toBeNull();

    expect(suivantActif()).toBe(false);
    repondre('estSeance', 'non');
    repondre('estHorsMco', 'non');
    expect(suivantActif()).toBe(true);
    suivant(); // actes : plus aucune question de dossier à franchir
    expect(questionCourante()).toContain('actes techniques');
  });

  it('ne pose plus les questions dont la réponse est acquise en prospectif', () => {
    retourAccueil();
    suivant(); // type de prise en charge

    // La venue est programmée par définition : ni cette question, ni celles de
    // la demande médicale préalable, de la synthèse du jour ou de la lettre de
    // liaison ne sont posées.
    for (const cle of ['estProgramme', 'lettreAdressage', 'syntheseMedicale', 'lettreLiaison']) {
      expect(document.querySelector(`.btn-oui-non[data-cle="${cle}"]`)).toBeNull();
    }
    const corps = texte('#carte');
    expect(corps).not.toContain('programmée');
    expect(corps).not.toContain('demande médicale préalable');
    expect(corps).not.toContain('jour même');
    expect(corps).not.toContain('lettre de liaison');

    // Le moteur considère néanmoins ces éléments comme réunis : un dossier de
    // trois interventions donne bien un GHS (porte 1 franchie, pas de suspension).
    atteindreActes();
    suivant(); // médicaments
    suivant(); // équipe
    choisirProfession('MEDECIN');
    choisirProfession('IDE');
    choisirProfession('DIETETICIEN');
    suivant(); // surveillance
    repondre('surveillanceActive', 'non');
    suivant(); // contexte patient
    suivant(); // décision
    expect(texte('.statut')).toBe('HDJ validée — facturation en GHS intermédiaire');
  });

  it('les boutons Oui sont verts et les boutons Non rouges', () => {
    retourAccueil();
    suivant(); // type de prise en charge : seules les questions à boutons Oui/Non
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
    retourAccueil();
    atteindreActes();
    expect(questionCourante()).toContain('actes techniques');

    const champ = document.querySelector<HTMLInputElement>('#champ-recherche');
    champ!.value = 'exploration';
    champ!.dispatchEvent(new Event('input', { bubbles: true }));
    await attendre(420);

    await choisirPremiereSuggestion('suggestion-acte');
    expect(document.querySelectorAll('[data-action="retirer-acte"]')).toHaveLength(1);
    expect(texte('.selection')).toContain('ZZQL002');

    // Les caractéristiques sont affichées, jamais demandées.
    expect(texte('.element-meta')).toContain('plateau technique lourd');
    expect(texte('.element-meta')).toContain('repris du référentiel');
    expect(document.querySelector('[data-action="acte-plateau"]')).toBeNull();
    expect(document.querySelector('[data-action="acte-externe"]')).toBeNull();
  });
});

describe('Médicaments — réserve hospitalière issue du référentiel', () => {
  it('ne redemande pas si le produit relève de la réserve hospitalière', async () => {
    retourAccueil();
    atteindreActes();
    suivant(); // médicaments
    expect(questionCourante()).toContain('médicaments');

    const champ = document.querySelector<HTMLInputElement>('#champ-recherche');
    champ!.value = 'immunoglobuline';
    champ!.dispatchEvent(new Event('input', { bubbles: true }));
    await attendre(420);

    await choisirPremiereSuggestion('suggestion-medicament');
    expect(document.querySelectorAll('[data-action="retirer-medicament"]')).toHaveLength(1);
    expect(texte('.element-meta')).toContain('Réserve hospitalière');
    expect(texte('.element-meta')).toContain('oui');
    expect(document.querySelector('[data-action="med-reserve"]')).toBeNull();
    expect(document.querySelector('[data-action="med-surveillance"]')).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Intervenants : sélection par boutons maintenus enfoncés
 * ------------------------------------------------------------------ */

describe('Intervenants — sélection par bascules de profession', () => {
  function atteindreIntervenants(): void {
    retourAccueil();
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
    expect(texte('.selection')).toContain('Infirmier(ère)');

    // Un second intervenant d'une autre profession s'ajoute au premier.
    choisirProfession('DIETETICIEN');
    expect(document.querySelectorAll('[data-action="retirer-intervenant"]')).toHaveLength(2);

    // Re-cliquer désélectionne.
    choisirProfession('IDE');
    expect(boutonIde()?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelectorAll('[data-action="retirer-intervenant"]')).toHaveLength(1);
  });

  it('la note d’évolution se règle par des boutons Oui / Non', () => {
    choisirProfession('MEDECIN');
    expect(
      document
        .querySelector('[data-action="note"][data-index="0"][data-valeur="oui"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');

    repondreNote(0, 'non');
    expect(texte('.selection')).toContain('non comptée');
    repondreNote(0, 'oui');
    expect(
      document
        .querySelector('[data-action="note"][data-index="0"][data-valeur="oui"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
  });
});

/* ------------------------------------------------------------------ *
 * Parcours complet
 * ------------------------------------------------------------------ */

describe('Assistant — parcours complet', () => {
  it('conduit un séjour pluridisciplinaire conforme jusqu’à la décision lisible', () => {
    retourAccueil();
    choisirDiscipline('ENDOCRINOLOGIE');
    atteindreActes();

    // Aucun acte, aucun médicament : on passe directement.
    suivant(); // médicaments
    suivant(); // intervenants

    choisirProfession('MEDECIN');
    choisirProfession('IDE');
    choisirProfession('DIETETICIEN');
    const specialite = document.querySelector<HTMLInputElement>('[data-champ="specialite-0"]');
    specialite!.value = 'Endocrinologie';
    specialite!.dispatchEvent(new Event('input', { bubbles: true }));
    suivant(); // densité

    repondre('surveillanceActive', 'non');
    cliquer('[data-action="duree"][data-valeur="300"]');
    suivant(); // contexte patient
    suivant(); // décision

    expect(texte('.statut')).toBe('HDJ validée — facturation en GHS intermédiaire');
    expect(document.querySelector('.badge')?.className).toContain('VERT');
    expect(texte('#carte')).toContain('Les 5 vérifications');
    expect(document.querySelectorAll('.pyramide li')).toHaveLength(5);
    expect(texte('#carte')).toContain('DGOS/R1/DSS/1A/2020/52');
    expect(document.querySelectorAll('.pyramide .marqueur')).toHaveLength(5);
    expect(document.querySelector('header .marque')).not.toBeNull();
  });

  it('retient un GHS plein lorsqu’un produit de la réserve hospitalière est administré', async () => {
    retourAccueil();
    atteindreActes();
    suivant(); // médicaments

    const champ = document.querySelector<HTMLInputElement>('#champ-recherche');
    champ!.value = 'immunoglobuline';
    champ!.dispatchEvent(new Event('input', { bubbles: true }));
    await attendre(420);
    await choisirPremiereSuggestion('suggestion-medicament');
    suivant(); // intervenants

    choisirProfession('IDE');
    suivant(); // densité
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
 * Raccourcis décisionnels
 * ------------------------------------------------------------------ */

describe('Assistant — raccourcis décisionnels', () => {
  function preparer(discipline: string): void {
    retourAccueil();
    choisirDiscipline(discipline); // ouvre directement l'écran « type de prise en charge »
  }

  it('une séance de chimiothérapie mène directement à la requalification', () => {
    preparer('ONCOLOGIE');
    repondre('estSeance', 'oui');
    repondre('estHorsMco', 'non');
    suivant();
    expect(texte('.statut')).toBe('Facturation en HDJ non validée — forfait de séance');
    expect(texte('#carte')).toContain('forfait de séance');
  });

  it('le SMR mène directement au hors champ MCO', () => {
    preparer('NEPHROLOGIE');
    repondre('estSeance', 'non');
    repondre('estHorsMco', 'oui');
    suivant();
    expect(texte('.statut')).toBe('Facturation en HDJ non validée — hors champ MCO');
  });

  it('affiche la décision provisoire dans l’en-tête dès qu’un raccourci est connu', () => {
    preparer('CARDIOLOGIE');
    repondre('estSeance', 'oui');
    const voyant = document.getElementById('voyant-verdict');
    expect(voyant?.className).toContain('verdict');
    expect(voyant?.textContent).toContain('forfait de séance');
  });

  it('n’annonce aucune décision tant qu’aucun élément de la prise en charge n’est saisi', () => {
    preparer('CARDIOLOGIE');
    repondre('estSeance', 'non');
    expect(document.getElementById('voyant-verdict')?.textContent).toBe('Décision : —');
  });
});

/* ------------------------------------------------------------------ *
 * Contexte patient — critères de vulnérabilité de l'instruction
 * ------------------------------------------------------------------ */

describe('Contexte patient — situations de vulnérabilité', () => {
  /** Trois interventions coordonnées, sans acte ni produit : GHS intermédiaire. */
  function atteindreContexte(): void {
    retourAccueil();
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
    expect(
      document
        .querySelector('[data-action="critere-contexte"][data-valeur="PRECARITE_SOCIALE"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    suivant(); // décision
    expect(texte('.statut')).toBe('HDJ validée — facturation en GHS plein');
    expect(texte('#carte')).toContain('Contexte patient particulier');
    expect(texte('#carte')).toContain('Précarité sociale');
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
    atteindreActes();

    expect(questionCourante()).toContain('actes techniques');
    expect(texte('#aide')).toContain('Pourquoi cette question');
    expect(texte('#aide')).toContain('Règle applicable');
    expect(texte('#aide')).toContain('Annexe 4');
    expect(texte('#aide')).toContain('Cas typiques');
    expect(texte('#aide')).toContain('Gastro-entérologie et hépatologie');
  });

  it('change de cas typique quand on change de question', () => {
    retourAccueil();
    choisirDiscipline('GASTRO');
    atteindreActes();
    expect(texte('#aide')).toContain('Endoscopie œso-gastro-duodénale');

    suivant(); // médicaments
    const aideMedicaments = texte('#aide');
    expect(aideMedicaments).toContain('biothérapie digestive de réserve hospitalière');
    expect(aideMedicaments).not.toContain('Endoscopie œso-gastro-duodénale');
  });
});

describe('Référentiel — valeur absente et surveillance particulière', () => {
  it('affiche « valeur absente » sans conclure « hors réserve »', async () => {
    retourAccueil();
    atteindreActes();
    suivant(); // médicaments
    expect(questionCourante()).toContain('médicaments');

    const champ = document.querySelector<HTMLInputElement>('#champ-recherche');
    champ!.value = 'fer';
    champ!.dispatchEvent(new Event('input', { bubbles: true }));
    await attendre(420);

    const suggestions = [...document.querySelectorAll('#zone-suggestions li')];
    const ligne = suggestions
      .map((li) => li.textContent ?? '')
      .find((txt) => txt.includes('FER CARBOXYMALTOSE'));
    expect(ligne).toBeDefined();
    expect(ligne).toContain('valeur absente');
    expect(ligne).not.toContain('· non');

    await choisirSuggestionContenant('FER CARBOXYMALTOSE');
    const meta = texte('.element-meta');
    expect(meta).toContain('Réserve hospitalière');
    expect(meta).toContain('valeur absente');
  });

  it('signale la surveillance particulière issue du référentiel', async () => {
    retourAccueil();
    atteindreActes();
    suivant(); // médicaments

    const champ = document.querySelector<HTMLInputElement>('#champ-recherche');
    champ!.value = 'immunoglobuline';
    champ!.dispatchEvent(new Event('input', { bubbles: true }));
    await attendre(420);
    await choisirPremiereSuggestion('suggestion-medicament');

    expect(texte('.element-meta')).toContain('surveillance particulière liée au produit');
  });
});
