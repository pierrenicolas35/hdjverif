/**
 * Contenu pédagogique de l'assistant.
 *
 * Pour chaque étape : une explication « pourquoi cette question ? », un rappel
 * de la règle applicable, et des exemples concrets adaptés à la discipline de
 * l'utilisateur (les mêmes règles ne se lisent pas de la même façon quand on est
 * médecin, cadre de santé, pharmacien, au DIM ou à la facturation).
 */

/** Discipline de l'utilisateur, choisie à l'étape d'accueil. */
export type Discipline =
  | 'MEDECIN'
  | 'SOIGNANT'
  | 'DIM_TIM'
  | 'PHARMACIE'
  | 'FACTURATION'
  | 'AUTRE';

export const LIBELLES_DISCIPLINE: Readonly<Record<Discipline, string>> = {
  MEDECIN: 'Médecin (prescripteur / coordonnateur)',
  SOIGNANT: 'Cadre de santé, IDE, paramédical',
  DIM_TIM: 'DIM / TIM (codage et contrôle interne)',
  PHARMACIE: 'Pharmacie à usage intérieur (PUI)',
  FACTURATION: 'Facturation / finances',
  AUTRE: 'Autre profil',
};

/** Accroche affichée après le choix de la discipline. */
export const ACCROCHES_DISCIPLINE: Readonly<Record<Discipline, string>> = {
  MEDECIN:
    'Vous engagez la justification clinique de la prise en charge : l’assistant vous aide à ' +
    'vérifier que les critères d’un GHS sont réunis avant de valider le séjour.',
  SOIGNANT:
    'Votre traçabilité (notes d’évolution, surveillance, éducation thérapeutique) est ce qui ' +
    'rend la prise en charge opposable : l’assistant vous montre ce qui compte.',
  DIM_TIM:
    'L’assistant applique les 5 portes de l’instruction et produit une fiche d’audit ' +
    'directement opposable en contrôle T2A.',
  PHARMACIE:
    'La recherche de spécialités interroge le référentiel des médicaments à réserve ' +
    'hospitalière (art. R. 5121-82 CSP) : un produit de réserve suffit à caractériser la densité.',
  FACTURATION:
    'L’assistant tranche entre facturation en GHS, requalification en ACE et forfait de séance, ' +
    'et vous donne les motifs de blocage à opposer.',
  AUTRE:
    'L’assistant vous guide pas à pas pour déterminer si la prise en charge relève d’un GHS ' +
    'd’hospitalisation de jour ou d’actes externes.',
};

/** Contenu pédagogique d'une étape. */
export interface AideEtape {
  /** Pourquoi cette question est posée. */
  readonly pourquoi: string;
  /** Règle applicable (résumé de la référence normative). */
  readonly regle: string;
  /** Exemples par discipline ; `AUTRE` sert de repli. */
  readonly exemples: Readonly<Record<Discipline, readonly string[]>>;
}

const exemples = (
  MEDECIN: readonly string[],
  SOIGNANT: readonly string[],
  DIM_TIM: readonly string[],
  PHARMACIE: readonly string[],
  FACTURATION: readonly string[],
): Readonly<Record<Discipline, readonly string[]>> => ({
  MEDECIN,
  SOIGNANT,
  DIM_TIM,
  PHARMACIE,
  FACTURATION,
  AUTRE: [...new Set([...MEDECIN, ...DIM_TIM])].slice(0, 4),
});

