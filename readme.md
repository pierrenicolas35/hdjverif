# HDJ Vérif — assistant d’éligibilité à l’hospitalisation de jour

Assistant pas-à-pas d’aide à la décision : une prise en charge ambulatoire doit-elle être
facturée en **GHS d’hospitalisation de jour** ou requalifiée en **actes et consultations
externes (ACE)** ?

La décision est rendue en **langage courant**, directement exploitable par le praticien :

| Décision affichée | Statut technique du moteur |
|---|---|
| HDJ validée — facturation en GHS **plein** | `VALIDE_GHS` |
| HDJ validée — facturation en GHS **intermédiaire** | `VALIDE_GHS` |
| HDJ à régulariser — pièce(s) manquante(s) au dossier | `SUSPENDU_POUR_REGULARISATION` |
| Facturation en HDJ non validée — actes et consultations externes | `REJET_VERS_ACE` |
| Facturation en HDJ non validée — forfait de séance | `REJET_VERS_FORFAIT_SEANCE` |
| Facturation en HDJ non validée — hors champ MCO | `REJET_HORS_MCO` |
| Facturation en HDJ non validée — prise en charge non programmée | `REJET_NON_PROGRAMME` |

Fondement : **Instruction N° DGOS/R1/DSS/1A/2020/52 du 10 septembre 2020** (NOR : SSAH2007743J,
BO Santé n° 2020/9 du 15 octobre 2020) relative à la gradation des prises en charge ambulatoires.

Site : <https://pierrenicolas35.github.io/hdjverif/>

---

## 1. Interface : une saisie minimale, orientée praticien

**Principe** : ne demander que ce qui sert au calcul de la facturation d’HDJ.

### Les engagements d’équipe : un rappel, pas une question

Deux conditions de fond de l’annexe 4, point 2.b.iii sont **réputées réunies** dans une HDJ en
cours de programmation, comme les faits de la porte 1 : elles ne sont donc pas demandées, mais
rappelées à l’écran pour être **tracées au dossier du patient**, où le contrôle T2A les vérifie :

1. la **note d’évolution** de chaque intervenant doit être rédigée dans le dossier — sans elle,
   l’intervention n’est pas dénombrée ;
2. les interventions de **deux professionnels médicaux** ne sont dénombrées séparément que s’ils
   relèvent de **deux spécialités ou surspécialités distinctes**.

Ces engagements sont repris dans l’audit : le pilier « pluriprofessionnalité concertée » formule
la réserve lorsqu’aucune spécialité n’est renseignée.

### Une évaluation prospective

L’outil sert à vérifier, **avant de programmer**, que les soins envisagés relèvent bien d’une
hospitalisation de jour. Les questions dont la réponse est « oui » **par construction** ne sont
donc pas posées :

| Question écartée | Pourquoi |
|---|---|
| La venue est-elle programmée ? | Elle est programmée puisqu’on la prépare. |
| La demande médicale préalable est-elle au dossier ? | Elle fait partie de la programmation. |
| La synthèse médicale est-elle signée le jour même ? | Elle sera signée le jour de la venue. |
| La lettre de liaison a-t-elle été remise au patient ? | Elle le sera au décours de la séance. |

Ces quatre éléments restent des **engagements de la prise en charge programmée** : ils sont
rappelés à cocher sur la fiche de traçabilité, et le moteur les considère comme réunis.

Les questions portent donc uniquement sur ce qui **détermine la facturation** : actes prévus,
médicaments prévus, professionnels qui interviendront, surveillance prévue, durée de présence et
**contexte patient**.

### Écran d’accueil : trois entrées

L’accueil ne demande rien : il propose trois entrées, la principale en tête et en plus grand.

1. **Calculer l’éligibilité d’une HDJ** — le parcours pas-à-pas (bouton principal, au-dessus des
   autres).
2. **Référentiel des actes techniques (CCAM)** — interroger la base pour savoir si un acte
   mobilise un **soin lourd** : recherche par mots-clés ou par code, et navigation par
   **arborescence** (thématique → sous-thème → actes).
3. **Médicaments de la réserve hospitalière** — rechercher une spécialité par nom commercial ou
   par DCI, et lire le classement issu du référentiel officiel.

### Rappel avant toute évaluation : les motifs hors champ

Les situations qui échappent à l’instruction ne représentent qu’une **part marginale** des
demandes : en faire la première question du parcours aurait alourdi l’outil pour tout le monde.
Elles font donc l’objet d’un **message d’alerte affiché avant de pouvoir débuter** (popup), qui
recense les trois motifs concernés et cite leur base réglementaire :

| Motif | Pourquoi il échappe à l’HDJ |
|---|---|
| **Séance de dialyse ou de chimiothérapie** | Séance forfaitisée (GHS de séance), « sans que la prise en charge n’ait à répondre aux critères » (annexe 4, point 1). |
| **SMR / SSR** | Financement propre au SMR, hors du champ MCO que vise l’instruction (art. L. 162-22-6 CSS). |
| **Psychiatrie** | Financement propre à la psychiatrie, hors champ MCO (art. L. 162-22-6 CSS). |

Le rappel est **catégorique** : aucun contexte patient, même très lourd, ne rend ces situations
facturables en GHS d’hospitalisation de jour MCO — la question n’est pas celle de la densité des
soins, mais celle du régime de financement. Une case « ne plus afficher ce rappel » permet de ne
pas le revoir une fois qu’il est connu.

### Écrans et interactions

- **Aucune donnée administrative** : ni numéro de séjour, ni date. Rien de ce qui identifie le
  patient n’est saisi ni affiché (y compris dans la fiche de traçabilité et la synthèse).
- **Cinq questions** + la décision : actes, médicaments, équipe, surveillance et durée,
  **contexte patient**. Les questions homogènes sont **regroupées** pour limiter les clics.
- **Contexte patient (vulnérabilité)** : l’écran reprend l’énumération de l’instruction — âge,
  handicap, pathologie psychiatrique, état grabataire, antécédents (échec ou impossibilité de la
  prise en charge en externe), précarité sociale, difficultés de coopération ou d’expression,
  suspicion de maltraitance, venue en urgence hors UHCD, autre situation documentée. **Une seule
  situation suffit** : le GHS « plein » est alors retenu quel que soit le nombre d’interventions,
  et les critères retenus sont imprimés sur la fiche de traçabilité.
- **Un langage de soignant, au futur** : « Quels actes techniques sont prévus pendant la venue ? »,
  « Quels professionnels interviendront auprès du patient ? », « Une surveillance rapprochée du
  patient est-elle prévue ? ». Le vocabulaire juridique (*champ de l’instruction*, *densité*,
  *MCO*) reste confiné au volet « Règle applicable », qui cite la référence normative.
- **Gros boutons Oui / Non** : **Oui en vert**, **Non en rouge** (Material Design), maintenus
  enfoncés une fois sélectionnés.
- **Équipe par boutons à bascule** : un bouton par profession (médecin, infirmier(ère),
  kinésithérapeute, diététicien(ne), psychologue, assistant(e) social(e), autre paramédical).
  Cliquer **maintient le bouton enfoncé** et sélectionne un intervenant ; re-cliquer le
  désélectionne. Un second médecin s’ajoute par un bouton dédié (autre spécialité).
  **Aucune autre saisie** : ni spécialité, ni question sur la note d’évolution — un **rappel**
  encadré les remplace (voir ci-dessous).
- **Référentiels faisant foi** : le **verdict d’éligibilité HDJ** d’un acte (issu du croisement
  avec le Manuel des GHM : acte classant, éligibilité à trois états, motif), ses indicateurs de
  nomenclature CCAM (plateau technique lourd, acte marqueur HDJ, réalisation en externe) et le
  classement d’un médicament (réserve hospitalière, surveillance renforcée) sont **repris du
  référentiel** et affichés. Ils ne sont **jamais redemandés** à l’utilisateur. Chaque écran
  CCAM affiche le verdict **en tête**, puis les indicateurs en complément : un acte **lourd**
  n’est pas nécessairement un acte **recevable en HDJ**.
