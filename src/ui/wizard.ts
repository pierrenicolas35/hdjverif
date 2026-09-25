/**
 * Assistant pas-à-pas (wizard) du moteur décisionnel HDJ.
 *
 * Principe : une saisie réduite au strict nécessaire au calcul de la
 * facturation. Aucune donnée administrative (ni numéro de séjour, ni date)
 * n'est demandée. Les caractéristiques des actes et des médicaments sont
 * reprises du référentiel : elles ne sont jamais redemandées à l'utilisateur.
 *
 * Trois entrées, depuis l'écran d'accueil :
 *   • **Calculer l'éligibilité d'une HDJ** — le parcours pas-à-pas, précédé d'un
 *     rappel des motifs qui échappent à l'hospitalisation de jour ; à l'étape
 *     « actes », la nomenclature CCAM se parcourt aussi par arborescence
 *     (thématique → sous-thème → actes) et chaque acte trouvé s'ajoute au dossier
 *     d'un clic, avant de poursuivre le questionnaire ;
 *   • **Référentiel des actes techniques (CCAM)** — interroger la base pour savoir si
 *     un acte peut valider une hospitalisation de jour (verdict de codage HDJ issu du
 *     Manuel des GHM, puis plateau technique lourd et réalisation en externe de la CCAM
 *     en complément ; recherche par mots-clés ou par arborescence : thématique →
 *     sous-thème → actes) ;
 *   • **Médicaments de la réserve hospitalière** — recherche par nom ou DCI.
 *
 * L'UI ne décide rien : chaque réponse alimente `EtatAssistant`, converti en
 * `DossierHDJ` puis soumis à `evaluerDossier`.
 */

import {
  CRITERES_CONTEXTE_PATIENT,
  PROFESSIONS,
  evaluerDossier,
} from '../core/rules-engine/index.js';
import type {
  CritereContextePatient,
  DossierHDJ,
  Profession,
  ResultatAudit,
} from '../core/rules-engine/index.js';
import { contenuFiche, imprimerFiche, telechargerFiche } from './fiche.js';
import {
  AIDE_ETAPES,
  AIDE_PAR_DEFAUT,
  DISCIPLINES,
  LIBELLES_DISCIPLINE,
  LIBELLES_NATURE,
  MOTIFS_HORS_CHAMP_HDJ,
  PEDAGOGIE_HORS_CHAMP,
  casPourEtape,
  type AideEtape,
  type Discipline,
} from './pedagogie.js';
import {
  acteChoisiDepuisReferentiel,
  acteChoisiManuel,
  etatInitial,
  intervenantPourProfession,
  libelleBooleen,
  medicamentChoisiDepuisReferentiel,
  versDossier,
  LIBELLES_PROFESSION,
  type EtatAssistant,
} from './store.js';
import {
  acteParCode,
  actesParTheme,
  chapitresCcam,
  dernieresMaj,
  detailMaj,
  etatDuReferentiel,
  libelleEtatReferentiel,
  libelleMaj,
  rechercherActesCcam,
  rechercherMedicaments,
  sousChapitresCcam,
  verifierReferentiel,
  type ActeRef,
  type MajReferentiel,
  type MedicamentRef,
  type ThemeRef,
} from './referentiels.js';

/* ================================================================== *
 * Définition des étapes
 * ================================================================== */

interface Etape {
  readonly id: string;
  readonly domaine: string;
  readonly question: string;
}

const ETAPES: readonly Etape[] = [
  {
    id: 'actes',
    domaine: 'Actes techniques',
    question: 'Quels actes techniques sont prévus pendant la venue ?',
  },
  {
    id: 'medicaments',
    domaine: 'Médicaments',
    question: 'Quels médicaments sont prévus pendant la venue ?',
  },
  {
    id: 'intervenants',
    domaine: 'Équipe',
    question: 'Quels professionnels interviendront auprès du patient ?',
  },
  {
    id: 'densite',
    domaine: 'Surveillance et durée',
    question: 'Une surveillance particulière est-elle prévue pendant la venue ?',
  },
  {
    id: 'contexte',
    domaine: 'Contexte patient',
    question: 'Le patient présente-t-il une situation de vulnérabilité ?',
  },
  { id: 'resultat', domaine: 'Décision', question: 'Décision' },
];

/**
 * Étapes de saisie, dans l'ordre du parcours.
 *
 * Le champ est **MCO général par construction** : les séances forfaitisées et les
 * prises en charge hors MCO font l'objet du rappel affiché avant l'évaluation, et non
 * d'une question. L'outil est **prospectif** : les questions dont la réponse est
 * « oui » par construction (venue programmée, demande médicale préalable au dossier,
 * synthèse du jour, lettre de liaison) ne sont pas posées : voir `versDossier()`.
 */
const ETAPES_DENSITE: readonly string[] = [
  'actes',
  'medicaments',
  'intervenants',
  'densite',
  'contexte',
];

const INDEX = new Map(ETAPES.map((etape, i) => [etape.id, i]));

/**
 * Libellés courts des critères de contexte patient, pour les bascules de
 * l'écran de saisie. Les libellés opposables (énumération de l'instruction)
 * restent dans `LIBELLES_CONTEXTE_PATIENT`, utilisés par le moteur et la fiche.
 */
const LIBELLES_COURTS_CONTEXTE: Readonly<Record<CritereContextePatient, string>> = {
  AGE: 'Âge du patient',
  HANDICAP: 'Handicap',
  PATHOLOGIE_PSYCHIATRIQUE: 'Pathologie psychiatrique',
  ETAT_GRABATAIRE: 'État grabataire',
  ANTECEDENTS: 'Antécédents / échec en externe',
  PRECARITE_SOCIALE: 'Précarité sociale',
  DIFFICULTES_COOPERATION: 'Coopération difficile ou expression limitée',
  SUSPICION_MALTRAITANCE: 'Suspicion de maltraitance / protection',
  PRISE_EN_CHARGE_URGENCE: 'Venue en urgence, hors UHCD',
  AUTRE_SITUATION: 'Autre situation documentée',
};

/** Écrans de l'application : accueil, évaluation, consultation des référentiels. */
type Ecran = 'accueil' | 'evaluation' | 'ccam' | 'medicaments';

const CLE_AIDE_HORS_CHAMP = 'hdjverif.aide-hors-champ';

/* ================================================================== *
 * Outils de rendu
 * ================================================================== */

const esc = (valeur: string): string =>
  valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const presse = (actif: boolean): string =>
  actif ? ' aria-pressed="true"' : ' aria-pressed="false"';

/**
 * Paire de boutons Oui (vert) / Non (rouge).
 * `cible` porte l'action et l'index éventuel ; `cle` la question concernée.
 */
function boutonsOuiNon(
  cle: string,
  valeur: boolean | null,
  action = 'repondre',
  index = -1,
): string {
  const attributIndex = index >= 0 ? ` data-index="${index}"` : '';
  const commun = `type="button" class="btn-oui-non" data-action="${action}"${attributIndex} data-cle="${cle}"`;
  return `
    <div class="choix-binaire">
      <button ${commun} data-valeur="oui"${presse(valeur === true)}>
        <span class="glyphe" aria-hidden="true">✔</span>Oui
      </button>
      <button ${commun} data-valeur="non"${presse(valeur === false)}>
        <span class="glyphe" aria-hidden="true">✘</span>Non
      </button>
    </div>`;
}

/** Une ligne de question binaire : intitulé à gauche, boutons Oui/Non à droite. */
interface LigneBinaire {
  readonly cle: string;
  readonly titre: string;
  readonly precision?: string;
  readonly valeur: boolean | null;
}

function lignesBinaires(lignes: readonly LigneBinaire[]): string {
  return `<div class="lignes-questions">${lignes
    .map(
      (ligne) => `
      <div class="ligne-question">
        <div class="ligne-libelle">
          <span class="ligne-titre">${esc(ligne.titre)}</span>
          ${
            ligne.precision
              ? `<span class="ligne-precision">${esc(ligne.precision)}</span>`
              : ''
          }
        </div>
        ${boutonsOuiNon(ligne.cle, ligne.valeur)}
      </div>`,
    )
    .join('')}</div>`;
}

/** Boutons à bascule d'un choix exclusif parmi une liste. */
function basculesExclusives(
  action: string,
  valeurs: readonly { valeur: string; libelle: string; actif: boolean }[],
): string {
  return `<div class="bascule-grille">${valeurs
    .map(
      (item) =>
        `<button type="button" class="btn-bascule" data-action="${action}"
                 data-valeur="${esc(item.valeur)}"${presse(item.actif)}>${esc(item.libelle)}</button>`,
    )
    .join('')}</div>`;
}

