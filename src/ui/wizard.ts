/**
 * Assistant pas-à-pas (wizard) du moteur décisionnel HDJ.
 *
 * Principe : une saisie réduite au strict nécessaire au calcul de la
 * facturation. Aucune donnée administrative (ni numéro de séjour, ni date)
 * n'est demandée. Les caractéristiques des actes et des médicaments sont
 * reprises du référentiel : elles ne sont jamais redemandées à l'utilisateur.
 *
 * L'UI ne décide rien : chaque réponse alimente `EtatAssistant`, converti en
 * `DossierHDJ` puis soumis à `evaluerDossier`.
 */

import { PROFESSIONS, evaluerDossier } from '../core/rules-engine/index.js';
import type { DossierHDJ, Profession, ResultatAudit } from '../core/rules-engine/index.js';
import { contenuFiche, imprimerFiche, telechargerFiche } from './fiche.js';
import {
  AIDE_ETAPES,
  AIDE_PAR_DEFAUT,
  DISCIPLINES,
  LIBELLES_DISCIPLINE,
  LIBELLES_NATURE,
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
  {
    id: 'discipline',
    domaine: 'Bienvenue',
    question: 'Sur quelle discipline souhaitez-vous des exemples ?',
  },
  {
    id: 'champ',
    domaine: 'Champ d’application',
    question: 'La prise en charge relève-t-elle du champ de l’instruction ?',
  },
  {
    id: 'prerequis',
    domaine: 'Prérequis du dossier',
    question: 'Quelles pièces figurent au dossier du patient ?',
  },
  {
    id: 'actes',
    domaine: 'Densité — actes',
    question: 'Quels actes techniques ont été réalisés ?',
  },
  {
    id: 'medicaments',
    domaine: 'Densité — médicaments',
    question: 'Quels médicaments ont été administrés ?',
  },
  {
    id: 'intervenants',
    domaine: 'Densité — intervenants',
    question: 'Qui est intervenu directement auprès du patient ?',
  },
  {
    id: 'densite',
    domaine: 'Densité — surveillance et durée',
    question: 'Surveillance et durée de présence',
  },
  { id: 'resultat', domaine: 'Décision', question: 'Décision' },
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
  private etapeId = 'discipline';
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
  private aideOuverte = false;

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

  /**
   * Parcours effectivement applicable compte tenu des raccourcis des portes 0
   * et 1 (un séjour non programmé ou hors champ ne déroule pas la densité).
   */
  private parcours(): readonly string[] {
    const e = this.etat;
    const etapes: string[] = ['discipline', 'champ'];
    const horsChamp = e.estSeance === true || e.estHorsMco === true;
    if (!horsChamp) {
      etapes.push('prerequis');
      if (e.estProgramme !== false) {
        etapes.push('actes', 'medicaments', 'intervenants', 'densite');
      }
    }
    return etapes;
  }

  private suivante(): string | null {
    const parcours = this.parcours();
    if (this.etapeId === 'resultat') return null;
    const rang = parcours.indexOf(this.etapeId);
    if (rang === -1) return parcours[0] ?? null;
    return parcours[rang + 1] ?? 'resultat';
  }

  private precedente(): string | null {
    const parcours = this.parcours();
    const cible = this.etapeId === 'resultat' ? parcours.length - 1 : parcours.indexOf(this.etapeId) - 1;
    return parcours[cible] ?? null;
  }

  private saisieComplete(): boolean {
    const e = this.etat;
    switch (this.etapeId) {
      // Le choix de la discipline est facultatif : il n'illustre que les exemples.
      case 'discipline':
        return true;
      case 'champ':
        return e.estSeance !== null && e.estHorsMco !== null;
      case 'prerequis':
        return (
          e.estProgramme !== null &&
          e.lettreAdressage !== null &&
          e.syntheseMedicale !== null &&
          e.lettreLiaison !== null
        );
      case 'densite':
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
    this.refsSuggerees.clear();
    this.messageRecherche = '';
    this.termeRecherche = '';
    this.aideOuverte = id !== 'discipline';
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
      discipline:
        'Facultatif. La discipline choisie ne modifie aucune règle : elle sert uniquement à illustrer les étapes par des cas concrets de votre domaine.',
      champ:
        'Deux filtres rapides : une séance (dialyse, chimiothérapie) ou une prise en charge hors MCO n’appelle pas la gradation ambulatoire.',
      prerequis:
        'Il suffit d’indiquer si chaque pièce est au dossier. Une pièce manquante peut se régulariser ; un séjour non programmé, non.',
      actes:
        'Recherchez dans la nomenclature CCAM : le code, le libellé et les caractéristiques de l’acte sont repris du référentiel.',
      medicaments:
        'Recherchez le produit par son nom ou sa DCI : le référentiel indique lui-même s’il relève de la réserve hospitalière.',
      intervenants:
        'Cliquez sur les professionnels intervenus : le bouton reste enfoncé. Précisez seulement si une note d’évolution a été rédigée.',
      densite:
        'La surveillance active justifie à elle seule un GHS plein ; la durée de présence, elle, n’est qu’un point d’attention.',
    };
    return textes[this.etapeId] ?? '';
  }

  private corps(): string {
    switch (this.etapeId) {
      case 'discipline':
        return this.corpsDiscipline();
      case 'champ':
        return this.corpsChamp();
      case 'prerequis':
        return this.corpsPrerequis();
      case 'actes':
        return this.corpsActes();
      case 'medicaments':
        return this.corpsMedicaments();
      case 'intervenants':
        return this.corpsIntervenants();
      case 'densite':
        return this.corpsDensite();
      default:
        return '';
    }
  }

  /* -------------------------------------------------- corps par étape */

  private corpsDiscipline(): string {
    return `
      <div class="choix-cartes">
        ${DISCIPLINES.map(
          (discipline) => `
          <button type="button" class="btn-carte" data-action="discipline"
                  data-valeur="${discipline.id}"${presse(this.etat.discipline === discipline.id)}>
            <span class="icone" aria-hidden="true">${discipline.icone}</span>
            <span>
              <strong>${esc(discipline.libelle)}</strong>
              <span>${esc(discipline.perimetre)}</span>
            </span>
          </button>`,
        ).join('')}
      </div>
      <p class="note-saisie">
        Aucun choix n’est obligatoire : cliquez sur « Suivant » pour continuer sans exemples ciblés
        (ou re-cliquez sur une discipline pour la désélectionner).
      </p>`;
  }

  private corpsChamp(): string {
    return lignesBinaires([
      {
        cle: 'estSeance',
        titre: 'S’agit-il d’une séance de dialyse ou de chimiothérapie ?',
        precision: 'Séance forfaitisée, sans critères de gradation.',
        valeur: this.etat.estSeance,
      },
      {
        cle: 'estHorsMco',
        titre: 'La prise en charge relève-t-elle du SMR/SSR ou de la psychiatrie ?',
        precision: 'Hors champ MCO : financements propres.',
        valeur: this.etat.estHorsMco,
      },
    ]);
  }

  private corpsPrerequis(): string {
    return lignesBinaires([
      {
        cle: 'estProgramme',
        titre: 'La venue du patient était-elle programmée ?',
        valeur: this.etat.estProgramme,
      },
      {
        cle: 'lettreAdressage',
        titre: 'La demande médicale préalable est-elle au dossier ?',
        valeur: this.etat.lettreAdressage,
      },
      {
        cle: 'syntheseMedicale',
        titre: 'La synthèse médicale a-t-elle été signée le jour même ?',
        valeur: this.etat.syntheseMedicale,
      },
      {
        cle: 'lettreLiaison',
        titre: 'La lettre de liaison a-t-elle été remise au patient ?',
        valeur: this.etat.lettreLiaison,
      },
    ]);
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
      : `<div class="vide">Aucun acte sélectionné.<br />Vous pouvez passer cette étape si la
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
                  Réserve hospitalière : ${etiquette(
                    choisi.reference?.est_reserve_hospitaliere ?? null,
                    'oui',
                    'non',
                  )}${
                    choisi.reference?.surveillance_renforcee === true
                      ? ' · surveillance renforcée'
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
      : `<div class="vide">Aucun médicament sélectionné.<br />Vous pouvez passer cette étape si
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
              <div class="mini-question">
                <span>Note d’évolution rédigée dans le dossier ?</span>
                ${boutonsOuiNon('note', intervenant.note_evolution_tracee, 'note', index)}
              </div>
            </div>
          </div>`,
          )
          .join('')
      : `<div class="vide">Aucun intervenant sélectionné.<br />Cliquez sur les professionnels
         intervenus auprès du patient.</div>`;

    const medecinPresent = this.professionPresente('MEDECIN');

    return `
      <p class="consigne">Intervenants auprès du patient</p>
      ${this.basculesProfessions()}
      ${
        medecinPresent
          ? `<button type="button" class="btn-bascule ajout-second"
                    data-action="ajouter-medecin">＋ Un second médecin (autre spécialité)</button>`
          : ''
      }
      <div class="selection">${elements}</div>`;
  }

  /* -------------------------------------------------- surveillance & durée */

  private corpsDensite(): string {
    const raccourcis = [60, 90, 120, 180, 240, 300, 360];
    const sousSeuil = this.etat.dureePresenceMinutes < 180;
    return `
      ${lignesBinaires([
        {
          cle: 'surveillanceActive',
          titre: 'Une surveillance clinique rapprochée a-t-elle été documentée ?',
          precision: 'Constantes, tolérance, surveillance rapprochée tracées au dossier.',
          valeur: this.etat.surveillanceActive,
        },
      ])}
      <p class="consigne">Durée de présence du patient</p>
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

  /* -------------------------------------------------- aide pédagogique */

  private rendreAide(): void {
    const discipline = this.etat.discipline;
    const aide: AideEtape = AIDE_ETAPES[this.etapeId] ?? AIDE_PAR_DEFAUT;
    const casTypiques = casPourEtape(discipline, this.etapeId);
    const libelleDiscipline = discipline
      ? LIBELLES_DISCIPLINE[discipline]
      : 'Toutes disciplines (cas généraux)';

    this.zoneAide.className = `aide${this.aideOuverte ? ' ouvert' : ''}`;
    this.zoneAide.innerHTML = `
      <button type="button" class="bascule-aide" data-action="basculer-aide"
              aria-expanded="${this.aideOuverte ? 'true' : 'false'}">
        <span>Aide &amp; exemples</span>
        <span aria-hidden="true">${this.aideOuverte ? '▲' : '▼'}</span>
      </button>
      <div class="aide-contenu">
        <h2>Aide &amp; exemples</h2>
        <div class="discipline-rappel">Cas illustrés : <strong>${esc(libelleDiscipline)}</strong></div>

        <section>
          <h3>Pourquoi cette question ?</h3>
          <p>${esc(aide.pourquoi)}</p>
        </section>

        <section>
          <h3>Règle applicable</h3>
          <p class="regle">${esc(aide.regle)}</p>
        </section>

        <section>
          <h3>Cas typiques</h3>
          <ul class="exemples">
            ${casTypiques
              .map(
                (c) => `<li><span class="etiquette-info ${c.nature.toLowerCase()}">${esc(
                  LIBELLES_NATURE[c.nature],
                )}</span> ${esc(c.texte)}</li>`,
              )
              .join('')}
          </ul>
          ${
            discipline
              ? ''
              : `<p class="note-aide">Choisissez une discipline à l’écran d’accueil pour des cas
                 propres à votre domaine.</p>`
          }
        </section>
      </div>`;
  }

  /* -------------------------------------------------- progression */

  private rendreProgression(): void {
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
  }

  private rendreVerdictProvisoire(): void {
    const suffisant =
      this.etat.estSeance !== null ||
      this.etat.estHorsMco !== null ||
      this.etat.estProgramme !== null;
    if (!suffisant) {
      this.voyantVerdict.className = 'voyant verdict';
      this.voyantVerdict.textContent = 'Décision : —';
      return;
    }
    const resultat = evaluerDossier(versDossier(this.etat));
    this.voyantVerdict.className = `voyant verdict ${resultat.severite}`;
    this.voyantVerdict.textContent = `${resultat.libelle_decision}`;
  }

  /* -------------------------------------------------- résultat */

  private rendreResultat(): void {
    const dossier = versDossier(this.etat);
    const resultat = evaluerDossier(dossier);
    this.dernierDossier = dossier;
    this.dernierResultat = resultat;

    const mentions: Record<ResultatAudit['statut'], string> = {
      VALIDE_GHS:
        'Les critères de l’instruction sont réunis : la venue peut être facturée comme une hospitalisation de jour.',
      SUSPENDU_POUR_REGULARISATION:
        'Une pièce obligatoire manque, mais la densité est suffisante : régularisez avant validation DIM.',
      REJET_VERS_ACE:
        'La prise en charge relève des actes et consultations externes (ACE / CSO).',
      REJET_VERS_FORFAIT_SEANCE: 'Requalification en forfait de séance dédié.',
      REJET_HORS_MCO: 'Prise en charge hors du champ MCO de l’instruction.',
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
        <h3>Pyramide des 5 portes</h3>
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
        // Re-cliquer sur la discipline active la désélectionne.
        this.etat.discipline = this.etat.discipline === valeur ? null : (valeur as Discipline);
        this.rendre();
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
      case 'note': {
        const intervenant = this.etat.intervenants[index];
        if (intervenant) intervenant.note_evolution_tracee = valeur === 'oui';
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
        this.changerEtape('discipline');
        break;
      default:
        break;
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

    if (cible.dataset?.['champ']) {
      this.majChamp(cible.dataset['champ'], (cible as HTMLInputElement).value);
      return;
    }
    if (cible.dataset?.['recherche']) {
      this.planifierRecherche(cible.dataset['recherche'], (cible as HTMLInputElement).value);
    }
  };

  private majChamp(champ: string, valeur: string): void {
    if (champ === 'dureePresenceMinutes') {
      const nombre = Number(valeur);
      this.etat.dureePresenceMinutes = Number.isFinite(nombre) ? Math.max(0, nombre) : 0;
      this.rendreVerdictProvisoire();
    } else if (champ.startsWith('specialite-')) {
      const intervenant = this.etat.intervenants[Number(champ.split('-')[1])];
      if (intervenant) intervenant.specialite_medicale = valeur;
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