- **Actes : recherche *et* arborescence sur l’écran de saisie** : à l’étape « actes », l’acte se
  cherche par code ou mots-clés — ou se **parcourt par arborescence** (thématique → site
  anatomique → acte), dépliée à la demande. Une fois l’acte trouvé, un bouton **« Ajouter au
  dossier »** le retient (il est alors signalé « Ajouté au dossier »), et le questionnaire se
  poursuit à l’étape suivante sans quitter le parcours.
- **Décision en direct** dans l’en-tête, formulée en langage courant, dès qu’un élément de la
  prise en charge est saisi.
- **Volet pédagogique** sur chaque écran : « pourquoi cette question ? », règle applicable citée,
  et cas typiques **ancrés sur la question posée**. La discipline qui illustre ces cas se choisit
  **dans un menu déroulant, à l’endroit où l’on lit l’aide** (et non en préambule) : les
  14 disciplines y sont rangées **par ordre alphabétique**. La grille couvre les cinq questions
  pour chacune d’elles, de sorte que l’aide ne parle jamais d’une autre question
  (*Relève du GHS* / *Relève de l’externe* / *Piège fréquent* / *Hors champ*). Ce choix ne
  modifie aucun critère de décision.
- **Fiche de traçabilité T2A** imprimable (PDF) ou exportable en `.txt`, avec zones de visa et
  rappel du dispositif de rescrit tarifaire.

### Charte et ergonomie

- **En-tête bleu CHU Grenoble Alpes (`#008FDB`) avec écriture blanche**, sur l’ensemble des
  écrans. Le reste du site est **blanc**, en permanence : **aucune adaptation du fond à l’heure de
  la journée** ni au thème du système (`color-scheme: light`, thème unique).
- **Boutons d’inspiration Material Design** : formes pleines, élévation, micro-animations au clic.
- **Optimisé smartphone et poste de travail** : barre d’action fixée en bas sur téléphone, volet
  d’aide repliable sur petit écran et collant sur grand écran, cibles tactiles ≥ 44 px, prise en
  charge de `prefers-reduced-motion` et des `safe-area-inset`.

## 2. Architecture

```
index.html                        Structure de l'assistant (en-tête, progression, carte, aide)
.github/workflows/
  ci.yml                          Typage, tests, build, déploiement GitHub Pages
  maj-referentiels.yml            Contrôle mensuel des sources officielles (+ reprise manuelle)
src/
  config.ts                       Accès au référentiel Supabase (clé publique anon)
  core/rules-engine/              MOTEUR — pur, typé strict, découplé de l'UI
    types.ts                      Schéma métier + ResultatAudit (décision lisible, niveau GHS)
    references.ts                 Citations littérales de l'instruction
    helpers.ts                    Primitives (intervenants actifs, dénombrement, niveau GHS)
    validation.ts                 Garde-fous d'entrée
    engine.ts                     Orchestration des 5 portes + libellé de décision
    synthese.ts                   Synthèse d'audit opposable
    ports/                        porte0-champ · porte1-prerequis · porte2-acte-isole
                                  porte3-densite · porte4-decision
  ui/
    wizard.ts                     Écrans (accueil, évaluation, consultation des référentiels),
                                  navigation, recherche, arborescence CCAM
    store.ts                      État de l'assistant → DossierHDJ
    referentiels.ts               Client Supabase (médicaments, CCAM) + repli local
    pedagogie.ts                  Disciplines cliniques, cas typiques, aide par étape
    fiche.ts                      Fiche de traçabilité T2A
    styles.css                    Charte CHU Grenoble Alpes (en-tête bleu, fond blanc)
supabase/
  hardening.sql                   Row Level Security, privilèges, index, vues
  functions/maj-referentiels/     Fonction Edge — jeton GitHub côté serveur (facultatif)
  rpc-recherche.sql               RPC de recherche (médicaments, CCAM, acte par code)
  referentiel-maj.sql             Suivi des dates de mise à jour et de contrôle
  ccam-arbres.sql                 Arborescence CCAM + mots-clés « grand public » et
                                  fonctions de navigation (chapitres, sous-thèmes, actes)
scripts/
  import-referentiels.mjs         Import des référentiels officiels vers Supabase
  maj-referentiels.mjs            Mise à jour mensuelle légère (empreinte des sources)
  verifier-referentiel.mjs        Porte de contrôle du référentiel publié (lecture seule)
  base-hdj.mjs                    Base des actes valorisables en HDJ (restitution 6 colonnes)
  extraire-referentiel-atih.py    Extraction des PDF officiels ATIH → CSV (voir §4)
  lib/referentiels.mjs            Lecture des sources officielles (BDPM, CCAM) — pur, testé
  lib/ghm.mjs                     Croisement CCAM × Manuel des GHM MCO — pur, testé
  lib/sources.mjs                 Sources officielles : URL, téléchargement, empreinte
data/                             Listes de travail (réserve hospitalière, surcharges CCAM)
  ccam-complete-2025.csv          Nomenclature CCAM consolidée, chapitres 1 à 19 (8 065 actes)
  atih/                           Manuel des GHM 2025 : racines et actes classants (ATIH)
tests/                            Moteur (5 cas obligatoires), portes, assistant, référentiels
```

**Principe** : l’interface ne décide rien. Elle collecte les réponses, les convertit en
`DossierHDJ`, appelle `evaluerDossier()` et affiche le `ResultatAudit`. Le moteur est une
fonction pure (pas de DOM, pas de réseau, pas d’horloge système) : deux dossiers identiques
produisent toujours le même résultat.

## 3. Algorithme : 5 portes séquentielles

| Porte | Objet | Issue bloquante |
|---|---|---|
| **0** | Filtre de champ d’application | `REJET_VERS_FORFAIT_SEANCE` (dialyse, chimiothérapie)<br>`REJET_HORS_MCO` (SMR, psychiatrie) |
| **1** | Prérequis médico-administratifs et traçabilité | `REJET_NON_PROGRAMME` · `SUSPENDU_POUR_REGULARISATION` · `REJET_VERS_ACE` || **2** | Exclusion des actes isolés réalisables en externe | `REJET_VERS_ACE` |
| **3** | Densité en ressources mobilisées (≥ 1 pilier) | — (alimente la porte 4) |
| **4** | Décision finale et alertes qualité | `REJET_VERS_ACE` si aucun pilier validé |

> **Portée dans l’interface.** L’assistant est prospectif : les faits de la **porte 1**
> (programmation, demande médicale préalable, synthèse du jour, lettre de liaison) sont acquis
> par construction et ne sont donc pas interrogés. Le moteur, lui, les évalue toujours — ses
> tests couvrent ces issues, et la porte 1 reste franchissable par tout autre appelant de
> `evaluerDossier()`.

**Piliers de densité (porte 3)**

1. **Soins / surveillance active** — surveillance documentée, ou administration d’un produit de
   la réserve hospitalière (art. R. 5121-82 CSP) ou nécessitant une surveillance particulière
   pendant le traitement (libellé officiel du référentiel). Une valeur **absente** du
   référentiel ne valide pas le pilier et ne le bloque pas : elle est signalée comme point à
   confirmer par la pharmacie à usage intérieur.
2. **Plateau technique lourd / actes coordonnés** — au moins un acte sur plateau lourd, ou au
   moins deux actes CCAM dénombrables distincts. L’ECG `DEQP003` est exclu du décompte
   (annexe 4, point 2.b.iii).
