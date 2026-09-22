/**
 * Primitives métier réutilisables par les portes du moteur.
 * Fonctions pures, sans effet de bord.
 */

import { CRITERES_CONTEXTE_PATIENT, PROFESSIONS_PARAMEDICALES } from './types.js';
import type {
  ActeCCAM,
  CritereContextePatient,
  DossierHDJ,
  Intervenant,
  MedicamentUCD,
  NiveauGHS,
} from './types.js';

/**
 * Acte d'électrocardiographie sur au moins douze dérivations.
 * Explicitement exclu du dénombrement des interventions par l'annexe 4,
 * point 2.b.iii de l'instruction.
 */
export const CODE_CCAM_NON_DENOMBRABLE_ECG = 'DEQP003';

/**
 * Intervenants « actifs » : seuls ceux dont l'intervention se traduit par une
 * note d'évolution individualisée dans le dossier constituent une ressource
 * opposable en contrôle T2A.
 */
export function intervenantsActifs(dossier: DossierHDJ): readonly Intervenant[] {
  return dossier.intervenants.filter((i) => i.note_evolution_tracee);
}

/** Intervenants actifs appartenant au corps médical. */
export function medecinsActifs(dossier: DossierHDJ): readonly Intervenant[] {
  return intervenantsActifs(dossier).filter((i) => i.profession === 'MEDECIN');
}

/** Intervenants actifs paramédicaux ou sociaux (hors corps médical). */
export function paramedicauxActifs(dossier: DossierHDJ): readonly Intervenant[] {
  return intervenantsActifs(dossier).filter((i) =>
    PROFESSIONS_PARAMEDICALES.includes(i.profession),
  );
}

/**
 * Spécialités médicales distinctes et réellement renseignées parmi les
 * médecins actifs. Une spécialité absente n'est pas dénombrable : elle ne
 * permet pas d'établir la distinction exigée par l'instruction.
 */
export function specialitesMedicalesDistinctes(
  dossier: DossierHDJ,
): readonly string[] {
  const specialites = new Set<string>();
  for (const medecin of medecinsActifs(dossier)) {
    const specialite = medecin.specialite_medicale?.trim();
    if (specialite) specialites.add(specialite.toLowerCase());
  }
  return [...specialites];
}

/** Professions distinctes parmi les intervenants actifs paramédicaux/sociaux. */
export function professionsParamedicalesDistinctes(
  dossier: DossierHDJ,
): readonly string[] {
  return [...new Set(paramedicauxActifs(dossier).map((i) => i.profession))];
}

/**
 * Actes CCAM dénombrables : les codes vides et l'acte DEQP003 (ECG ≥ 12
 * dérivations) sont exclus du décompte des interventions.
 */
export function actesDenombrables(dossier: DossierHDJ): readonly ActeCCAM[] {
  return dossier.actes_ccam.filter(
    (acte) =>
      acte.code.trim() !== '' && acte.code !== CODE_CCAM_NON_DENOMBRABLE_ECG,
  );
}

/** Codes CCAM distincts (hors ECG non dénombrable). */
export function codesCcamDistincts(dossier: DossierHDJ): readonly string[] {
  return [...new Set(actesDenombrables(dossier).map((a) => a.code))];
}

/**
 * Médicaments emportant une présomption de surveillance particulière :
 * produit de la réserve hospitalière ou surveillance continue requise.
 */
export function medicamentsSurveillanceParticuliere(
  dossier: DossierHDJ,
): readonly MedicamentUCD[] {
  return dossier.medicaments.filter(
    (m) => m.reserve_hospitaliere || m.necessite_surveillance_continue,
  );
}

/**
 * Nombre d'interventions dénombrées au sens de l'annexe 4, point 2.b.iii.
 *
 * Règles appliquées :
 *  1. chaque acte CCAM dénombrable compte pour une intervention (l'ECG
 *     DEQP003 est exclu) ;
 *  2. chaque intervenant paramédical/socio-éducatif ayant tracé une note
 *     d'évolution compte pour une intervention ;
 *  3. les médecins ne sont dénombrés que s'ils relèvent de spécialités
 *     distinctes lorsqu'ils sont plusieurs ; un médecin seul peut voir
 *     l'ensemble de ses interventions dénombrées.
 *
 * Ce décompte est restitué à titre informatif (gradation GHS intermédiaire à
 * compter de 3 interventions, GHS plein à compter de 4) ; il ne conditionne
 * pas à lui seul la décision du moteur, qui s'appuie sur les piliers de densité.
 */
export function denombrerInterventions(dossier: DossierHDJ): number {
  const nbActes = codesCcamDistincts(dossier).length;

  const intervenantsTracees = intervenantsActifs(dossier);

  // 3. Corps médical.
  const medecins = intervenantsTracees.filter((i) => i.profession === 'MEDECIN');
  let nbMedecins: number;
  if (medecins.length <= 1) {
    nbMedecins = medecins.length;
  } else {
    const specialites = new Set(
      medecins
        .map((m) => m.specialite_medicale?.trim().toLowerCase())
        .filter((s): s is string => Boolean(s)),
    );
    nbMedecins = specialites.size;
  }

  // 2. Paramédicaux / socio-éducatifs.
  const nbParamedicaux = intervenantsTracees.filter((i) =>
    PROFESSIONS_PARAMEDICALES.includes(i.profession),
  ).length;

  return nbActes + nbMedecins + nbParamedicaux;
}

/**
 * Niveau de GHS à retenir pour une prise en charge dont la densité est établie.
 *
 * Le GHS « plein » est retenu dès lors que la prise en charge comporte :
 *  - une surveillance particulière (surveillance active documentée, produit de
 *    la réserve hospitalière ou à surveillance continue), ou
 *  - un contexte patient particulier (au moins une situation de vulnérabilité
 *    retenue au dossier), ou
 *  - un acte classant / une prise en charge sur plateau technique (acte lourd ou
 *    au moins deux actes CCAM dénombrables distincts), ou
 *  - au moins quatre interventions dénombrées.
 *
 * À défaut — typiquement une prise en charge de médecine pluriprofessionnelle
 * reposant sur exactement trois interventions — le GHS « intermédiaire »
 * s'applique (annexe 4, point 2.b.iii).
 */
export function niveauGhs(dossier: DossierHDJ): NiveauGHS {
  const surveillanceParticuliere =
    dossier.surveillance_active_documentee ||
    medicamentsSurveillanceParticuliere(dossier).length > 0;

  const contextePatient = contextePatientParticulier(dossier).length > 0;

  const plateauTechnique =
    actesDenombrables(dossier).some((acte) => acte.est_plateau_lourd) ||
    codesCcamDistincts(dossier).length >= 2;

  if (surveillanceParticuliere || contextePatient || plateauTechnique) return 'PLEIN';
  return denombrerInterventions(dossier) >= 4 ? 'PLEIN' : 'INTERMEDIAIRE';
}

/**
 * Situations de vulnérabilité retenues au titre du « contexte patient ».
 *
 * Une seule situation suffit à caractériser un « contexte patient particulier »
 * (annexe 4, point 2.b.iii) : le GHS plein est alors justifié indépendamment du
 * nombre d'interventions réalisées. Les éléments doivent être retracés dans le
 * dossier du patient (annexe 4, point 5).
 */
export function contextePatientParticulier(
  dossier: DossierHDJ,
): readonly CritereContextePatient[] {
  // Un critère inconnu est ignoré : le moteur ne se fie qu'à l'énumération.
  return dossier.contexte_patient.filter((critere) =>
    CRITERES_CONTEXTE_PATIENT.includes(critere),
  );
}
