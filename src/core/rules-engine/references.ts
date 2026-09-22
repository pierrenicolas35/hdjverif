/**
 * Référentiel normatif opposable.
 *
 * Toutes les citations ci-dessous sont extraites de l'Instruction
 * N° DGOS/R1/DSS/1A/2020/52 du 10 septembre 2020 (NOR : SSAH2007743J,
 * BO Santé n° 2020/9 du 15 octobre 2020) relative à la gradation des prises en
 * charge ambulatoires.
 *
 * Ce fichier centralise les sources afin que chaque motif de rejet produit par
 * le moteur soit immédiatement opposable lors d'un contrôle T2A.
 */

/** Métadonnées du texte de référence. */
export interface TexteReference {
  readonly id: string;
  readonly date: string;
  readonly nor: string;
  readonly titre: string;
  readonly publication: string;
  readonly source: string;
}

export const INSTRUCTION_DGOS_2020_52: TexteReference = {
  id: 'DGOS/R1/DSS/1A/2020/52',
  date: '10 septembre 2020',
  nor: 'SSAH2007743J',
  titre:
    "relative à la gradation des prises en charge ambulatoires réalisées au sein des " +
    "établissements de santé ayant des activités de médecine, chirurgie, obstétrique et " +
    "odontologie ou ayant une activité d'hospitalisation à domicile",
  publication: 'BO Santé n° 2020/9 du 15 octobre 2020',
  source: 'https://www.legifrance.gouv.fr/ (texte non publié au JO — instruction ministérielle)',
};

/** Entrée du référentiel : localisation + citation littérale. */
export interface EntreeReference {
  /** Référence courte affichable (ex. « Annexe 4, 2.a »). */
  readonly localisation: string;
  /** Fondement juridique supérieur éventuel (CSS, CSP, arrêté). */
  readonly fondement?: string;
  /** Citation littérale du texte. */
  readonly citation: string;
}

/** Clés de référence utilisées par les portes du moteur. */
export type CodeReference =
  | 'CHAMP_APPLICATION'
  | 'PORTE_0_SEANCE'
  | 'PORTE_0_HORS_MCO'
  | 'PORTE_1_PROGRAMMATION'
  | 'PORTE_1_TRACABILITE'
  | 'PORTE_1_STRUCTURE_HDJ'
  | 'PORTE_2_ACTE_ISOLE'
  | 'PORTE_2_FORFAIT_SE'
  | 'PORTE_3_SURVEILLANCE_PARTICULIERE'
  | 'PORTE_3_CONTEXTE_PATIENT'
  | 'PORTE_3_PRODUIT_RESERVE_HOSPITALIERE'
  | 'PORTE_3_ACTE_CLASSANT'
  | 'PORTE_3_DECOMPTE_ACTES'
  | 'PORTE_3_PLURIPROFESSIONNALITE'
  | 'PORTE_3_SPECIALITES_DISTINCTES'
  | 'PORTE_4_TRACABILITE_DOSSIER'
  | 'PORTE_4_ALERTE_DUREE'
  | 'RESCRIT_TARIFAIRE';

