/**
 * Fiche de traçabilité T2A — document imprimable (PDF) et export.
 *
 * Le document est construit **à partir des structures de l'audit** (`ResultatAudit`,
 * `DossierHDJ`) et non plus d'un pavé de texte monospace : titres, tableaux, encadrés et
 * bloc de visa sont mis en page, en A4, avec une police système lisible
 * (`system-ui` / Segoe UI / Roboto / Noto Sans) — le PDF obtenu par « Imprimer »
 * conserve un texte sélectionnable et exploitable.
 *
 * Deux rendus sont produits :
 *   • `documentFiche()`  : document HTML complet, autonome (styles inclus) — impression PDF
 *     et téléchargement ;
 *   • `contenuFiche()`   : version texte de l'audit, pour le presse-papier et les échanges.
 */

import {
  INSTRUCTION_DGOS_2020_52,
  LIBELLES_CONTEXTE_PATIENT,
  REFERENCES,
  type CodeReference,
  type Constat,
  type DossierHDJ,
  type EtapePorte,
  type PilierEvaluation,
  type ResultatAudit,
  type StatutPorte,
} from '../core/rules-engine/index.js';
import { LIBELLES_PROFESSION, LIBELLES_REGIME } from './store.js';

/* ------------------------------------------------------------------ *
 * Utilitaires
 * ------------------------------------------------------------------ */

/** Échappement HTML minimal. */
function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Nom de fichier normalisé, dérivé de la décision rendue (sans extension). */
export function nomFichier(resultat: ResultatAudit): string {
  const niveau = resultat.niveau_ghs ? `_${resultat.niveau_ghs}` : '';
  return `Fiche_T2A_HDJ_${resultat.statut}${niveau}`;
}

const LIBELLE_STATUT: Readonly<Record<StatutPorte, string>> = {
  FRANCHIE: 'Vérifiée',
  BLOQUANTE: 'Point de blocage',
  NON_EVALUEE: 'Non évaluée',
};

const CLE_STATUT: Readonly<Record<StatutPorte, string>> = {
  FRANCHIE: 'ok',
  BLOQUANTE: 'ko',
  NON_EVALUEE: 'ne',
};

const dateFr = (date: Date): string => date.toLocaleString('fr-FR');

/** Ligne de tableau « étiquette / valeur ». */
function ligneTableau(etiquette: string, valeur: string, accent = false): string {
  return `<tr><th scope="row">${echapper(etiquette)}</th><td${
    accent ? ' class="accent"' : ''
  }>${valeur}</td></tr>`;
}

/** Liste à puces, ou mention explicite d'absence. */
function liste(items: readonly string[], vide: string): string {
  if (items.length === 0) return `<p class="vide">${echapper(vide)}</p>`;
  return `<ul class="puces">${items.map((i) => `<li>${echapper(i)}</li>`).join('')}</ul>`;
}

/* ------------------------------------------------------------------ *
 * Sections du document
 * ------------------------------------------------------------------ */

function enteteDocument(resultat: ResultatAudit, horodatage: string): string {
  return `
  <header class="entete">
    <div class="entete-marque">
      <span class="logo">HDJ</span>
      <span class="entete-service">Évaluation de la facturation en hospitalisation de jour</span>
    </div>
    <h1>Fiche de traçabilité T2A</h1>
    <p class="entete-sous-titre">
      Prise en charge facturable en GHS <span class="ou">ou</span> actes et consultations
      externes (ACE)
    </p>
    <div class="entete-reference">
      Instruction N° ${echapper(INSTRUCTION_DGOS_2020_52.id)} du
      ${echapper(INSTRUCTION_DGOS_2020_52.date)}<br />
      NOR : ${echapper(INSTRUCTION_DGOS_2020_52.nor)} — document généré le
      ${echapper(horodatage)}
    </div>
  </header>

  <section class="decision decision--${resultat.severite.toLowerCase()}">
    <p class="decision-libelle">${echapper(resultat.libelle_decision)}</p>
    <dl class="decision-chiffres">
      <div>
        <dt>GHS facturable</dt>
        <dd>${
          resultat.ghs_autorise
            ? `Oui — GHS ${resultat.niveau_ghs === 'PLEIN' ? 'plein' : 'intermédiaire'}`
            : 'Non'
        }</dd>
      </div>
      <div>
        <dt>Statut technique</dt>
        <dd>${echapper(resultat.statut)}</dd>
      </div>
      <div>
        <dt>Piliers de densité validés</dt>
        <dd>${resultat.piliers_valides.length} sur ${resultat.piliers.length || 3}</dd>
      </div>
    </dl>
  </section>`;
}

