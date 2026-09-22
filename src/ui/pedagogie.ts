/**
 * Contenu pédagogique de l'assistant.
 *
 * Philosophie : l'assistant n'interroge pas l'identité professionnelle de
 * l'utilisateur. Il propose de choisir une **discipline clinique** dans le seul
 * but d'illustrer les règles par des cas concrets de cette discipline.
 *
 * Pour chaque étape : le « pourquoi » de la question et la règle applicable
 * (génériques), complétés par des **cas typiques rattachés à la discipline**
 * choisie et filtrés selon l'étape en cours.
 */

/* ================================================================== *
 * Disciplines cliniques
 * ================================================================== */

export type Discipline =
  | 'ENDOCRINOLOGIE'
  | 'CARDIOLOGIE'
  | 'ONCOLOGIE'
  | 'NEUROLOGIE'
  | 'RHUMATOLOGIE'
  | 'GASTRO'
  | 'NEPHROLOGIE'
  | 'PNEUMOLOGIE'
  | 'PEDIATRIE'
  | 'GERIATRIE'
  | 'DOULEUR'
  | 'PSYCHIATRIE'
  | 'CHIRURGIE'
  | 'AUTRE';

export interface DefinitionDiscipline {
  readonly id: Discipline;
  readonly libelle: string;
  readonly icone: string;
  /** Intitulé court résumant le périmètre. */
  readonly perimetre: string;
}

/**
 * Icônes des disciplines.
 *
 * Chaque icône doit **décrire l'organe ou l'acte emblématique** de la discipline, et rester
 * distincte des autres tuiles (aucun doublon). Deux disciplines n'ont pas de pictogramme
 * dédié dans le jeu d'emojis : la gastro-entérologie (aucun emoji d'organe digestif n'existe)
 * et la chirurgie (aucun emoji de scalpel), d'où l'usage du symbole le plus proche —
 * explorations/biopsies pour l'une, instrument tranchant pour l'autre.
 *
 *   🩸 glycémie (diabète)        🫀 cœur anatomique        🎗️ ruban (cancer)
 *   🧠 cerveau                   🦴 os                      🔬 explorations, biopsies
 *   💧 rein / dialyse            🫁 poumons                 🧒 enfant
 *   🧓 personne âgée (neutre)    🩹 soulagement, soins      🧩 psychisme
 *   ✂️ acte opératoire           🏥 établissement, cas général
 */
export const DISCIPLINES: readonly DefinitionDiscipline[] = [
  {
    id: 'ENDOCRINOLOGIE',
    libelle: 'Endocrinologie, diabétologie, nutrition',
    icone: '🩸',
    perimetre: 'Diabète, obésité, thyroïde, ETP structurée',
  },
  {
    id: 'CARDIOLOGIE',
    libelle: 'Cardiologie et maladies vasculaires',
    icone: '🫀',
    perimetre: 'Explorations fonctionnelles, insuffisance cardiaque',
  },
  {
    id: 'ONCOLOGIE',
    libelle: 'Oncologie et hématologie',
    icone: '🎗️',
    perimetre: 'Traitements, bilans d’extension, biothérapies',
  },
  {
    id: 'NEUROLOGIE',
    libelle: 'Neurologie et maladies neuromusculaires',
    icone: '🧠',
    perimetre: 'SEP, SLA, bilans neuropsychologiques',
  },
  {
    id: 'RHUMATOLOGIE',
    libelle: 'Rhumatologie et maladies auto-immunes',
    icone: '🦴',
    perimetre: 'Biothérapies, polyarthrite, lupus',
  },
  {
    id: 'GASTRO',
    libelle: 'Gastro-entérologie et hépatologie',
    icone: '🔬',
    perimetre: 'Endoscopies, MICI, bilan hépatique',
  },
  {
    id: 'NEPHROLOGIE',
    libelle: 'Néphrologie et urologie',
    icone: '💧',
    perimetre: 'Dialyse, bilan pré-transplantation',
  },
  {
    id: 'PNEUMOLOGIE',
    libelle: 'Pneumologie et allergologie',
    icone: '🫁',
    perimetre: 'EFR, tests de provocation, asthme sévère',
  },
  {
    id: 'PEDIATRIE',
    libelle: 'Pédiatrie et neurodéveloppement',
    icone: '🧒',
    perimetre: 'Bilans TND, grands prématurés, handicaps',
  },
  {
    id: 'GERIATRIE',
    libelle: 'Gériatrie et troubles cognitifs',
    icone: '🧓',
    perimetre: 'Évaluation gériatrique, mémoire, fragilité',
  },
  {
    id: 'DOULEUR',
    libelle: 'Douleur chronique et soins palliatifs',
    icone: '🩹',
    perimetre: 'Bilans douleur, analgésie, soins palliatifs',
  },
  {
    id: 'PSYCHIATRIE',
    libelle: 'Psychiatrie et addictologie',
    icone: '🧩',
    perimetre: 'Financement propre — hors médecine, chirurgie, obstétrique',
  },
  {
    id: 'CHIRURGIE',
    libelle: 'Chirurgie et actes interventionnels',
    icone: '✂️',
    perimetre: 'Chirurgie ambulatoire, endoscopie interventionnelle',
  },
  {
    id: 'AUTRE',
    libelle: 'Autre discipline / cas général',
    icone: '🏥',
    perimetre: 'Exemples transversaux, toutes disciplines',
  },
];