export const REFERENCES: Readonly<Record<CodeReference, EntreeReference>> = {
  CHAMP_APPLICATION: {
    localisation: 'Objet de l\u2019instruction',
    fondement: 'CSS, art. L. 162-22-6 et R. 162-33-1',
    citation:
      "La présente instruction précise les conditions de facturation à l'Assurance Maladie, " +
      "par les établissements de santé, de l'ensemble des prises en charge ambulatoires " +
      "réalisées en leur sein, en rappelant les textes réglementaires qui les régissent.",
  },
  PORTE_0_SEANCE: {
    localisation: 'Annexe 4, point 1, 2ᵉ tiret',
    fondement: 'Arrêté du 19 février 2015, art. 11 ; arrêté du 23 décembre 2016, annexe I (CMD 28)',
    citation:
      "Les prises en charge correspondant à des « séances » […] L'intégralité de ces séances, " +
      "telles que définies dans le guide méthodologique PMSI MCO, est ainsi financée à travers " +
      "un GHS sans que la prise en charge n'ait à répondre aux critères de la présente instruction.",
  },
  PORTE_0_HORS_MCO: {
    localisation: 'Intitulé et objet de l\u2019instruction',
    fondement: 'CSS, art. L. 162-22-6',
    citation:
      "relative à la gradation des prises en charge ambulatoires réalisées au sein des " +
      "établissements de santé ayant des activités de médecine, chirurgie, obstétrique et " +
      "odontologie ou ayant une activité d'hospitalisation à domicile.",
  },
  PORTE_1_PROGRAMMATION: {
    localisation: 'Annexe 4, point 2.a',
    fondement: 'CSP, art. D. 6124-301-1 et suivants',
    citation:
      "Une prise en charge programmée sans nuitée requiert une organisation spécifique réalisée " +
      "sur un plateau adapté, à savoir une structure d'hospitalisation à temps partiel " +
      "individualisée […] La prise en charge du patient donne lieu à l'utilisation des moyens en " +
      "locaux, en matériel et en personnel dont dispose la structure d'hospitalisation de jour.",
  },
  PORTE_1_TRACABILITE: {
    localisation: 'Annexe 4, point 2.b.iii (coordination) et point 5',
    fondement: 'CSP, art. R. 1112-1-2',
    citation:
      "La coordination de la prise en charge, assurée par un professionnel médical, donne lieu […] " +
      "à la rédaction d'un compte-rendu d'hospitalisation ou de la lettre de liaison mentionnée à " +
      "l'article R. 1112-1-2 du code de la santé publique. […] Les éléments justifiant " +
      "l'administration d'un produit de la réserve hospitalière, le contexte patient ou la " +
      "surveillance particulière sont bien retracés dans le dossier du patient.",
  },
  PORTE_1_STRUCTURE_HDJ: {
    localisation: 'Annexe 4, point 5',
    citation:
      "Dans tous les cas de figure, les établissements de santé doivent veiller à la traçabilité " +
      "des éléments permettant de caractériser l'hospitalisation de jour.",
  },
  PORTE_2_ACTE_ISOLE: {
    localisation: 'Annexe 1 (ACE) et Annexe 2 (prestations sans hospitalisation)',
    fondement: 'CSS, art. L. 162-26, L. 162-26-1 et R. 162-33-1, 2° à 6°',
    citation:
      "L'ensemble des établissements de santé a la possibilité de dispenser aux patients des actes " +
      "et consultations externes (ACE). […] Les prestations non suivies d'hospitalisation sont " +
      "visées par les dispositions des 2° à 6° de l'article R. 162-33-1 du code de la sécurité " +
      "sociale. […] Ces prestations ne nécessitent pas une admission du patient dans une unité " +
      "d'hospitalisation.",
  },
  PORTE_2_FORFAIT_SE: {
    localisation: 'Annexe 4, point 2.b.i',
    citation:
      "Les prises en charge concernant des actes associés à un forfait « sécurité environnement » " +
      "(SE) tel que décrit à l'annexe 2 de la présente instruction, ne peuvent en principe donner " +
      "lieu à facturation d'un GHS, sauf dans les cas particuliers suivants […].",
  },
  PORTE_3_SURVEILLANCE_PARTICULIERE: {
    localisation: 'Annexe 4, point 2.b.iii (« La prise en compte de la surveillance particulière ou du contexte patient »)',
    citation:
      "soit parce qu'il s'agit de modalités de prise en charge qui nécessitent un temps de " +
      "surveillance du patient ou de réalisation plus important ou qui nécessitent des conditions " +
      "d'asepsie spécifiques : cette situation est dénommée « surveillance particulière » ; […] " +
      "L'ensemble de ces situations justifie la facturation d'un GHS dit « plein », quel que soit " +
      "le nombre d'interventions dénombrées.",
  },
  PORTE_3_CONTEXTE_PATIENT: {
    localisation:
      'Annexe 4, point 2.b.iii (« La prise en compte de la surveillance particulière ou du contexte patient »)',
    citation:
      "Le contexte patient renvoie aux situations suivantes : âge du patient ; handicap ; " +
      "pathologie psychiatrique ; état grabataire ; antécédents du patient (présence d'une autre " +
      "pathologie ou d'un traitement, échec ou impossibilité de réaliser la prise en charge dans " +
      "un environnement de type externe) ; précarité sociale ; difficultés de coopération ou " +
      "incapacité à s'exprimer ; suspicion de maltraitance chez le majeur protégé, chez le mineur " +
      "ou la mise en place de mesures de protection d'une femme victime de violence au sein du " +
      "couple ; lorsque la prise en charge de moins d'une journée est réalisée en urgence ou de " +
      "manière non programmée, en dehors d'une unité d'hospitalisation de courte durée […] ; le " +
      "cas échéant, en raison d'autres situations qui seront précisées dans le dossier du patient.",
  },
  PORTE_3_PRODUIT_RESERVE_HOSPITALIERE: {    localisation: 'Annexe 4, point 2.b.iii',
    fondement: 'CSP, art. R. 5121-82',
    citation:
      "soit parce que la prise en charge comporte l'administration de produits de la réserve " +
      "hospitalière telle que définie à l'article R. 5121-82 du code de la santé publique ;",
  },
  PORTE_3_ACTE_CLASSANT: {
    localisation: 'Annexe 4, point 2.b.i',
    fondement: 'Arrêté du 23 décembre 2016, annexe I — Annexe 8 du Volume 1 du manuel des GHM',
    citation:
      "Ces prises en charge donnent lieu à la facturation d'un GHS dit « plein » dès lors que la " +
      "présence d'un acte classant est détectée au sein du séjour, et ceci indépendamment du " +
      "groupage de ce dernier.",
  },
  PORTE_3_DECOMPTE_ACTES: {
    localisation: 'Annexe 4, point 2.b.iii (« Focus sur les actes CCAM »)',
    citation:
      "Deux actes de la CCAM peuvent être dénombrés de façon distincte dès lors qu'ils relèvent de " +
      "deux techniques différentes. […] 2 actes techniques relevant de 2 sous-paragraphes de la " +
      "CCAM ; 2 actes d'un même sous-paragraphe mais correspondant à 2 techniques différentes. […] " +
      "A noter que l'acte d'électrocardiographie sur au moins douze dérivations (DEQP003) ne peut " +
      "être dénombré au titre d'une intervention.",
  },
  PORTE_3_PLURIPROFESSIONNALITE: {
    localisation: 'Annexe 4, point 2.b.iii (« Prises en charge de médecine »)',
    citation:
      "Il s'agit des prises en charge sans acte classant qui mobilisent au moins trois " +
      "interventions coordonnées par un professionnel médical. […] La facturation d'un GHS dit " +
      "« intermédiaire » a lieu pour des prises en charge justifiant de 3 interventions ; la " +
      "facturation d'un GHS dit « plein » a lieu pour des prises en charge justifiant de 4 " +
      "interventions ou dans le cas d'une surveillance particulière ou d'un contexte patient " +
      "particulier, indépendamment du nombre d'interventions réalisées.",
  },
  PORTE_3_SPECIALITES_DISTINCTES: {
    localisation: 'Annexe 4, point 2.b.iii (« Focus sur les interventions des professionnels médicaux »)',
    fondement: 'CSP, art. L. 4111-1',
    citation:
      "Dans le cas où plusieurs professionnels médicaux interviennent directement auprès du " +
      "patient, ces professionnels doivent relever de deux spécialités ou surspécialités " +
      "distinctes pour que leurs interventions puissent être dénombrées. […] Seuls les " +
      "professionnels médicaux définis à l'article L. 4111-1 du code de la santé publique " +
      "(médecins, chirurgiens-dentistes et sages-femmes) peuvent assurer la coordination.",
  },
  PORTE_4_TRACABILITE_DOSSIER: {
    localisation: 'Annexe 4, point 5',
    citation:
      "Les interventions réalisées par les différents professionnels ou celles caractérisées par la " +
      "réalisation d'actes CCAM doivent donner lieu à une mention dans le dossier du patient. Le " +
      "dossier du patient doit également permettre d'apprécier les éléments de contexte patient et " +
      "de surveillance particulière.",
  },
  PORTE_4_ALERTE_DUREE: {
    localisation: 'Annexe 4, point 2.a — règle de contrôle interne (aucune durée plancher fixée par le texte)',
    citation:
      "La prise en charge du patient donne lieu à l'utilisation des moyens en locaux, en matériel " +
      "et en personnel dont dispose la structure d'hospitalisation de jour.",
  },
  RESCRIT_TARIFAIRE: {
    localisation: 'Annexe 6 — Dispositif de rescrit tarifaire',
    citation:
      "Ce dispositif permettra à tout établissement de santé, société savante ou fédération " +
      "hospitalière d'obtenir une prise de position formelle de l'Etat et de l'Assurance Maladie " +
      "sur les conditions de facturation d'une prise en charge spécifique.",
  },
};

/** Rend une référence sous forme « localisation — fondement ». */
export function libelleReference(code: CodeReference): string {
  const ref = REFERENCES[code];
  const fondement = ref.fondement ? ` (${ref.fondement})` : '';
  return `${ref.localisation}${fondement} — Instr. DGOS/R1/DSS/1A/2020/52`;
}