function sectionSejour(dossier: DossierHDJ): string {
  const ouiNon = (valeur: boolean): string =>
    `<span class="marque-${valeur ? 'oui' : 'non'}">${valeur ? 'Oui' : 'Non'}</span>`;

  const contexte = dossier.contexte_patient
    .map((critere) => LIBELLES_CONTEXTE_PATIENT[critere] ?? critere)
    .join(' ; ');

  return `
  <section class="bloc">
    <h2><span>1</span> Éléments du séjour évalué</h2>
    <table class="tableau">
      ${ligneTableau('Régime de champ', echapper(LIBELLES_REGIME[dossier.regime_champ] ?? dossier.regime_champ))}
      ${ligneTableau('Durée de présence prévue', `${dossier.duree_presence_minutes} minutes`)}
      ${ligneTableau('Séjour programmé', ouiNon(dossier.est_programme))}
      ${ligneTableau('Demande médicale préalable (lettre d’adressage)', ouiNon(dossier.lettre_adressage_presente))}
      ${ligneTableau('Synthèse médicale / lettre de sortie tracée', ouiNon(dossier.synthese_medicale_tracee))}
      ${ligneTableau('Lettre de liaison remise au patient', ouiNon(dossier.lettre_liaison_remise))}
      ${ligneTableau('Surveillance active documentée (IDE)', ouiNon(dossier.surveillance_active_documentee))}
      ${ligneTableau(
        'Contexte patient retenu',
        contexte ? echapper(contexte) : '<span class="vide-en-ligne">Aucun critère retenu</span>',
      )}
    </table>
  </section>`;
}

function sectionPortes(portes: readonly EtapePorte[]): string {
  const lignes = portes
    .map(
      (etape) => `
      <tr>
        <td class="porte-libelle">${echapper(etape.libelle)}</td>
        <td><span class="etat etat--${CLE_STATUT[etape.statut]}">
          ${echapper(LIBELLE_STATUT[etape.statut])}</span></td>
      </tr>`,
    )
    .join('');

  return `
  <section class="bloc">
    <h2><span>2</span> Vérifications du parcours de facturation</h2>
    <table class="tableau tableau-portes">
      <thead>
        <tr><th scope="col">Étape</th><th scope="col">Résultat</th></tr>
      </thead>
      <tbody>${lignes}</tbody>
    </table>
  </section>`;
}

function sectionPiliers(piliers: readonly PilierEvaluation[]): string {
  if (piliers.length === 0) {
    return `
  <section class="bloc">
    <h2><span>3</span> Moyens mobilisés</h2>
    <p class="vide">Non évalués : une étape bloquante en amont interrompt l’analyse.</p>
  </section>`;
  }

  const cartes = piliers
    .map(
      (pilier) => `
      <article class="pilier ${pilier.valide ? 'pilier--valide' : 'pilier--echec'}">
        <header>
          <span class="etat etat--${pilier.valide ? 'ok' : 'ko'}">
            ${pilier.valide ? 'Validé' : 'Non retenu'}</span>
          <h3>${echapper(pilier.libelle)}</h3>
        </header>
        <ul class="puces">
          ${pilier.justifications.map((j) => `<li>${echapper(j)}</li>`).join('')}
        </ul>
      </article>`,
    )
    .join('');

  return `
  <section class="bloc">
    <h2><span>3</span> Moyens mobilisés (densité en ressources)</h2>
    ${cartes}
  </section>`;
}

function sectionBlocages(resultat: ResultatAudit): string {
  if (resultat.motifs_blocage.length === 0) return '';
  return `
  <section class="bloc">
    <h2><span>4</span> Motifs opposables</h2>
    <div class="encart encart--alerte">
      ${liste(resultat.motifs_blocage, 'Aucun motif de blocage.')}
    </div>
  </section>`;
}

