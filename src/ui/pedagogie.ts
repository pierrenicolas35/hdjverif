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
    icone: '❤️',
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
    icone: '🫀',
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
    icone: '👵',
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
    icone: '🔬',
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
    cas('intervenants', 'GHS', 'Bilan de diabète déséquilibré associant endocrinologue, IDE d’éducation et diététicien(ne), chacun ayant tracé sa note d’évolution.'),
    cas('medicaments', 'GHS', 'Mise en route d’un analogue de la somatostatine (réserve hospitalière) avec surveillance de la tolérance.'),
    cas('actes', 'ACE', 'ECG de dépistage pratiqué seul au décours d’une consultation : acte isolé, en principe externe.'),
    cas('densite', 'PIEGE', 'Venue de 45 minutes pour un simple renouvellement d’ordonnance : la durée et l’absence de ressources trahissent une ACE.'),
  ],
  CARDIOLOGIE: [
    cas('actes', 'GHS', 'Exploration fonctionnelle avec cathétérisme et mesure hémodynamique sur plateau technique lourd.'),
    cas('medicaments', 'GHS', 'Perfusion d’un inotrope (lévosimendan) sous surveillance continue des constantes.'),
    cas('actes', 'ACE', 'Épreuve d’effort isolée chez un patient stable : réalisable en cabinet.'),
    cas('champ', 'PIEGE', 'Patient adressé par les urgences : la prise en charge n’est pas programmée, elle ne relève pas de l’hospitalisation de jour.'),
  ],
  ONCOLOGIE: [
    cas('champ', 'HORS_CHAMP', 'Cure de chimiothérapie : séance forfaitisée, elle n’a pas à démontrer la densité.'),
    cas('medicaments', 'GHS', 'Perfusion d’un anticorps monoclonal de réserve hospitalière hors cure, sous surveillance de la tolérance.'),
    cas('actes', 'GHS', 'Bilan d’extension regroupant plusieurs actes et avis coordonnés sur la journée.'),
    cas('champ', 'PIEGE', 'Présenter une immunothérapie de séance comme un HDJ de gradation expose à un rejet.'),
  ],
  NEUROLOGIE: [
    cas('actes', 'GHS', 'Bilan de sclérose en plaques coordonné : imagerie, consultation spécialisée et évaluation neuropsychologique.'),
    cas('intervenants', 'GHS', 'Bilan pluriprofessionnel : neurologue, kinésithérapeute et orthophoniste, notes tracées.'),
    cas('medicaments', 'GHS', 'Perfusion d’immunoglobulines ou de natalizumab (réserve hospitalière) sous surveillance.'),
    cas('intervenants', 'PIEGE', 'Un intervenant dont la note d’évolution n’est pas prévue n’est pas dénombrable : à anticiper au dossier.'),
  ],
  RHUMATOLOGIE: [
    cas('medicaments', 'GHS', 'Perfusion d’une biothérapie (infliximab, rituximab) avec surveillance de la tolérance immédiate.'),
    cas('intervenants', 'GHS', 'Bilan de polyarthrite associant rhumatologue, IDE et assistant(e) social(e).'),
    cas('actes', 'ACE', 'Infiltration rachidienne simple : geste réalisable en cabinet.'),
    cas('medicaments', 'PIEGE', 'Une perfusion de biothérapie sans surveillance prévue au dossier ne suffit pas à caractériser une hospitalisation de jour.'),
  ],
  GASTRO: [
    cas('actes', 'GHS', 'Endoscopie œso-gastro-duodénale sous anesthésie générale : plateau technique lourd.'),
    cas('densite', 'GHS', 'Surveillance post-ponction biopsie hépatique documentée dans le dossier de soins.'),
    cas('actes', 'ACE', 'Exploration fonctionnelle isolée sans sédation ni geste associé : à examiner au titre de l’acte isolé.'),
    cas('actes', 'PIEGE', 'L’ECG DEQP003, souvent associé au bilan, ne peut jamais être dénombré comme intervention.'),
  ],
  NEPHROLOGIE: [
    cas('champ', 'HORS_CHAMP', 'Séance d’hémodialyse : financée par forfait de séance, hors critères de gradation.'),
    cas('actes', 'GHS', 'Bilan pré-transplantation coordonné : plusieurs avis et examens sur la même journée.'),
    cas('medicaments', 'GHS', 'Administration d’époétine (réserve hospitalière) avec surveillance tensionnelle.'),
    cas('champ', 'PIEGE', 'Facturer un GHS de gradation pour une séance de dialyse est un motif classique de rejet.'),
  ],
  PNEUMOLOGIE: [
    cas('densite', 'GHS', 'Test de réintroduction médicamenteuse à risque anaphylactique sous surveillance rapprochée.'),
    cas('medicaments', 'GHS', 'Perfusion d’omalizumab ou d’immunoglobulines (réserve hospitalière) en hôpital de jour.'),
    cas('actes', 'GHS', 'Explorations fonctionnelles respiratoires complètes avec épreuve de provocation.'),
    cas('actes', 'ACE', 'Spirométrie isolée : réalisable en cabinet de ville.'),
  ],
  PEDIATRIE: [
    cas('intervenants', 'GHS', 'Bilan de troubles du neurodéveloppement : pédiatre, psychologue et orthophoniste, notes tracées.'),
    cas('actes', 'GHS', 'Bilan de grand prématuré regroupant plusieurs évaluations coordonnées le même jour.'),
    cas('densite', 'GHS', 'Enfant polyhandicapé : contexte patient et surveillance prolongée à documenter.'),
    cas('intervenants', 'PIEGE', 'Les interventions réalisées hors la présence de l’enfant ne sont pas dénombrables.'),
  ],
  GERIATRIE: [
    cas('actes', 'GHS', 'Évaluation gériatrique multidimensionnelle : plusieurs évaluations articulées sur la journée.'),
    cas('intervenants', 'GHS', 'Gériatre, psychologue et assistant(e) social(e) intervenant auprès du patient, notes tracées.'),
    cas('densite', 'GHS', 'Contexte patient : fragilité, troubles de l’équilibre, surveillance des constantes.'),
    cas('densite', 'PIEGE', 'Une évaluation très courte doit conduire à vérifier la réalité des interventions dénombrées.'),
  ],
  DOULEUR: [
    cas('actes', 'GHS', 'Bilan multidisciplinaire de douleur chronique invalidante : médecin de la douleur, psychiatre, psychologue.'),
    cas('densite', 'GHS', 'Analgésie périmédullaire ou bloc analgésique complet : surveillance particulière documentée.'),
    cas('medicaments', 'GHS', 'Application de patchs de capsaïcine à haute concentration (réserve hospitalière).'),
    cas('actes', 'PIEGE', 'Une infiltration simple peut relever du contexte externe selon l’état du patient.'),
  ],
  PSYCHIATRIE: [
    cas('champ', 'HORS_CHAMP', 'Hôpital de jour psychiatrique : financement propre, hors du champ de cette instruction.'),
    cas('champ', 'PIEGE', 'Ne pas rechercher les critères de densité MCO dans un séjour psychiatrique ou d’addictologie.'),
    cas('champ', 'HORS_CHAMP', 'Hôpital de jour d’addictologie : activités inscrites dans un programme de soins formalisé.'),
    cas('champ', 'PIEGE', 'Un séjour SMR ou psychiatrique ne se facture pas en GHS MCO.'),
  ],
  CHIRURGIE: [
    cas('actes', 'GHS', 'Chirurgie ambulatoire : la présence d’un acte classant emporte la facturation d’un GHS plein.'),
    cas('densite', 'GHS', 'Surveillance post-opératoire en salle de réveil puis en unité d’hospitalisation de jour.'),
    cas('actes', 'ACE', 'Petite intervention réalisable au cabinet sous anesthésie locale : en principe externe.'),
    cas('actes', 'PIEGE', 'Un acte associé à un forfait « sécurité environnement » ne peut en principe donner lieu à un GHS.'),
  ],
  AUTRE: [
    cas('actes', 'GHS', 'Plusieurs actes de techniques différentes réalisés le même jour sur un plateau technique coordonné.'),
    cas('intervenants', 'GHS', 'Au moins un médecin et deux professions paramédicales ou sociales distinctes, notes tracées.'),
    cas('actes', 'ACE', 'Un acte technique isolé, réalisable en cabinet, sans surveillance documentée : requalification externe.'),
    cas('densite', 'PIEGE', 'Une surveillance annoncée mais non tracée au dossier n’est pas opposable en contrôle.'),
  ],
};

