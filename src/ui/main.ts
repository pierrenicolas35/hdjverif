/**
 * Interface utilisateur du moteur décisionnel HDJ.
 *
 * L'UI ne contient AUCUNE règle métier : elle collecte la saisie, la convertit
 * en `DossierHDJ`, appelle `evaluerDossier` et affiche le `ResultatAudit`.
 */

import './styles.css';

import {
  PROFESSIONS,
  REGIMES_CHAMP,
  evaluerDossier,
  validerDossier,
} from '../core/rules-engine/index.js';
import type {
  DossierHDJ,
  Profession,
  RegimeChamp,
  ResultatAudit,
} from '../core/rules-engine/index.js';

import { contenuFiche, imprimerFiche, telechargerFiche } from './fiche.js';
import { PRESETS } from './presets.js';
import {
  LIBELLES_PROFESSION,
  LIBELLES_REGIME,
  acteVide,
  etatInitial,
  intervenantVide,
  medicamentVide,
  versDossier,
  type EtatApplication,
} from './store.js';

/* ------------------------------------------------------------------ *
 * Utilitaires DOM
 * ------------------------------------------------------------------ */

/** Récupère un élément par identifiant, en échouant explicitement. */
function el<T extends HTMLElement>(id: string): T {
  const noeud = document.getElementById(id);
  if (!noeud) throw new Error(`Élément introuvable : #${id}`);
  return noeud as T;
}