/** Étiquette d'information issue du référentiel. */
function etiquette(valeur: boolean | null, libelleOui: string, libelleNon: string): string {
  if (valeur === null) {
    return (
      '<span class="etiquette-info inconnu" title="Valeur absente du référentiel : non ' +
      'déterminée, à confirmer par la pharmacie à usage intérieur. Une valeur absente n’est ' +
      'pas interprétée comme « hors réserve hospitalière ».">valeur absente</span>'
    );
  }
  return valeur
    ? `<span class="etiquette-info oui">${esc(libelleOui)}</span>`
    : `<span class="etiquette-info non">${esc(libelleNon)}</span>`;
}

function el<T extends HTMLElement>(id: string): T {
  const noeud = document.getElementById(id);
  if (!noeud) throw new Error(`Élément introuvable : #${id}`);
  return noeud as T;
}

/* ================================================================== *
 * Assistant
 * ================================================================== */

class Assistant {
  private etat: EtatAssistant = etatInitial();
  private ecran: Ecran = 'accueil';
  private etapeId = 'actes';
  private jetonRequete = 0;
  private minuteurRecherche: number | null = null;
  private termeRecherche = '';
  private suggestionsHtml = '';
  /** Objets complets du référentiel indexés par identifiant de suggestion. */
  private refsSuggerees = new Map<string, MedicamentRef | ActeRef>();
  private messageRecherche = '';
  private dernierDossier: DossierHDJ | null = null;
  private dernierResultat: ResultatAudit | null = null;
  /** Volet d'aide déplié (utile sur smartphone ; toujours ouvert sur PC). */
  private aideOuverte = true;
  /** Rappel « motifs hors champ » de l'écran d'accueil. */
  private modaleOuverte = false;

  /* --- arborescence CCAM --- */
  private chapitres: readonly ThemeRef[] | null = null;
  private sousChapitres: readonly ThemeRef[] | null = null;
  private chapitreActif: ThemeRef | null = null;
  private sousChapitreActif: ThemeRef | null = null;
  private actesTheme: readonly ActeRef[] | null = null;
  private chargementArbre = false;
  /**
   * Arborescence CCAM dépliée dans l'étape « actes » du questionnaire.
   *
   * Le même arbre que celui de la consultation est proposé pendant la saisie :
   * une fois l'acte trouvé, un bouton l'ajoute au dossier, puis le parcours
   * reprend (étape suivante). Il est replié par défaut pour ne pas alourdir la
   * saisie.
   */
  private arbreQuestionnaireOuvert = false;

  private readonly racine = el<HTMLElement>('carte');
  private readonly zoneAide = el<HTMLElement>('aide');
  private readonly modale = el<HTMLElement>('modale');
  private readonly jauge = el<HTMLElement>('jauge');
  private readonly texteProgression = el<HTMLElement>('progression-texte');
  private readonly voyantVerdict = el<HTMLElement>('voyant-verdict');
  private readonly voyantReferentiel = el<HTMLElement>('voyant-referentiel');
  private readonly boutonEntete = el<HTMLButtonElement>('bouton-entete');

  /** Dates de mise à jour des deux tables de référentiel (affichées dans l'en-tête). */
  private majReferentiels: readonly MajReferentiel[] | null = null;

  /* -------------------------------------------------- cycle de vie */

  demarrer(): void {
    document.body.addEventListener('click', this.gererClic);
    document.body.addEventListener('change', this.gererChangement);
    this.racine.addEventListener('input', this.gererSaisie);
    this.afficherEtatReferentiel();
    void verifierReferentiel().then(() => this.afficherEtatReferentiel());
    void dernieresMaj().then((majs) => {
      this.majReferentiels = majs;
      this.afficherEtatReferentiel();
    });
    this.rendre();
  }

  private afficherEtatReferentiel(): void {
    const etat = etatDuReferentiel();
    const maj = this.majReferentiels;
    const dates = maj ? libelleMaj(maj) : '';
    this.voyantReferentiel.className = `voyant ${etat === 'degrade' ? 'degrade' : ''}`;
    this.voyantReferentiel.title = maj ? detailMaj(maj) : '';
    this.voyantReferentiel.innerHTML =
      `<span class="point"></span>${esc(libelleEtatReferentiel())}` +
      (dates ? `<span class="voyant-maj">${esc(dates)}</span>` : '');
  }

  /* -------------------------------------------------- navigation */

  private get etape(): Etape {
    return ETAPES[INDEX.get(this.etapeId) ?? 0] ?? ETAPES[0]!;
  }

  /** Parcours de l'évaluation : les cinq questions puis la décision. */
  private parcours(): readonly string[] {
    return ETAPES_DENSITE;
  }

  private suivante(): string | null {
    if (this.etapeId === 'resultat') return null;
    const rang = this.parcours().indexOf(this.etapeId);
    if (rang === -1) return this.parcours()[0] ?? null;
    return this.parcours()[rang + 1] ?? 'resultat';
  }

  private precedente(): string | null {
    const parcours = this.parcours();
    const cible =
      this.etapeId === 'resultat' ? parcours.length - 1 : parcours.indexOf(this.etapeId) - 1;
    return parcours[cible] ?? null;
  }

  private saisieComplete(): boolean {
    switch (this.etapeId) {
      case 'densite':
        return this.etat.surveillanceActive !== null;
      default:
        return true;
    }
  }

  private avancer(): void {
    const cible = this.suivante();
    if (!cible) return;
    this.changerEtape(cible);
  }

  private reculer(): void {
    const cible = this.precedente();
    if (!cible) return;
    this.changerEtape(cible);
  }