export const AIDE_ETAPES: Readonly<Record<string, AideEtape>> = {
  champ_seance: {
    pourquoi:
      'La dialectique de l’instruction ne s’applique pas aux séances : dialyse et chimiothérapie ' +
      'sont financées par un forfait de séance, sans avoir à démontrer la densité.',
    regle:
      'Annexe 4, point 1 : les prises en charge correspondant à des « séances » sont financées à ' +
      'travers un GHS « sans que la prise en charge n’ait à répondre aux critères de la présente ' +
      'instruction ».',
    exemples: exemples(
      [
        'Séance d’hémodialyse en unité d’auto-dialyse ou en centre lourd',
        'Cure de chimiothérapie anticancéreuse programmée sur protocole',
        'Séance d’immunothérapie ou de biothérapie en hôpital de jour de cancérologie',
      ],
      [
        'Préparer et administrer une cure de chimiothérapie : codage en séance, pas en GHS de gradation',
        'Une séance de dialyse se compte par séance, jamais par séjour HDJ',
        'Vérifier que la convocation porte bien la mention « séance » et non « hôpital de jour »',
      ],
      [
        'Séances = CMD 28 : groupage en séance, hors critères de gradation ambulatoire',
        'Ne pas rechercher de GHM de médecine pour une séance de dialyse',
        'Le critère de densité (3 ou 4 interventions) ne s’applique pas aux séances',
      ],
      [
        'Un produit de chimiothérapie en séance reste facturé au forfait de séance',
        'La réserve hospitalière du produit ne transforme pas une séance en GHS de gradation',
        'Penser au circuit séparé des préparations cytotoxiques',
      ],
      [
        'Dialyse : forfait D ; chimiothérapie : forfait de séance — pas de GHS de médecine',
        'Une séance ne consomme pas de numéro de séjour HDJ au sens de la gradation',
        'Vérifier le mode d’entrée/sortie saisi pour éviter un groupage en erreur',
      ],
    ),
  },

  champ_hors_mco: {
    pourquoi:
      'L’instruction ne concerne que les établissements ayant des activités de médecine, ' +
      'chirurgie, obstétrique et odontologie (MCO). Le SMR et la psychiatrie relèvent d’autres ' +
      'modalités de financement.',
    regle:
      'L’instruction est relative aux prises en charge réalisées « au sein des établissements de ' +
      'santé ayant des activités de médecine, chirurgie, obstétrique et odontologie ou ayant une ' +
      'activité d’hospitalisation à domicile ».',
    exemples: exemples(
      [
        'Hôpital de jour de rééducation neurologique : champ SMR, pas MCO',
        'Hôpital de jour psychiatrique : financement propre à la psychiatrie',
        'Une activité de dialyse en établissement MCO reste une séance, pas un séjour de gradation',
      ],
      [
        'HDJ de soins de suite : la dotation SMR s’applique, pas la règle des 3 interventions',
        'HDJ psychiatrique : ne pas rechercher de critères de densité MCO',
      ],
      [
        'Vérifier l’autorisation de l’entité juridique avant d’appliquer les portes 1 à 4',
        'Un séjour SMR/DPSY groupé dans son champ propre n’entre pas dans cet audit',
        'Contrôler la table de correspondance des unités fonctionnelles',
      ],
      [
        'Un traitement de fond en HDJ psychiatrique suit le financement psychiatrique',
        'Pas de recherche de réserve hospitalière au titre de la gradation MCO',
      ],
      [
        'Segments tarifaires distincts : un séjour SMR/psy ne se facture pas en GHS MCO',
        'Vérifier le régime saisi en amont pour éviter un rejet',
      ],
    ),
  },

  programmation: {
    pourquoi:
      'Un GHS de jour suppose une organisation anticipée : convocation, objectif médical formalisé ' +
      'et utilisation des moyens de la structure d’hospitalisation de jour.',
    regle:
      'Annexe 4, point 2.a : « Une prise en charge programmée sans nuitée requiert une ' +
      'organisation spécifique réalisée sur un plateau adapté. »',
    exemples: exemples(
      [
        'Convoquer un patient pour un bilan de diabète déséquilibré avec synthèse en fin de journée',
        'Regrouper sur une même venue les avis dont le patient a besoin (endocrino, diététique, IDE)',
        'Un passage direct par les urgences ne permet pas de reconstituer une programmation',
      ],
      [
        'Vérifier que la convocation mentionne un objectif (bilan, traitement, éducation)',
        'Le cahier de rendez-vous de l’HDJ fait foi en cas de contrôle',
        'Un patient « ajouté » le matin sans convocation affaiblit sérieusement le dossier',
      ],
      [
        'Rechercher la trace de convocation dans le DPI, pas seulement la date d’entrée',
        'Un séjour non programmé se code en GHS mais doit être requalifié',
        'Tracer la programmation dans le dossier des séjours pour l’opposabilité',
      ],
      [
        'Une chimiothérapie programmée relève de la séance : la question ne se pose qu’en MCO',
        'Vérifier que la préparation pharmaceutique est bien datée du jour de la venue',
      ],
      [
        'Contrôler le mode d’entrée : un mode « urgence » avec objectif HDJ est un signal d’alerte',
        'La programmation conditionne la facturabilité, pas seulement la qualité',
      ],
    ),
  },

  documents: {
    pourquoi:
      'Ce sont les pièces qui rendent la prise en charge opposable. Sans elles, l’assurance ' +
      'maladie ne peut pas vérifier la réalité de la prise en charge coordonnée.',
    regle:
      'Annexe 4, points 2.b.iii et 5 : compte-rendu d’hospitalisation ou lettre de liaison ' +
      '(art. R. 1112-1-2 CSP) ; les interventions doivent « donner lieu à une mention dans le ' +
      'dossier du patient ».',
    exemples: exemples(
      [
        'Signer le compte-rendu le jour même : c’est le document central du contrôle',
        'La lettre d’adressage du médecin traitant justifie la pertinence du recours à l’HDJ',
        'Ne pas « reconstituer » a posteriori un compte-rendu : c’est le risque majeur en contrôle',
      ],
      [
        'Chaque intervenant écrit sa note d’évolution le jour de la venue',
        'La surveillance des constantes se trace dans le dossier de soins, pas sur un post-it',
        'Une lettre de liaison remise au patient est également une exigence de qualité',
      ],
      [
        'Absence de synthèse signée = suspension pour régularisation, pas rejet : laissez la ' +
          'chance au service de produire la pièce avant validation DIM',
        'Vérifier que la synthèse est signée, pas seulement saisie dans le DPI',
        'Contrôler la remise de la lettre de liaison au médecin traitant',
      ],
      [
        'Un compte-rendu mentionnant explicitement le produit administré et sa surveillance ' +
          'conforte le pilier « soins »',
        'La mention de la réserve hospitalière dans le dossier est un élément de preuve',
      ],
      [
        'Ces pièces ne sont pas facturables mais conditionnent le paiement : les exiger en amont',
        'La lettre de liaison est un indicateur qualité souvent regardé en contrôle',
      ],
    ),
  },

  actes: {
    pourquoi:
      'Un acte technique isolé, réalisable en cabinet, ne justifie pas une hospitalisation. ' +
      'À l’inverse, un plateau technique lourd ou des actes coordonnés caractérisent la densité.',
    regle:
      'Annexe 4, points 2.b.i et 2.b.iii : acte classant → GHS plein ; deux actes CCAM de ' +
      'techniques différentes sont dénombrables ; l’ECG DEQP003 ne peut être dénombré.',
    exemples: exemples(
      [
        'Une endoscopie digestive sous anesthésie générale relève d’un plateau technique',
        'Un ECG seul ne justifie jamais un GHS : il n’est même pas dénombrable',
        'Regrouper deux gestes de techniques différentes sur la même venue renforce le dossier',
      ],
      [
        'Un acte réalisé en salle interventionnelle est un marqueur fort de densité',
        'Ne comptez pas un ECG dans vos interventions : le texte l’exclut explicitement',
        'Vérifiez que l’acte est bien codé le jour de la venue (pas la veille)',
      ],
      [
        'La recherche interroge directement la nomenclature : le code et le libellé sont fiables',
        'Acte classant (annexe 8 du manuel des GHM) → GHS plein sans autre condition',
        'ECG DEQP003 : non dénombrable au titre d’une intervention',
      ],
      [
        'Un acte de perfusion isolé est en principe externe : vérifiez le besoin de surveillance',
        'La réserve hospitalière du produit administré peut suffire à caractériser la densité',
      ],
      [
        'Un acte isolé réalisable en externe se requalifie en ACE (consultation ou acte)',
        'Deux actes de techniques distinctes valorisent un GHS : ne pas les fusionner',
      ],
    ),
  },

  medicaments: {
    pourquoi:
      'Certains produits ne peuvent être administrés qu’à l’hôpital. Leur administration est alors ' +
      'un motif suffisant de prise en charge en hôpital de jour, quel que soit le nombre ' +
      'd’interventions.',
    regle:
      'Annexe 4, point 2.b.iii : la prise en charge justifie un GHS plein « soit parce que la ' +
      'prise en charge comporte l’administration de produits de la réserve hospitalière telle que ' +
      'définie à l’article R. 5121-82 du code de la santé publique ».',
    exemples: exemples(
      [
        'Perfusion d’immunoglobulines polyvalentes (réserve hospitalière)',
        'Administration d’une biothérapie nécessitant une surveillance de la tolérance',
        'Un antalgique de ville administré pendant la venue ne caractérise pas la densité',
      ],
      [
        'Surveillez et tracez la tolérance : c’est cette trace qui rend la surveillance opposable',
        'Un produit à réserve hospitalière impose une surveillance, donc une trace',
        'Distinguez « produit de réserve » et « produit courant » dans la feuille de surveillance',
      ],
      [
        'Le référentiel indique si le produit est en réserve hospitalière ; NULL = à trancher',
        'La mention du lot et de l’heure d’administration conforte le dossier',
        'Un produit hors AMM fait l’objet d’un moratoire sur le contrôle de la facturation',
      ],
      [
        'Recherchez la spécialité dans l’assistant : la réserve hospitalière vient du référentiel',
        'Produit non retrouvé ? Le référentiel renvoie « non déterminé » : tranchez avec le DIM',
        'La liste en sus est un champ distinct, utile au contrôle du remboursement',
      ],
      [
        'Un produit de réserve hospitalière suffit à facturer un GHS plein : c’est un point de contrôle clé',
        'Vérifiez la concordance entre la pharmacie, le dossier et la facturation',
      ],
    ),
  },

  intervenants: {
    pourquoi:
      'La pluriprofessionnalité ne compte que si elle est écrite. Un intervenant qui n’a pas ' +
      'rédigé de note d’évolution n’est pas dénombrable en contrôle.',
    regle:
      'Annexe 4, point 2.b.iii : les interventions doivent être « réalisées directement auprès du ' +
      'patient » ; plusieurs médecins ne sont dénombrés que s’ils relèvent de deux spécialités ou ' +
      'surspécialités distinctes. Point 5 : mention obligatoire dans le dossier.',
    exemples: exemples(
      [
        'Un bilan d’éducation thérapeutique associe médecin, IDE et diététicien(ne)',
        'Deux médecins de la même spécialité ne comptent que pour un',
        'Chaque intervenant signe sa propre note dans le dossier',
      ],
      [
        'L’entretien diététique et l’entretien éducatif IDE sont deux interventions distinctes',
        'Une intervention collective peut être dénombrée pour chacun des patients',
        'N’oubliez pas de tracer les entretiens d’éducation thérapeutique',
      ],
      [
        'Comptez les professions distinctes, pas le nombre de personnes',
        'Médecins : exiger la spécialité (qualification ordinale ou surspécialité)',
        'Un intervenant sans note d’évolution est exclu du décompte',
      ],
      [
        'Le pharmacien clinicien réalisant un entretien pharmaceutique peut être dénombré',
        'Le biologiste qui traite un prélèvement au laboratoire n’est pas dénombrable',
      ],
      [
        '3 interventions = GHS intermédiaire ; 4 interventions = GHS plein',
        'Sans trace écrite, l’intervention n’existe pas au plan tarifaire',
      ],
    ),
  },

  surveillance: {
    pourquoi:
      'La surveillance particulière et le contexte patient justifient un GHS plein quel que soit ' +
      'le nombre d’interventions — mais uniquement si elle est documentée.',
    regle:
      'Annexe 4, point 2.b.iii : « la prise en charge peut justifier une hospitalisation de jour ' +
      'et la facturation d’un GHS dit « plein » […] dans la mesure où […] la surveillance ' +
      'particulière sont bien retracées dans le dossier du patient ».',
    exemples: exemples(
      [
        'Surveillance de la tolérance d’une première perfusion de biothérapie',
        'Patient très dépendant nécessitant des précautions particulières pendant l’acte',
        'Un acte rapide chez un patient autonome ne mobilise pas de surveillance particulière',
      ],
      [
        'Tracez les constantes avant, pendant et après : c’est votre preuve',
        'Durée de présence courte + acte simple = signal d’alerte en contrôle',
        'La surveillance prolongée après le geste est un critère à documenter',
      ],
      [
        'Une durée de présence inférieure à 3 heures déclenche une alerte qualité (non bloquante)',
        'La surveillance particulière doit être retrouvée dans le dossier de soins',
        'Contexte patient : à motiver explicitement, sinon fragile en contrôle',
      ],
      [
        'Surveillance continue requise par le produit → pilier « soins » validé',
        'Pensez à la surveillance post-administration, pas seulement pendant la perfusion',
      ],
      [
        'Alerte durée < 3 h : renforcer le dossier plutôt que de renoncer à facturer',
        'La surveillance documentée peut suffire à elle seule à justifier le GHS',
      ],
    ),
  },
};

/** Repli générique si une étape n'a pas de contenu dédié. */
export const AIDE_PAR_DEFAUT: AideEtape = {
  pourquoi: 'Cette information est utilisée par le moteur décisionnel.',
  regle: 'Instruction N° DGOS/R1/DSS/1A/2020/52 du 10 septembre 2020.',
  exemples: exemples([], [], [], [], []),
};
