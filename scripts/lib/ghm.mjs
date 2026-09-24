/**
 * Référentiel ATIH — actes CCAM valorisables en hospitalisation de jour.
 *
 * OBJET
 *   Croiser la nomenclature CCAM avec les tables **officielles** du Manuel des GHM MCO
 *   (version 2025, arrêté publié au BO le 23/07/2025) pour répondre à deux questions
 *   opérationnelles de codage et de facturation T2A :
 *     1. cet acte **classe-t-il** le séjour à lui seul (« acte classant ») ?
 *     2. ce séjour peut-il être **sans nuitée** (GHM ambulatoire strict ou très courte durée),
 *        c'est-à-dire facturable en GHS d'hospitalisation de jour ?
 *
 * SOURCES OFFICIELLES (aucune règle n'est inventée ici)
 *   • `racines-ghm-2025.csv`      ← annexe 2 (GHM classés par CMD) et annexe 3
 *     (« GHM courts » : J = GHM ambulatoire strict (0 nuit), T0/T1/T2 = très courte durée).
 *   • `actes-classants-ghm-2025.csv` ← annexe 8 (actes classants et CMD où ils sont
 *     répertoriés), annexe 11 (actes mineurs reclassant dans un GHM « médical ») et
 *     **volume 2 par CMD** (listes d'actes en CCAM rattachées à chaque racine de GHM).
 *
 *   Le volume 2 est la seule source qui rattache un acte à une **racine de GHM** ; l'annexe 8
 *   ne donne que les CMD. Les deux lectures se recoupent à 99,8 % (5 472 actes sur les
 *   5 483 de l'annexe 8), ce qui sert de contrôle d'intégrité (`scripts/verifier-referentiel.mjs`).
 *
 * CE QUE LA CCAM NE DIT PAS
 *   La CCAM ne porte aucune information d'anesthésie ni de présence d'un MAR : ces actes
 *   forment le **chapitre 18** (« Anesthésies complémentaires et gestes complémentaires »),
 *   absent du jeu de données « CCAM Ameli ». Un acte d'anesthésie porte le **code « activité »
 *   4** et n'est **jamais classant** : c'est un geste complémentaire (Manuel des GHM,
 *   volume 2, CMD 01 — « séjours sans nuitée contenant des actes classants non opératoires
 *   avec un code “activité” égal à 4, y compris les gestes complémentaires d'anesthésie »).
 */

import { decouperCsv } from './referentiels.mjs';

/* ------------------------------------------------------------------ *
 * Enrichissement des actes CCAM
 * ------------------------------------------------------------------ */

/**
 * Ajoute à chaque acte CCAM les colonnes du référentiel ATIH.
 *
 * Le libellé et les indicateurs CCAM de l'acte ne sont jamais modifiés : les colonnes
 * ajoutées disent ce que le Manuel des GHM ajoute à la nomenclature, pas autre chose.
 * `eligible_hdj` est le **booléen** retenu en base (GHM ambulatoire strict) ; le texte
 * `eligibilite_hdj` en donne la version nuancée, à trois états.
 *
 * @param {object[]} actes lignes issues de `construireActes()`
 * @param {{racines: Map, actesClassants: Map}} referentiel
 */