function sectionVigilance(resultat: ResultatAudit): string {
  const numero = resultat.motifs_blocage.length > 0 ? 5 : 4;
  return `
  <section class="bloc">
    <h2><span>${numero}</span> Points de vigilance en contrôle T2A</h2>
    ${liste(resultat.alertes_controle, 'Aucun point de vigilance : le dossier est complet.')}
  </section>`;
}

function sectionMoyens(dossier: DossierHDJ, numero: number): string {
  const actes = dossier.actes_ccam.length
    ? `
    <table class="tableau tableau-moyens">
      <thead>
        <tr>
          <th scope="col">Code CCAM</th><th scope="col">Libellé</th>
          <th scope="col">Plateau lourd</th><th scope="col">Réalisable en externe</th>
        </tr>
      </thead>
      <tbody>
        ${dossier.actes_ccam
          .map(
            (acte) => `
        <tr>
          <td class="mono">${echapper(acte.code)}</td>
          <td>${echapper(acte.libelle)}</td>
          <td>${acte.est_plateau_lourd ? 'Oui' : 'Non'}</td>
          <td>${acte.est_realisable_externe ? 'Oui' : 'Non'}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>`
    : '<p class="vide">Aucun acte technique retenu.</p>';

  const medicaments = dossier.medicaments.length
    ? `
    <table class="tableau tableau-moyens">
      <thead>
        <tr>
          <th scope="col">Code</th><th scope="col">Produit</th>
          <th scope="col">Réserve hospitalière</th>
          <th scope="col">Surveillance particulière</th>
        </tr>
      </thead>
      <tbody>
        ${dossier.medicaments
          .map(
            (produit) => `
        <tr>
          <td class="mono">${echapper(produit.code_ucd)}</td>
          <td>${echapper(produit.libelle)}</td>
          <td>${
            produit.reserve_hospitaliere === null
              ? '<span class="doute">Valeur absente du référentiel — à confirmer (PUI)</span>'
              : produit.reserve_hospitaliere
                ? 'Oui'
                : 'Non'
          }</td>
          <td>${produit.necessite_surveillance_continue ? 'Oui' : 'Non'}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>`
    : '<p class="vide">Aucun produit administré.</p>';

  return `
  <section class="bloc">
    <h2><span>${numero}</span> Actes et produits retenus</h2>
    <h3 class="sous-titre">Actes techniques (CCAM)</h3>
    ${actes}
    <h3 class="sous-titre">Produits et médicaments</h3>
    ${medicaments}
  </section>`;
}

function sectionEquipe(dossier: DossierHDJ, numero: number): string {
  const lignes = dossier.intervenants.length
    ? `
    <table class="tableau tableau-moyens">
      <thead>
        <tr>
          <th scope="col">Profession</th><th scope="col">Intervention</th>
          <th scope="col">Note d’évolution</th>
        </tr>
      </thead>
      <tbody>
        ${dossier.intervenants
          .map(
            (intervenant) => `
        <tr>
          <td>${echapper(LIBELLES_PROFESSION[intervenant.profession] ?? intervenant.profession)}${
            intervenant.specialite_medicale
              ? ` <span class="precise">(${echapper(intervenant.specialite_medicale)})</span>`
              : ''
          }</td>
          <td>${echapper(intervenant.acte_ou_atelier)}</td>
          <td>${intervenant.note_evolution_tracee ? 'Requise au dossier' : 'Non tracée'}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>`
    : '<p class="vide">Aucun professionnel retenu.</p>';

  const plusieursMedecins =
    dossier.intervenants.filter((i) => i.profession === 'MEDECIN').length >= 2;

  return `
  <section class="bloc">
    <h2><span>${numero}</span> Équipe mobilisée</h2>
    ${lignes}
    ${
      plusieursMedecins
        ? `<p class="remarque">
             Plusieurs professionnels médicaux interviennent : leurs interventions ne sont
             dénombrées séparément que s’ils relèvent de deux spécialités ou surspécialités
             distinctes (annexe 4, point 2.b.iii).
           </p>`
        : ''
    }
  </section>`;
}

/** Localisation normative d'un code de référence, si elle est connue. */
function localisation(reference: string): string {
  const entree = REFERENCES[reference as CodeReference];
  return entree ? entree.localisation : reference;
}

function sectionConstats(constats: readonly Constat[], numero: number): string {
  if (constats.length === 0) return '';
  const lignes = constats
    .map(
      (c) => `
      <tr>
        <td class="mono">${echapper(c.code)}</td>
        <td>${echapper(c.message)}</td>
        <td class="source">${echapper(localisation(c.reference))}</td>
      </tr>`,
    )
    .join('');

  return `
  <section class="bloc">
    <h2><span>${numero}</span> Constats et références normatives</h2>
    <table class="tableau tableau-constats">
      <thead>
        <tr><th scope="col">Code</th><th scope="col">Constat</th><th scope="col">Référence</th></tr>
      </thead>
      <tbody>${lignes}</tbody>
    </table>
  </section>`;
}

function sectionPieces(dossier: DossierHDJ, numero: number): string {
  const pieces: readonly [boolean, string][] = [
    [dossier.est_programme, 'Convocation programmée / objectif médical formalisé'],
    [dossier.lettre_adressage_presente, 'Demande médicale préalable (lettre d’adressage)'],
    [dossier.synthese_medicale_tracee, 'Compte-rendu d’hospitalisation ou lettre de sortie signé'],
    [dossier.lettre_liaison_remise, 'Lettre de liaison remise (art. R. 1112-1-2 CSP)'],
    [dossier.surveillance_active_documentee, 'Traçabilité de la surveillance active (constantes, tolérance)'],
    [false, 'Notes d’évolution individualisées de chaque intervenant'],
    [false, 'Deux spécialités/surspécialités distinctes si plusieurs professionnels médicaux'],
    [false, 'Éléments de contexte patient / surveillance particulière'],
  ];

  return `
  <section class="bloc">
    <h2><span>${numero}</span> Pièces à réunir au dossier</h2>
    <ul class="pieces">
      ${pieces
        .map(
          ([acquis, libelle]) =>
            `<li><span class="case">${acquis ? '✓' : ''}</span> ${echapper(libelle)}</li>`,
        )
        .join('')}
    </ul>
    <p class="remarque">
      Évaluation prospective : les éléments cochés sont acquis par la programmation elle-même et
      sont rappelés ici comme engagements à tenir au dossier du patient.
    </p>
  </section>`;
}

function sectionVisa(numero: number): string {
  const blocs = [
    'Rédacteur de l’évaluation',
    'Validation DIM',
    'Médecin coordonnateur',
  ]
    .map(
      (role) => `
      <div class="visa-bloc">
        <p class="visa-role">${echapper(role)}</p>
        <p class="visa-ligne"></p>
        <p class="visa-date">Date : ____ / ____ / ________</p>
      </div>`,
    )
    .join('');

  return `
  <section class="bloc bloc--visa">
    <h2><span>${numero}</span> Visa et responsabilités</h2>
    <div class="visa-grille">${blocs}</div>
  </section>`;
}

function piedDocument(): string {
  return `
  <footer class="pied">
    <p>
      En cas de divergence d’interprétation persistante sur les conditions de facturation,
      l’établissement peut solliciter une prise de position formelle de l’État et de l’Assurance
      Maladie : <strong>dispositif de rescrit tarifaire</strong> (annexe 6 de l’instruction).
    </p>
    <p class="pied-textes">
      Textes de référence : instruction N° ${echapper(INSTRUCTION_DGOS_2020_52.id)} du
      ${echapper(INSTRUCTION_DGOS_2020_52.date)} (NOR
      ${echapper(INSTRUCTION_DGOS_2020_52.nor)}) ; code de la sécurité sociale, art. L. 162-22-6 et
      R. 162-33-1 ; arrêté du 19 février 2015 modifié (art. 11 et 11 bis).
    </p>
    <p class="pied-avertissement">
      Document d’aide à la décision médico-administrative. Il ne se substitue pas à
      l’appréciation du médecin DIM ni aux contrôles de l’Assurance Maladie.
    </p>
  </footer>`;
}

/* ------------------------------------------------------------------ *
 * Styles du document
 * ------------------------------------------------------------------ */

const STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }

  @page { size: A4; margin: 12mm 12mm 14mm; }

  body {
    margin: 0;
    padding: 0;
    font-family: system-ui, -apple-system, "Segoe UI", "Segoe UI Variable Text", Roboto,
      "Noto Sans", "Liberation Sans", "Helvetica Neue", Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.42;
    color: #1f2933;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  h1, h2, h3 { margin: 0; font-weight: 650; letter-spacing: -0.01em; }

  /* Filigrane d'écran : le bouton d'impression ne sort pas sur le papier */
  .barre-actions {
    position: sticky; top: 0; z-index: 10; display: flex; gap: 10px; align-items: center;
    padding: 10px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
    font-size: 9pt; color: #475569;
  }
  .barre-actions button {
    padding: 9px 16px; border: 0; border-radius: 8px; cursor: pointer;
    background: #008fdb; color: #fff; font-weight: 600; font-size: 9.5pt;
  }
  .barre-actions button:hover { background: #0071ad; }

  .page { max-width: 186mm; margin: 0 auto; padding: 14px 12px 28px; }

  /* En-tête */
  .entete {
    border-top: 4px solid #008fdb;
    padding: 12px 0 12px;
    border-bottom: 1px solid #dfe5ec;
    margin-bottom: 14px;
  }
  .entete-marque { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
  .logo {
    display: inline-block; padding: 2px 7px; border-radius: 6px;
    background: #008fdb; color: #fff; font-weight: 700; font-size: 9pt; letter-spacing: 0.03em;
  }
  .entete-service { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: #52606d; }
  .entete h1 { font-size: 17pt; }
  .entete-sous-titre { margin: 2px 0 8px; font-size: 10.5pt; color: #52606d; }
  .entete-sous-titre .ou { color: #008fdb; font-weight: 650; }
  .entete-reference { font-size: 8.5pt; color: #7b8794; }

  /* Bandeau de décision */
  .decision {
    border: 1px solid #dfe5ec; border-left: 5px solid #7b8794; border-radius: 8px;
    padding: 11px 13px; margin-bottom: 16px; background: #f8fafc;
  }
  .decision--vert { border-left-color: #2e7d32; background: #f1f8f1; }
  .decision--orange { border-left-color: #ef6c00; background: #fff8f0; }
  .decision--rouge { border-left-color: #c62828; background: #fdf3f2; }
  .decision-libelle { margin: 0 0 8px; font-size: 12.5pt; font-weight: 700; }
  .decision-chiffres { display: flex; flex-wrap: wrap; gap: 6px 28px; margin: 0; }
  .decision-chiffres div { display: flex; flex-direction: column; }
  .decision-chiffres dt {
    font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; color: #52606d;
  }
  .decision-chiffres dd { margin: 1px 0 0; font-size: 10pt; font-weight: 600; }

  /* Blocs */
  .bloc { margin: 0 0 14px; break-inside: avoid; }
  .bloc h2 {
    display: flex; align-items: center; gap: 8px;
    font-size: 11pt; padding-bottom: 4px; margin-bottom: 8px;
    border-bottom: 1px solid #e2e8f0;
  }
  .bloc h2 span {
    display: inline-flex; align-items: center; justify-content: center;
    width: 17px; height: 17px; border-radius: 50%;
    background: #008fdb; color: #fff; font-size: 8.5pt; font-weight: 700;
  }
  .bloc h2 span::after { content: ""; }
  .sous-titre { font-size: 9.5pt; margin: 8px 0 4px; color: #52606d; }

  /* Tableaux */
  .tableau { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  .tableau th, .tableau td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #eef2f6; vertical-align: top; }
  .tableau thead th {
    font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em;
    color: #52606d; border-bottom: 1px solid #dfe5ec; background: #f8fafc;
  }
  .tableau tbody th { font-weight: 600; color: #1f2933; width: 46%; }
  .tableau .accent { font-weight: 600; }
  .tableau-portes td { width: 50%; }
  .porte-libelle { font-weight: 600; }
  .tableau-moyens th:first-child, .tableau-moyens td:first-child { width: 22%; }
  .tableau-constats th:first-child, .tableau-constats td:first-child { width: 24%; }
  .tableau-constats td.source { color: #52606d; font-size: 8.5pt; }
  .mono { font-family: "SFMono-Regular", "Cascadia Mono", Consolas, "Liberation Mono", monospace; font-size: 8.5pt; }

  /* États */
  .etat {
    display: inline-block; padding: 1px 7px; border-radius: 999px;
    font-size: 8pt; font-weight: 650; white-space: nowrap;
  }
  .etat--ok { background: #e8f5e9; color: #1b5e20; border: 1px solid #b7dfb9; }
  .etat--ko { background: #fdecea; color: #8e1b1b; border: 1px solid #f2c2bd; }
  .etat--ne { background: #eef2f6; color: #52606d; border: 1px solid #dfe5ec; }
  .marque-oui { color: #1b5e20; font-weight: 600; }
  .marque-non { color: #52606d; }
  .doute { color: #8a5a00; font-weight: 600; }
  .precise { color: #52606d; font-size: 8.5pt; }

  /* Piliers */
  .pilier { border: 1px solid #e2e8f0; border-radius: 7px; padding: 8px 10px; margin-bottom: 7px; break-inside: avoid; }
  .pilier--valide { border-left: 3px solid #2e7d32; }
  .pilier--echec { border-left: 3px solid #c4ced9; }
  .pilier header { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
  .pilier h3 { font-size: 9.5pt; }

  /* Listes */
  .puces { margin: 0; padding-left: 16px; }
  .puces li { margin-bottom: 3px; }
  .vide { margin: 0; color: #7b8794; font-style: italic; }
  .vide-en-ligne { color: #7b8794; font-style: italic; }
  .remarque { margin: 6px 0 0; font-size: 8.5pt; color: #52606d; }

  /* Encadré d'alerte */
  .encart { border-radius: 7px; padding: 8px 11px; }
  .encart--alerte { background: #fdf3f2; border: 1px solid #f2c2bd; }
  .encart--alerte .puces { color: #8e1b1b; font-weight: 500; }

  /* Pièces à réunir */
  .pieces { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 22px; }
  .pieces li { margin-bottom: 5px; break-inside: avoid; }
  .case {
    display: inline-block; width: 12px; height: 12px; margin-right: 6px;
    border: 1px solid #c4ced9; border-radius: 3px; text-align: center;
    line-height: 11px; font-size: 8pt; color: #1b5e20; font-weight: 700;
  }

  /* Visa */
  .bloc--visa { break-inside: avoid; }
  .visa-grille { display: flex; gap: 16px; }
  .visa-bloc { flex: 1 1 0; }
  .visa-role { margin: 0 0 14px; font-size: 9pt; font-weight: 600; }
  .visa-ligne { margin: 0; border-bottom: 1px solid #7b8794; }
  .visa-date { margin: 4px 0 0; font-size: 8pt; color: #52606d; }

  /* Pied */
  .pied { margin-top: 16px; padding-top: 9px; border-top: 1px solid #dfe5ec; font-size: 8pt; color: #52606d; }
  .pied p { margin: 0 0 5px; }
  .pied-textes { color: #7b8794; }
  .pied-avertissement { font-style: italic; }

  @media print {
    .barre-actions { display: none !important; }
    .page { max-width: none; padding: 0; margin: 0; }
    .bloc { break-inside: avoid; }
    .decision { break-inside: avoid; }
  }
`;

/* ------------------------------------------------------------------ *
 * Documents
 * ------------------------------------------------------------------ */

/** Document HTML complet et autonome, prêt à imprimer (PDF) ou à télécharger. */
export function documentFiche(dossier: DossierHDJ, resultat: ResultatAudit): string {
  const horodatage = dateFr(new Date());
  const blocages = resultat.motifs_blocage.length > 0;
  const constats = resultat.constats.length > 0;

  let numero = 6; // 1 séjour · 2 vérifications · 3 moyens · 4 motifs · 5 vigilance
  const numeroMoyens = numero++;
  const numeroEquipe = numero++;
  const numeroConstats = constats ? numero++ : null;
  const numeroPieces = numero++;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fiche de traçabilité T2A — évaluation HDJ (${echapper(resultat.statut)})</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="barre-actions">
    <button type="button" onclick="window.print()">Imprimer / Enregistrer en PDF</button>
    <span>Format A4 — police système, texte sélectionnable.</span>
  </div>
  <main class="page">
    ${enteteDocument(resultat, horodatage)}
    ${sectionSejour(dossier)}
    ${sectionPortes(resultat.portes)}
    ${sectionPiliers(resultat.piliers)}
    ${blocages ? sectionBlocages(resultat) : ''}
    ${sectionVigilance(resultat)}
    ${sectionMoyens(dossier, numeroMoyens)}
    ${sectionEquipe(dossier, numeroEquipe)}
    ${numeroConstats === null ? '' : sectionConstats(resultat.constats, numeroConstats)}
    ${sectionPieces(dossier, numeroPieces)}
    ${sectionVisa(numero)}
    ${piedDocument()}
  </main>
</body>
</html>`;
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

/** Téléchargement de la fiche : document HTML autonome, imprimable en PDF. */
export function telechargerFiche(dossier: DossierHDJ, resultat: ResultatAudit): void {
  const blob = new Blob([documentFiche(dossier, resultat)], {
    type: 'text/html;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = `${nomFichier(resultat)}.html`;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
}

/** Ouverture d'une fenêtre imprimable contenant la fiche mise en page. */
export function imprimerFiche(dossier: DossierHDJ, resultat: ResultatAudit): void {
  const fenetre = window.open('', '_blank', 'width=920,height=1000');
  if (!fenetre) {
    window.alert(
      'L’ouverture de la fenêtre d’impression a été bloquée par le navigateur. ' +
        'Autorisez les fenêtres surgissantes puis réessayez.',
    );
    return;
  }
  fenetre.document.open();
  fenetre.document.write(documentFiche(dossier, resultat));
  fenetre.document.close();
  fenetre.focus();
}

/** Version texte de l'audit : presse-papier et échanges par messagerie. */
export function contenuFiche(dossier: DossierHDJ, resultat: ResultatAudit): string {
  const entete = [
    'FICHE DE TRAÇABILITÉ T2A — ÉVALUATION HDJ (GHS) vs ACTES EXTERNES (ACE)',
    `Document généré le ${dateFr(new Date())}`,
    '',
    'OBJET : attester des éléments de traçabilité permettant de caractériser',
    "l'hospitalisation de jour, conformément à l'annexe 4, point 5, de l'instruction.",
    '',
  ].join('\n');

  const pieces = [
    'PIÈCES À RÉUNIR AU DOSSIER',
    `  [${dossier.est_programme ? 'x' : ' '}] Convocation programmée / objectif médical formalisé`,
    `  [${dossier.lettre_adressage_presente ? 'x' : ' '}] Demande médicale préalable (lettre d’adressage)`,
    `  [${dossier.synthese_medicale_tracee ? 'x' : ' '}] Compte-rendu d’hospitalisation ou lettre de sortie signé`,
    `  [${dossier.lettre_liaison_remise ? 'x' : ' '}] Lettre de liaison remise (art. R. 1112-1-2 CSP)`,
    `  [${dossier.surveillance_active_documentee ? 'x' : ' '}] Traçabilité de la surveillance active (constantes, tolérance)`,
    '  [ ] Notes d’évolution individualisées de chaque intervenant',
    '  [ ] Deux spécialités/surspécialités distinctes si plusieurs professionnels médicaux',
    '  [ ] Éléments de contexte patient / surveillance particulière',
    '',
  ].join('\n');

  const visa = [
    '',
    'VISA ET RESPONSABILITÉS',
    '  Rédacteur de l’évaluation : ______________________________  Date : ____/____/______',
    '  Validation DIM             : ______________________________  Date : ____/____/______',
    '  Médecin coordonnateur      : ______________________________  Date : ____/____/______',
    '',
    'DISPOSITIF DE RESCRIT TARIFAIRE (annexe 6)',
    "  En cas de divergence d'interprétation persistante sur les conditions de",
    "  facturation, l'établissement peut solliciter une prise de position formelle",
    "  de l'État et de l'Assurance Maladie (rescrit tarifaire).",
    '',
  ].join('\n');

  const pied = [
    `Référence : Instruction N° ${INSTRUCTION_DGOS_2020_52.id} du ${INSTRUCTION_DGOS_2020_52.date}`,
    `NOR : ${INSTRUCTION_DGOS_2020_52.nor} — ${INSTRUCTION_DGOS_2020_52.publication}`,
    '',
    'Document d’aide à la décision médico-administrative. Il ne se substitue pas',
    'à l’appréciation du médecin DIM ni aux contrôles de l’Assurance Maladie.',
    '',
  ].join('\n');

  return `${entete}${resultat.synthese_audit}\n${pieces}${visa}${pied}`;
}