export const LIBELLES_DISCIPLINE: Readonly<Record<Discipline, string>> = Object.fromEntries(
  DISCIPLINES.map((d) => [d.id, d.libelle]),
) as Readonly<Record<Discipline, string>>;

/* ================================================================== *
 * Cas typiques par discipline
 * ================================================================== */

/** Nature du cas : conforme GHS, requalification externe, ou piège fréquent. */
export type NatureCas = 'GHS' | 'ACE' | 'PIEGE' | 'HORS_CHAMP';

export interface CasDiscipline {
  /** Étape de l'assistant à laquelle le cas se rattache. */
  readonly etape: string;
  readonly nature: NatureCas;
  readonly texte: string;
}

export const LIBELLES_NATURE: Readonly<Record<NatureCas, string>> = {
  GHS: 'Relève du GHS',
  ACE: 'Relève de l’externe',
  PIEGE: 'Piège fréquent',
  HORS_CHAMP: 'Hors champ',
};

const cas = (etape: string, nature: NatureCas, texte: string): CasDiscipline => ({
  etape,
  nature,
  texte,
});

export const CAS_PAR_DISCIPLINE: Readonly<Record<Discipline, readonly CasDiscipline[]>> = {
  ENDOCRINOLOGIE: [
    cas('champ', 'PIEGE', 'Bilan de diabète : s’il s’agit d’une cure de chimiothérapie, c’est une séance forfaitisée — un bilan pluriprofessionnel relève bien de l’HDJ.'),
    cas('actes', 'ACE', 'ECG de dépistage pratiqué seul au décours d’une consultation : acte isolé, en principe externe.'),
    cas('medicaments', 'GHS', 'Mise en route d’un analogue de la somatostatine (réserve hospitalière) avec surveillance de la tolérance.'),
    cas('intervenants', 'GHS', 'Bilan de diabète déséquilibré associant endocrinologue, IDE d’éducation et diététicien(ne), notes d’évolution réputées au dossier.'),
    cas('densite', 'PIEGE', 'Venue de 45 minutes pour un simple renouvellement d’ordonnance : la durée prévue et l’absence de moyens trahissent une ACE.'),
    cas('contexte', 'GHS', 'Diabète instable chez un patient âgé, isolé, à risque d’hypoglycémie sévère : contexte patient à tracer au dossier.'),
  ],
  CARDIOLOGIE: [
    cas('champ', 'PIEGE', 'Patient adressé par les urgences : la prise en charge n’est pas programmée, elle ne relève pas de l’hospitalisation de jour.'),
    cas('actes', 'GHS', 'Exploration fonctionnelle avec cathétérisme et mesure hémodynamique sur plateau technique lourd.'),
    cas('medicaments', 'GHS', 'Perfusion d’un inotrope (lévosimendan) sous surveillance continue des constantes.'),
    cas('intervenants', 'GHS', 'Cardiologue, IDE de surveillance et diététicien(ne) : deux professions paramédicales distinctes, notes d’évolution réputées au dossier.'),
    cas('densite', 'ACE', 'Épreuve d’effort isolée chez un patient stable : réalisable en cabinet, sans mobiliser la structure d’HDJ.'),
    cas('contexte', 'GHS', 'Insuffisance cardiaque décompensée chez un patient en précarité sociale, incapable de gérer seul son traitement.'),
  ],
  ONCOLOGIE: [
    cas('champ', 'HORS_CHAMP', 'Cure de chimiothérapie : séance forfaitisée, elle n’a pas à démontrer la densité.'),
    cas('actes', 'GHS', 'Bilan d’extension regroupant plusieurs actes et avis coordonnés le même jour.'),
    cas('medicaments', 'GHS', 'Perfusion d’un anticorps monoclonal de réserve hospitalière hors cure, sous surveillance de la tolérance.'),
    cas('intervenants', 'GHS', 'Oncologue, IDE de perfusion et psychologue, notes d’évolution réputées au dossier.'),
    cas('densite', 'GHS', 'Surveillance de la tolérance et des constantes pendant la perfusion : surveillance particulière à tracer.'),
    cas('contexte', 'GHS', 'Patient très éloigné de l’établissement, sans aidant disponible : la situation doit être précisée au dossier.'),
  ],
  NEUROLOGIE: [
    cas('champ', 'HORS_CHAMP', 'Bilan réalisé dans un hôpital de jour psychiatrique : financement propre, hors de cette évaluation.'),
    cas('actes', 'GHS', 'Bilan de sclérose en plaques coordonné : imagerie, consultation spécialisée et évaluation neuropsychologique.'),
    cas('medicaments', 'GHS', 'Perfusion d’immunoglobulines ou de natalizumab (réserve hospitalière) sous surveillance.'),
    cas('intervenants', 'GHS', 'Bilan pluriprofessionnel : neurologue, kinésithérapeute et orthophoniste, notes d’évolution réputées au dossier.'),
    cas('densite', 'GHS', 'Surveillance rapprochée après une première perfusion d’immunoglobulines : à tracer au dossier de soins.'),
    cas('contexte', 'GHS', 'Troubles de la déglutition et de la marche chez un patient appareillé : contexte patient à documenter.'),
  ],
  RHUMATOLOGIE: [
    cas('champ', 'PIEGE', 'Une infiltration programmée en consultation externe ne devient pas une HDJ parce qu’elle est planifiée.'),
    cas('actes', 'GHS', 'Bilan de polyarthrite regroupant plusieurs explorations sur la même journée.'),
    cas('medicaments', 'GHS', 'Perfusion d’une biothérapie (infliximab, rituximab) avec surveillance de la tolérance immédiate.'),
    cas('intervenants', 'GHS', 'Rhumatologue, IDE et assistant(e) social(e) intervenant auprès du patient, notes d’évolution réputées au dossier.'),
    cas('densite', 'PIEGE', 'Une perfusion de biothérapie sans surveillance prévue au dossier ne suffit pas à caractériser la densité de la venue.'),
    cas('contexte', 'GHS', 'Rhumatisme inflammatoire chez une personne âgée isolée, avec troubles cognitifs : contexte patient à tracer.'),
  ],
  GASTRO: [
    cas('champ', 'HORS_CHAMP', 'Prise en charge de type séance (aphérèse sanguine, transfusion) : financée au forfait, hors critères de gradation.'),
    cas('actes', 'GHS', 'Endoscopie œso-gastro-duodénale sous anesthésie générale : plateau technique lourd.'),
    cas('medicaments', 'GHS', 'Administration d’une biothérapie digestive de réserve hospitalière, tolérance surveillée sur place.'),
    cas('intervenants', 'GHS', 'Hépato-gastro-entérologue, IDE de surveillance et diététicien(ne) : notes d’évolution prévues.'),
    cas('densite', 'GHS', 'Surveillance post-ponction biopsie hépatique documentée dans le dossier de soins.'),
    cas('contexte', 'GHS', 'Patient sans aidant, avec difficultés de compréhension des consignes post-examen : situation à documenter.'),
  ],
  NEPHROLOGIE: [
    cas('champ', 'HORS_CHAMP', 'Séance d’hémodialyse : financée par forfait de séance, hors critères de gradation.'),
    cas('actes', 'GHS', 'Bilan pré-transplantation coordonné : plusieurs avis et examens sur la même journée.'),
    cas('medicaments', 'GHS', 'Administration d’époétine (réserve hospitalière) avec surveillance tensionnelle.'),
    cas('intervenants', 'GHS', 'Néphrologue, IDE et assistant(e) social(e) : interventions coordonnées, notes d’évolution réputées au dossier.'),
    cas('densite', 'GHS', 'Surveillance rapprochée de la pression artérielle après injection : à tracer au dossier.'),
    cas('contexte', 'GHS', 'Patient dialysé fragile, en précarité, coopération difficile : contexte patient à documenter.'),
  ],
  PNEUMOLOGIE: [
    cas('champ', 'HORS_CHAMP', 'Séance d’oxygénothérapie hyperbare en caisson : forfait de séance, hors gradation.'),
    cas('actes', 'GHS', 'Explorations fonctionnelles respiratoires complètes avec épreuve de provocation.'),
    cas('medicaments', 'GHS', 'Perfusion d’omalizumab ou d’immunoglobulines (réserve hospitalière) en hôpital de jour.'),
    cas('intervenants', 'GHS', 'Pneumologue, IDE et kinésithérapeute, notes d’évolution prévues.'),
    cas('densite', 'GHS', 'Test de réintroduction médicamenteuse à risque anaphylactique sous surveillance rapprochée.'),
    cas('contexte', 'GHS', 'Insuffisance respiratoire chronique chez un patient grabataire : contexte patient et surveillance particulière.'),
  ],
  PEDIATRIE: [
    cas('champ', 'HORS_CHAMP', 'Hôpital de jour pédopsychiatrique : financement propre, hors du champ de cette évaluation.'),
    cas('actes', 'GHS', 'Bilan de grand prématuré regroupant plusieurs évaluations coordonnées le même jour.'),
    cas('medicaments', 'GHS', 'Perfusion d’immunoglobulines ou de biothérapie (réserve hospitalière) sous surveillance de l’enfant.'),
    cas('intervenants', 'GHS', 'Bilan de troubles du neurodéveloppement : pédiatre, psychologue et orthophoniste, notes d’évolution réputées au dossier.'),
    cas('densite', 'GHS', 'Enfant polyhandicapé : surveillance prolongée et adaptation du rythme à documenter.'),
    cas('contexte', 'GHS', 'Suspicion de maltraitance chez un mineur : situation de vulnérabilité à tracer au dossier.'),
  ],
  GERIATRIE: [
    cas('champ', 'HORS_CHAMP', 'Évaluation gériatrique réalisée dans un service de SMR : financement propre, hors HDJ MCO.'),
    cas('actes', 'GHS', 'Évaluation gériatrique multidimensionnelle : plusieurs évaluations articulées sur la journée.'),
    cas('medicaments', 'GHS', 'Réhydratation ou perfusion de fer, selon le produit de réserve hospitalière, avec surveillance des constantes.'),
    cas('intervenants', 'GHS', 'Gériatre, psychologue et assistant(e) social(e) intervenant auprès du patient, notes d’évolution réputées au dossier.'),
    cas('densite', 'PIEGE', 'Une évaluation très courte doit conduire à vérifier la réalité des interventions dénombrées.'),
    cas('contexte', 'GHS', 'Patient de 92 ans, état grabataire, vivant seul : contexte patient à tracer au dossier.'),
  ],
  DOULEUR: [
    cas('champ', 'PIEGE', 'Une consultation douleur isolée ne relève pas de l’HDJ : seul un programme coordonné le justifie.'),
    cas('actes', 'GHS', 'Bilan multidisciplinaire de douleur chronique invalidante : médecin de la douleur, psychiatre, psychologue.'),
    cas('medicaments', 'GHS', 'Application de patchs de capsaïcine à haute concentration (réserve hospitalière).'),
    cas('intervenants', 'GHS', 'Médecin de la douleur, psychologue et kinésithérapeute, notes d’évolution prévues.'),
    cas('densite', 'GHS', 'Analgésie périmédullaire ou bloc analgésique complet : surveillance particulière documentée.'),
    cas('contexte', 'GHS', 'Douleur rebelle chez un patient en précarité, difficultés à s’exprimer : contexte patient à documenter.'),
  ],
  PSYCHIATRIE: [
    cas('champ', 'HORS_CHAMP', 'Hôpital de jour psychiatrique : financement propre, hors du champ de cette instruction.'),
    cas('actes', 'HORS_CHAMP', 'Les actes d’un programme de soins psychiatrique se facturent dans le cadre propre de la psychiatrie.'),
    cas('medicaments', 'HORS_CHAMP', 'Les traitements administrés en HDJ psychiatrique suivent le financement de la psychiatrie.'),
    cas('intervenants', 'HORS_CHAMP', 'L’équipe pluriprofessionnelle d’un hôpital de jour psychiatrique n’entre pas dans le décompte MCO.'),
    cas('densite', 'HORS_CHAMP', 'La surveillance d’un patient psychiatrique ne se mesure pas au référentiel de densité MCO.'),
    cas('contexte', 'PIEGE', 'Une pathologie psychiatrique associée compte comme contexte patient pour une HDJ de médecine, à tracer au dossier.'),
  ],
  CHIRURGIE: [
    cas('champ', 'PIEGE', 'Un acte associé à un forfait « sécurité environnement » ne peut en principe donner lieu à un GHS.'),
    cas('actes', 'GHS', 'Chirurgie ambulatoire : la présence d’un acte classant emporte la facturation d’un GHS plein.'),
    cas('medicaments', 'GHS', 'Antibioprophylaxie et antalgiques de réserve hospitalière administrés sur place, avec surveillance.'),
    cas('intervenants', 'GHS', 'Chirurgien, anesthésiste et IDE de surveillance, notes d’évolution réputées au dossier.'),
    cas('densite', 'GHS', 'Surveillance post-opératoire en salle de réveil puis en unité d’hospitalisation de jour.'),
    cas('contexte', 'GHS', 'Patient en situation de handicap nécessitant une installation spécifique : contexte patient à tracer.'),
  ],
  AUTRE: [
    cas('champ', 'PIEGE', 'Une venue non programmée (adressage par les urgences) ne relève pas de l’hospitalisation de jour.'),
    cas('actes', 'GHS', 'Plusieurs actes de techniques différentes réalisés le même jour sur un plateau technique coordonné.'),
    cas('medicaments', 'GHS', 'Administration d’un produit de la réserve hospitalière : motif suffisant, quel que soit le nombre d’interventions.'),
    cas('intervenants', 'GHS', 'Au moins un médecin et deux professions paramédicales ou sociales distinctes, notes d’évolution réputées au dossier.'),
    cas('densite', 'PIEGE', 'Une surveillance annoncée mais non tracée au dossier n’est pas opposable en contrôle.'),
    cas('contexte', 'GHS', 'Situation de vulnérabilité retenue au dossier : GHS plein quel que soit le nombre d’interventions.'),
  ],
};