3. **Pluriprofessionnalité concertée** — seuls les intervenants ayant
   `note_evolution_tracee === true` comptent (par défaut : tous, la note étant réputée
   rédigée) : **3A** ≥ 2 médecins de spécialités distinctes — ou **2 médecins sans spécialité
   renseignée**, la condition étant alors rappelée comme engagement de dossier —,
   **3B** ≥ 1 médecin + ≥ 2 professions paramédicales/sociales distinctes.

**Niveau de GHS (porte 4)** — l’instruction distingue le GHS « intermédiaire » du GHS « plein » :

- **GHS plein** dès qu’une surveillance particulière est documentée (surveillance active, produit
  de la réserve hospitalière ou à surveillance continue), qu’un acte classant / plateau technique
  est présent, ou que **4 interventions au moins** sont dénombrées ;
- **GHS intermédiaire** dans les autres cas (typiquement une prise en charge de médecine reposant
  sur **3 interventions** coordonnées).

**Alertes qualité** (non bloquantes) : durée de présence < 180 min ; lettre de liaison non
remise ; **réserve hospitalière absente du référentiel** (valeur non déterminée, à confirmer par
la pharmacie à usage intérieur).

## 4. Référentiels Supabase

Projet Supabase `Hdjverif` — trois tables publiques en lecture seule :

| Table | Contenu | Source |
|---|---|---|
| `referentiel_medicaments` | 13 609 spécialités (CIS, dénomination, **DCI réelle**, réserve hospitalière, liste en sus, **surveillance particulière**, surveillance renforcée) | **Base de données publique des médicaments** (BDPM, ANSM / Assurance Maladie) : `CIS_bdpm.txt`, **`CIS_COMPO_bdpm.txt`** (composition → DCI) et **`CIS_CPD_bdpm.txt`** (conditions de prescription et de délivrance → réserve hospitalière) |
| `referentiel_ccam` | **8 059 actes** (code, libellé, acte marqueur HDJ, exclusif externe, plateau technique lourd, **chapitre**, **sous-thème = site anatomique**, **mots-clés**, **acte classant**, **racine GHM**, **éligibilité HDJ**…) | **Nomenclature CCAM consolidée** — chapitres 1 à 19 de la CCAM descriptive (ATIH), jeu de données « CCAM Ameli » (data.gouv.fr / InterHop) et libellés abrégés du Manuel des GHM. Voir `data/ccam-complete-2025.csv` |
| `thesaurus_synonymes` | **329 termes** de vocabulaire de recherche rangés en **88 notions** (terme, forme normalisée, notion, type, domaine) — la table qu’interroge la recherche élargie | **`data/thesaurus-synonymes.csv`** (fichier versionné, voir « Thésaurus des synonymes ») |

S’y ajoute `referentiel_maj`, table de **service** (lecture publique, écriture réservée au
`service_role`) : une ligne par table de référentiel, avec la date du dernier **import**
(`maj_le`), la date du dernier **contrôle des sources** (`verifie_le`), l’état de ce contrôle
(`etat_controle` : `importe`, `a_jour`, `echec`) et le message d’un éventuel échec. C’est elle
qui permet à l’application de dire *« référentiel non contrôlé depuis 67 jours »* au lieu de
laisser croire que des données anciennes sont à jour (voir « Mise à jour mensuelle »).

Dans l’assistant :

- l’utilisateur **recherche un acte** (par code ou par mots-clés) : le code, le libellé, le
  **verdict d’éligibilité HDJ** et les trois indicateurs de nomenclature sont repris du
  référentiel et affichés, sans ressaisie ;
- l’utilisateur **recherche un médicament** (nom ou DCI) : l’assistant affiche s’il s’agit d’un
  **produit de la réserve hospitalière** — ce qui suffit à valider le pilier « soins » ;
- la recherche est **insensible à la casse et aux accents** (fonctions RPC `unaccent`) ;
- si le référentiel est **injoignable**, un repli local embarqué prend le relais et l’état est
  signalé dans l’en-tête.

### Recherche des actes : mots-clés « grand public » et arborescence

La recherche d’un acte technique ne pouvait pas se limiter au libellé officiel : le référentiel
parle de « **remnographie** » là où tout le monde cherche « **IRM** », de « **scanographie** » là
où l’on cherche « **scanner** », et un secrétariat cherchera « fibro » plutôt
qu’« endoscopie œsogastroduodénale ». Deux dispositifs complètent donc la recherche par code :

1. **Des mots-clés de vocabulaire courant**, construits à l’import pour chaque acte à partir de son
   libellé, de ses libellés d’arborescence et du **thésaurus des synonymes**
   (`scripts/lib/referentiels.mjs`, colonne `mots_cles` indexée en trigrammes). Ils viennent
   **s’ajouter** au libellé officiel, jamais le remplacer. Sur la nomenclature complète,
   6 186 des 8 059 actes en portent.
2. **Une arborescence officielle à deux niveaux**, navigable à l’écran :
   - **thématique** = les **chapitres par appareil** de la nomenclature — les **19 chapitres**
     de la CCAM sont désormais présents (le chapitre 18 « gestes complémentaires et
     modificateurs », absent du jeu libéral, est apporté par les chapitres publiés par l’ATIH) ;
   - **sous-thème** = le **site anatomique** de l’acte (axe « Appareils » de l’arborescence CCAM
     publiée par l’Assurance Maladie), replié sur le chapitre lorsqu’il est absent.

   Aucune classification n’est inventée : ces niveaux sont livrés par le jeu de données « CCAM
   Ameli » lui-même (colonnes `chapterCode`/`chapterLabel`, `topographie`/`topographieLabel`,
   `action`, `modeAcces`, famille d’actes), et repris tels quels par trois fonctions RPC :
   `chapitres_ccam()`, `sous_chapitres_ccam(chapitre)` et `actes_par_theme(chapitre, sous-thème)`.

   Cette arborescence est **la même dans les deux contextes** : la consultation autonome du
   référentiel (lecture seule, où l’acte reçoit son **verdict d’éligibilité HDJ**) et **l’étape
   « actes » du questionnaire**, où elle se déplie à la demande et où chaque acte trouvé porte un
   bouton **« Ajouter au dossier »** : l’acte rejoint la saisie sans quitter le parcours, puis
   l’étape suivante se poursuit. Une fois retenu, il est signalé « Ajouté au dossier » et son
   bouton est désactivé.

> **Exactitude des indicateurs.** Un défaut a été corrigé à cette occasion : la source écrit
> « autre qu’**’**abord ouvert » avec une **apostrophe typographique**, là où les règles
> utilisaient l’apostrophe droite. Sans normalisation (`normaliserModeAcces`), deux modes
> d’accès entiers n’étaient jamais reconnus et **157 actes** (angiographies, échographies
> endocavitaires…) étaient classés « non lourds » à tort. Le référentiel en compte désormais
> **1 501 sur plateau technique lourd** (contre 1 344 auparavant).

### Thésaurus des synonymes : élargir la requête, pas seulement indexer

Indexer du vocabulaire ne suffit pas : une saisie ne contient pas toujours le mot indexé.
« **prothèse de hanche** » ne trouve rien si l’acte parle de « **prothèse totale de hanche** » ;
« **anti-TNF** » ne trouve pas l’infliximab si l’on cherche par nom de classe. Le thésaurus sert
donc **deux fois** : à l’import (colonne `mots_cles`) **et** au moment de la recherche, où il
**élargit la requête** à ses synonymes.

**Source de vérité : `data/thesaurus-synonymes.csv`** — fichier versionné, lisible et relu à chaque
import : **329 termes** rangés en **88 notions** (le concept pivot), avec cinq types de termes
(`libellé officiel` 160, `vocabulaire courant` 112, `classe thérapeutique` 28, `sigle` 21,
`anglicisme` 8) et trois domaines (`actes` 228, `commun` 23, `medicaments` 78).