  private changerEtape(id: string): void {
    this.etapeId = id;
    this.suggestionsHtml = '';
    this.refsSuggerees.clear();
    this.messageRecherche = '';
    this.termeRecherche = '';
    this.aideOuverte = true;
    this.rendre();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private changerEcran(ecran: Ecran): void {
    this.ecran = ecran;
    this.suggestionsHtml = '';
    this.refsSuggerees.clear();
    this.messageRecherche = '';
    this.termeRecherche = '';
    this.arbreQuestionnaireOuvert = false;
    this.chapitreActif = null;
    this.sousChapitreActif = null;
    this.sousChapitres = null;
    this.actesTheme = null;
    if (ecran === 'evaluation') this.etapeId = 'actes';
    this.rendre();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* -------------------------------------------------- rendu */

  private rendre(): void {
    this.rendreEntete();
    this.rendreAide();
    this.rendreModale();
    switch (this.ecran) {
      case 'accueil':
        this.rendreAccueil();
        break;
      case 'ccam':
        this.rendreConsultationActes();
        break;
      case 'medicaments':
        this.rendreConsultationMedicaments();
        break;
      default:
        if (this.etapeId === 'resultat') this.rendreResultat();
        else this.rendreQuestion();
    }
  }

  private rendreEntete(): void {
    // Barre de progression : n'a de sens que pendant l'évaluation.
    if (this.ecran === 'evaluation') {
      const parcours = this.parcours();
      const total = parcours.length;
      const ratio =
        this.etapeId === 'resultat'
          ? 1
          : Math.min(1, (parcours.indexOf(this.etapeId) + 1) / total);
      this.jauge.style.width = `${Math.round(ratio * 100)}%`;
      this.texteProgression.textContent =
        this.etapeId === 'resultat'
          ? 'Évaluation terminée'
          : `${Math.round(ratio * 100)} % — ${this.etape.domaine}`;
    } else {
      this.jauge.style.width = '0%';
      this.texteProgression.textContent =
        this.ecran === 'accueil'
          ? 'Accueil'
          : this.ecran === 'ccam'
            ? 'Référentiel CCAM — actes techniques'
            : 'Référentiel — réserve hospitalière';
    }

    this.boutonEntete.textContent =
      this.ecran === 'evaluation' ? '↺ Recommencer' : '⌂ Accueil';

    this.rendreVerdict(this.ecran === 'evaluation');
  }

  /* -------------------------------------------------- progression / verdict */

  private rendreVerdict(afficher: boolean): void {
    if (!afficher) {
      this.voyantVerdict.className = 'voyant verdict';
      this.voyantVerdict.textContent = 'Décision : —';
      return;
    }
    const e = this.etat;
    // La décision ne s'affiche qu'une fois un élément de la prise en charge saisi :
    // sans cela, l'en-tête annoncerait « non validée » devant un dossier encore vide.
    const densiteAmorcee =
      e.actes.length > 0 ||
      e.medicaments.length > 0 ||
      e.intervenants.length > 0 ||
      e.surveillanceActive === true ||
      e.contextePatient.length > 0;

    if (!densiteAmorcee) {
      this.voyantVerdict.className = 'voyant verdict';
      this.voyantVerdict.textContent = 'Décision : —';
      return;
    }
    const resultat = evaluerDossier(versDossier(this.etat));
    this.voyantVerdict.className = `voyant verdict ${resultat.severite}`;
    this.voyantVerdict.textContent = `${resultat.libelle_decision}`;
  }

  /* -------------------------------------------------- écran d'accueil */

  private rendreAccueil(): void {
    this.racine.innerHTML = `
      <span class="etape-numero">Accueil</span>
      <h2 class="question">Que voulez-vous faire ?</h2>
      <p class="sous-question">
        Vérifiez la gradation d’une hospitalisation de jour, ou consultez directement les
        référentiels qui la fondent.
      </p>

      <button type="button" class="btn-accueil principal" data-action="demarrer-evaluation">
        <span class="btn-accueil-icone" aria-hidden="true">🩺</span>
        <span class="btn-accueil-texte">
          <strong>Calculer l’éligibilité d’une HDJ</strong>
          <span>Actes, médicaments, équipe, surveillance et contexte patient : la décision est
            rendue en langage courant, avec sa justification réglementaire.</span>
        </span>
        <span class="btn-accueil-fleche" aria-hidden="true">→</span>
      </button>

      <div class="accueil-secondaires">
        <button type="button" class="btn-accueil" data-action="ouvrir-ccam">
          <span class="btn-accueil-icone" aria-hidden="true">🔎</span>
          <span class="btn-accueil-texte">
            <strong>Référentiel des actes techniques (CCAM)</strong>
            <span>Cet acte peut-il valider une hospitalisation de jour ? Verdict de codage HDJ,
              recherche par mots-clés, par code ou par thématique.</span>
          </span>
        </button>
        <button type="button" class="btn-accueil" data-action="ouvrir-medicaments">
          <span class="btn-accueil-icone" aria-hidden="true">💊</span>
          <span class="btn-accueil-texte">
            <strong>Médicaments de la réserve hospitalière</strong>
            <span>Un produit relève-t-il de la réserve hospitalière ? Recherche par nom ou par
              DCI.</span>
          </span>
        </button>
      </div>

      <p class="note-saisie">
        Outil d’aide à la décision : il ne se substitue ni à l’appréciation du médecin DIM, ni aux
        contrôles de l’Assurance Maladie.
      </p>`;
  }

  /* -------------------------------------------------- rappel hors champ */

  private rendreModale(): void {
    if (!this.modaleOuverte) {
      this.modale.className = 'modale';
      this.modale.innerHTML = '';
      return;
    }
    this.modale.className = 'modale ouvert';
    this.modale.innerHTML = `
      <div class="modale-voile" data-action="fermer-modale"></div>
      <div class="modale-carte" role="dialog" aria-modal="true" aria-labelledby="modale-titre">
        <span class="etape-numero">Avant de commencer</span>
        <h2 id="modale-titre" class="question">
          Trois motifs ne relèvent pas de l’hospitalisation de jour
        </h2>
        <p class="sous-question">
          Ces situations, <strong>quelle que soit la situation du patient</strong>, ne se
          facturent pas en GHS d’hospitalisation de jour MCO. Elles ne représentent qu’une part
          marginale des demandes : autant le dire d’emblée, plutôt qu’au terme d’un parcours.
        </p>
        <ul class="motifs-hors-champ">
          ${MOTIFS_HORS_CHAMP_HDJ.map(
            (motif) => `
            <li>
              <strong>${esc(motif.titre)}</strong>
              <p>${esc(motif.explication)}</p>
              <p class="reference">${esc(motif.reference)}</p>
            </li>`,
          ).join('')}
        </ul>
        <p class="pedagogie">${esc(PEDAGOGIE_HORS_CHAMP)}</p>
        <label class="case-afficher">
          <input type="checkbox" id="ne-plus-afficher" />
          <span>Ne plus afficher ce rappel</span>
        </label>
        <div class="actions">
          <button type="button" class="btn-action secondaire" data-action="fermer-modale">
            ← Retour à l’accueil
          </button>
          <button type="button" class="btn-action principal" data-action="demarrer-confirme">
            J’ai compris — évaluer l’éligibilité
          </button>
        </div>
      </div>`;
  }

  private lireAideHorsChamp(): boolean {
    try {
      return window.localStorage.getItem(CLE_AIDE_HORS_CHAMP) === '1';
    } catch {
      return false;
    }
  }

  private ecrireAideHorsChamp(valeur: boolean): void {
    try {
      if (valeur) window.localStorage.setItem(CLE_AIDE_HORS_CHAMP, '1');
      else window.localStorage.removeItem(CLE_AIDE_HORS_CHAMP);
    } catch {
      // Le stockage local indisponible ne doit pas empêcher l'évaluation.
    }
  }

  /* -------------------------------------------------- question courante */

  private rendreQuestion(): void {
    const parcours = this.parcours();
    const rang = parcours.indexOf(this.etapeId) + 1;
    const precedent = this.precedente();
    this.racine.innerHTML = `
      <span class="etape-numero">${esc(this.etape.domaine)}</span>
      <h2 class="question">${esc(this.etape.question)}</h2>
      <p class="sous-question">${this.sousQuestion()}</p>
      <div id="corps">${this.corps()}</div>
      <div class="navigation">
        <button type="button" class="btn-nav retour" data-action="reculer"${
          precedent ? '' : ' disabled'
        }>← Précédent</button>
        <span class="note-saisie">Étape ${rang} sur ${parcours.length}</span>
        <button type="button" class="btn-nav suivant" data-action="avancer"${
          this.saisieComplete() ? '' : ' disabled'
        }>Suivant →</button>
      </div>`;
  }

  private sousQuestion(): string {
    const textes: Record<string, string> = {
      actes:
        'Recherchez l’acte dans la nomenclature CCAM : sa fiche indique elle-même s’il mobilise un plateau technique ou s’il se réalise en externe. Vous pouvez aussi parcourir la nomenclature par thématique et ajouter l’acte d’un clic.',
      medicaments:
        'Recherchez le produit par son nom ou sa DCI : la fiche indique elle-même s’il s’agit d’un médicament de réserve hospitalière.',
      intervenants:
        'Cliquez sur les professionnels qui interviendront auprès du patient : le bouton reste enfoncé. Rien d’autre à saisir, les engagements de dossier sont rappelés sous la liste.',
      densite:
        'Une surveillance rapprochée prévue et tracée justifie à elle seule un GHS plein ; la durée de présence n’est qu’un point d’attention.',
      contexte:
        'Une situation de vulnérabilité retenue au dossier justifie à elle seule un GHS plein : le nombre d’interventions n’entre plus en compte.',
    };
    return textes[this.etapeId] ?? '';
  }

  private corps(): string {
    switch (this.etapeId) {
      case 'actes':
        return this.corpsActes();
      case 'medicaments':
        return this.corpsMedicaments();
      case 'intervenants':
        return this.corpsIntervenants();
      case 'densite':
        return this.corpsDensite();
      case 'contexte':
        return this.corpsContexte();
      default:
        return '';
    }
  }

  /* -------------------------------------------------- corps par étape */

  private corpsActes(): string {
    const elements = this.etat.actes.length
      ? this.etat.actes
          .map(
            (choisi, index) => `
          <div class="element">
            <div class="element-tete">
              <div>
                <strong>${esc(choisi.acte.code)} — ${esc(choisi.acte.libelle)}</strong>
                <div class="element-meta">
                  ${
                    choisi.issuReferentiel
                      ? `Référentiel CCAM · plateau technique lourd ${libelleBooleen(
                          choisi.reference?.necessite_plateau_lourd ?? null,
                          'oui',
                          'non',
                        )} · acte marqueur HDJ ${libelleBooleen(
                          choisi.reference?.acte_marqueur_hdj ?? null,
                          'oui',
                          'non',
                        )} — repris du référentiel`
                      : 'Acte saisi manuellement.'
                  }
                </div>
              </div>
              <button type="button" class="btn-retirer" data-action="retirer-acte"
                      data-index="${index}">Retirer</button>
            </div>
          </div>`,
          )
          .join('')
      : `<div class="vide">Aucun acte prévu.<br />Vous pouvez passer cette étape si la venue ne
         comporte aucun acte technique.</div>`;

    return `
      <div class="recherche">
        <input type="text" id="champ-recherche" data-recherche="actes" autocomplete="off"
               value="${esc(this.termeRecherche)}"
               placeholder="Code (DEQP003) ou mots-clés (endoscopie, échographie…)" />
        <span class="loupe" aria-hidden="true">🔍</span>
      </div>
      <div id="zone-suggestions">${this.rendreSuggestions()}</div>
      <div class="selection">${elements}</div>
      ${this.arbreQuestionnaire()}`;
  }

  /**
   * Arborescence CCAM proposée **dans l'étape « actes »** du questionnaire.
   *
   * Elle reprend l'arbre de la consultation (thématique → site anatomique → acte),
   * mais chaque acte porte un bouton qui l'ajoute directement au dossier, sans
   * quitter le parcours. Repliable pour ne pas alourdir la saisie.
   */
  private arbreQuestionnaire(): string {
    const ouvert = this.arbreQuestionnaireOuvert;
    return `
      <div class="arbre-questionnaire">
        <button type="button" class="bascule-arbre" data-action="basculer-arbre"
                aria-expanded="${ouvert ? 'true' : 'false'}">
          <span>Parcourir la nomenclature CCAM par thématique</span>
          <span aria-hidden="true">${ouvert ? '▲' : '▼'}</span>
        </button>
        ${
          ouvert
            ? `<div class="arbre" id="arbre-ccam">${this.rendreArbreActes()}</div>`
            : `<p class="note-saisie">Thématique → site anatomique → acte : ouvrez
               l’arborescence pour retrouver un acte par appareil, puis ajoutez-le au dossier
               d’un clic.</p>`
        }
      </div>`;
  }

  private corpsMedicaments(): string {
    const elements = this.etat.medicaments.length
      ? this.etat.medicaments
          .map(
            (choisi, index) => `
          <div class="element">
            <div class="element-tete">
              <div>
                <strong>${esc(choisi.medicament.libelle)}</strong>
                <div class="element-meta">
                  Réserve hospitalière : ${etiquette(
                    choisi.reference?.est_reserve_hospitaliere ?? null,
                    'oui',
                    'non',
                  )}${
                    choisi.reference?.surveillance_particuliere === true
                      ? ' · surveillance particulière liée au produit'
                      : ''
                  }${choisi.reference?.est_liste_en_sus === true ? ' · liste en sus' : ''}
                </div>
              </div>
              <button type="button" class="btn-retirer" data-action="retirer-medicament"
                      data-index="${index}">Retirer</button>
            </div>
          </div>`,
          )
          .join('')
      : `<div class="vide">Aucun médicament prévu.<br />Vous pouvez passer cette étape si la
         venue ne comporte aucun traitement.</div>`;

    return `
      <div class="recherche">
        <input type="text" id="champ-recherche" data-recherche="medicaments" autocomplete="off"
               value="${esc(this.termeRecherche)}"
               placeholder="Nom commercial ou DCI (immunoglobuline, infliximab…)" />
        <span class="loupe" aria-hidden="true">🔍</span>
      </div>
      <div id="zone-suggestions">${this.rendreSuggestions()}</div>
      <div class="selection">${elements}</div>`;
  }

  private rendreSuggestions(): string {
    if (this.messageRecherche) {
      return `<div class="etat-recherche">${esc(this.messageRecherche)}</div>`;
    }
    if (this.termeRecherche.trim().length >= 2 && !this.suggestionsHtml) {
      return '<div class="etat-recherche">Recherche en cours…</div>';
    }
    return this.suggestionsHtml ? `<ul class="suggestions">${this.suggestionsHtml}</ul>` : '';
  }

  /* -------------------------------------------------- intervenants */

  private professionPresente(profession: Profession): boolean {
    return this.etat.intervenants.some((i) => i.profession === profession);
  }

  private basculesProfessions(): string {
    return `<div class="bascule-grille">${PROFESSIONS.map(
      (profession) =>
        `<button type="button" class="btn-bascule" data-action="profession-bascule"
                 data-valeur="${profession}"${presse(this.professionPresente(profession))}>
           ${esc(LIBELLES_PROFESSION[profession])}
         </button>`,
    ).join('')}</div>`;
  }

  private corpsIntervenants(): string {
    const elements = this.etat.intervenants.length
      ? this.etat.intervenants
          .map(
            (intervenant, index) => `
          <div class="element">
            <div class="element-tete">
              <div>
                <strong>${esc(LIBELLES_PROFESSION[intervenant.profession])}</strong>
              </div>
              <button type="button" class="btn-retirer" data-action="retirer-intervenant"
                      data-index="${index}">Retirer</button>
            </div>
          </div>`,
          )
          .join('')
      : `<div class="vide">Aucun professionnel pour l’instant.<br />Cliquez sur les professionnels
         qui interviendront auprès du patient.</div>`;

    const medecins = this.etat.intervenants.filter((i) => i.profession === 'MEDECIN').length;

    return `
      <p class="consigne">Professionnels prévus auprès du patient</p>
      ${this.basculesProfessions()}
      ${
        medecins === 1
          ? `<button type="button" class="btn-bascule ajout-second"
                    data-action="ajouter-medecin">＋ Un second médecin (autre spécialité)</button>`
          : ''
      }
      <div class="selection">${elements}</div>
      ${this.rappelIntervenants(medecins)}`;
  }

  /**
   * Rappel des engagements attachés à l'équipe.
   *
   * Ces deux points sont réputés réunis dans une HDJ en cours de programmation et
   * ne sont donc pas interrogés : ils restent à tracer au dossier du patient, où
   * le contrôle T2A les vérifie (annexe 4, point 2.b.iii).
   */
  private rappelIntervenants(nbMedecins: number): string {
    return `
      <p class="note-saisie rappel-saisie">
        <strong>Rappel.</strong> La <strong>note d’évolution</strong> de chaque intervenant doit
        être rédigée dans le dossier du patient : elle est réputée présente. Sans elle,
        l’intervention n’est pas dénombrée en contrôle.
        ${
          nbMedecins >= 2
            ? ' Les interventions de deux professionnels médicaux ne sont dénombrées '
              + 'séparément que s’ils relèvent de <strong>deux spécialités ou '
              + 'surspécialités distinctes</strong> (annexe 4, point 2.b.iii) : à tracer au '
              + 'dossier du patient.'
            : ''
        }
      </p>`;
  }

  /* -------------------------------------------------- surveillance & durée */

  private corpsDensite(): string {
    const raccourcis = [60, 90, 120, 180, 240, 300, 360];
    const sousSeuil = this.etat.dureePresenceMinutes < 180;
    return `
      ${lignesBinaires([
        {
          cle: 'surveillanceActive',
          titre: 'Une surveillance rapprochée du patient est-elle prévue ?',
          precision:
            'Constantes, tolérance, surveillance rapprochée : à prévoir au dossier de soins.',
          valeur: this.etat.surveillanceActive,
        },
      ])}
      <p class="consigne">Durée de présence prévue</p>
      ${basculesExclusives(
        'duree',
        raccourcis.map((minutes) => ({
          valeur: String(minutes),
          libelle: minutes >= 120 ? `${minutes / 60} h` : `${minutes} min`,
          actif: this.etat.dureePresenceMinutes === minutes,
        })),
      )}
      <div class="grille-champs">
        <div>
          <label class="etiquette" for="champ-duree">Durée prévue de présence (minutes)</label>
          <input type="number" id="champ-duree" data-champ="dureePresenceMinutes" min="0"
                 max="1440" step="5" value="${this.etat.dureePresenceMinutes}" />
        </div>
      </div>
      <p class="note-saisie" style="margin-top:12px">
        ${
          sousSeuil
            ? '⚠️ Durée prévue inférieure à 3 heures : elle devra être justifiée lors du contrôle.'
            : 'Durée prévue conforme au repère de 3 heures utilisé en contrôle.'
        }
      </p>`;
  }

  /* -------------------------------------------------- contexte patient */

  /**
   * Situations de vulnérabilité du « contexte patient ».
   *
   * Énumération de l'instruction (annexe 4, point 2.b.iii) : une seule situation
   * suffit à justifier un GHS plein, quel que soit le nombre d'interventions.
   * Aucune sélection = pas de contexte patient particulier.
   */
  private corpsContexte(): string {
    const retenus = new Set<CritereContextePatient>(this.etat.contextePatient);
    return `
      <p class="consigne">Situations retenues au dossier</p>
      <div class="bascule-grille">
        ${CRITERES_CONTEXTE_PATIENT.map(
          (critere) => `
          <button type="button" class="btn-bascule" data-action="critere-contexte"
                  data-valeur="${critere}"${presse(retenus.has(critere))}>
            ${esc(LIBELLES_COURTS_CONTEXTE[critere])}
          </button>`,
        ).join('')}
      </div>
      <p class="note-saisie">
        ${
          retenus.size > 0
            ? `Une situation suffit : le GHS plein est retenu quel que soit le nombre
               d’interventions. Ces éléments doivent être tracés au dossier du patient.`
            : `Aucune situation particulière : c’est le nombre d’interventions qui déterminera le
               GHS (plein à partir de 4 interventions, intermédiaire à 3).`
        }
      </p>`;
  }

  /* ================================================================ *
   * Consultation du référentiel des actes techniques (CCAM)
   * ================================================================ */

  private rendreConsultationActes(): void {
    this.racine.innerHTML = `
      <span class="etape-numero">Référentiel CCAM</span>
      <h2 class="question">Cet acte peut-il valider une hospitalisation de jour ?</h2>
      <p class="sous-question">
        Interrogez la nomenclature par mots-clés ou par code, ou parcourez-la par thématique.
        Chaque fiche donne le <strong>verdict de codage HDJ</strong> issu du Manuel des GHM
        (acte classant, éligibilité, motif) et, en complément, les indicateurs de la
        nomenclature CCAM (plateau technique lourd, réalisation en externe). Rien n’est saisi.
      </p>
      <div class="recherche">
        <input type="text" id="champ-recherche" data-recherche="actes" autocomplete="off"
               value="${esc(this.termeRecherche)}"
               placeholder="Mots-clés ou code (scanner, fibro, IRM, perfusion, DEQP003…)" />
        <span class="loupe" aria-hidden="true">🔍</span>
      </div>
      <div id="zone-suggestions">${this.rendreResultatsActes()}</div>
      <div class="arbre" id="arbre-ccam">${this.rendreArbreActes()}</div>
      <div class="navigation">
        <button type="button" class="btn-nav retour" data-action="accueil">← Accueil</button>
      </div>`;
  }

  private rendreResultatsActes(): string {
    if (this.messageRecherche) {
      return `<div class="etat-recherche">${esc(this.messageRecherche)}</div>`;
    }
    if (this.termeRecherche.trim().length >= 2 && !this.suggestionsHtml) {
      return '<div class="etat-recherche">Recherche en cours…</div>';
    }
    if (!this.suggestionsHtml) return '';
    return `<ul class="resultats-actes">${this.suggestionsHtml}</ul>`;
  }

  private rendreArbreActes(): string {
    if (this.chargementArbre) {
      return '<div class="etat-recherche">Chargement de l’arborescence…</div>';
    }
    if (!this.chapitreActif) {
      const chapitres = this.chapitres ?? [];
      return `
        <p class="consigne">Parcourir par thématique</p>
        ${
          chapitres.length
            ? `<ul class="arbre-liste">${chapitres
                .map(
                  (chapitre) => `
                  <li>
                    <button type="button" data-action="chapitre-ccam"
                            data-valeur="${esc(chapitre.code)}">
                      <span class="arbre-code">${esc(chapitre.code)}</span>
                      <span class="arbre-libelle">${esc(chapitre.libelle)}</span>
                      <span class="arbre-compte">${chapitre.actes}</span>
                    </button>
                  </li>`,
                )
                .join('')}</ul>`
            : '<div class="etat-recherche">Arborescence indisponible pour l’instant.</div>'
        }`;
    }

    const fil = `
      <nav class="fil">
        <button type="button" data-action="arbre-racine">Thématiques</button>
        <span aria-hidden="true">›</span>
        ${
          this.sousChapitreActif
            ? `<button type="button" data-action="arbre-chapitre">${esc(
                this.chapitreActif.libelle,
              )}</button><span aria-hidden="true">›</span>
               <span class="fil-courant">${esc(this.sousChapitreActif.libelle)}</span>`
            : `<span class="fil-courant">${esc(this.chapitreActif.libelle)}</span>`
        }
      </nav>`;

    if (!this.sousChapitreActif) {
      const sousChapitres = this.sousChapitres ?? [];
      return `
        ${fil}
        <ul class="arbre-liste">
          ${sousChapitres
            .map(
              (sousChapitre) => `
              <li>
                <button type="button" data-action="sous-chapitre-ccam"
                        data-valeur="${esc(sousChapitre.code)}">
                  <span class="arbre-libelle">${esc(sousChapitre.libelle)}</span>
                  <span class="arbre-compte">${sousChapitre.actes}</span>
                </button>
              </li>`,
            )
            .join('')}
          <li>
            <button type="button" data-action="sous-chapitre-ccam" data-valeur=""
                    class="arbre-tous">
              <span class="arbre-libelle">Tous les actes de cette thématique</span>
              <span class="arbre-compte">${this.chapitreActif.actes}</span>
            </button>
          </li>
        </ul>`;
    }

    const actes = this.actesTheme ?? [];
    return `
      ${fil}
      <ul class="resultats-actes">${actes
        .map((acte) => this.ligneActe(acte, this.ecran === 'evaluation'))
        .join('')}</ul>`;
  }

  /**
   * Verdict d'éligibilité à l'HDJ d'un acte, tel que le référentiel le porte.
   *
   * Le verdict vient du croisement avec le Manuel des GHM et **ne dépend pas** du plateau
   * technique : un acte lourd peut ne pas valider une HDJ (une craniotomie exige une nuitée),
   * un acte léger peut la valider. L'écran ne doit donc pas confondre « soin lourd » et
   * « acte marqueur d'HDJ ».
   */
  private verdictHdj(acte: ActeRef): {
    readonly classe: 'hdj-oui' | 'hdj-sous-condition' | 'hdj-non';
    readonly titre: string;
    readonly explication: string;
  } {
    const motif = (acte.motif_eligibilite_hdj ?? '').replace(
      /^(oui|non|sous condition)\s*—\s*/i,
      '',
    );
    switch (acte.eligibilite_hdj) {
      case 'oui':
        return {
          classe: 'hdj-oui',
          titre: 'Éligible à une HDJ',
          explication: motif || 'l’acte peut valider un GHS d’hospitalisation de jour à lui seul.',
        };
      case 'sous condition':
        return {
          classe: 'hdj-sous-condition',
          titre: 'Éligible sous condition',
          explication: motif || 'la recevabilité dépend du diagnostic principal.',
        };
      case 'non':
        return {
          classe: 'hdj-non',
          titre: 'Non recevable en HDJ sur cet acte seul',
          explication: motif || 'l’acte n’ouvre pas de GHS d’hospitalisation de jour à lui seul.',
        };
      default:
        return {
          classe: 'hdj-non',
          titre: 'Éligibilité non renseignée',
          explication: 'le référentiel ne tranche pas pour cet acte.',
        };
    }
  }

  /** Indicateur du référentiel à trois états ; l'absence est nommée, jamais convertie en « non ». */
  private etatCourt(valeur: boolean | null | undefined): string {
    if (valeur === true) return 'oui';
    if (valeur === false) return 'non';
    return 'non renseigné';
  }

  /** Indicateur du référentiel à trois états, avec l'explication de l'absence en infobulle. */
  private drapeau(libelle: string, valeur: boolean | null | undefined): string {
    const etat = this.etatCourt(valeur);
    if (valeur === null || valeur === undefined) {
      return (
        `<span class="drapeau absent" title="Non renseigné par la nomenclature CCAM : l’acte ` +
        'n’appartient pas au jeu de données libéral. Une valeur absente n’est jamais interprétée ' +
        `comme « non ».">${libelle} : ${etat}</span>`
      );
    }
    return `<span class="drapeau">${libelle} : ${etat}</span>`;
  }

  /** Raccourci textuel du verdict d'éligibilité, pour les listes de suggestions. */
  private resumeEligibilite(acte: ActeRef): string {
    switch (acte.eligibilite_hdj) {
      case 'oui':
        return 'HDJ possible';
      case 'sous condition':
        return 'HDJ possible sous condition';
      case 'non':
        return 'HDJ non recevable sur cet acte seul';
      default:
        return 'éligibilité HDJ non renseignée';
    }
  }

  /** Ligne d'un acte CCAM : code, libellé et verdict d'éligibilité à l'HDJ. */
  private ligneActe(acte: ActeRef, avecAjout = false): string {
    const verdict = this.verdictHdj(acte);
    const dejaChoisi = this.etat.actes.some((a) => a.acte.code === acte.code);
    const action = avecAjout
      ? `<div class="acte-action">
          <button type="button" class="btn-ajouter-acte" data-action="suggestion-acte"
                  data-valeur="${esc(acte.code)}"${dejaChoisi ? ' disabled' : ''}>
            ${dejaChoisi ? '✓ Ajouté au dossier' : '＋ Ajouter au dossier'}
          </button>
        </div>`
      : '';
    return `
      <li class="acte-ligne ${verdict.classe}">
        <div class="acte-tete">
          <code>${esc(acte.code)}</code>
          <span class="acte-libelle">${esc(acte.libelle)}</span>
        </div>
        <p class="acte-verdict ${verdict.classe}">
          <strong>${esc(verdict.titre)}</strong> — ${esc(verdict.explication)}
        </p>
        <div class="acte-drapeaux">
          ${this.drapeau('Acte marqueur HDJ', acte.acte_marqueur_hdj)}
          ${this.drapeau('Plateau technique lourd', acte.necessite_plateau_lourd)}
          ${this.drapeau('Réalisable en externe', acte.exclusif_externe)}
        </div>
        ${action}
      </li>`;
  }

  /* ================================================================ *
   * Consultation du référentiel des médicaments
   * ================================================================ */

  private rendreConsultationMedicaments(): void {
    this.racine.innerHTML = `
      <span class="etape-numero">Réserve hospitalière</span>
      <h2 class="question">Ce médicament relève-t-il de la réserve hospitalière ?</h2>
      <p class="sous-question">
        Recherchez une spécialité par son nom commercial ou par sa DCI : le classement affiché
        provient du référentiel officiel (BDPM), il n’est jamais saisi.
      </p>
      <div class="recherche">
        <input type="text" id="champ-recherche" data-recherche="medicaments" autocomplete="off"
               value="${esc(this.termeRecherche)}"
               placeholder="Nom commercial ou DCI (immunoglobuline, infliximab…)" />
        <span class="loupe" aria-hidden="true">🔍</span>
      </div>
      <div id="zone-suggestions">${this.rendreResultatsMedicaments()}</div>
      <div class="navigation">
        <button type="button" class="btn-nav retour" data-action="accueil">← Accueil</button>
      </div>`;
  }

  private rendreResultatsMedicaments(): string {
    if (this.messageRecherche) {
      return `<div class="etat-recherche">${esc(this.messageRecherche)}</div>`;
    }
    if (this.termeRecherche.trim().length >= 2 && !this.suggestionsHtml) {
      return '<div class="etat-recherche">Recherche en cours…</div>';
    }
    if (!this.suggestionsHtml) {
      return '<div class="etat-recherche">Saisissez au moins deux caractères.</div>';
    }
    return `<ul class="resultats-actes">${this.suggestionsHtml}</ul>`;
  }

  /** Ligne d'un médicament : dénomination, DCI et classement au référentiel. */
  private ligneMedicament(medicament: MedicamentRef): string {
    return `
      <li class="acte-ligne ${medicament.est_reserve_hospitaliere === true ? 'lourd' : 'leger'}">
        <div class="acte-tete">
          <span class="acte-libelle">${esc(medicament.denomination)}</span>
        </div>
        <div class="acte-drapeaux">
          <span class="drapeau">${
            medicament.dci ? `DCI ${esc(medicament.dci)}` : 'DCI non renseignée'
          }</span>
          <span class="drapeau">Réserve hospitalière : ${etiquette(
            medicament.est_reserve_hospitaliere,
            'oui',
            'non',
          )}</span>
          ${
            medicament.surveillance_particuliere === true
              ? '<span class="drapeau">surveillance particulière liée au produit</span>'
              : ''
          }
          ${medicament.est_liste_en_sus === true ? '<span class="drapeau">liste en sus</span>' : ''}
        </div>
        <div class="acte-verdict">${
          medicament.est_reserve_hospitaliere === true
            ? 'Produit de la réserve hospitalière : motif suffisant pour une hospitalisation de jour'
            : medicament.est_reserve_hospitaliere === false
              ? 'Hors réserve hospitalière (source officielle)'
              : 'Valeur absente du référentiel : à confirmer par la pharmacie à usage intérieur'
        }</div>
      </li>`;
  }

  /* ================================================================ *
   * Volet d'aide
   * ================================================================ */

  private rendreAide(): void {
    const contenu =
      this.ecran === 'evaluation'
        ? this.aideEvaluation()
        : this.ecran === 'ccam'
          ? this.aideCcam()
          : this.ecran === 'medicaments'
            ? this.aideMedicaments()
            : this.aideAccueil();

    this.zoneAide.className = `aide${this.aideOuverte ? ' ouvert' : ''}`;
    this.zoneAide.innerHTML = `
      <button type="button" class="bascule-aide" data-action="basculer-aide"
              aria-expanded="${this.aideOuverte ? 'true' : 'false'}">
        <span>Aide &amp; exemples</span>
        <span aria-hidden="true">${this.aideOuverte ? '▲' : '▼'}</span>
      </button>
      <div class="aide-contenu">
        <h2>Aide &amp; exemples</h2>
        ${contenu}
      </div>`;
  }

  private aideAccueil(): string {
    return `
      <section>
        <h3>Trois entrées</h3>
        <p>
          Le <strong>calcul d’éligibilité</strong> déroule les cinq vérifications de
          l’instruction et rend une décision en langage courant. Les deux autres entrées
          interrogent directement les référentiels qui fondent cette décision.
        </p>
      </section>
      <section>
        <h3>Règle applicable</h3>
        <p class="regle">
          Instruction N° DGOS/R1/DSS/1A/2020/52 du 10 septembre 2020 — gradation des prises en
          charge ambulatoires : GHS d’hospitalisation de jour ou actes et consultations externes.
        </p>
      </section>`;
  }

  private aideCcam(): string {
    return `
      <section>
        <h3>Pourquoi cette question ?</h3>
        <p>
          Un acte technique isolé, réalisable en cabinet, ne justifie pas une hospitalisation.
          À l’inverse, un plateau technique lourd ou des actes coordonnés caractérisent la
          densité de la prise en charge.
        </p>
        <p>
          Le <strong>verdict affiché</strong> ne dit pas « soin lourd » : il dit si l’acte
          <strong>peut valider une hospitalisation de jour</strong>. Il vient du croisement avec
          le Manuel des GHM MCO (l’acte est-il classant ? une de ses racines de GHM admet-elle un
          séjour de 0 nuit ?). Le plateau technique lourd et la réalisation en externe, eux, sont
          repris de la nomenclature CCAM et n’ont d’incidence que sur la densité de la prise en
          charge, jamais sur l’éligibilité de l’acte.
        </p>
      </section>
      <section>
        <h3>Règle applicable</h3>
        <p class="regle">
          Annexe 4, points 2.b.i et 2.b.iii : acte classant → GHS plein ; deux actes CCAM de
          techniques différentes sont dénombrables ; l’ECG DEQP003 ne peut être dénombré.
          Manuel des GHM MCO 2025, annexes 2, 3, 8 et 11 : actes classants, racines de GHM et
          marqueur d’hospitalisation de jour.
        </p>
      </section>
      <section>
        <h3>Arborescence officielle</h3>
        <p>
          La nomenclature CCAM est organisée en <strong>19 chapitres par appareil</strong>, puis
          par site anatomique, action et technique. La navigation proposée reprend ces niveaux
          officiels.
        </p>
      </section>`;
  }

  private aideMedicaments(): string {
    return `
      <section>
        <h3>Pourquoi cette question ?</h3>
        <p>
          Certains produits ne peuvent être administrés qu’à l’hôpital. Leur administration est
          un motif suffisant de prise en charge en hôpital de jour, quel que soit le nombre
          d’interventions.
        </p>
      </section>
      <section>
        <h3>Règle applicable</h3>
        <p class="regle">
          Annexe 4, point 2.b.iii : la prise en charge justifie un GHS plein « soit parce que la
          prise en charge comporte l’administration de produits de la réserve hospitalière telle
          que définie à l’article R. 5121-82 du code de la santé publique ».
        </p>
      </section>
      <section>
        <h3>Valeur absente</h3>
        <p>
          Quand la source officielle est muette, la valeur reste « non déterminée » : elle n’est
          jamais interprétée comme « hors réserve hospitalière » et demande la confirmation de la
          pharmacie à usage intérieur.
        </p>
      </section>`;
  }

  private aideEvaluation(): string {
    const discipline = this.etat.discipline;
    const aide: AideEtape = AIDE_ETAPES[this.etapeId] ?? AIDE_PAR_DEFAUT;
    const casTypiques = casPourEtape(discipline, this.etapeId);
    const libelleDiscipline = discipline
      ? LIBELLES_DISCIPLINE[discipline]
      : 'Toutes disciplines (cas généraux)';

    return `
        <div class="choix-discipline">
          <label class="etiquette" for="select-discipline">Exemples illustrés pour</label>
          <select id="select-discipline" data-champ="discipline-aide">
            <option value=""${discipline ? '' : ' selected'}>
              Toutes disciplines (cas généraux)
            </option>
            ${DISCIPLINES.map(
              (d) =>
                `<option value="${d.id}"${discipline === d.id ? ' selected' : ''}>${esc(
                  d.libelle,
                )}</option>`,
            ).join('')}
          </select>
          <p class="note-aide">
            Le choix de la discipline ne change aucune règle : il ne fait qu’illustrer la
            question posée par des cas de votre domaine.
          </p>
        </div>

        <section>
          <h3>Pourquoi cette question ?</h3>
          <p>${esc(aide.pourquoi)}</p>
        </section>

        <section>
          <h3>Règle applicable</h3>
          <p class="regle">${esc(aide.regle)}</p>
        </section>

        <section>
          <h3>Cas typiques — ${esc(libelleDiscipline)}</h3>
          <ul class="exemples">
            ${casTypiques
              .map(
                (c) => `<li><span class="etiquette-info ${c.nature.toLowerCase()}">${esc(
                  LIBELLES_NATURE[c.nature],
                )}</span> ${esc(c.texte)}</li>`,
              )
              .join('')}
          </ul>
        </section>`;
  }

  /* -------------------------------------------------- résultat */

  private rendreResultat(): void {
    const dossier = versDossier(this.etat);
    const resultat = evaluerDossier(dossier);
    this.dernierDossier = dossier;
    this.dernierResultat = resultat;

    const mentions: Record<ResultatAudit['statut'], string> = {
      VALIDE_GHS:
        'Tout est réuni : la venue pourra être facturée en hospitalisation de jour.',
      SUSPENDU_POUR_REGULARISATION:
        'Pièce obligatoire manquante : à compléter avant la validation DIM.',
      REJET_VERS_ACE:
        'Ces soins relèvent des actes et consultations externes (ACE / CSO), pas de l’hospitalisation de jour.',
      REJET_VERS_FORFAIT_SEANCE:
        'Séance forfaitisée : facturation au forfait de séance, pas en GHS.',
      REJET_HORS_MCO:
        'Prise en charge en psychiatrie ou en SMR/SSR : financement propre, hors hospitalisation de jour.',
      REJET_NON_PROGRAMME:
        'Venue non programmée : la facturation en hospitalisation de jour est exclue.',
    };

    const piliers = resultat.piliers.length
      ? resultat.piliers
          .map(
            (pilier) => `
        <div class="pilier ${pilier.valide ? 'valide' : 'echec'}">
          <strong>${pilier.valide ? '✔' : '✘'} ${esc(pilier.libelle)}</strong>
          <ul>${pilier.justifications.map((j) => `<li>${esc(j)}</li>`).join('')}</ul>
        </div>`,
          )
          .join('')
      : '<p class="alerte-vide">Évaluation des piliers non atteinte (porte bloquante en amont).</p>';

    this.racine.innerHTML = `
      <div class="badge ${resultat.severite}">
        <div class="intitule">Décision</div>
        <div class="statut">${esc(resultat.libelle_decision)}</div>
        <div class="mention">${esc(mentions[resultat.statut])}</div>
      </div>

      <div class="bloc-resultat">
        <h3>Les 5 vérifications</h3>
        <ul class="pyramide">
          ${resultat.portes
            .map(
              (porte) =>
                `<li><span class="marqueur ${porte.statut}">${porte.statut}</span>` +
                `<span>${esc(porte.libelle)}</span></li>`,
            )
            .join('')}
        </ul>
      </div>

      <div class="bloc-resultat">
        <h3>Moyens mobilisés</h3>
        ${piliers}
      </div>

      <div class="bloc-resultat">
        <h3>Ce qui empêche la facturation en HDJ</h3>
        <ul class="liste">
          ${
            resultat.motifs_blocage.length
              ? resultat.motifs_blocage.map((m) => `<li>${esc(m)}</li>`).join('')
              : '<li style="list-style:none;color:var(--vert-ok)">Aucun motif de blocage.</li>'
          }
        </ul>
      </div>

      <div class="bloc-resultat">
        <h3>Points de vigilance en contrôle</h3>
        <ul class="liste">
          ${
            resultat.alertes_controle.length
              ? resultat.alertes_controle.map((a) => `<li>${esc(a)}</li>`).join('')
              : '<li style="list-style:none" class="alerte-vide">Aucun point de vigilance.</li>'
          }
        </ul>
      </div>

      <div class="bloc-resultat">
        <h3>Constats et références normatives</h3>
        ${resultat.constats
          .map(
            (c) =>
              `<div class="constat"><code>${esc(c.code)}</code> ${esc(c.message)}
               <span class="source">↳ ${esc(c.porte)} — ${esc(c.reference)}</span></div>`,
          )
          .join('')}
      </div>

      <div class="actions">
        <button type="button" class="btn-action principal" data-action="fiche-imprimer">
          🖨️ Fiche T2A (PDF)
        </button>
        <button type="button" class="btn-action secondaire" data-action="fiche-telecharger">
          💾 Télécharger la fiche
        </button>
        <button type="button" class="btn-action secondaire" data-action="fiche-copier">
          📋 Copier la synthèse
        </button>
        <button type="button" class="btn-action secondaire" data-action="recommencer">
          ↺ Nouvelle évaluation
        </button>
      </div>

      <div class="navigation">
        <button type="button" class="btn-nav retour" data-action="reculer">
          ← Modifier mes réponses
        </button>
      </div>`;
  }

  /* -------------------------------------------------- interactions */

  private gererClic = (evenement: MouseEvent): void => {
    const cible = (evenement.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!cible) return;
    const action = cible.dataset.action ?? '';
    const valeur = cible.dataset.valeur ?? '';
    const index = Number(cible.dataset.index ?? '-1');

    switch (action) {
      case 'accueil':
        this.changerEcran('accueil');
        break;
      case 'demarrer-evaluation':
        if (this.lireAideHorsChamp()) this.changerEcran('evaluation');
        else {
          this.modaleOuverte = true;
          this.rendreModale();
        }
        break;
      case 'demarrer-confirme': {
        const case_ = this.modale.querySelector<HTMLInputElement>('#ne-plus-afficher');
        if (case_?.checked) this.ecrireAideHorsChamp(true);
        this.modaleOuverte = false;
        this.changerEcran('evaluation');
        break;
      }
      case 'fermer-modale':
        this.modaleOuverte = false;
        this.rendreModale();
        break;
      case 'ouvrir-ccam':
        this.changerEcran('ccam');
        void this.chargerChapitres();
        break;
      case 'ouvrir-medicaments':
        this.changerEcran('medicaments');
        break;
      case 'chapitre-ccam': {
        const chapitre = (this.chapitres ?? []).find((c) => c.code === valeur);
        if (!chapitre) break;
        this.chapitreActif = chapitre;
        this.sousChapitreActif = null;
        this.actesTheme = null;
        this.sousChapitres = null;
        void this.chargerSousChapitres(valeur);
        break;
      }
      case 'sous-chapitre-ccam': {
        if (!this.chapitreActif) break;
        const sousChapitre = valeur
          ? (this.sousChapitres ?? []).find((s) => s.code === valeur) ?? null
          : null;
        this.sousChapitreActif = sousChapitre;
        void this.chargerActesTheme(this.chapitreActif.code, sousChapitre?.code ?? null);
        break;
      }
      case 'arbre-racine':
        this.chapitreActif = null;
        this.sousChapitreActif = null;
        this.sousChapitres = null;
        this.actesTheme = null;
        this.rendre();
        break;
      case 'arbre-chapitre':
        this.sousChapitreActif = null;
        this.actesTheme = null;
        this.rendre();
        break;
      case 'basculer-arbre':
        this.arbreQuestionnaireOuvert = !this.arbreQuestionnaireOuvert;
        this.rendre();
        if (this.arbreQuestionnaireOuvert && this.chapitres === null) {
          void this.chargerChapitres();
        }
        break;
      case 'avancer':
        this.avancer();
        break;
      case 'reculer':
        this.reculer();
        break;
      case 'basculer-aide':
        this.aideOuverte = !this.aideOuverte;
        this.rendreAide();
        break;
      case 'repondre':
        this.repondre(cible.dataset.cle ?? '', valeur === 'oui');
        break;
      case 'duree':
        this.etat.dureePresenceMinutes = Number(valeur);
        this.rendre();
        break;
      case 'critere-contexte': {
        const critere = valeur as CritereContextePatient;
        this.etat.contextePatient = this.etat.contextePatient.includes(critere)
          ? this.etat.contextePatient.filter((c) => c !== critere)
          : [...this.etat.contextePatient, critere];
        this.rendre();
        break;
      }
      case 'suggestion-acte':
        void this.ajouterActe(valeur);
        break;
      case 'suggestion-medicament':
        void this.ajouterMedicament(valeur);
        break;
      case 'retirer-acte':
        this.etat.actes.splice(index, 1);
        this.rendre();
        break;
      case 'retirer-medicament':
        this.etat.medicaments.splice(index, 1);
        this.rendre();
        break;
      case 'profession-bascule':
        this.basculerProfession(valeur as Profession);
        break;
      case 'ajouter-medecin':
        this.etat.intervenants.push(intervenantPourProfession('MEDECIN'));
        this.rendre();
        break;
      case 'retirer-intervenant':
        this.etat.intervenants.splice(index, 1);
        this.rendre();
        break;
      case 'fiche-imprimer':
        if (this.dernierDossier && this.dernierResultat) {
          imprimerFiche(this.dernierDossier, this.dernierResultat);
        }
        break;
      case 'fiche-telecharger':
        if (this.dernierDossier && this.dernierResultat) {
          telechargerFiche(this.dernierDossier, this.dernierResultat);
        }
        break;
      case 'fiche-copier':
        if (this.dernierDossier && this.dernierResultat) {
          void this.copierSynthese(cible, this.dernierDossier, this.dernierResultat);
        }
        break;
      case 'recommencer':
        this.etat = etatInitial();
        this.changerEcran('accueil');
        break;
      default:
        break;
    }
  };

  private gererChangement = (evenement: Event): void => {
    const cible = evenement.target as HTMLElement;
    if (cible?.dataset?.['champ'] === 'discipline-aide') {
      const valeur = (cible as HTMLSelectElement).value;
      this.etat.discipline = valeur ? (valeur as Discipline) : null;
      this.rendreAide();
    }
  };

  /** Bascule une profession : présente → retirée, absente → ajoutée. */
  private basculerProfession(profession: Profession): void {
    if (this.professionPresente(profession)) {
      this.etat.intervenants = this.etat.intervenants.filter(
        (i) => i.profession !== profession,
      );
    } else {
      this.etat.intervenants.push(intervenantPourProfession(profession));
    }
    this.rendre();
  }

  private gererSaisie = (evenement: Event): void => {
    const cible = evenement.target as HTMLElement;

    if (cible.dataset?.['champ'] === 'dureePresenceMinutes') {
      const nombre = Number((cible as HTMLInputElement).value);
      this.etat.dureePresenceMinutes = Number.isFinite(nombre) ? Math.max(0, nombre) : 0;
      this.rendreVerdict(true);
      return;
    }
    if (cible.dataset?.['recherche']) {
      this.planifierRecherche(cible.dataset['recherche'], (cible as HTMLInputElement).value);
    }
  };

  private repondre(cle: string, valeur: boolean): void {
    if (cle === 'surveillanceActive') this.etat.surveillanceActive = valeur;
    this.rendre();
  }

  /* -------------------------------------------------- recherche référentiel */

  private planifierRecherche(type: string, terme: string): void {
    this.termeRecherche = terme;
    if (this.minuteurRecherche !== null) window.clearTimeout(this.minuteurRecherche);

    if (terme.trim().length < 2) {
      this.suggestionsHtml = '';
      this.messageRecherche = '';
      this.rafraichirSuggestions();
      return;
    }

    this.messageRecherche = '';
    this.suggestionsHtml = '';
    this.rafraichirSuggestions();
    this.minuteurRecherche = window.setTimeout(() => {
      void this.executerRecherche(type, terme.trim());
    }, 280);
  }

  private async executerRecherche(type: string, terme: string): Promise<void> {
    const jeton = (this.jetonRequete += 1);
    const consultation = this.ecran !== 'evaluation';
    try {
      if (type === 'actes') {
        const resultats = await rechercherActesCcam(terme, consultation ? 30 : 12);
        if (jeton !== this.jetonRequete) return;
        this.refsSuggerees.clear();
        for (const acte of resultats) this.refsSuggerees.set(acte.code, acte);
        this.suggestionsHtml = consultation
          ? resultats.map((a) => this.ligneActe(a)).join('')
          : resultats
              .map(
                (a) => `<li><button type="button" data-action="suggestion-acte"
                data-valeur="${esc(a.code)}">
                <span class="titre-ligne">${esc(a.code)} — ${esc(a.libelle)}</span>
                <span class="detail-ligne">${esc(this.resumeEligibilite(a))} · plateau technique
                  lourd : ${this.etatCourt(a.necessite_plateau_lourd)} · réalisable en externe :
                  ${this.etatCourt(a.exclusif_externe)}</span>
              </button></li>`,
              )
              .join('');
        this.messageRecherche = resultats.length ? '' : 'Aucun acte trouvé pour cette recherche.';
      } else {
        const resultats = await rechercherMedicaments(terme, consultation ? 30 : 12);
        if (jeton !== this.jetonRequete) return;
        this.refsSuggerees.clear();
        for (const medicament of resultats) this.refsSuggerees.set(medicament.cis, medicament);
        this.suggestionsHtml = consultation
          ? resultats.map((m) => this.ligneMedicament(m)).join('')
          : resultats
              .map(
                (m) => `<li><button type="button" data-action="suggestion-medicament"
                data-valeur="${esc(m.cis)}">
                <span class="titre-ligne">${esc(m.denomination)}</span>
                <span class="detail-ligne">${m.dci ? `DCI ${esc(m.dci)} · ` : ''}réserve
                  hospitalière : ${libelleBooleen(
                    m.est_reserve_hospitaliere,
                    'oui',
                    'non',
                    'valeur absente',
                  )}${
                    m.surveillance_particuliere
                      ? ' · surveillance particulière liée au produit'
                      : ''
                  }</span>
              </button></li>`,
              )
              .join('');
        this.messageRecherche = resultats.length
          ? ''
          : 'Aucun médicament trouvé pour cette recherche.';
      }
    } catch {
      if (jeton !== this.jetonRequete) return;
      this.messageRecherche = 'Référentiel injoignable — réessayez dans un instant.';
      this.suggestionsHtml = '';
    }
    this.afficherEtatReferentiel();
    this.rafraichirSuggestions();
  }

  /** Met à jour la seule zone de suggestions : le champ de recherche garde le focus. */
  private rafraichirSuggestions(): void {
    const zone = this.racine.querySelector<HTMLElement>('#zone-suggestions');
    if (!zone) return;
    zone.innerHTML =
      this.ecran === 'ccam'
        ? this.rendreResultatsActes()
        : this.ecran === 'medicaments'
          ? this.rendreResultatsMedicaments()
          : this.rendreSuggestions();
  }

  /* -------------------------------------------------- arborescence CCAM */

  private async chargerChapitres(): Promise<void> {
    this.chargementArbre = true;
    this.rafraichirArbre();
    this.chapitres = await chapitresCcam();
    this.chargementArbre = false;
    this.afficherEtatReferentiel();
    this.rafraichirArbre();
  }

  private async chargerSousChapitres(chapitre: string): Promise<void> {
    this.chargementArbre = true;
    this.rafraichirArbre();
    this.sousChapitres = await sousChapitresCcam(chapitre);
    this.chargementArbre = false;
    this.afficherEtatReferentiel();
    this.rafraichirArbre();
  }

  private async chargerActesTheme(
    chapitre: string,
    sousChapitre: string | null,
  ): Promise<void> {
    this.chargementArbre = true;
    this.rafraichirArbre();
    this.actesTheme = await actesParTheme(chapitre, sousChapitre);
    this.chargementArbre = false;
    this.afficherEtatReferentiel();
    this.rafraichirArbre();
  }

  /** Redessine l'arbre sans toucher au champ de recherche. */
  private rafraichirArbre(): void {
    const zone = this.racine.querySelector<HTMLElement>('#arbre-ccam');
    if (zone) zone.innerHTML = this.rendreArbreActes();
  }

  private async ajouterActe(code: string): Promise<void> {
    if (this.etat.actes.some((a) => a.acte.code === code)) {
      this.signaler(`L’acte ${code} est déjà sélectionné.`);
      return;
    }
    const reference = this.acteConnu(code) ?? (await acteParCode(code));
    this.etat.actes.push(
      reference ? acteChoisiDepuisReferentiel(reference) : acteChoisiManuel(code, ''),
    );
    this.rendre();
  }

  /**
   * Acte déjà en mémoire : suggestion de recherche ou acte de l'arborescence
   * affiché à l'écran. Évite un aller-retour réseau quand l'acte vient de l'arbre.
   */
  private acteConnu(code: string): ActeRef | null {
    const suggere = this.refsSuggerees.get(code);
    if (suggere && 'libelle' in suggere) return suggere;
    return this.actesTheme?.find((acte) => acte.code === code) ?? null;
  }

  private async ajouterMedicament(cis: string): Promise<void> {
    if (this.etat.medicaments.some((m) => m.medicament.code_ucd === cis)) {
      this.signaler('Ce médicament est déjà sélectionné.');
      return;
    }
    const connue = this.refsSuggerees.get(cis);
    const reference =
      connue && 'denomination' in connue
        ? connue
        : (await rechercherMedicaments(cis, 1).catch(() => [] as readonly MedicamentRef[]))[0];
    if (!reference) {
      this.signaler('Médicament introuvable dans le référentiel.');
      return;
    }
    this.etat.medicaments.push(medicamentChoisiDepuisReferentiel(reference));
    this.rendre();
  }

  private signaler(message: string): void {
    this.messageRecherche = message;
    this.suggestionsHtml = '';
    this.rafraichirSuggestions();
  }

  private async copierSynthese(
    bouton: HTMLElement,
    dossier: DossierHDJ,
    resultat: ResultatAudit,
  ): Promise<void> {
    const texte = contenuFiche(dossier, resultat);
    const initial = bouton.textContent;
    try {
      await navigator.clipboard.writeText(texte);
      bouton.textContent = '✅ Synthèse copiée';
      window.setTimeout(() => {
        bouton.textContent = initial;
      }, 2400);
    } catch {
      window.prompt('Copiez la synthèse ci-dessous :', texte);
    }
  }
}

export function demarrerAssistant(): void {
  new Assistant().demarrer();
}