/**
 * Cas typiques à afficher pour une étape donnée.
 *
 * Seuls les cas **ancrés sur l'étape en cours** sont retournés : la grille
 * `CAS_PAR_DISCIPLINE` couvre les six étapes pour chaque discipline, de sorte
 * que l'aide parle toujours de la question posée. Sur l'écran de décision — qui
 * ne porte pas de question — on rappelle les deux situations qui, à elles
 * seules, justifient un GHS plein.
 */
export function casPourEtape(
  discipline: Discipline | null,
  etape: string,
): readonly CasDiscipline[] {
  const tous = CAS_PAR_DISCIPLINE[discipline ?? 'AUTRE'];
  const cibles = tous.filter((c) => c.etape === etape);
  if (cibles.length > 0) return cibles;
  return tous.filter((c) => c.etape === 'densite' || c.etape === 'contexte').slice(0, 2);
}

/* ================================================================== *
 * Aide par étape
 * ================================================================== */

export interface AideEtape {
  /** Pourquoi cette question est posée. */
  readonly pourquoi: string;
  /** Règle applicable (résumé de la référence normative). */
  readonly regle: string;
}

export const AIDE_PAR_DEFAUT: AideEtape = {
  pourquoi: 'Cette information est utilisée par le moteur décisionnel.',
  regle: 'Instruction N° DGOS/R1/DSS/1A/2020/52 du 10 septembre 2020.',
};