| Notion (jamais affichée) | Termes synonymes |
|---|---|
| tomodensitométrie | `TDM` · `scanographie` · `scanner` · `CT scanner` · `examen tomodensitométrique` |
| endoscopie œso-gastro-duodénale | `fibroscopie` · `fibro` · `gastroscopie` · `endoscopie digestive` |
| anti-TNF | `infliximab` · `adalimumab` · `etanercept` · `biosimilaire` |
| immunoglobulines polyvalentes | `IgIV` · `immunoglobuline humaine normale` |

Le module `scripts/lib/thesaurus.mjs` est **pur** (il reçoit le contenu du CSV, jamais le disque) :
le même code sert à l’import et à l’application, ce qui interdit toute divergence entre les deux.

- **Une seule notion par terme normalisé** : chercher « avc » ne peut pas renvoyer deux univers
  incompatibles — l’élargissement reste prévisible ;
- **Les mots vides** (`de`, `du`, `pour`, `avec`…) ne sont jamais interrogés seuls : sans cela,
  « prothèse **de** hanche » ramènerait tout ce qui contient « de » ;
- **Les sigles courts** (≤ 4 lettres : `IRM`, `ECG`, `AVC`, `PTH`) ne sont cherchés que comme **mot
  entier** — sinon « AIT » (accident ischémique transitoire) serait reconnu dans « trai**t**ement » ;
- **Les mots courts ne sont interrogés que s’ils sont eux-mêmes un terme du thésaurus** : sans cette
  règle, « anti-TNF » se découperait en « anti » et « tnf », et « anti » ramènerait toute
  l’immunologie ;
- **Seuls les domaines `actes` et `commun` alimentent `mots_cles`** : une classe thérapeutique n’est
  jamais injectée comme mot-clé d’un acte technique.

Dans l’application, l’usager **voit l’élargissement** : sous le champ, une ligne « **Recherche
élargie** » affiche des pastilles portant les synonymes employés ; cliquer l’une d’elles remplace la
saisie et relance la recherche. L’usager corrige ainsi lui-même l’interprétation de ses mots, au
lieu de subir une recherche muette. Les synonymes viennent de la base (RPC `synonymes_de`) et, si
le référentiel est injoignable, du **thésaurus embarqué** — le repli local cherche donc exactement
la même chose que la base.

`supabase/thesaurus.sql` rejoue la même normalisation en SQL (`normaliser_terme`, `thesaurus_contient`,
`thesaurus_saisie`) et **rebranche `rechercher_ccam` et `rechercher_medicaments`** sur le thésaurus :
il doit donc être appliqué **après** `rpc-recherche.sql` et `ccam-arbres.sql`. Les deux listes qui ne
peuvent pas être importées d’un fichier — les **mots vides** et le **seuil des sigles** — sont
recopiées à l’identique ; `tests/thesaurus.test.ts` compare les deux fichiers pour qu’en ligne et
hors ligne la recherche reste la même.

> **Ce que le thésaurus n’est pas.** Une **aide à la recherche**, pas une nomenclature : il rapproche
> des mots, il ne fonde **aucune** décision médico-administrative. Le verdict d’éligibilité HDJ reste
> rendu par la seule confrontation au Manuel des GHM.

### Actes valorisables en HDJ : le croisement avec le Manuel des GHM (ATIH)

La nomenclature CCAM dit ce qu’est un acte ; elle ne dit **pas** s’il ouvre un GHS
d’hospitalisation de jour. Cette question relève du **Manuel des GHM MCO** (version 2025,
arrêté publié au BO du 23/07/2025). Quatre de ses annexes sont désormais croisées avec la
nomenclature, dans `scripts/lib/ghm.mjs` :

| Annexe ATIH | Ce qu’elle apporte |
|---|---|
| **Annexe 2** — GHM classés par CMD | les codes GHM, leur libellé et leur **catégorie majeure** (« Groupes chirurgicaux », « Groupes avec acte classant non opératoire », « Groupes médicaux ») |
| **Annexe 3** — caractéristiques des racines | la colonne **« GHM courts »** : `J` = *GHM ambulatoire strict (0 nuit)*, `T0`/`T1`/`T2` = très courte durée (0 jour, 0 à 1 jour, 0 à 2 jours) |
| **Annexe 8** — actes classants | les actes **classants** et les catégories majeures où ils sont répertoriés (5 483 actes) |
| **Annexe 11** — actes reclassant en GHM médical | les actes mineurs qui, malgré leur présence dans les listes, laissent le séjour dans un **GHM médical** (214 actes) |
| **Volume 2** (par CMD) | la seule source qui rattache un acte à une **racine de GHM** : les listes d’actes en CCAM « Voir la liste A-xxx » (16 036 lignes, 5 481 actes) |

> **Le « modificateur J » désigne, en PMSI, la colonne « GHM courts » de l’annexe 3** :
> `J` = GHM ambulatoire strict (0 nuit). Ce n’est pas un modificateur CCAM — les
> modificateurs CCAM (chapitre 19.03 : urgence, âge, chirurgie itérative, radiologie…) sont
> un autre mécanisme, apposé au code de l’acte. C’est bien le `J` du manuel qui commande la
> recevabilité d’une HDJ.

Le croisement est vérifié par recoupement : le volume 2 rattache 5 481 actes, l’annexe 8 en
déclare 5 483 — les deux lectures coïncident pour **5 472 actes (99,8 %)**, et les 152 racines
« `J` » de l’annexe 2 sont exactement celles de l’annexe 3. Ces concordances servent de porte
de contrôle à l’import.

**Colonnes ajoutées à `referentiel_ccam`** (`supabase/hdj-ghm.sql`) :

| Colonne | Signification |
|---|---|
| `acte_classant` | l’acte peut valider un GHS à lui seul |
| `racines_ghm` | la ou les racines de GHM dans lesquelles il classe |
| `cmd_classantes` | les CMD où il est répertorié (annexe 8) |
| `ghm_ambulatoire_strict` | au moins une racine ne contient qu’un **GHM en « J »** (0 nuit) |
| `admet_sejour_0_nuit` | au moins une racine décrit un séjour de **0 nuit** (`J`, `T0`, `T1`, `T2`) |
| `reclassant_ghm_medical` | acte mineur reclassant en GHM médical (annexe 11) |
| `type_acte` | *acte interventionnel classant* · *acte lourd non opératoire* · *acte reclassant en GHM médical* · *acte non classant* |
| `eligible_hdj` | booléen : GHM ambulatoire strict présent — la valeur retenue en base |
| `eligibilite_hdj` | version nuancée, **à trois états** : `oui` · `sous condition` · `non` |
| `environnement_requis` | bloc ou salle interventionnelle, anesthésie mentionnée par la racine, aucun plateau lourd |
| `commentaire_pmsi` | règles de traçabilité opposables au dossier |

La vue `base_hdj_actes` restitue le tableau à six colonnes demandé par le codage —
`[Code CCAM] | [Libellé] | [Racine GHM / Type d’acte] | [Éligibilité HDJ] | [Plateau technique
lourd requis] | [Commentaires / traçabilité PMSI]` — et `node scripts/base-hdj.mjs` en produit
la version fichier (`data/atih/base-hdj-2025.csv`, 6 377 actes).

**Pourquoi trois états et non deux.** Le GHM retenu n’est pas une propriété de l’acte : il
dépend du diagnostic principal et du groupage, et un même acte classe dans **plusieurs**
racines (le rattachement du volume 2 est volontairement large : la liste A-369 « Interventions
majeures de la CMD 17 » couvre 1 768 actes). Conclure « oui » dès qu’une racine quelconque
admet un séjour de 0 nuit validerait une **césarienne** en HDJ, au titre des racines
« accouchement par voie basse, très courte durée ». Le statut est donc :