/** Cas à afficher pour une étape donnée : ceux de l'étape, complétés par 2 autres. */
export function casPourEtape(
  discipline: Discipline | null,
  etape: string,
): readonly CasDiscipline[] {
  const tous = CAS_PAR_DISCIPLINE[discipline ?? 'AUTRE'];
  const prioritaires = tous.filter((c) => c.etape === etape);
  const autres = tous.filter((c) => c.etape !== etape);
  return [...prioritaires, ...autres].slice(0, 4);
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
      'Indiquez simplement les professionnels qui interviendront directement auprès du patient. ' +
      'Il suffit de préciser, pour chacun, si une note d’évolution sera rédigée : un intervenant ' +
      'sans note n’est pas dénombrable en contrôle.',
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
  resultat: {
    pourquoi:
      'La décision est formulée en clair. Un GHS « plein » s’applique en présence d’une surveillance ' +
      'particulière, d’un acte classant ou à compter de quatre interventions ; un GHS ' +
      '« intermédiaire » s’applique aux prises en charge de médecine justifiant trois interventions.',
    regle:
      'Annexe 4, point 2.b.iii : « La facturation d’un GHS dit « intermédiaire » a lieu pour des ' +
      'prises en charge justifiant de 3 interventions ; la facturation d’un GHS dit « plein » a ' +
      'lieu pour des prises en charge justifiant de 4 interventions ou dans le cas d’une ' +
      'surveillance particulière ou d’un contexte patient particulier. »',
  },
};