export const AIDE_ETAPES: Readonly<Record<string, AideEtape>> = {
  discipline: {
    pourquoi:
      'Le choix de la discipline ne change aucune règle : il sert uniquement à illustrer les ' +
      'étapes suivantes par des cas concrets de votre domaine d’exercice.',
    regle:
      'Les critères de facturation sont identiques quelle que soit la spécialité (instruction ' +
      'DGOS/R1/DSS/1A/2020/52).',
  },
  champ: {
    pourquoi:
      'L’instruction ne concerne que les prises en charge de médecine, chirurgie, obstétrique et ' +
      'odontologie (MCO). Les séances (dialyse, chimiothérapie) sont financées par un forfait, et ' +
      'le SMR comme la psychiatrie relèvent d’autres modalités de financement.',
    regle:
      'Annexe 4, point 1 : les prises en charge correspondant à des « séances » sont financées à ' +
      'travers un GHS « sans que la prise en charge n’ait à répondre aux critères de la présente ' +
      'instruction ». L’instruction porte sur les établissements « ayant des activités de ' +
      'médecine, chirurgie, obstétrique et odontologie ou ayant une activité d’hospitalisation à ' +
      'domicile ».',
  },
  actes: {
    pourquoi:
      'Un acte technique isolé, réalisable en cabinet, ne justifie pas une hospitalisation. ' +
      'À l’inverse, un plateau technique lourd ou des actes coordonnés caractérisent la densité. ' +
      'Les caractéristiques de chaque acte sont reprises de la nomenclature CCAM : vous n’avez ' +
      'rien à ressaisir.',
    regle:
      'Annexe 4, points 2.b.i et 2.b.iii : acte classant → GHS plein ; deux actes CCAM de ' +
      'techniques différentes sont dénombrables ; l’ECG DEQP003 ne peut être dénombré.',
  },
  medicaments: {
    pourquoi:
      'Certains produits ne peuvent être administrés qu’à l’hôpital. Leur administration est un ' +
      'motif suffisant de prise en charge en hôpital de jour, quel que soit le nombre ' +
      'd’interventions. Le référentiel précise lui-même s’il s’agit d’un produit de la réserve ' +
      'hospitalière : vous n’avez pas à le déclarer.',
    regle:
      'Annexe 4, point 2.b.iii : la prise en charge justifie un GHS plein « soit parce que la ' +
      'prise en charge comporte l’administration de produits de la réserve hospitalière telle que ' +
      'définie à l’article R. 5121-82 du code de la santé publique ».',
  },
  intervenants: {
    pourquoi:
      'Indiquez simplement les professionnels qui interviendront directement auprès du patient : ' +
      'la liste des boutons suffit. Deux engagements restent à tenir au dossier (la note ' +
      'd’évolution de chaque intervenant, et la condition de spécialités distinctes entre ' +
      'professionnels médicaux) : ils sont rappelés sous la liste et vérifiés en contrôle.',
    regle:
      'Annexe 4, point 2.b.iii : interventions « réalisées directement auprès du patient » ; ' +
      'plusieurs médecins ne sont dénombrés que s’ils relèvent de deux spécialités distinctes.',
  },
  densite: {
    pourquoi:
      'La surveillance particulière justifie un GHS plein quel que soit le nombre d’interventions, ' +
      'à condition d’être tracée au dossier. La durée de présence éclaire la densité réelle : une ' +
      'venue très courte constitue un point d’attention en contrôle.',
    regle:
      'Annexe 4, point 2.b.iii (surveillance particulière) et point 2.a (utilisation des moyens de ' +
      'la structure d’hospitalisation de jour).',
  },
  contexte: {
    pourquoi:
      'L’instruction confie au dossier du patient le soin de décrire les situations qui, ' +
      'indépendamment du nombre d’interventions, expliquent la mobilisation d’une ' +
      'hospitalisation de jour : âge, handicap, pathologie psychiatrique, état grabataire, ' +
      'antécédents, précarité sociale, difficultés de coopération ou d’expression, suspicion de ' +
      'maltraitance, ou venue en urgence hors UHCD. Une seule situation suffit : le GHS plein ' +
      'est alors retenu.',
    regle:
      'Annexe 4, point 2.b.iii (« La prise en compte de la surveillance particulière ou du ' +
      'contexte patient ») : « Le contexte patient renvoie aux situations suivantes : âge du ' +
      'patient ; handicap ; pathologie psychiatrique ; état grabataire ; antécédents du patient ' +
      '[…] ; précarité sociale ; difficultés de coopération ou incapacité à s’exprimer ; ' +
      'suspicion de maltraitance […] ; le cas échéant, en raison d’autres situations qui seront ' +
      'précisées dans le dossier du patient. » Les éléments doivent être tracés au dossier ' +
      '(annexe 4, point 5).',
  },
  resultat: {
    pourquoi:
      'La décision est formulée en clair. Un GHS « plein » s’applique en présence d’une surveillance ' +
      'particulière, d’un contexte patient particulier, d’un acte classant ou à compter de quatre ' +
      'interventions ; un GHS « intermédiaire » s’applique aux prises en charge de médecine ' +
      'justifiant trois interventions.',
    regle:
      'Annexe 4, point 2.b.iii : « La facturation d’un GHS dit « intermédiaire » a lieu pour des ' +
      'prises en charge justifiant de 3 interventions ; la facturation d’un GHS dit « plein » a ' +
      'lieu pour des prises en charge justifiant de 4 interventions ou dans le cas d’une ' +
      'surveillance particulière ou d’un contexte patient particulier. »',
  },
};
