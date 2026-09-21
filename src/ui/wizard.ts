/**
 * Assistant pas-à-pas (wizard) du moteur décisionnel HDJ.
 *
 * Une question par écran, gros boutons Oui/Non, choix multiples par boutons à
 * bascule (maintenus enfoncés), barre de progression, et volet pédagogique
 * adapté à la discipline déclarée par l'utilisateur.
 *
 * L'UI ne décide rien : chaque réponse alimente `EtatAssistant`, converti en
 * `DossierHDJ` puis soumis à `evaluerDossier`.
 */

import { PROFESSIONS, evaluerDossier } from '../core/rules-engine/index.js';
import type { DossierHDJ, Profession, ResultatAudit } from '../core/rules-engine/index.js';
import { contenuFiche, imprimerFiche, telechargerFiche } from './fiche.js';
import {
  ACCROCHES_DISCIPLINE,
  AIDE_ETAPES,
  AIDE_PAR_DEFAUT,
  LIBELLES_DISCIPLINE,
  type AideEtape,
  type Discipline,
} from './pedagogie.js';
import {
  acteChoisiDepuisReferentiel,
  acteChoisiManuel,
  etatInitial,
  intervenantVide,
  libelleBooleen,
  medicamentChoisiDepuisReferentiel,
  versDossier,
  LIBELLES_PROFESSION,
  type EtatAssistant,
} from './store.js';
import {
  acteParCode,
  etatDuReferentiel,
  libelleEtatReferentiel,
  rechercherActesCcam,
  rechercherMedicaments,
  verifierReferentiel,
  type ActeRef,
  type MedicamentRef,
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
  { id: 'accueil', domaine: 'Bienvenue', question: 'Quel est votre profil ?' },
  { id: 'identite', domaine: 'Identification', question: 'Quel séjour évaluez-vous ?' },
  {
    id: 'champ_seance',
    domaine: 'Porte 0 — Champ d’application',
    question: 'S’agit-il d’une séance de dialyse ou de chimiothérapie ?',
  },
  {
    id: 'champ_hors_mco',
    domaine: 'Porte 0 — Champ d’application',
    question: 'La prise en charge relève-t-elle du SMR/SSR ou de la psychiatrie ?',
  },
  {
    id: 'programmation',
    domaine: 'Porte 1 — Prérequis',
    question: 'La venue du patient était-elle programmée ?',
  },
  {
    id: 'doc_adressage',
    domaine: 'Porte 1 — Prérequis',
    question: 'La demande médicale préalable est-elle au dossier ?',
  },
  {
    id: 'doc_synthese',
    domaine: 'Porte 1 — Prérequis',
    question: 'La synthèse médicale a-t-elle été signée le jour même ?',
  },
  {
    id: 'doc_liaison',
    domaine: 'Porte 1 — Prérequis',
    question: 'La lettre de liaison a-t-elle été remise ?',
  },
  {
    id: 'actes',
    domaine: 'Portes 2 & 3 — Densité',
    question: 'Quel(s) acte(s) technique(s) ont été réalisés ?',
  },
  {
    id: 'medicaments',
    domaine: 'Porte 3 — Densité',
    question: 'Quel(s) médicament(s) ont été administrés ?',
  },
  {
    id: 'intervenants',
    domaine: 'Porte 3 — Densité',
    question: 'Qui est intervenu directement auprès du patient ?',
  },
  {
    id: 'surveillance',
    domaine: 'Porte 3 — Densité',
    question: 'Une surveillance clinique rapprochée a-t-elle été documentée ?',
  },
  {
    id: 'duree',
    domaine: 'Porte 4 — Alertes qualité',
    question: 'Quelle a été la durée de présence du patient ?',
  },
  { id: 'resultat', domaine: 'Décision', question: 'Décision du moteur décisionnel' },
];

const INDEX = new Map(ETAPES.map((etape, i) => [etape.id, i]));

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