export function enrichirActesAvecGhm(actes, { racines, actesClassants }) {
  return actes.map((acte) => {
    const c = classerActeHdj(acte, { actesClassants, racines });
    return {
      ...acte,
      // Le plateau technique lourd déduit de la classification en GHM remplace la valeur
      // absente laissée par la nomenclature CCAM (voir `classerActeHdj`).
      necessite_plateau_lourd: c.plateauTechniqueLourdRequis,
      acte_classant: c.acteClassant,
      racines_ghm: c.racinesGhm.join(' ') || null,
      cmd_classantes: c.cmdClassantes.join(' ') || null,
      ghm_ambulatoire_strict: c.ghmAmbulatoireStrict,
      admet_sejour_0_nuit: c.admetSejourZeroNuit,
      reclassant_ghm_medical: c.reclassantMedical,
      type_acte: c.typeActe,
      eligible_hdj: c.eligibleHdj === ELIGIBILITE.OUI,
      eligibilite_hdj: c.eligibleHdj,
      motif_eligibilite_hdj: c.motifEligibilite,
      environnement_requis: c.environnementRequis,
      commentaire_pmsi: c.commentairePmsi,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Catégories majeures de GHM (annexe 2)
 * ------------------------------------------------------------------ */

/** Les catégories majeures publiées, telles qu'écrites dans l'annexe 2. */
export const CATEGORIE_CHIRURGICALE = 'Groupes chirurgicaux';
export const CATEGORIE_NON_OPERATOIRE = 'Groupes avec acte classant non opératoire';
export const CATEGORIE_MEDICALE = 'Groupes "médicaux"';

/* ------------------------------------------------------------------ *
 * Lecture des fichiers de référence
 * ------------------------------------------------------------------ */

/**
 * Découpe un CSV « ; » en ignorant les lignes de commentaire (`#`) et vides.
 *
 * Le découpage respecte les guillemets : les libellés officiels en contiennent (par exemple
 * « Traitement de premier recours … (pose d'une perfusion ; administration d'oxygène …) »).
 *
 * @returns {{entetes: string[], lignes: Object<string,string>[]}}
 */
export function lireCsvPointVirgule(contenu) {
  const utiles = contenu
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trimStart().startsWith('#'));
  const entetes = decouperCsv(utiles.shift() ?? '', ';');
  const lignes = utiles.map((l) => {
    const cellules = decouperCsv(l, ';');
    return Object.fromEntries(entetes.map((h, i) => [h.trim(), (cellules[i] ?? '').trim()]));
  });
  return { entetes, lignes };
}

/**
 * Racines de GHM et leurs caractéristiques.
 *
 * `ghmCourt` est le marqueur « GHM courts » de l'annexe 3 :
 *   • `J`  — GHM ambulatoire strict (0 nuit) ;
 *   • `T0` — très courte durée, séjours de 0 jour ;
 *   • `T1` — très courte durée, séjours de 0 et 1 jour ;
 *   • `T2` — très courte durée, séjours de 0, 1 et 2 jours.
 * Une racine sans marqueur ne décrit aucun séjour de 0 nuit.
 *
 * @returns {Map<string, {racine: string, cmd: string, categorieMajeure: string,
 *          ghmCourt: string, admetSejourZeroNuit: boolean, libelle: string}>}
 */
export function lireRacinesGhm(contenu) {
  const racines = new Map();
  for (const l of lireCsvPointVirgule(contenu).lignes) {
    if (!l.racine_ghm) continue;
    const ghmCourt = l.ghm_court || '';
    racines.set(l.racine_ghm, {
      racine: l.racine_ghm,
      cmd: l.cmd || '',
      categorieMajeure: l.categorie_majeure_ghm || '',
      ghmCourt,
      admetSejourZeroNuit: l.admet_sejour_0_nuit === 'oui',
      libelle: l.libelle || '',
    });
  }
  return racines;
}

/**
 * Actes CCAM classants et racines de GHM dans lesquelles ils classent.
 *
 * @returns {Map<string, {racines: string[], cmds: string[], reclassantMedical: boolean,
 *          libelleGhm: string}>}
 */
export function lireActesClassantsGhm(contenu) {
  const actes = new Map();
  for (const l of lireCsvPointVirgule(contenu).lignes) {
    if (!l.code_ccam) continue;
    actes.set(l.code_ccam, {
      racines: (l.racines_ghm || '').split(/\s+/).filter(Boolean),
      cmds: (l.cmds_classantes || '').split(/\s+/).filter(Boolean),
      reclassantMedical: l.reclassant_ghm_medical === 'oui',
      libelleGhm: l.libelle_ghm || '',
    });
  }
  return actes;
}

/* ------------------------------------------------------------------ *
 * Classement d'un acte
 * ------------------------------------------------------------------ */

/** Vocabulaire de restitution — les trois statuts demandés par le codage HDJ. */
export const TYPE_ACTE = {
  /** Acte interventionnel classant : il valide l'HDJ à lui seul. */
  OPERATOIRE: 'Acte interventionnel classant',
  /** Acte classant non opératoire : plateau technique, souvent guidé par l'image. */
  NON_OPERATOIRE: 'Acte lourd non opératoire',
  /** Acte classant reclassé dans un GHM médical : il ne valide pas l'HDJ à lui seul. */
  RECLASSANT_MEDICAL: 'Acte reclassant en GHM médical',
  /** Acte absent des listes d'actes classants : il n'ouvre aucun GHS à lui seul. */
  NON_CLASSANT: 'Acte non classant',
};

/**
 * Statuts d'éligibilité.
 *
 * Ils sont **au nombre de trois**, et non de deux, parce que l'acte seul ne suffit pas à
 * décider : le GHM obtenu dépend aussi du diagnostic principal et de l'algorithme de
 * groupage. Un acte peut donc classer dans **plusieurs** racines, dont certaines seulement
 * décrivent un séjour de 0 nuit. Le rattachement d'un acte aux listes du volume 2 est
 * d'ailleurs volontairement large (la liste A-369 « Interventions majeures de la CMD 17 »
 * couvre 1 768 actes) : prendre la racine la plus permissive reviendrait à valider une HDJ
 * sur une césarienne, dont les racines « voie basse très courte durée » ne la concernent pas.
 */
export const ELIGIBILITE = {
  /** Au moins une racine n'a qu'un GHM en « J » : ambulatoire strict, 0 nuit. */
  OUI: 'oui',
  /** Pas de GHM ambulatoire strict, mais une racine en très courte durée (T0/T1/T2). */
  SOUS_CONDITION: 'sous condition',
  /** Aucune racine ne décrit de séjour de 0 nuit. */
  NON: 'non',
};

/** Ce qui motive le statut — repris tel quel dans la traçabilité PMSI. */
export const MOTIF_ELIGIBILITE = {
  NON_CLASSANT:
    'non — acte non classant : il n’ouvre pas de GHS à lui seul (ACE ou forfait de séance)',
  RECLASSANT:
    'non — annexe 11 : acte mineur reclassant dans un GHM « médical », il ne valide pas l’HDJ',
  SANS_GHM_0_NUIT:
    'non — aucune racine de cet acte ne décrit de séjour de 0 nuit : au moins une nuitée requise',
  SOUS_CONDITION:
    'sous condition — pas de GHM ambulatoire strict, mais racine en très courte durée : la ' +
    'recevabilité dépend du diagnostic principal et de la racine effectivement retenue',
  OUI: 'oui — GHM ambulatoire strict (0 nuit) : l’acte peut valider un GHS d’HDJ à lui seul',
};

/**
 * Classe un acte CCAM au regard du codage HDJ.
 *
 * Règles appliquées, dans cet ordre :
 *   1. l'acte est **classant** s'il figure dans les listes d'actes du volume 2 (donc à
 *      l'annexe 8) ; l'annexe 8 seule ne suffit pas, elle ne dit pas la racine ;
 *   2. il est **reclassant médical** s'il figure à l'annexe 11 : malgré sa présence dans les
 *      listes, le séjour est groupé dans un GHM « médical » — il ne valide donc pas l'HDJ ;
 *   3. il est **éligible à l'HDJ** si au moins une de ses racines ne décrit qu'un GHM en
 *      « J » (ambulatoire strict, 0 nuit, annexe 3) : le séjour de 0 nuit est alors acquis ;
 *      à défaut, une racine en très courte durée (`T0`/`T1`/`T2`) ne donne qu'un statut
 *      **« sous condition »**, la racine retenue dépendant du diagnostic principal ;
 *   4. le **type d'acte** reprend la catégorie majeure de GHM (annexe 2), la catégorie
 *      chirurgicale primant lorsqu'un acte classe dans plusieurs racines.
 *
 * @param {{code: string, libelle: string, necessite_plateau_lourd?: boolean}} acte
 * @param {{actesClassants: Map, racines: Map}} referentiel
 * @returns {{acteClassant: boolean, racinesGhm: string[], cmdClassantes: string[],
 *            ghmAmbulatoireStrict: boolean, admetSejourZeroNuit: boolean,
 *            reclassantMedical: boolean, typeActe: string,
 *            eligibleHdj: 'oui'|'sous condition'|'non', motifEligibilite: string,
 *            environnementRequis: string, commentairePmsi: string}}
 */
export function classerActeHdj(acte, { actesClassants, racines }) {
  const fiche = actesClassants.get(acte.code);
  const acteClassant = Boolean(fiche);
  const racinesGhm = fiche?.racines ?? [];
  const details = racinesGhm.map((r) => racines.get(r)).filter(Boolean);

  const ghmAmbulatoireStrict = details.some((r) => r.ghmCourt === 'J');
  const admetSejourZeroNuit = details.some((r) => r.admetSejourZeroNuit);
  const reclassantMedical = fiche?.reclassantMedical ?? false;

  const types = new Set(details.map((r) => r.categorieMajeure));
  let typeActe;
  if (!acteClassant) typeActe = TYPE_ACTE.NON_CLASSANT;
  else if (reclassantMedical) typeActe = TYPE_ACTE.RECLASSANT_MEDICAL;
  else if (types.has(CATEGORIE_CHIRURGICALE)) typeActe = TYPE_ACTE.OPERATOIRE;
  else if (types.has(CATEGORIE_NON_OPERATOIRE)) typeActe = TYPE_ACTE.NON_OPERATOIRE;
  else typeActe = TYPE_ACTE.NON_OPERATOIRE;

  // Le mode d'accès de la CCAM n'est pas connu des actes absents du jeu de données libéral
  // (chapitre 18, actes hospitaliers, forfaits du chapitre 19) : c'est alors la classification
  // en GHM qui tranche — un séjour groupé dans un « Groupe chirurgical » suppose un bloc
  // opératoire. Hors de ce cas, la valeur reste **absente** (`null`) plutôt que convertie en
  // « non » : même doctrine que pour la réserve hospitalière.
  const plateauLourd = acte.necessite_plateau_lourd
    ?? (typeActe === TYPE_ACTE.OPERATOIRE ? true : null);

  let eligibleHdj;
  let motifEligibilite;
  if (!acteClassant) {
    eligibleHdj = ELIGIBILITE.NON;
    motifEligibilite = MOTIF_ELIGIBILITE.NON_CLASSANT;
  } else if (reclassantMedical) {
    eligibleHdj = ELIGIBILITE.NON;
    motifEligibilite = MOTIF_ELIGIBILITE.RECLASSANT;
  } else if (ghmAmbulatoireStrict) {
    eligibleHdj = ELIGIBILITE.OUI;
    motifEligibilite = MOTIF_ELIGIBILITE.OUI;
  } else if (admetSejourZeroNuit) {
    eligibleHdj = ELIGIBILITE.SOUS_CONDITION;
    motifEligibilite = MOTIF_ELIGIBILITE.SOUS_CONDITION;
  } else {
    eligibleHdj = ELIGIBILITE.NON;
    motifEligibilite = MOTIF_ELIGIBILITE.SANS_GHM_0_NUIT;
  }

  return {
    acteClassant,
    racinesGhm,
    cmdClassantes: fiche?.cmds ?? [],
    ghmAmbulatoireStrict,
    admetSejourZeroNuit,
    reclassantMedical,
    typeActe,
    eligibleHdj,
    motifEligibilite,
    plateauTechniqueLourdRequis: plateauLourd,
    environnementRequis: environnementRequis(details, plateauLourd),
    commentairePmsi: commentairePmsi({
      acteClassant,
      typeActe,
      ghmAmbulatoireStrict,
      reclassantMedical,
      racinesGhm,
      details,
      plateauLourd,
      libelleGhm: fiche?.libelleGhm ?? '',
    }),
  };
}

/** Environnement technique que l'acte mobilise, d'après la CCAM et les libellés de racines. */
function environnementRequis(details, plateauLourd) {
  if (details.some((r) => /anesth[ée]sie/i.test(r.libelle))) {
    return 'Anesthésie (AG/ALR) mentionnée par la racine de GHM';
  }
  if (plateauLourd) return 'Bloc opératoire ou salle interventionnelle';
  return 'Aucun plateau technique lourd';
}

/** Commentaire de traçabilité : ce que le contrôle T2A peut opposer au dossier. */
function commentairePmsi({
  acteClassant,
  typeActe,
  ghmAmbulatoireStrict,
  reclassantMedical,
  racinesGhm,
  details,
  plateauLourd,
  libelleGhm,
}) {
  const bouts = [];
  if (!acteClassant) {
    bouts.push(
      'Absent des listes d’actes classants du Manuel des GHM : n’ouvre pas de GHS à lui seul ' +
        '(reste facturable en ACE ou en forfait de séance selon la prise en charge).',
    );
    if (plateauLourd) bouts.push('Plateau technique lourd : à documenter au dossier.');
    return bouts.join(' ');
  }
  bouts.push(`Racine(s) GHM : ${racinesGhm.join(', ')}.`);
  if (libelleGhm) bouts.push(`Libellé ATIH : « ${libelleGhm.toLowerCase()} ».`);
  if (reclassantMedical) {
    bouts.push(
      'Annexe 11 : acte mineur reclassant dans un GHM « médical » — classant au sens de la ' +
        'liste, mais le séjour est groupé en GHM médical : il ne valide pas l’HDJ à lui seul.',
    );
  } else if (ghmAmbulatoireStrict) {
    const jRacines = details.filter((r) => r.ghmCourt === 'J').map((r) => r.racine);
    bouts.push(
      `Racine(s) en GHM ambulatoire strict (0 nuit) : ${jRacines.join(', ')}. L’HDJ n’est ` +
        'recevable que si le groupage retient effectivement l’une d’elles — un même acte peut ' +
        'classer dans plusieurs racines, dont certaines exigent une nuitée.',
    );
  } else if (details.some((r) => r.admetSejourZeroNuit)) {
    bouts.push(
      'Sous condition : aucun GHM ambulatoire strict, mais racine(s) en très courte durée ' +
        `(${details
          .filter((r) => r.admetSejourZeroNuit)
          .map((r) => r.ghmCourt)
          .join(', ')}) — un séjour de 0 nuit n’est recevable que si le diagnostic principal ` +
        'retient effectivement l’une de ces racines.',
    );
  } else {
    bouts.push(
      'Aucune racine de cet acte ne décrit de séjour de 0 nuit : une HDJ n’est pas ' +
        'recevable sur cet acte seul (au moins une nuitée requise par la classification).',
    );
  }
  if (typeActe === TYPE_ACTE.NON_OPERATOIRE) {
    bouts.push('Acte classant non opératoire : conditions de réalisation à tracer (salle, matériel).');
  }
  return bouts.join(' ');
}
