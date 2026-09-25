/**
 * Thésaurus des synonymes de la recherche par mots-clés.
 *
 * Module **pur** : il reçoit le *contenu* du fichier `data/thesaurus-synonymes.csv`
 * (une chaîne), jamais le disque ni le réseau. Il est donc testable directement
 * (`tests/thesaurus.test.ts`) et **partagé** par les deux bouts de la recherche :
 *
 *   • l'**import** (`scripts/import-referentiels.mjs`) — qui alimente la colonne
 *     `mots_cles` des actes CCAM et la table `public.thesaurus_synonymes` ;
 *   • l'**application** (`src/ui/referentiels.ts`) — qui élargit la requête et affiche
 *     à l'usager les synonymes employés, y compris hors ligne (repli local).
 *
 * Une notion = un concept pivot ; ses termes sont synonymes entre eux. Un terme
 * normalisé n'appartient qu'à **une seule** notion : l'élargissement reste prévisible
 * (voir la règle dans `data/thesaurus-synonymes.csv`).
 *
 * ── Alignement avec Supabase ────────────────────────────────────────────────
 * `supabase/thesaurus.sql` rejoue la même normalisation et le même découpage en SQL
 * (fonction `public.normaliser_terme`), et sa liste de mots vides est celle de
 * `MOTS_VIDES` : la porte de contrôle des tests compare les deux fichiers pour que
 * l'application en ligne et le repli local ne divergent jamais.
 */

/** Domaines admis par la colonne `domaine` du thésaurus. */
export const DOMAINES = ['actes', 'medicaments', 'commun'];

/**
 * Mots vides : jamais interrogés seuls, sous peine qu'une requête (« prothèse **de**
 * hanche ») ramène tous les actes contenant « de ».
 *
 * ⚠️ Cette liste est **reprise telle quelle** dans `supabase/thesaurus.sql` (tableau
 * `mots_vides`) ; `tests/thesaurus.test.ts` vérifie que les deux restent identiques.
 */
export const MOTS_VIDES = [
  'au',
  'aux',
  'avec',
  'dans',
  'de',
  'des',
  'du',
  'elle',
  'en',
  'et',
  'la',
  'le',
  'les',
  'ou',
  'par',
  'pour',
  'sans',
  'sur',
  'un',
  'une',
];

const ENSEMBLE_MOTS_VIDES = new Set(MOTS_VIDES);

/**
 * Longueur à partir de laquelle un mot est réputé significatif par lui-même.
 *
 * En deçà, un mot n'est interrogé que s'il est **lui-même un terme du thésaurus** : sans
 * cette règle, « anti-TNF » se découperait en « anti » et « tnf », et « anti » ramènerait
 * tout ce qui contient ce mot (immunoglobuline anti-lymphocytaire, anti-inflammatoire…).
 *
 * ⚠️ Seuil repris tel quel dans `supabase/thesaurus.sql` (`thesaurus_saisie`).
 */
export const LONGUEUR_MOT_SIGNIFICATIF = 5;

/**
 * Forme normalisée d'un terme : minuscules, sans accent ni ligature, séparateurs
 * ramenés à une espace. C'est la clé de comparaison des deux côtés (JS et SQL).
 */