- **`oui`** — une racine ne contient qu’un GHM en « J » : le séjour de 0 nuit est acquis
  (libération du canal carpien `01C15`, endoscopie digestive thérapeutique `06K03`…) ;
- **`sous condition`** — pas de GHM ambulatoire strict, mais une racine en très courte durée :
  la recevabilité dépend de la racine effectivement retenue ;
- **`non`** — aucune racine de 0 nuit, acte non classant, ou acte reclassant en GHM médical.

Le commentaire de traçabilité **nomme les racines en « J »** : sur une prothèse de genou,
il montre que l’ambulatoire ne vient pas de `08C24` (prothèses de genou) mais de `21C05`, et
laisse donc le coder trancher.

**Les deux limites de la source libérale, désormais levées.**

Le jeu de données « CCAM Ameli » dérive du fichier Cnam `ps-tarifs.csv` : il ne contient que
les **1 969 actes tarifés en libéral**. Deux manques en découlaient, tous deux corrigés depuis.

1. **4 399 actes classants manquaient à l’appel.** Sur les 5 483 actes classants du manuel,
   seuls 1 084 étaient dans la base — et les absents étaient majoritairement des actes
   hospitaliers, précisément ceux qu’une HDJ programme (craniotomies, prothèses, césariennes).
   La nomenclature est désormais **consolidée à 8 059 actes** à partir de trois sources
   officielles ; seul l’acte que *aucune* des trois ne porte reste sans libellé (3 actes).

2. **Le chapitre 18 de la CCAM n’existait pas dans la source** — c’est-à-dire **aucun acte
   d’anesthésie**. Il est maintenant importé : **148 actes** (« Anesthésie générale ou
   locorégionale complémentaire niveau 1 » `ZZLP025`, « Anesthésie rachidienne au cours d’un
   accouchement par voie basse » `AFLB010`…). Le manuel est explicite (volume 2, CMD 01) :
   certains séjours de 0 nuit sont composés « d’actes classants non opératoires avec un
   **code “activité” égal à 4**, y compris les gestes complémentaires d’anesthésie ». D’où la
   règle que le référentiel applique et que les tests vérifient : **un acte d’anesthésie n’est
   jamais classant** — il s’ajoute à l’acte pour le valider en HDJ.

   En revanche, la **présence d’un MAR** reste hors de portée de la nomenclature : elle se
   trace par l’acte d’anesthésie et ses modificateurs, pas par une colonne d’acte.
   `environnement_requis` s’en tient donc à ce que les libellés de racines disent
   (« affections du système nerveux sans acte opératoire **avec anesthésie**, en ambulatoire »
   → `01K06`).

> **Ce que l’ajout change — et ce qu’il ne change pas.** Les actes nouvellement importés n’ont
> **aucun mode d’accès CCAM** : le croisement avec le Manuel des GHM comble ce que la
> nomenclature ne dit pas, **sans jamais transformer une absence en « non »** :
>
> | Indicateur | Source de la valeur définitive | Valeur pour les 6 090 actes hors périmètre libéral |
> |---|---|---|
> | `acte_marqueur_hdj` | **Manuel des GHM** | **toujours renseigné** : l’acte peut-il valider un GHS d’HDJ ? |
> | `necessite_plateau_lourd` | CCAM, puis **groupe de la racine de GHM** | *oui* (groupe chirurgical, ou acte classant non opératoire donc lourd), *non* (acte mineur reclassant), sinon **absent** (hors des listes) |
> | `exclusif_externe` | CCAM, puis **croisement** | *non* dès que l’acte est **classant** (il ouvre un GHS) ; sinon **absent** (hors des listes) |
>
> Les **1 969 actes déjà connus** conservent leur libellé et leur plateau technique : c’est ce
> que vérifie un test, acte par acte. Seul `acte_marqueur_hdj` y est **redéfini** — il devient le
> verdict d’éligibilité, et non un doublon du plateau (voir le contrôle DIM ci-dessous).

**Sur la nomenclature complète, le croisement donne :** 5 486 actes classants sur 8 059,
**4 254 éligibles à l’HDJ** (GHM ambulatoire strict), **4 377** de type « interventionnel
classant », 901 « lourd non opératoire », 214 reclassant en GHM médical et 2 573 non classants.

### Contrôle DIM : 1 000 actes tirés au hasard

> **Contrôle du 25/09/2026, en position de responsable du DIM.** Un tirage aléatoire reproductible
> (graine `20260925`) de **1 000 actes** parmi les 4 730 dont une racine de GHM admet un séjour de
> 0 nuit — la population « qui aurait pu être utilisée en HDJ » — a été passé au crible des
> colonnes réellement servies à l’utilisateur. Constat : la base **ne répondait pas** à la
> question posée, et l’écran renvoyait l’image d’un référentiel mal renseigné.

Deux défauts de la construction, tous deux corrigés depuis :

1. **`acte_marqueur_hdj` était vide pour 79 % des actes HDJ** (789 sur 1 000, `NULL` — affiché
   « Non déterminé » ; seuls 5 portaient « Non »). La colonne n’était dérivée que du **mode
   d’accès CCAM** : les 6 090 actes hors périmètre libéral n’en avaient pas. Pire, sur les
   1 969 actes qui en avaient une, le marqueur **contredisait l’éligibilité** : **645 actes**
   affichaient « acte marqueur HDJ : oui » alors qu’ils ne peuvent pas valider une HDJ
   (une craniotomie est lourde *et* exige une nuitée). Le marqueur confondait **« acte lourd »**
   et **« acte recevable en HDJ »**.
2. **Le verdict d’éligibilité n’était pas exposé à l’application.** Les colonnes
   `eligibilite_hdj`, `acte_classant`, `type_acte` et `motif_eligibilite_hdj` — complètes, elles,
   à 100 % — n’étaient renvoyées par aucune fonction RPC : l’écran ne pouvait donc afficher que
   les trois drapeaux de nomenclature. La vue `base_hdj_actes` rendait en outre toute absence de
   plateau comme un « non » **établi** (`coalesce`), contre la doctrine du projet.

**Correction apportée.** Le marqueur est **redéfini** par le croisement GHM — « l’acte peut
ouvrir un GHS d’HDJ », donc **défini pour les 8 059 actes** (4 517 oui / 3 542 non, plus aucun
`NULL`) —, le plateau technique lourd et la réalisation en externe sont complétés par la
classification, le verdict est **exposé aux trois fonctions RPC** et **affiché en tête de chaque
fiche** (badge vert / orange / rouge + motif), les trois indicateurs passant en complément avec
la mention explicite « non renseigné » (jamais « Non déterminé »). Pour les 52 actes classants
dont la racine n’a pas de catégorie publiée et les 1 688 actes non classants hors CCAM, la
valeur reste **absente** — mais elle porte désormais sur des actes **non éligibles**, et la fiche
le dit.

**Mesure du contrôle après correction** (même tirage, reproductible) :

| Colonne | Avant | Après |
|---|---|---|
| `acte_marqueur_hdj` renseigné | 211 / 1 000 (789 « Non déterminé », 5 « Non ») | **1 000 / 1 000** |
| `eligibilite_hdj` renseigné | 1 000 / 1 000 mais **non exposé à l’écran** | **1 000 / 1 000, affiché en tête de fiche** |
| `necessite_plateau_lourd` renseigné | 859 / 1 000 | **1 000 / 1 000** |
| `exclusif_externe` renseigné | 211 / 1 000 | **1 000 / 1 000** |