/** Paire de gros boutons Oui / Non (choix exclusif). */
function boutonsOuiNon(cle: string, valeur: boolean | null): string {
  return `
    <div class="choix-binaire">
      <button type="button" class="btn-oui-non" data-action="repondre" data-cle="${cle}"
              data-valeur="oui"${presse(valeur === true)}>
        <span class="glyphe" aria-hidden="true">✔</span>Oui
      </button>
      <button type="button" class="btn-oui-non" data-action="repondre" data-cle="${cle}"
              data-valeur="non"${presse(valeur === false)}>
        <span class="glyphe" aria-hidden="true">✘</span>Non
      </button>
    </div>`;
}

/**
 * Boutons à bascule Oui / Non pour un élément d'une liste.
 * Le bouton correspondant à la valeur courante reste « enfoncé ».
 */
function boutonsValeur(action: string, index: number, valeur: boolean): string {
  return `
    <div class="bascule-grille">
      <button type="button" class="btn-bascule" data-action="${action}" data-index="${index}"
              data-valeur="true"${presse(valeur)}>Oui</button>
      <button type="button" class="btn-bascule" data-action="${action}" data-index="${index}"
              data-valeur="false"${presse(!valeur)}>Non</button>
    </div>`;
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
  if (valeur === null) return '<span class="etiquette-info inconnu">non déterminé</span>';
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
  private etapeId = 'accueil';
  private jetonRequete = 0;
  private minuteurRecherche: number | null = null;
  private termeRecherche = '';
  private suggestionsHtml = '';
  /** Objets complets du référentiel indexés par identifiant de suggestion. */
  private refsSuggerees = new Map<string, MedicamentRef | ActeRef>();
  private messageRecherche = '';
  private dernierDossier: DossierHDJ | null = null;
  private dernierResultat: ResultatAudit | null = null;

  private readonly racine = el<HTMLElement>('carte');
  private readonly zoneAide = el<HTMLElement>('aide');
  private readonly jauge = el<HTMLElement>('jauge');
  private readonly texteProgression = el<HTMLElement>('progression-texte');
  private readonly voyantVerdict = el<HTMLElement>('voyant-verdict');
  private readonly voyantReferentiel = el<HTMLElement>('voyant-referentiel');

  /* -------------------------------------------------- cycle de vie */

  demarrer(): void {
    document.body.addEventListener('click', this.gererClic);
    this.racine.addEventListener('input', this.gererSaisie);
    this.afficherEtatReferentiel();
    void verifierReferentiel().then(() => this.afficherEtatReferentiel());
    this.rendre();
  }

  private afficherEtatReferentiel(): void {
    const etat = etatDuReferentiel();
    this.voyantReferentiel.className = `voyant ${etat === 'degrade' ? 'degrade' : ''}`;
    this.voyantReferentiel.innerHTML = `<span class="point"></span>${esc(
      libelleEtatReferentiel(),
    )}`;
  }

  /* -------------------------------------------------- navigation */

  private get etape(): Etape {
    return ETAPES[INDEX.get(this.etapeId) ?? 0] ?? ETAPES[0]!;
  }

  private suivante(): string | null {
    const e = this.etat;
    switch (this.etapeId) {
      case 'accueil':
        return 'identite';
      case 'identite':
        return 'champ_seance';
      case 'champ_seance':
        return e.estSeance === true ? 'resultat' : 'champ_hors_mco';
      case 'champ_hors_mco':
        return e.estHorsMco === true ? 'resultat' : 'programmation';
      case 'programmation':
        return e.estProgramme === false ? 'resultat' : 'doc_adressage';
      case 'doc_adressage':
        return 'doc_synthese';
      case 'doc_synthese':
        return 'doc_liaison';
      case 'doc_liaison':
        return 'actes';
      case 'actes':
        return 'medicaments';
      case 'medicaments':
        return 'intervenants';
      case 'intervenants':
        return 'surveillance';
      case 'surveillance':
        return 'duree';
      case 'duree':
        return 'resultat';
      default:
        return null;
    }
  }

  private precedente(): string | null {
    const parcours = [
      'accueil',
      'identite',
      'champ_seance',
      'champ_hors_mco',
      'programmation',
      'doc_adressage',
      'doc_synthese',
      'doc_liaison',
      'actes',
      'medicaments',
      'intervenants',
      'surveillance',
      'duree',
    ];
    const rang = INDEX.get(this.etapeId) ?? 0;
    for (let i = Math.min(rang - 1, parcours.length - 1); i >= 0; i -= 1) {
      const candidat = parcours[i];
      if (!candidat) continue;
      if (candidat === 'champ_hors_mco' && this.etat.estSeance === true) continue;
      if (candidat === 'programmation' && this.etat.estHorsMco === true) continue;
      if (candidat.startsWith('doc_') && this.etat.estProgramme === false) continue;
      return candidat;
    }
    return null;
  }

  private saisieComplete(): boolean {
    const e = this.etat;
    switch (this.etapeId) {
      case 'accueil':
        return e.discipline !== null;
      case 'identite':
        return e.identifiantSejour.trim().length > 0 && e.dateSejour.length > 0;
      case 'champ_seance':
        return e.estSeance !== null;
      case 'champ_hors_mco':
        return e.estHorsMco !== null;
      case 'programmation':
        return e.estProgramme !== null;
      case 'doc_adressage':
        return e.lettreAdressage !== null;
      case 'doc_synthese':
        return e.syntheseMedicale !== null;
      case 'doc_liaison':
        return e.lettreLiaison !== null;
      case 'surveillance':
        return e.surveillanceActive !== null;
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
    this.messageRecherche = '';
    this.termeRecherche = '';
    this.rendre();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* -------------------------------------------------- rendu */

  private rendre(): void {
    this.rendreProgression();
    this.rendreVerdictProvisoire();
    this.rendreAide();
    if (this.etapeId === 'resultat') this.rendreResultat();
    else this.rendreQuestion();
  }

  private rendreQuestion(): void {
    const rang = (INDEX.get(this.etapeId) ?? 0) + 1;
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
        <span class="note-saisie">Question ${rang} sur ${ETAPES.length - 1}</span>
        <button type="button" class="btn-nav suivant" data-action="avancer"${
          this.saisieComplete() ? '' : ' disabled'
        }>Suivant →</button>
      </div>`;
  }

  private sousQuestion(): string {
    const textes: Record<string, string> = {
      accueil: 'Vos réponses serviront à adapter les exemples et le vocabulaire de l’assistant.',
      identite: 'Ces informations figurent en tête de la fiche de traçabilité T2A.',
      champ_seance:
        'Dialyse et chimiothérapie sont financées par un forfait de séance, sans critères de gradation.',
      champ_hors_mco: 'L’instruction ne s’applique qu’au champ médecine-chirurgie-obstétrique.',
      programmation:
        'Une hospitalisation de jour suppose une organisation anticipée sur un plateau dédié.',
      doc_adressage: 'Pièce justifiant la pertinence du recours à l’hospitalisation de jour.',
      doc_synthese: 'Compte-rendu d’hospitalisation ou lettre de sortie signé.',
      doc_liaison: 'Courrier remis au patient et transmis au médecin traitant (art. R. 1112-1-2 CSP).',
      actes:
        'Recherchez dans la nomenclature CCAM : les caractéristiques de l’acte sont reprises du référentiel.',
      medicaments:
        'La recherche interroge le référentiel et indique s’il s’agit d’un produit à réserve hospitalière.',
      intervenants:
        'Seuls les intervenants ayant rédigé une note d’évolution individualisée sont dénombrés.',
      surveillance:
        'La surveillance particulière justifie un GHS plein, à condition d’être retracée au dossier.',
      duree: 'Une durée inférieure à 3 heures déclenche une alerte qualité, sans bloquer la décision.',
    };
    return textes[this.etapeId] ?? '';
  }

  private corps(): string {
    switch (this.etapeId) {
      case 'accueil':
        return this.corpsAccueil();
      case 'identite':
        return this.corpsIdentite();
      case 'champ_seance':
        return boutonsOuiNon('estSeance', this.etat.estSeance);
      case 'champ_hors_mco':
        return boutonsOuiNon('estHorsMco', this.etat.estHorsMco);
      case 'programmation':
        return boutonsOuiNon('estProgramme', this.etat.estProgramme);
      case 'doc_adressage':
        return boutonsOuiNon('lettreAdressage', this.etat.lettreAdressage);
      case 'doc_synthese':
        return boutonsOuiNon('syntheseMedicale', this.etat.syntheseMedicale);
      case 'doc_liaison':
        return boutonsOuiNon('lettreLiaison', this.etat.lettreLiaison);
      case 'surveillance':
        return boutonsOuiNon('surveillanceActive', this.etat.surveillanceActive);
      case 'actes':
        return this.corpsActes();
      case 'medicaments':
        return this.corpsMedicaments();
      case 'intervenants':
        return this.corpsIntervenants();
      case 'duree':
        return this.corpsDuree();
      default:
        return '';
    }
  }

  /* -------------------------------------------------- corps par étape */

  private corpsAccueil(): string {
    const disciplines: readonly [Discipline, string, string][] = [
      ['MEDECIN', '🩺', 'Je prescris ou je coordonne la prise en charge.'],
      ['SOIGNANT', '💉', 'Je réalise et je trace les soins.'],
      ['DIM_TIM', '🗂️', 'Je code et je contrôle les séjours.'],
      ['PHARMACIE', '💊', 'Je gère les produits et leur dispensation.'],
      ['FACTURATION', '🧾', 'Je facture et je sécurise les recettes.'],
      ['AUTRE', '🏥', 'Autre fonction administrative ou support.'],
    ];

    return `
      <div class="choix-cartes">
        ${disciplines
          .map(
            ([valeur, icone, description]) => `
          <button type="button" class="btn-carte" data-action="discipline"
                  data-valeur="${valeur}"${presse(this.etat.discipline === valeur)}>
            <span class="icone" aria-hidden="true">${icone}</span>
            <span>
              <strong>${esc(LIBELLES_DISCIPLINE[valeur])}</strong>
              <span>${esc(description)}</span>
            </span>
          </button>`,
          )
          .join('')}
      </div>`;
  }

  private corpsIdentite(): string {
    return `
      <div class="grille-champs">
        <div>
          <label class="etiquette" for="champ-sejour">Identifiant de séjour</label>
          <input type="text" id="champ-sejour" data-champ="identifiantSejour"
                 value="${esc(this.etat.identifiantSejour)}" autocomplete="off" />
        </div>
        <div>
          <label class="etiquette" for="champ-date">Date du séjour</label>
          <input type="date" id="champ-date" data-champ="dateSejour"
                 value="${esc(this.etat.dateSejour)}" />
        </div>
      </div>`;
  }

  private corpsDuree(): string {
    const raccourcis = [60, 90, 120, 180, 240, 300, 360];
    const sousSeuil = this.etat.dureePresenceMinutes < 180;
    return `
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
          <label class="etiquette" for="champ-duree">Durée exacte de présence (minutes)</label>
          <input type="number" id="champ-duree" data-champ="dureePresenceMinutes" min="0"
                 max="1440" step="5" value="${this.etat.dureePresenceMinutes}" />
        </div>
      </div>
      <p class="note-saisie" style="margin-top:12px">
        ${
          sousSeuil
            ? '⚠️ Durée inférieure à 3 heures : une alerte qualité sera émise en contrôle.'
            : 'Durée conforme au repère de 3 heures utilisé en contrôle.'
        }
      </p>`;
  }

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
                      ? `Référentiel CCAM : plateau technique lourd ${libelleBooleen(
                          choisi.reference?.necessite_plateau_lourd ?? null,
                          'oui',
                          'non',
                        )} · acte marqueur HDJ ${libelleBooleen(
                          choisi.reference?.acte_marqueur_hdj ?? null,
                          'oui',
                          'non',
                        )}`
                      : 'Acte saisi manuellement — précisez ses caractéristiques'
                  }
                </div>
              </div>
              <button type="button" class="btn-retirer" data-action="retirer-acte"
                      data-index="${index}">Retirer</button>
            </div>
            <div class="element-questions">
              <div class="mini-question">
                <span>Nécessite un plateau technique lourd ?</span>
                ${boutonsValeur('acte-plateau', index, choisi.acte.est_plateau_lourd)}
              </div>
              <div class="mini-question">
                <span>Réalisable en externe (cabinet, ville) ?</span>
                ${boutonsValeur('acte-externe', index, choisi.acte.est_realisable_externe)}
              </div>
            </div>
          </div>`,
          )
          .join('')
      : `<div class="vide">Aucun acte sélectionné.<br />Vous pouvez passer cette question si la
         venue ne comporte aucun acte technique.</div>`;

    return `
      <div class="recherche">
        <input type="text" id="champ-recherche" data-recherche="actes" autocomplete="off"
               value="${esc(this.termeRecherche)}"
               placeholder="Code (DEQP003) ou mots-clés (endoscopie, échographie…)" />
        <span class="loupe" aria-hidden="true">🔍</span>
      </div>
      <div id="zone-suggestions">${this.rendreSuggestions()}</div>
      <div class="selection">${elements}</div>`;
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
                  CIS ${esc(choisi.medicament.code_ucd)}${
                    choisi.reference?.surveillance_renforcee === true ? ' · surveillance renforcée' : ''
                  }${choisi.reference?.est_liste_en_sus === true ? ' · liste en sus' : ''}
                  ${choisi.issuReferentiel ? '' : ' · saisie manuelle'}
                </div>
              </div>
              <button type="button" class="btn-retirer" data-action="retirer-medicament"
                      data-index="${index}">Retirer</button>
            </div>
            <div class="element-questions">
              <div class="mini-question">
                <span>
                  Produit de la réserve hospitalière ?
                  ${etiquette(
                    choisi.reference?.est_reserve_hospitaliere ?? null,
                    'oui (référentiel)',
                    'non (référentiel)',
                  )}
                </span>
                ${boutonsValeur('med-reserve', index, choisi.medicament.reserve_hospitaliere)}
              </div>
              <div class="mini-question">
                <span>Administration nécessitant une surveillance continue ?</span>
                ${boutonsValeur(
                  'med-surveillance',
                  index,
                  choisi.medicament.necessite_surveillance_continue,
                )}
              </div>
            </div>
          </div>`,
          )
          .join('')
      : `<div class="vide">Aucun médicament sélectionné.<br />Vous pouvez passer cette question si
         la venue ne comporte aucun traitement.</div>`;

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

  private corpsIntervenants(): string {
    const elements = this.etat.intervenants.length
      ? this.etat.intervenants
          .map(
            (intervenant, index) => `
          <div class="element">
            <div class="element-tete">
              <div>
                <strong>Intervenant ${index + 1} — ${esc(
                  LIBELLES_PROFESSION[intervenant.profession],
                )}</strong>
                <div class="element-meta">
                  ${
                    intervenant.note_evolution_tracee
                      ? 'Note d’évolution tracée — intervention dénombrable'
                      : 'Aucune note tracée — intervention NON dénombrable'
                  }
                </div>
              </div>
              <button type="button" class="btn-retirer" data-action="retirer-intervenant"
                      data-index="${index}">Retirer</button>
            </div>
            <div class="element-questions">
              <div class="mini-question" style="display:block">
                <div style="margin-bottom:8px">Profession</div>
                ${basculesExclusives(
                  'profession',
                  PROFESSIONS.map((profession) => ({
                    valeur: `${index}:${profession}`,
                    libelle: LIBELLES_PROFESSION[profession],
                    actif: intervenant.profession === profession,
                  })),
                )}
              </div>
              ${
                intervenant.profession === 'MEDECIN'
                  ? `<div class="mini-question" style="display:block">
                       <div style="margin-bottom:8px">
                         Spécialité médicale — indispensable pour distinguer deux médecins
                       </div>
                       <input type="text" data-champ="specialite-${index}"
                              value="${esc(intervenant.specialite_medicale ?? '')}"
                              placeholder="Endocrinologie, cardiologie…" />
                     </div>`
                  : ''
              }
              <div class="mini-question" style="display:block">
                <div style="margin-bottom:8px">Acte ou atelier réalisé auprès du patient</div>
                <input type="text" data-champ="atelier-${index}"
                       value="${esc(intervenant.acte_ou_atelier)}"
                       placeholder="Entretien éducatif, surveillance, atelier diététique…" />
              </div>
              <div class="mini-question">
                <span>Note d’évolution rédigée dans le dossier ?</span>
                ${boutonsValeur('note', index, intervenant.note_evolution_tracee)}
              </div>
            </div>
          </div>`,
          )
          .join('')
      : `<div class="vide">Aucun intervenant renseigné : la pluriprofessionnalité ne pourra pas
         être établie.</div>`;

    return `
      <div class="selection">${elements}</div>
      <button type="button" class="btn-nav suivant" style="margin-top:16px"
              data-action="ajouter-intervenant">+ Ajouter un intervenant</button>`;
  }

  /* -------------------------------------------------- aide pédagogique */

  private rendreAide(): void {
    const discipline = this.etat.discipline;
    const aide: AideEtape = AIDE_ETAPES[this.etapeId] ?? AIDE_PAR_DEFAUT;
    const exemples = discipline ? aide.exemples[discipline] : [];

    this.zoneAide.innerHTML = `
      <h2>Aide &amp; exemples</h2>
      ${
        discipline
          ? `<div class="discipline-rappel">Exemples adaptés à : <strong>${esc(
              LIBELLES_DISCIPLINE[discipline],
            )}</strong></div>
             <section><p>${esc(ACCROCHES_DISCIPLINE[discipline])}</p></section>`
          : '<section><p>Sélectionnez votre profil pour obtenir des exemples ciblés.</p></section>'
      }
      <section>
        <h3>Pourquoi cette question ?</h3>
        <p>${esc(aide.pourquoi)}</p>
      </section>
      <section>
        <h3>Règle applicable</h3>
        <p class="regle">${esc(aide.regle)}</p>
      </section>
      ${
        exemples.length
          ? `<section><h3>Exemples concrets</h3>
               <ul class="exemples">${exemples.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
             </section>`
          : ''
      }`;
  }

  /* -------------------------------------------------- progression */

  private rendreProgression(): void {
    const rang = (INDEX.get(this.etapeId) ?? 0) + 1;
    const total = ETAPES.length - 1;
    const ratio = this.etapeId === 'resultat' ? 1 : Math.min(1, rang / total);
    this.jauge.style.width = `${Math.round(ratio * 100)}%`;
    this.texteProgression.textContent =
      this.etapeId === 'resultat'
        ? 'Évaluation terminée'
        : `${Math.round(ratio * 100)} % — ${this.etape.domaine}`;
  }

  private rendreVerdictProvisoire(): void {
    const suffisant =
      this.etat.estSeance !== null ||
      this.etat.estHorsMco !== null ||
      this.etat.estProgramme !== null;
    if (!suffisant) {
      this.voyantVerdict.className = 'voyant verdict';
      this.voyantVerdict.textContent = 'Verdict provisoire : —';
      return;
    }
    const resultat = evaluerDossier(versDossier(this.etat));
    this.voyantVerdict.className = `voyant verdict ${resultat.severite}`;
    this.voyantVerdict.textContent = `Verdict provisoire : ${resultat.statut}`;
  }

  /* -------------------------------------------------- résultat */

  private rendreResultat(): void {
    const dossier = versDossier(this.etat);
    const resultat = evaluerDossier(dossier);
    this.dernierDossier = dossier;
    this.dernierResultat = resultat;

    const mentions: Record<ResultatAudit['statut'], string> = {
      VALIDE_GHS: 'Les critères de l’instruction sont réunis : le séjour peut être facturé en GHS.',
      SUSPENDU_POUR_REGULARISATION:
        'Une pièce obligatoire manque, mais la densité est suffisante : régularisez avant validation DIM.',
      REJET_VERS_ACE:
        'La prise en charge relève des actes et consultations externes (ACE / CSO).',
      REJET_VERS_FORFAIT_SEANCE: 'Requalification en forfait de séance dédié.',
      REJET_HORS_MCO: 'Prise en charge hors du champ MCO de l’instruction.',
      REJET_NON_PROGRAMME: 'Séjour non programmé : la facturation en GHS est exclue.',
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
        <div class="intitule">Décision du moteur décisionnel</div>
        <div class="statut">${esc(resultat.statut)}</div>
        <div class="mention">${esc(mentions[resultat.statut])}</div>
      </div>

      <div class="bloc-resultat">
        <h3>Pyramide des 5 portes</h3>
        <ul class="pyramide">
          ${resultat.portes
            .map(
              (porte) =>
                `<li><span class="marque ${porte.statut}">${porte.statut}</span>` +
                `<span>${esc(porte.libelle)}</span></li>`,
            )
            .join('')}
        </ul>
      </div>

      <div class="bloc-resultat">
        <h3>Densité en ressources (porte 3)</h3>
        ${piliers}
      </div>

      <div class="bloc-resultat">
        <h3>Motifs opposables</h3>
        <ul class="liste">
          ${
            resultat.motifs_blocage.length
              ? resultat.motifs_blocage.map((m) => `<li>${esc(m)}</li>`).join('')
              : '<li style="list-style:none;color:var(--vert-ok)">Aucun motif de blocage.</li>'
          }
        </ul>
      </div>

      <div class="bloc-resultat">
        <h3>Alertes qualité / contrôle T2A</h3>
        <ul class="liste">
          ${
            resultat.alertes_controle.length
              ? resultat.alertes_controle.map((a) => `<li>${esc(a)}</li>`).join('')
              : '<li style="list-style:none" class="alerte-vide">Aucune alerte qualité.</li>'
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
          🖨️ Fiche de traçabilité T2A
        </button>
        <button type="button" class="btn-action secondaire" data-action="fiche-telecharger">
          💾 Télécharger (.txt)
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
        <span class="note-saisie">Séjour ${esc(dossier.id_sejour)}</span>
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
      case 'avancer':
        this.avancer();
        break;
      case 'reculer':
        this.reculer();
        break;
      case 'discipline':
        this.etat.discipline = valeur as Discipline;
        this.rendre();
        break;
      case 'repondre':
        this.repondre(cible.dataset.cle ?? '', valeur === 'oui');
        break;
      case 'duree':
        this.etat.dureePresenceMinutes = Number(valeur);
        this.rendre();
        break;
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
      case 'acte-plateau':
      case 'acte-externe': {
        const choisi = this.etat.actes[index];
        if (choisi) {
          choisi.acte =
            action === 'acte-plateau'
              ? { ...choisi.acte, est_plateau_lourd: valeur === 'true' }
              : { ...choisi.acte, est_realisable_externe: valeur === 'true' };
        }
        this.rendre();
        break;
      }
      case 'med-reserve':
      case 'med-surveillance': {
        const choisi = this.etat.medicaments[index];
        if (choisi) {
          choisi.medicament =
            action === 'med-reserve'
              ? { ...choisi.medicament, reserve_hospitaliere: valeur === 'true' }
              : { ...choisi.medicament, necessite_surveillance_continue: valeur === 'true' };
          if (action === 'med-reserve') choisi.reserveSource = 'arbitrage';
        }
        this.rendre();
        break;
      }
      case 'ajouter-intervenant':
        this.etat.intervenants.push(intervenantVide());
        this.rendre();
        break;
      case 'retirer-intervenant':
        this.etat.intervenants.splice(index, 1);
        this.rendre();
        break;
      case 'profession': {
        const [rang, profession] = valeur.split(':');
        const intervenant = this.etat.intervenants[Number(rang)];
        if (intervenant) {
          intervenant.profession = profession as Profession;
          if (profession !== 'MEDECIN') delete intervenant.specialite_medicale;
          else intervenant.specialite_medicale ??= '';
        }
        this.rendre();
        break;
      }
      case 'note': {
        const intervenant = this.etat.intervenants[index];
        if (intervenant) intervenant.note_evolution_tracee = valeur === 'true';
        this.rendre();
        break;
      }
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
        this.changerEtape('accueil');
        break;
      default:
        break;
    }
  };

  private gererSaisie = (evenement: Event): void => {
    const cible = evenement.target as HTMLElement;

    if (cible.dataset?.['champ']) {
      this.majChamp(cible.dataset['champ'], (cible as HTMLInputElement).value);
      return;
    }
    if (cible.dataset?.['recherche']) {
      this.planifierRecherche(cible.dataset['recherche'], (cible as HTMLInputElement).value);
    }
  };

  private majChamp(champ: string, valeur: string): void {
    if (champ === 'identifiantSejour') this.etat.identifiantSejour = valeur;
    else if (champ === 'dateSejour') this.etat.dateSejour = valeur;
    else if (champ === 'dureePresenceMinutes') {
      const nombre = Number(valeur);
      this.etat.dureePresenceMinutes = Number.isFinite(nombre) ? Math.max(0, nombre) : 0;
      this.rendreVerdictProvisoire();
    } else if (champ.startsWith('specialite-')) {
      const intervenant = this.etat.intervenants[Number(champ.split('-')[1])];
      if (intervenant) intervenant.specialite_medicale = valeur;
    } else if (champ.startsWith('atelier-')) {
      const intervenant = this.etat.intervenants[Number(champ.split('-')[1])];
      if (intervenant) intervenant.acte_ou_atelier = valeur;
    }
  }

  private repondre(cle: string, valeur: boolean): void {
    switch (cle) {
      case 'estSeance':
        this.etat.estSeance = valeur;
        break;
      case 'estHorsMco':
        this.etat.estHorsMco = valeur;
        break;
      case 'estProgramme':
        this.etat.estProgramme = valeur;
        break;
      case 'lettreAdressage':
        this.etat.lettreAdressage = valeur;
        break;
      case 'syntheseMedicale':
        this.etat.syntheseMedicale = valeur;
        break;
      case 'lettreLiaison':
        this.etat.lettreLiaison = valeur;
        break;
      case 'surveillanceActive':
        this.etat.surveillanceActive = valeur;
        break;
      default:
        break;
    }
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
    try {
      if (type === 'actes') {
        const resultats = await rechercherActesCcam(terme);
        if (jeton !== this.jetonRequete) return;
        this.refsSuggerees.clear();
        for (const acte of resultats) this.refsSuggerees.set(acte.code, acte);
        this.suggestionsHtml = resultats
          .map(
            (a) => `<li><button type="button" data-action="suggestion-acte"
                data-valeur="${esc(a.code)}">
                <span class="titre-ligne">${esc(a.code)} — ${esc(a.libelle)}</span>
                <span class="detail-ligne">plateau technique lourd :
                  ${libelleBooleen(a.necessite_plateau_lourd, 'oui', 'non')} · acte marqueur HDJ :
                  ${libelleBooleen(a.acte_marqueur_hdj, 'oui', 'non')} · réalisable en externe :
                  ${libelleBooleen(a.exclusif_externe, 'oui', 'non')}</span>
              </button></li>`,
          )
          .join('');
        this.messageRecherche = resultats.length ? '' : 'Aucun acte trouvé pour cette recherche.';
      } else {
        const resultats = await rechercherMedicaments(terme);
        if (jeton !== this.jetonRequete) return;
        this.refsSuggerees.clear();
        for (const medicament of resultats) this.refsSuggerees.set(medicament.cis, medicament);
        this.suggestionsHtml = resultats
          .map(
            (m) => `<li><button type="button" data-action="suggestion-medicament"
                data-valeur="${esc(m.cis)}">
                <span class="titre-ligne">${esc(m.denomination)}</span>
                <span class="detail-ligne">${m.dci ? `DCI ${esc(m.dci)} · ` : ''}réserve
                  hospitalière : ${libelleBooleen(m.est_reserve_hospitaliere, 'oui', 'non', 'non déterminé')}${
                    m.surveillance_renforcee ? ' · surveillance renforcée' : ''
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
    if (zone) zone.innerHTML = this.rendreSuggestions();
  }

  private async ajouterActe(code: string): Promise<void> {
    if (this.etat.actes.some((a) => a.acte.code === code)) {
      this.signaler(`L’acte ${code} est déjà sélectionné.`);
      return;
    }
    const connue = this.refsSuggerees.get(code);
    const reference = connue && 'libelle' in connue ? connue : await acteParCode(code);
    this.etat.actes.push(
      reference ? acteChoisiDepuisReferentiel(reference) : acteChoisiManuel(code, ''),
    );
    this.rendre();
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