export function normaliserTerme(texte) {
  return String(texte ?? '')
    .replace(/[\u0153\u0152]/g, 'oe')
    .replace(/[\u00e6\u00c6]/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Un terme court et isolé est un **sigle** (IRM, ECG, AVC, TDM, PTH…) : on ne le cherche
 * que comme **mot entier**. Sans cette règle, « AIT » (accident ischémique transitoire)
 * serait reconnu dans « trai**t**ement » et indexerait des actes hors sujet.
 *
 * La longueur-seuil est **reprise à l'identique** dans `supabase/thesaurus.sql`
 * (fonction `public.thesaurus_contient`), sinon l'application en ligne et le repli local
 * ne chercheraient pas la même chose.
 */
export function estSigle(termeNormalise) {
  return termeNormalise.length <= 4 && !termeNormalise.includes(' ');
}

/** Vrai si `texteNormalise` porte le terme — mot entier pour un sigle, sinon inclusion. */
export function contientTerme(texteNormalise, termeNormalise) {
  if (estSigle(termeNormalise)) return ` ${texteNormalise} `.includes(` ${termeNormalise} `);
  return texteNormalise.includes(termeNormalise);
}

/**
 * Découpe une requête en mots interrogeables : normalisés, d'au moins deux
 * caractères, sans mots vides. Les codes CCAM (« DEQP003 ») en ressortent intacts.
 */
export function decouperRequete(terme) {
  return normaliserTerme(terme)
    .split(' ')
    .filter((mot) => mot.length >= 2 && !ENSEMBLE_MOTS_VIDES.has(mot));
}

/**
 * Lit le thésaurus (CSV `;`). Lignes vides et commentaires `#` ignorés ; en-tête
 * reconnue et sautée.
 *
 * Les incohérences **arrêtent** la lecture plutôt que de produire un thésaurus
 * silencieusement faux : nombre de colonnes, domaine inconnu, terme vide, ou terme
 * déjà rattaché à une autre notion.
 *
 * @param {string} contenu
 * @returns {EntreeThesaurus[]}
 */
export function lireThesaurus(contenu) {
  const entrees = [];
  const notionDuTerme = new Map();

  String(contenu)
    .split(/\r?\n/)
    .forEach((brute, index) => {
      const ligne = brute.trim();
      if (!ligne || ligne.startsWith('#')) return;
      if (/^notion;terme/i.test(ligne)) return;

      const cellules = ligne.split(';').map((cellule) => cellule.trim());
      if (cellules.length !== 5) {
        throw new Error(
          `thésaurus, ligne ${index + 1} : ${cellules.length} colonne(s) au lieu de 5 — « ${ligne} »`,
        );
      }
      const [notion, terme, type, domaine, source] = cellules;
      if (!notion || !terme) {
        throw new Error(`thésaurus, ligne ${index + 1} : notion ou terme vide — « ${ligne} »`);
      }
      if (!DOMAINES.includes(domaine)) {
        throw new Error(
          `thésaurus, ligne ${index + 1} : domaine « ${domaine} » inconnu ` +
            `(${DOMAINES.join(', ')})`,
        );
      }
      const termeNormalise = normaliserTerme(terme);
      if (!termeNormalise) {
        throw new Error(`thésaurus, ligne ${index + 1} : terme sans contenu utile — « ${terme} »`);
      }
      const dejaVu = notionDuTerme.get(termeNormalise);
      if (dejaVu && dejaVu.notion !== notion) {
        throw new Error(
          `thésaurus, ligne ${index + 1} : « ${terme} » est déjà rattaché à la notion ` +
            `« ${dejaVu.notion} » (ligne ${dejaVu.ligne}) — un terme n'appartient qu'à une notion`,
        );
      }
      if (dejaVu && dejaVu.notion === notion) {
        throw new Error(
          `thésaurus, ligne ${index + 1} : « ${terme} » est déjà présent dans la notion ` +
            `« ${notion} » (ligne ${dejaVu.ligne})`,
        );
      }

      const entree = {
        ligne: index + 1,
        notion,
        terme,
        terme_normalise: termeNormalise,
        type,
        domaine,
        source,
      };
      notionDuTerme.set(termeNormalise, entree);
      entrees.push(entree);
    });

  if (entrees.length === 0) {
    throw new Error('thésaurus vide : aucune entrée lue');
  }
  return entrees;
}

/**
 * Indexe les entrées et expose les trois usages de la recherche.
 *
 * @param {EntreeThesaurus[]} entrees
 * @returns {Thesaurus}
 */
export function construireThesaurus(entrees) {
  /** @type {Map<string, EntreeThesaurus[]>} */
  const parNotion = new Map();
  /** @type {Map<string, EntreeThesaurus>} */
  const parTerme = new Map();
  for (const entree of entrees) {
    if (!parNotion.has(entree.notion)) parNotion.set(entree.notion, []);
    parNotion.get(entree.notion).push(entree);
    parTerme.set(entree.terme_normalise, entree);
  }

  const domaineCompatible = (entree, domaine) =>
    !domaine || entree.domaine === 'commun' || entree.domaine === domaine;

  /**
   * Notions atteintes par une saisie.
   *
   * La saisie entière (sans mots vides) est toujours interrogée telle quelle ; ses mots
   * ne le sont que s'ils sont significatifs — assez longs, ou termes du thésaurus
   * eux-mêmes. « prothèse de hanche » interroge donc « prothese » et « hanche » (ce qui
   * fait remonter les vraies prothèses), « anti-TNF » n'interroge que « anti tnf ».
   */
  const notionsAtteintes = (terme, domaine) => {
    const phrase = normaliserTerme(terme);
    // Saisie reconnue comme une notion entière (« anti-TNF », « prothèse de hanche »,
    // « fer injectable ») : ses mots ne sont pas interrogés séparément, sinon
    // « prothèse » ou « injectable » ramèneraient tout ce qui les contient.
    const mots = parTerme.has(phrase)
      ? []
      : decouperRequete(terme).filter(
          (mot) => mot.length >= LONGUEUR_MOT_SIGNIFICATIF || parTerme.has(mot),
        );
    const requete = [phrase, ...mots].filter(
      (mot) => mot && !ENSEMBLE_MOTS_VIDES.has(mot),
    );
    const notions = new Set();
    for (const mot of requete) {
      const entree = parTerme.get(mot);
      if (entree && domaineCompatible(entree, domaine)) notions.add(entree.notion);
    }
    return { requete, notions };
  };

  return {
    entrees,
    notions: [...parNotion.keys()],
    /** Termes **normalisés** à interroger pour une saisie (requête + synonymes). */
    elargir(terme, domaine = null) {
      const { requete, notions } = notionsAtteintes(terme, domaine);
      const termes = new Set(requete);
      for (const notion of notions) {
        for (const entree of parNotion.get(notion) ?? []) {
          if (domaineCompatible(entree, domaine)) termes.add(entree.terme_normalise);
        }
      }
      return [...termes];
    },
    /**
     * Synonymes **lisibles** employés pour une saisie : tous les termes des notions
     * atteintes, sauf ceux déjà écrits par l'usager. Sert à l'affichage (« recherche
     * élargie à… ») et alimente les pastilles cliquables de l'application.
     */
    synonymesDe(terme, domaine = null) {
      const { requete, notions } = notionsAtteintes(terme, domaine);
      const dejaEcrits = new Set(requete);
      const vus = new Set();
      const resultats = [];
      for (const notion of notions) {
        for (const entree of parNotion.get(notion) ?? []) {
          if (!domaineCompatible(entree, domaine)) continue;
          if (dejaEcrits.has(entree.terme_normalise) || vus.has(entree.terme_normalise)) continue;
          vus.add(entree.terme_normalise);
          resultats.push({
            terme: entree.terme,
            terme_normalise: entree.terme_normalise,
            notion: entree.notion,
            type: entree.type,
            domaine: entree.domaine,
          });
        }
      }
      return resultats;
    },
    /**
     * Mots-clés **normalisés** à indexer pour un texte (libellé d'acte et libellés
     * d'arborescence) : la colonne `mots_cles` des actes CCAM. Un seul passage — les
     * termes ajoutés ne déclenchent pas de nouvelles notions, pour éviter l'emballement.
     */
    motsClesPour(texte, domaines = ['actes', 'commun']) {
      const cible = normaliserTerme(texte);
      const mots = new Set();
      for (const [notion, entreesNotion] of parNotion) {
        const declenche = entreesNotion.some((entree) => contientTerme(cible, entree.terme_normalise));
        if (!declenche) continue;
        for (const entree of entreesNotion) {
          if (domaines.includes(entree.domaine)) mots.add(entree.terme_normalise);
        }
      }
      return [...mots];
    },
    /** Lignes prêtes pour `public.thesaurus_synonymes` (aucune colonne en trop). */
    versLignesBase() {
      return entrees.map(({ notion, terme, terme_normalise, type, domaine, source }) => ({
        notion,
        terme,
        terme_normalise,
        type,
        domaine,
        source,
      }));
    },
  };
}

/** Thésaurus prêt à l'emploi depuis le contenu du fichier versionné. */
export function thesaurusDepuisCsv(contenu) {
  return construireThesaurus(lireThesaurus(contenu));
}