Les valeurs encore absentes en base (1 740 plateaux, 1 688 réalisations en externe) ne portent
que sur des **actes non classants hors nomenclature libérale** : aucun n’entre dans la
population HDJ, et leur fiche affiche le verdict « Non recevable en HDJ sur cet acte seul ».
Le tableau à six colonnes (`node scripts/base-hdj.mjs`) suit la même doctrine de tri-état.

### Extraction des PDF officiels (`scripts/extraire-referentiel-atih.py`)

Les sources du croisement sont des **PDF**. La chaîne d’import Node n’embarque aucun extracteur
PDF : la conversion est donc faite une fois, par ce script Python, puis versionnée en CSV dans
`data/`. Le reste du traitement — croisement avec la CCAM, classement HDJ — reste en Node.

```bash
# Télécharge les PDF officiels (Manuel des GHM 2025 et chapitres CCAM 1 à 19) dans .cache/atih,
# extrait le texte, produit les trois CSV de data/ et exécute les contrôles de cohérence.
uv run --with pypdf python3 scripts/extraire-referentiel-atih.py
```

Le script **échoue bruyamment** si une source change de forme : les contrôles portent sur le
nombre de racines (679), la concordance des 152 racines « J » entre les annexes 2 et 3, le
recoupement volume 2 / annexe 8 (99,7 %) et la présence du chapitre 18. C’est la raison d’être
d’un script plutôt que d’un fichier figé.

### Comment la réserve hospitalière est déterminée

La colonne `est_reserve_hospitaliere` ne repose plus sur une appréciation de libellés : elle est
issue du **libellé officiel « réservé à l’usage HOSPITALIER »** du fichier `CIS_CPD_bdpm.txt`
(art. R. 5121-82 du code de la santé publique), qui est opposable.

| Situation de la spécialité | Valeur | Origine |
|---|---|---|
| porte le libellé « réservé à l’usage HOSPITALIER » | `true` | source officielle (CPD) |
| a des conditions de prescription/délivrance **sans** ce libellé | `false` | source officielle (CPD) |
| n’a **aucune** condition de prescription ni de délivrance (CPD muet) | `true` si un motif de `data/reserve-hospitaliere.dci.txt` correspond, sinon **`NULL`** | **valeur absente** : la source ne tranche pas |

Résultat sur la base : **701 spécialités en réserve hospitalière** (677 par le libellé CPD,
24 rattrapées par la liste de travail — oxygène médicinal, citrate de bétaïne…), **11 621 hors
réserve**, **1 287 valeurs absentes**. La liste de travail `data/reserve-hospitaliere.dci.txt`
n’est plus qu’un **filet de sécurité** : elle ne peut jamais contredire le CPD, et ses exclusions
(`!motif`) neutralisent les homonymies (préparations homéopathiques, produits de ville).

### Valeur absente : jamais convertie en « hors réserve »

**Doctrine du 22/09/2026.** Quand la source officielle est muette, la valeur reste
**absente** (`NULL`). L’application l’affiche « valeur absente » et l’assistant en tire une
**alerte**, pas un refus :

- le pilier « soins » n’est pas validé par une valeur absente (elle ne présume rien) ;
- l’absence **n’est jamais** un motif de rejet, ni présentée comme « hors réserve
  hospitalière » ;
- l’alerte demande la **confirmation de la pharmacie à usage intérieur**.

Autrement dit : une absence ne peut pas faire basculer une facturation vers l’ACE — seul un
« non » **établi** le fait.

### Surveillance particulière (libellé officiel)

La colonne `surveillance_particuliere` reprend le libellé CPD « **médicament nécessitant une
surveillance particulière pendant le traitement** » (1 469 spécialités). C’est la trace à
laquelle renvoie la variable **« surveillance particulière ou contexte patient »** de l’annexe 4,
point 2.b.iii (GHS plein indépendamment du nombre d’interventions). Elle valide le pilier
« soins » au même titre que la réserve hospitalière — ce qui couvre les produits perfusés en HDJ
qui relèvent de la « prescription hospitalière » sans être en réserve, **MABTHERA (rituximab)**
par exemple. La présomption n’est retenue que si le libellé est **établi** : l’absence ne
présume rien.

> **Décision tracée.** Étendre la liste de travail aux 418 DCI des produits marqués « usage
> hospitalier » a été mesuré puis écarté : la recherche par sous-chaîne faisait basculer
> **160 présentations de ville** (acétylcystéine, chlorhexidine, alginate, bicarbonate…) en
> « réserve hospitalière », exactement le faux positif à éviter. Le motif reste donc une classe
> thérapeutique, jamais une DCI isolée.

### Points de vigilance sur les données

- `dci` : **DCI réelle** (substance active de `CIS_COMPO_bdpm.txt`) — et non le nom commercial.
  Deux spécialités n’en ont pas (aucune substance active déclarée) ; la recherche par DCI
  (`infliximab` → REMICADE, `pembrolizumab` → KEYTRUDA) fonctionne pour toutes les autres.
- `est_liste_en_sus` : la liste en sus (arrêté) n’est pas déductible des sources publiques
  utilisées ici. Elle est renseignée à `TRUE` lorsque la spécialité relève de la réserve
  hospitalière (approximation documentée) et laissée à `NULL` sinon — « non déterminé », et non
  « hors liste ». Cet indicateur **n’intervient dans aucune décision** : il n’est qu’affiché.
- `surveillance_renforcee` : champ de **pharmacovigilance** de la BDPM (plan de gestion des
  risques). Il est affiché à titre informatif et **n’intervient plus dans la décision** :
  la présomption de surveillance du référentiel est portée par `surveillance_particuliere`,
  dont le libellé est celui de l’instruction.
- `est_reserve_hospitaliere` et `surveillance_particuliere` peuvent valoir `NULL` : c’est une
  **valeur absente**, affichée comme telle. Une **validation par la pharmacie à usage
  intérieur** reste nécessaire.
- `acte_marqueur_hdj` : **différent du plateau technique**. Il dit « l’acte peut ouvrir un GHS
  d’hospitalisation de jour » et vient du **croisement avec le Manuel des GHM** (acte classant et
  séjour de 0 nuit possible). Il est **défini pour les 8 059 actes** — ne plus le lire comme un
  synonyme d’« acte lourd » (une craniotomie est lourde et n’est pas recevable en HDJ).
- `necessite_plateau_lourd` / `exclusif_externe` : dérivés du **mode d’accès** de la nomenclature
  CCAM (un acte en « abord ouvert » ou « accès transpariétal » nécessite un plateau lourd ; une
  imagerie « sans accès » est réalisable en externe), corrigés par `data/ccam-overlay.csv` pour
  les cas connus (ECG `DEQP003`, etc.). Quand la CCAM est muette, le **groupe de la racine de
  GHM** tranche (chirurgical ou non opératoire → plateau lourd ; acte classant → non réalisable
  en externe) ; hors de ces cas la valeur reste **absente** (`NULL`), jamais convertie en « non »,
  et l’écran l’affiche « non renseigné ».

### Sécurité

`supabase/hardening.sql` active **Row Level Security** et réduit les privilèges de `anon` et
`authenticated` à `SELECT`. La clé `anon` est publique par conception ; **aucune écriture n’est
possible depuis le navigateur**.

### Mise à jour des référentiels