/** Échappement HTML. */
function esc(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const attribut = (actif: boolean): string => (actif ? ' checked' : '');

/* ------------------------------------------------------------------ *
 * État
 * ------------------------------------------------------------------ */

let etat: EtatApplication = etatInitial();

/** Formulaire des champs scalaires. */
const formulaire = el<HTMLFormElement>('formulaire');

/* ------------------------------------------------------------------ *
 * Rendu des listes déroulantes statiques
 * ------------------------------------------------------------------ */

function rendreOptionsRegime(): void {
  const select = el<HTMLSelectElement>('regime_champ');
  select.innerHTML = REGIMES_CHAMP.map(
    (regime) =>
      `<option value="${regime}">${esc(LIBELLES_REGIME[regime])}</option>`,
  ).join('');
}

/* ------------------------------------------------------------------ *
 * Rendu des blocs dynamiques
 * ------------------------------------------------------------------ */

function rendreIntervenants(): void {
  const zone = el<HTMLDivElement>('zone-intervenants');

  if (etat.intervenants.length === 0) {
    zone.innerHTML =
      '<p class="alerte-vide">Aucun intervenant renseigné : la densité ' +
      'pluriprofessionnelle ne pourra pas être établie.</p>';
    return;
  }

  zone.innerHTML = etat.intervenants
    .map((intervenant, index) => {
      const options = PROFESSIONS.map(
        (profession) =>
          `<option value="${profession}">${esc(LIBELLES_PROFESSION[profession])}</option>`,
      ).join('');

      const estMedecin = intervenant.profession === 'MEDECIN';
      const idTrace = `trace-${intervenant.id}`;

      return `
        <div class="ligne-carte" data-array="intervenants" data-index="${index}">
          <div class="entete-ligne">
            <strong>Intervenant ${index + 1}</strong>
            <button type="button" class="bouton supprimer" data-action="supprimer-intervenant" data-index="${index}">
              Supprimer
            </button>
          </div>
          <div class="grille">
            <div>
              <label>Profession</label>
              <select data-field="profession">${options}</select>
            </div>
            <div>
              <label>Spécialité médicale (médecins)</label>
              <input type="text" data-field="specialite_medicale" value="${esc(
                intervenant.specialite_medicale ?? '',
              )}" placeholder="Endocrinologie, Cardiologie…"${estMedecin ? '' : ' disabled'} />
            </div>
            <div>
              <label>Acte ou atelier réalisé</label>
              <input type="text" data-field="acte_ou_atelier" value="${esc(
                intervenant.acte_ou_atelier,
              )}" placeholder="Entretien éducatif, surveillance…" />
            </div>
          </div>
          <label class="case imperative" for="${idTrace}" style="margin-top: 10px">
            <input type="checkbox" id="${idTrace}" data-field="note_evolution_tracee"${attribut(
              intervenant.note_evolution_tracee,
            )} />
            <span>Note d’évolution rédigée dans le dossier</span>
          </label>
        </div>`;
    })
    .join('');

  // L'attribut `selected` n'est pas appliqué de façon fiable par tous les
  // moteurs de rendu lors d'une réaffectation d'`innerHTML` : on force la
  // valeur des listes déroulantes après insertion.
  zone.querySelectorAll<HTMLElement>('[data-array="intervenants"]').forEach((carte, index) => {
    const intervenant = etat.intervenants[index];
    if (!intervenant) return;
    const select = carte.querySelector<HTMLSelectElement>('[data-field="profession"]');
    if (select) select.value = intervenant.profession;
  });
}

function rendreActes(): void {
  const zone = el<HTMLDivElement>('zone-actes');

  if (etat.actes_ccam.length === 0) {
    zone.innerHTML = '<p class="alerte-vide">Aucun acte CCAM renseigné.</p>';
    return;
  }

  zone.innerHTML = etat.actes_ccam
    .map(
      (acte, index) => `
        <div class="ligne-carte" data-array="actes" data-index="${index}">
          <div class="entete-ligne">
            <strong>Acte ${index + 1}</strong>
            <button type="button" class="bouton supprimer" data-action="supprimer-acte" data-index="${index}">
              Supprimer
            </button>
          </div>
          <div class="grille">
            <div>
              <label>Code CCAM</label>
              <input type="text" data-field="code" value="${esc(acte.code)}" placeholder="DEQP003" />
            </div>
            <div>
              <label>Libellé</label>
              <input type="text" data-field="libelle" value="${esc(
                acte.libelle,
              )}" placeholder="Électrocardiographie…" />
            </div>
          </div>
          <div class="grille" style="margin-top: 10px">
            <label class="case">
              <input type="checkbox" data-field="est_plateau_lourd"${attribut(
                acte.est_plateau_lourd,
              )} />
              <span>Nécessite un plateau technique lourd</span>
            </label>
            <label class="case">
              <input type="checkbox" data-field="est_realisable_externe"${attribut(
                acte.est_realisable_externe,
              )} />
              <span>Réalisable en externe (ville / cabinet)</span>
            </label>
          </div>
        </div>`,
    )
    .join('');
}

function rendreMedicaments(): void {
  const zone = el<HTMLDivElement>('zone-medicaments');

  if (etat.medicaments.length === 0) {
    zone.innerHTML = '<p class="alerte-vide">Aucun produit UCD renseigné.</p>';
    return;
  }

  zone.innerHTML = etat.medicaments
    .map(
      (medicament, index) => `
        <div class="ligne-carte" data-array="medicaments" data-index="${index}">
          <div class="entete-ligne">
            <strong>Produit ${index + 1}</strong>
            <button type="button" class="bouton supprimer" data-action="supprimer-medicament" data-index="${index}">
              Supprimer
            </button>
          </div>
          <div class="grille">
            <div>
              <label>Code UCD</label>
              <input type="text" data-field="code_ucd" value="${esc(
                medicament.code_ucd,
              )}" placeholder="3400938" />
            </div>
            <div>
              <label>Libellé</label>
              <input type="text" data-field="libelle" value="${esc(
                medicament.libelle,
              )}" placeholder="Fer carboxymaltose injectable" />
            </div>
          </div>
          <div class="grille" style="margin-top: 10px">
            <label class="case">
              <input type="checkbox" data-field="reserve_hospitaliere"${attribut(
                medicament.reserve_hospitaliere,
              )} />
              <span>Produit de la réserve hospitalière (art. R. 5121-82 CSP)</span>
            </label>
            <label class="case">
              <input type="checkbox" data-field="necessite_surveillance_continue"${attribut(
                medicament.necessite_surveillance_continue,
              )} />
              <span>Nécessite une surveillance continue</span>
            </label>
          </div>
        </div>`,
    )
    .join('');
}

function rendrePresets(): void {
  const zone = el<HTMLDivElement>('zone-presets');
  zone.innerHTML = PRESETS.map(
    (preset, index) => `
      <button type="button" class="bouton preset" data-action="charger-preset" data-index="${index}">
        <strong>${esc(preset.libelle)}</strong><br />
        <span style="font-size: 0.76rem; color: var(--ardoise-600)">${esc(
          preset.description,
        )}</span><br />
        <span style="font-size: 0.74rem; color: var(--bleu-700)">Attendu : ${esc(
          preset.attendu,
        )}</span>
      </button>`,
  ).join('');
}

/* ------------------------------------------------------------------ *
 * Synchronisation formulaire → état
 * ------------------------------------------------------------------ */

function lireChampsScalaires(): void {
  etat.champs.id_sejour = el<HTMLInputElement>('id_sejour').value;
  etat.champs.date_sejour = el<HTMLInputElement>('date_sejour').value;
  etat.champs.regime_champ = el<HTMLSelectElement>('regime_champ').value as RegimeChamp;
  etat.champs.duree_presence_minutes = Number(
    el<HTMLInputElement>('duree_presence_minutes').value || 0,
  );
  etat.champs.est_programme = el<HTMLInputElement>('est_programme').checked;
  etat.champs.lettre_adressage_presente = el<HTMLInputElement>(
    'lettre_adressage_presente',
  ).checked;
  etat.champs.synthese_medicale_tracee = el<HTMLInputElement>(
    'synthese_medicale_tracee',
  ).checked;
  etat.champs.lettre_liaison_remise = el<HTMLInputElement>('lettre_liaison_remise').checked;
  etat.champs.surveillance_active_documentee = el<HTMLInputElement>(
    'surveillance_active_documentee',
  ).checked;
}

function lireValeur(carte: HTMLElement, champ: string): string {
  const noeud = carte.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[data-field="${champ}"]`,
  );
  return noeud?.value ?? '';
}

function lireBooleen(carte: HTMLElement, champ: string): boolean {
  const noeud = carte.querySelector<HTMLInputElement>(`[data-field="${champ}"]`);
  return noeud?.checked ?? false;
}

function lireIntervenants(): void {
  const cartes = document.querySelectorAll<HTMLElement>('[data-array="intervenants"]');
  etat.intervenants = [...cartes].map((carte, index) => {
    const precedent = etat.intervenants[index] ?? intervenantVide();
    const profession = lireValeur(carte, 'profession') as Profession;
    const specialite = lireValeur(carte, 'specialite_medicale').trim();
    return {
      id: precedent.id,
      profession,
      ...(profession === 'MEDECIN' && specialite ? { specialite_medicale: specialite } : {}),
      note_evolution_tracee: lireBooleen(carte, 'note_evolution_tracee'),
      acte_ou_atelier: lireValeur(carte, 'acte_ou_atelier').trim(),
    };
  });
}

function lireActes(): void {
  const cartes = document.querySelectorAll<HTMLElement>('[data-array="actes"]');
  etat.actes_ccam = [...cartes].map((carte) => ({
    code: lireValeur(carte, 'code').trim(),
    libelle: lireValeur(carte, 'libelle').trim(),
    est_plateau_lourd: lireBooleen(carte, 'est_plateau_lourd'),
    est_realisable_externe: lireBooleen(carte, 'est_realisable_externe'),
  }));
}

function lireMedicaments(): void {
  const cartes = document.querySelectorAll<HTMLElement>('[data-array="medicaments"]');
  etat.medicaments = [...cartes].map((carte) => ({
    code_ucd: lireValeur(carte, 'code_ucd').trim(),
    libelle: lireValeur(carte, 'libelle').trim(),
    reserve_hospitaliere: lireBooleen(carte, 'reserve_hospitaliere'),
    necessite_surveillance_continue: lireBooleen(carte, 'necessite_surveillance_continue'),
  }));
}

function synchroniserDepuisFormulaire(): void {
  lireChampsScalaires();
  lireIntervenants();
  lireActes();
  lireMedicaments();
}

/* ------------------------------------------------------------------ *
 * Rendu du panneau de résultat
 * ------------------------------------------------------------------ */

const MENTIONS: Readonly<Record<ResultatAudit['statut'], string>> = {
  VALIDE_GHS: 'GHS facturable — critères de l’instruction satisfaits.',
  SUSPENDU_POUR_REGULARISATION:
    'Régularisation requise avant validation DIM (pièce obligatoire manquante).',
  REJET_VERS_ACE: 'Requalification en actes et consultations externes (ACE / CSO).',
  REJET_VERS_FORFAIT_SEANCE: 'Requalification en forfait de séance dédié.',
  REJET_HORS_MCO: 'Prise en charge hors champ MCO de l’instruction.',
  REJET_NON_PROGRAMME: 'Séjour non programmé : facturation en GHS exclue.',
};

function rendreResultat(resultat: ResultatAudit, dossier: DossierHDJ): void {
  // --- Badge de statut -------------------------------------------------
  const badge = el<HTMLDivElement>('badge');
  badge.className = `badge ${resultat.severite}`;
  el<HTMLDivElement>('badge-statut').textContent = resultat.statut;
  el<HTMLDivElement>('badge-mention').textContent = MENTIONS[resultat.statut];

  // --- Pyramide des portes --------------------------------------------
  el<HTMLUListElement>('zone-portes').innerHTML = resultat.portes
    .map(
      (porte) => `
        <li>
          <span class="marqueur ${porte.statut}">${porte.statut}</span>
          <span>${esc(porte.libelle)}</span>
        </li>`,
    )
    .join('');

  // --- Piliers de densité ---------------------------------------------
  const zonePiliers = el<HTMLDivElement>('zone-piliers');
  if (resultat.piliers.length === 0) {
    zonePiliers.innerHTML =
      '<p class="alerte-vide">Évaluation des piliers non atteinte (porte bloquante en amont).</p>';
  } else {
    zonePiliers.innerHTML = resultat.piliers
      .map(
        (pilier) => `
          <div class="pilier ${pilier.valide ? 'valide' : 'echec'}">
            <strong>${pilier.valide ? '✔' : '✘'} ${esc(pilier.libelle)}</strong>
            <ul class="detail">
              ${pilier.justifications.map((j) => `<li>${esc(j)}</li>`).join('')}
            </ul>
          </div>`,
      )
      .join('');
  }

  // --- Motifs de blocage ----------------------------------------------
  el<HTMLUListElement>('zone-motifs').innerHTML =
    resultat.motifs_blocage.length === 0
      ? '<li style="list-style: none; color: var(--vert-900)">Aucun motif de blocage.</li>'
      : resultat.motifs_blocage.map((motif) => `<li>${esc(motif)}</li>`).join('');

  // --- Alertes qualité -------------------------------------------------
  el<HTMLUListElement>('zone-alertes').innerHTML =
    resultat.alertes_controle.length === 0
      ? '<li style="list-style: none" class="alerte-vide">Aucune alerte qualité.</li>'
      : resultat.alertes_controle.map((alerte) => `<li>${esc(alerte)}</li>`).join('');

  // --- Constats et références -----------------------------------------
  el<HTMLDivElement>('zone-constats').innerHTML = resultat.constats
    .map(
      (c) => `
        <div class="constat">
          <code>${esc(c.code)}</code> ${esc(c.message)}
          <span class="source">↳ ${esc(c.porte)} — ${esc(c.reference)}</span>
        </div>`,
    )
    .join('');

  // --- Erreurs de saisie (bloquantes) ----------------------------------
  const erreurs = validerDossier(dossier);
  if (erreurs.length > 0) {
    el<HTMLDivElement>('zone-constats').insertAdjacentHTML(
      'afterbegin',
      `<div class="constat"><code>SAISIE_INCOMPLETE</code> Dossier non exploitable :
        ${erreurs.map((e) => esc(`${e.champ} — ${e.message}`)).join(' ; ')}</div>`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Boucle d'évaluation temps réel
 * ------------------------------------------------------------------ */

let dernierResultat: ResultatAudit = evaluerDossier(versDossier(etat));
let dernierDossier: DossierHDJ = versDossier(etat);

function evaluerEtRendre(): void {
  dernierDossier = versDossier(etat);
  dernierResultat = evaluerDossier(dernierDossier);
  rendreResultat(dernierResultat, dernierDossier);
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

function chargerEtat(nouvelEtat: EtatApplication): void {
  etat = structuredClone(nouvelEtat);
  rendreChamps();
  rendreIntervenants();
  rendreActes();
  rendreMedicaments();
  evaluerEtRendre();
}

function rendreChamps(): void {
  el<HTMLInputElement>('id_sejour').value = etat.champs.id_sejour;
  el<HTMLInputElement>('date_sejour').value = etat.champs.date_sejour;
  el<HTMLSelectElement>('regime_champ').value = etat.champs.regime_champ;
  el<HTMLInputElement>('duree_presence_minutes').value = String(
    etat.champs.duree_presence_minutes,
  );
  el<HTMLInputElement>('est_programme').checked = etat.champs.est_programme;
  el<HTMLInputElement>('lettre_adressage_presente').checked =
    etat.champs.lettre_adressage_presente;
  el<HTMLInputElement>('synthese_medicale_tracee').checked =
    etat.champs.synthese_medicale_tracee;
  el<HTMLInputElement>('lettre_liaison_remise').checked = etat.champs.lettre_liaison_remise;
  el<HTMLInputElement>('surveillance_active_documentee').checked =
    etat.champs.surveillance_active_documentee;
}

/** Bascule l'état « désactivé » du champ spécialité selon la profession. */
function ajusterSpecifiqueMedecin(cible: HTMLSelectElement): void {
  const carte = cible.closest<HTMLElement>('.ligne-carte');
  const champ = carte?.querySelector<HTMLInputElement>('[data-field="specialite_medicale"]');
  if (champ) champ.disabled = cible.value !== 'MEDECIN';
}

function gererClic(evenement: MouseEvent): void {
  const cible = (evenement.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!cible) return;

  const action = cible.dataset.action;
  const index = Number(cible.dataset.index ?? -1);

  switch (action) {
    case 'ajouter-intervenant':
      etat.intervenants.push(intervenantVide());
      rendreIntervenants();
      evaluerEtRendre();
      break;
    case 'supprimer-intervenant':
      etat.intervenants.splice(index, 1);
      rendreIntervenants();
      evaluerEtRendre();
      break;
    case 'ajouter-acte':
      etat.actes_ccam.push(acteVide());
      rendreActes();
      evaluerEtRendre();
      break;
    case 'supprimer-acte':
      etat.actes_ccam.splice(index, 1);
      rendreActes();
      evaluerEtRendre();
      break;
    case 'ajouter-medicament':
      etat.medicaments.push(medicamentVide());
      rendreMedicaments();
      evaluerEtRendre();
      break;
    case 'supprimer-medicament':
      etat.medicaments.splice(index, 1);
      rendreMedicaments();
      evaluerEtRendre();
      break;
    case 'charger-preset': {
      const preset = PRESETS[index];
      if (preset) chargerEtat(preset.etat);
      break;
    }
    default:
      break;
  }
}

function gererSaisie(evenement: Event): void {
  const cible = evenement.target;
  if (cible instanceof HTMLSelectElement && cible.dataset.field === 'profession') {
    ajusterSpecifiqueMedecin(cible);
  }
  synchroniserDepuisFormulaire();
  evaluerEtRendre();
}

/* ------------------------------------------------------------------ *
 * Démarrage
 * ------------------------------------------------------------------ */

function initialiser(): void {
  rendreOptionsRegime();
  rendrePresets();
  rendreChamps();
  rendreIntervenants();
  rendreActes();
  rendreMedicaments();

  formulaire.addEventListener('input', gererSaisie);
  formulaire.addEventListener('change', gererSaisie);
  formulaire.addEventListener('click', gererClic);
  formulaire.addEventListener('submit', (evenement) => evenement.preventDefault());

  el<HTMLButtonElement>('btn-fiche-imprimer').addEventListener('click', () => {
    imprimerFiche(dernierDossier, dernierResultat);
  });

  el<HTMLButtonElement>('btn-fiche-telecharger').addEventListener('click', () => {
    telechargerFiche(dernierDossier, dernierResultat);
  });

  el<HTMLButtonElement>('btn-copier-synthese').addEventListener('click', () => {
    const bouton = el<HTMLButtonElement>('btn-copier-synthese');
    const texte = contenuFiche(dernierDossier, dernierResultat);
    const confirmation = (): void => {
      const initial = bouton.textContent;
      bouton.textContent = '✅ Synthèse copiée';
      window.setTimeout(() => {
        bouton.textContent = initial;
      }, 2500);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(texte).then(confirmation).catch(() => {
        window.prompt('Copiez la synthèse ci-dessous :', texte);
      });
    } else {
      window.prompt('Copiez la synthèse ci-dessous :', texte);
    }
  });

  // Chargement par défaut : premier cas de démonstration.
  const premier = PRESETS[0];
  if (premier) chargerEtat(premier.etat);
  else evaluerEtRendre();
}

initialiser();