```bash
# 0. Sources PDF (Manuel des GHM 2025 et chapitres CCAM 1 à 19) : téléchargement, extraction
#    du texte, production des CSV de data/ et contrôles de cohérence. À relancer à chaque
#    nouvelle version du manuel des GHM ou de la CCAM.
uv run --with pypdf python3 scripts/extraire-referentiel-atih.py

# 1. Contrôle à blanc : télécharge les sources officielles, prépare et vérifie les lignes
#    (cas de référence, intégrité des sources) sans rien écrire.
npm run import:referentiels:controle            # ou --export pour un CSV de secours

# 2. Import réel (écriture réservée au rôle service_role)
export SUPABASE_URL=https://<ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<clé service_role>   # ne jamais publier
npm run import:referentiels

# 3. Porte de contrôle après import (lecture seule, clé anon de l'application)
npm run verifier:referentiel                    # code retour 0 = conforme

# 4. Le cas échéant : appliquer supabase/hardening.sql, supabase/rpc-recherche.sql,
#    supabase/ccam-arbres.sql (arborescence + mots-clés CCAM), supabase/thesaurus.sql
#    (thésaurus des synonymes : normalisation SQL, table thesaurus_synonymes, recherche
#    élargie), supabase/hdj-ghm.sql (actes classants, racines de GHM, éligibilité HDJ et
#    vue base_hdj_actes) puis supabase/referentiel-maj.sql (suivi des dates de mise à jour
#    et de contrôle : à réappliquer après une montée de version, le script est idempotent).
#    ccam-arbres.sql puis thesaurus.sql redéfinissent la fonction rechercher_ccam : ils
#    doivent être appliqués après rpc-recherche.sql, et thesaurus.sql en dernier.
npm run sql:appliquer -- supabase/hdj-ghm.sql --verifier   # psql < … si PostgreSQL est installé
```

`scripts/appliquer-sql.mjs` exécute un script SQL du dépôt via l'API Management : le même
jeton `SUPABASE_ACCESS_TOKEN` que pour la clé `service_role` suffit, ce qui évite d'installer
PostgreSQL sur le poste. Il n'écrit rien d'autre que le SQL fourni.

La base des actes valorisables en HDJ se régénère à tout moment sans accès à Supabase :

```bash
npm run base:hdj                 # → data/atih/base-hdj-2025.csv (8 065 actes, 6 colonnes)
npm run base:hdj -- --exemples   # + un échantillon par type d'acte à l'écran
```

`supabase/referentiel-maj.sql` crée la table de suivi `referentiel_maj` (une ligne par table :
date de dernière mise à jour effective, volume, empreinte des sources, **date et état du dernier
contrôle des sources**). L’import la renseigne automatiquement ; **l’en-tête de l’application
affiche ces dates** à côté de l’état de la connexion (« Référentiel Supabase connecté · MAJ
25/09/2026 »), avec le détail en infobulle (date et heure exactes, nombre de lignes). La date de
mise à jour ne bouge que lorsque les sources officielles changent réellement ; celle du contrôle,
à l’inverse, avance à chaque vérification — c’est elle qui permet d’avertir quand le suivi
s’arrête (voir « Mise à jour mensuelle automatique », § *L’avertissement dans l’application*).
Le contrôle du référentiel vérifie également ce suivi.

Le script est **idempotent** : sur une base déjà installée, il ajoute les colonnes de suivi du
contrôle (`verifie_le`, `etat_controle`, `derniere_erreur`, `verifie_par`) sans rien perdre :

```bash
npm run sql:appliquer -- supabase/referentiel-maj.sql   # met la base au niveau du dépôt
```

`npm run verifier:referentiel` interroge la base **exactement comme l’application** et refuse (code retour 1) un référentiel dont la réserve hospitalière ne serait pas déterminée, dont la
DCI serait absente, ou dont une recherche par DCI (`infliximab`, `pembrolizumab`…) ne trouverait
pas la spécialité attendue. C’est la porte de contrôle des **données**, pendant de celle des
documents livrés.

Sans clé `service_role`, `npm run import:referentiels:controle -- --export` produit les deux CSV
prêts à charger (`referentiel_medicaments.csv`, `referentiel_ccam.csv`) pour un import par le
tableau de bord Supabase.

### Mise à jour mensuelle automatique (légère)

```bash
npm run maj:referentiels            # met à jour si les sources ont changé, sinon ne fait rien
npm run maj:referentiels -- --force # force le réimport
npm run maj:referentiels:controle   # contrôle seul de la base publiée (aucune écriture)
```

`scripts/maj-referentiels.mjs` retélécharge les sources officielles puis **compare leur empreinte
SHA-256** à celle du dernier import réussi :

1. **sources inchangées** → aucune écriture des données, et une seule écriture de **suivi** : le
   « battement de cœur » (`referentiel_maj.verifie_le`, `etat_controle = a_jour`). C'est le mode
   « léger » (quelques secondes, ~8 Mo téléchargés) ;
2. **sources modifiées** → import complet puis `verifier-referentiel.mjs` ; l'empreinte n'est
   enregistrée **qu'après un contrôle vert**, si bien qu'un échec est automatiquement retenté à
   l'exécution suivante ;
3. **échec** → `etat_controle = echec` et le message d'erreur sont enregistrés **sans toucher**
   à la date du dernier succès : l'application avertit alors l'utilisateur au lieu de lui
   présenter des données dont plus personne ne garantit la fraîcheur ;
4. la nomenclature CCAM étant une ressource **datée** sur data.gouv.fr, la dernière version
   publiée est résolue via l'API (repli sur la version épinglée si l'API est injoignable).

L'écriture s'appuie sur la clé `service_role` (récupérée au besoin par le jeton Management API,
jamais journalisée). Journal des exécutions : `.cache/maj-referentiels.log`.

#### Ce qui déclenche le contrôle

Trois chemins, complémentaires — un seul suffit, mais le référentiel n'est plus laissé au
hasard :

| Déclencheur | Où | Quand | Ce qu'il apporte |
|---|---|---|---|
| **Cron du serveur** | `crontab` de la machine | 1ᵉʳ du mois, 05:17 UTC (07:17 à Paris) | le contrôle de proximité, sans dépendance à GitHub |
| **GitHub Actions** | `.github/workflows/maj-referentiels.yml` | 1ᵉʳ du mois, 05:47 UTC + `workflow_dispatch` | le contrôle a lieu **même serveur éteint** ; en cas d'échec, GitHub prévient le propriétaire du dépôt |
| **Bouton de l'application** | en-tête → « Mettre à jour le référentiel » | à la demande | le référent DIM n'attend pas le 1ᵉʳ du mois |

**Cron installé sur le serveur** (1ᵉʳ du mois, 05:17 UTC, soit 07:17 à Paris) :

```cron
17 5 1 * * cd /home/ubuntu/hdjverif && MAJ_DECLENCHEUR=cron /home/ubuntu/.local/bin/node scripts/maj-referentiels.mjs >> .cache/maj-cron.log 2>&1
```

`MAJ_DECLENCHEUR` n'est qu'une étiquette, recopiée dans `referentiel_maj.verifie_par` : elle
permet de savoir, des mois plus tard, si le dernier contrôle venait du serveur, de GitHub
Actions ou d'une personne.

**Workflow GitHub Actions** — il ne demande aucune installation sur le serveur, mais il a
besoin de la clé d'écriture :

1. créer un secret de dépôt `SUPABASE_SERVICE_ROLE_KEY` (Settings → Secrets and variables →
   Actions) — la même clé que celle utilisée par l'import ; `SUPABASE_ACCESS_TOKEN` est
   également accepté si vous préférez ne pas la recopier ;
2. facultatif : une variable `SUPABASE_URL` si le projet change de référence ;
3. vérifier une première fois le workflow à la main (onglet **Actions** → *Mise à jour des
   référentiels* → **Run workflow**). Le résumé de l'exécution affiche la fin du journal.

Sans l'un ou l'autre de ces secrets, le workflow **échoue immédiatement** avec un message
explicite : c'est volontaire, un contrôle silencieusement inopérant serait pire qu'un contrôle
absent.

Deux limites connues, assumées : GitHub désactive les workflows planifiés d'un dépôt sans
activité depuis 60 jours, et un serveur peut être éteint. C'est précisément ce que le
**battement de cœur** rend visible : si plus rien ne contrôle le référentiel, l'application le
dit à l'écran plutôt que de laisser croire que tout va bien — et les trois déclencheurs se
relaient (serveur, GitHub, bouton).

#### L'avertissement dans l'application

Le suivi sert deux fois : à dater (« MAJ 25/09/2026 ») et à **avertir**. `referentiel_maj`
distingue ce que `maj_le` seul ne peut pas dire : *rien à mettre à jour* (contrôle fait,
sources inchangées) et *plus personne ne contrôle* (le contrôle n'a pas eu lieu depuis
longtemps).

`peremptionMaj()` (dans `src/ui/referentiels.ts`) en tire quatre états, affichés dans
l'en-tête dès que le référentiel n'est plus suivi :

| État | Quand | Ce que l'application affiche |
|---|---|---|
| à jour | contrôle réussi il y a moins de **35 jours** | la date, sans alerte |
| à recontrôler | entre **35 et 62 jours** | bandeau « un contrôle mensuel a été manqué » |
| périmé | plus de **62 jours** | bandeau : « non contrôlé depuis N jours — les sources ont pu changer » |
| en échec | dernière tentative en échec | bandeau avec le message d'erreur |

Deux contrôles manqués valent péremption : le premier seuil avise (un contrôle a été raté), le
second alerte (le suivi est interrompu). Le raisonnement est volontairement **pessimiste** :
on retient la table la plus ancienne, et l'application préfère dire « fraîcheur inconnue » que
de laisser croire à des données à jour. Le bandeau est aussi rappelé **au moment de conclure**,
sous la décision, avec la mention qu'une décision reste valable mais qu'elle doit être
revérifiée après mise à jour — les règles, elles, ne dépendent pas des sources.

Le même engin sert au bouton **« Mettre à jour le référentiel »** (le voyant du référentiel y
mène aussi) : la modale montre pour chaque table la date d'import, la date du dernier contrôle
et le nombre de lignes, puis propose le déclenchement.

#### Déclencher la mise à jour depuis l'application

L'application est une page statique : elle ne détient que la clé `anon`, que Row Level Security
refuse en écriture. Deux façons de déclencher, sans jamais mettre la clé d'écriture dans le
navigateur :

1. **Sans rien déployer** (par défaut) — le bouton ouvre la page GitHub Actions du workflow
   (*Run workflow*) : c'est GitHub qui authentifie l'opérateur. Rien à configurer, mais il faut
   l'accès au dépôt ;
2. **Un clic dans l'application** (facultatif) — la fonction Edge
   `supabase/functions/maj-referentiels/index.ts` garde le jeton GitHub côté serveur et ne fait
   qu'un appel : *exécute le workflow*. Il faut la déployer et renseigner ses secrets :

```bash
supabase functions deploy maj-referentiels --project-ref <ref>
supabase secrets set GITHUB_TOKEN=github_pat_… CODE_MAJ=<code partagé> --project-ref <ref>
# puis, au build de l'application, indiquer l'URL du service :
VITE_MAJ_SERVICE_URL=https://<ref>.supabase.co/functions/v1/maj-referentiels npm run build
```

Le jeton GitHub demandé est un **jeton finement porté**, limité au dépôt, avec la seule
permission « Actions : read and write » ; il ne peut pas modifier le code. `CODE_MAJ` est un
code partagé (demandé par la modale, mémorisé localement) qui évite qu'un tiers fasse
télécharger 8 Mo à GitHub en boucle ; la fonction refuse aussi deux déclenchements à moins de
30 minutes d'intervalle. Sans `VITE_MAJ_SERVICE_URL`, le bouton reste sur l'option 1.

> **Où trouver la clé d’écriture.** Le jeton **Management API** du projet
> (`SUPABASE_ACCESS_TOKEN`, préfixe `sbp_`) suffit : il permet de récupérer la clé
> `service_role` sans jamais la publier.
>
> ```bash
> curl -s "https://api.supabase.com/v1/projects/<ref>/api-keys?reveal=true" \
>   -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
> # → renseigner SUPABASE_SERVICE_ROLE_KEY avec la valeur de « service_role », puis importer
> ```
>
> Le durcissement Row Level Security reste actif : la clé `anon` de l’application est toujours
> refusée en écriture (HTTP 401), seul le rôle `service_role` écrit.

## 5. Tests

```bash
npm install
npm test              # 198 tests : moteur, portes, assistant (référentiel simulé),
                      #             thésaurus des synonymes, lecture des référentiels
                      #             officiels, croisement GHM et fraîcheur du référentiel
                      #             (alerte de péremption, bandeau de décision)
npm run test:coverage # couverture du moteur (~99 %)
npm run typecheck     # TypeScript strict
npm run dev           # serveur de développement
npm run build         # build de production dans dist/
```

Les **5 cas obligatoires** :

| # | Cas | Statut attendu |
|---|---|---|
| 1 | Bilan diabète : Médecin + IDE + Diététicien, notes tracées | `VALIDE_GHS` (GHS intermédiaire) |
| 2 | Idem, note de la diététicienne non tracée | `REJET_VERS_ACE` |
| 3 | Absence de synthèse médicale signée | `SUSPENDU_POUR_REGULARISATION` |
| 4 | Perfusion isolée de fer, sans surveillance continue | `REJET_VERS_ACE` |
| 5 | Séance de chimiothérapie | `REJET_VERS_FORFAIT_SEANCE` |

## 6. Références

- Instruction N° DGOS/R1/DSS/1A/2020/52 du 10 septembre 2020 — NOR : SSAH2007743J.
- Code de la sécurité sociale : art. L. 162-22-6, L. 162-26, L. 162-26-1, R. 162-33-1.
- Code de la santé publique : art. D. 6124-301-1 et s., R. 1112-1-2, R. 5121-82, L. 4111-1.
- Arrêté du 19 février 2015 modifié (art. 11 et 11 bis) ; arrêté du 23 décembre 2016.
- **Manuel des GHM, version 2025** (arrêté publié au BO du 23 juillet 2025), annexes 2, 3,
  8 et 11 et volume 2 par CMD — <https://www.atih.sante.fr/manuel-des-ghm-2025-publication-bo>.
  C’est la source des actes classants, des racines de GHM et du marqueur `J` (GHM ambulatoire
  strict, 0 nuit) ; les tables extraites sont versionnées dans `data/atih/`.
- **Nomenclature CCAM** — deux sources croisées :
  - **CCAM descriptive**, chapitres 1 à 19 publiés par l'ATIH (nomenclature complète, dont le
    chapitre 18 « gestes complémentaires et modificateurs ») :
    <https://www.atih.sante.fr/sites/default/files/public/content/1621/Chapitre_1.pdf> …
    `Chapitre_19.pdf` ;
  - jeu de données « **CCAM Ameli** » (data.gouv.fr / InterHop), issu du fichier Cnam
    `ps-tarifs.csv` : périmètre des 1 969 actes tarifés en libéral, porteur des axes
    « Appareils / Actions / Techniques » (mode d'accès).
  Les deux sont consolidés dans `data/ccam-complete-2025.csv` (8 065 actes).
- **CCAM, chapitre 18** — « Gestes complémentaires et modificateurs », qui porte les actes
  d'anesthésie : <https://www.atih.sante.fr/sites/default/files/public/content/1621/Chapitre_18.pdf>.
- Base de données publique des médicaments (BDPM, ANSM / Assurance Maladie).

Outil d’aide à la décision médico-administrative : il ne se substitue ni à l’appréciation du
médecin DIM, ni aux contrôles de l’Assurance Maladie.
