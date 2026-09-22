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

Les questions portent donc uniquement sur ce qui **détermine la facturation** : type de prise en
charge, actes prévus, médicaments prévus, professionnels qui interviendront, surveillance prévue,
durée de présence et **contexte patient**.

### Écrans et interactions

- **Aucune donnée administrative** : ni numéro de séjour, ni date. Rien de ce qui identifie le
  patient n’est saisi ni affiché (y compris dans la fiche de traçabilité et la synthèse).
- **Sept écrans** + la décision : discipline, type de prise en charge, actes, médicaments, équipe,
  surveillance et durée, **contexte patient**. Les questions homogènes sont **regroupées** pour
  limiter les clics.
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
- **Le clic sur une discipline ouvre directement l’écran suivant** : la liste est longue, il n’y a
  rien à aller chercher plus bas. Le choix reste facultatif : « Suivant » passe l’étape.
- **Gros boutons Oui / Non** : **Oui en vert**, **Non en rouge** (Material Design), maintenus
  enfoncés une fois sélectionnés.
- **Équipe par boutons à bascule** : un bouton par profession (médecin, infirmier(ère),
  kinésithérapeute, diététicien(ne), psychologue, assistant(e) social(e), autre paramédical).
  Cliquer **maintient le bouton enfoncé** et sélectionne un intervenant ; re-cliquer le
  désélectionne. Seule question complémentaire, par intervenant : **une note d’évolution
  sera-t-elle rédigée ?** (Oui / Non).
- **Référentiels faisant foi** : les caractéristiques d’un acte CCAM (plateau technique lourd,
  acte marqueur HDJ, réalisation en externe) et le classement d’un médicament (réserve
  hospitalière, surveillance renforcée) sont **repris du référentiel** et affichés. Ils ne sont
  **jamais redemandés** à l’utilisateur.
- **Décision en direct** dans l’en-tête, formulée en langage courant, dès qu’un élément de la
  prise en charge est saisi ou qu’un raccourci la tranche.
- **Volet pédagogique** sur chaque écran : « pourquoi cette question ? », règle applicable citée,
  et cas typiques **ancrés sur la question posée** : la grille couvre les six étapes pour chacune
  des 14 disciplines, de sorte que l’aide ne parle jamais d’une autre question
  (*Relève du GHS* / *Relève de l’externe* / *Piège fréquent* / *Hors champ*). Le choix de la
  discipline est facultatif et ne modifie aucun critère de décision.
- **Raccourcis décisionnels** : une séance de dialyse/chimiothérapie ou une prise en charge
  SMR/psychiatrie conduit directement au résultat, sans dérouler l’assistant.
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
    wizard.ts                     Assistant pas-à-pas (état, navigation, rendu, recherche)
    store.ts                      État de l'assistant → DossierHDJ
    referentiels.ts               Client Supabase (médicaments, CCAM) + repli local
    pedagogie.ts                  Disciplines cliniques, cas typiques, aide par étape
    fiche.ts                      Fiche de traçabilité T2A
    styles.css                    Charte CHU Grenoble Alpes (en-tête bleu, fond blanc)
supabase/                         SQL du projet Supabase (durcissement, RPC de recherche)
scripts/
  import-referentiels.mjs         Import des référentiels officiels vers Supabase
  verifier-referentiel.mjs        Porte de contrôle du référentiel publié (lecture seule)
  lib/referentiels.mjs            Lecture des sources officielles (BDPM, CCAM) — pur, testé
data/                             Listes de travail (réserve hospitalière, surcharges CCAM)
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
   la réserve hospitalière (art. R. 5121-82 CSP) ou à surveillance continue.
2. **Plateau technique lourd / actes coordonnés** — au moins un acte sur plateau lourd, ou au
   moins deux actes CCAM dénombrables distincts. L’ECG `DEQP003` est exclu du décompte
   (annexe 4, point 2.b.iii).
3. **Pluriprofessionnalité concertée** — seuls les intervenants ayant
   `note_evolution_tracee === true` comptent : **3A** ≥ 2 médecins de spécialités distinctes,
   **3B** ≥ 1 médecin + ≥ 2 professions paramédicales/sociales distinctes.

**Niveau de GHS (porte 4)** — l’instruction distingue le GHS « intermédiaire » du GHS « plein » :

- **GHS plein** dès qu’une surveillance particulière est documentée (surveillance active, produit
  de la réserve hospitalière ou à surveillance continue), qu’un acte classant / plateau technique
  est présent, ou que **4 interventions au moins** sont dénombrées ;
- **GHS intermédiaire** dans les autres cas (typiquement une prise en charge de médecine reposant
  sur **3 interventions** coordonnées).

**Alertes qualité** (non bloquantes) : durée de présence < 180 min ; lettre de liaison non remise.

## 4. Référentiels Supabase

Projet Supabase `Hdjverif` — deux tables publiques en lecture seule :

| Table | Contenu | Source |
|---|---|---|
| `referentiel_medicaments` | 13 609 spécialités (CIS, dénomination, **DCI réelle**, réserve hospitalière, liste en sus, surveillance renforcée) | **Base de données publique des médicaments** (BDPM, ANSM / Assurance Maladie) : `CIS_bdpm.txt`, **`CIS_COMPO_bdpm.txt`** (composition → DCI) et **`CIS_CPD_bdpm.txt`** (conditions de prescription et de délivrance → réserve hospitalière) |
| `referentiel_ccam` | 1 969 actes (code, libellé, acte marqueur HDJ, exclusif externe, plateau technique lourd) | **Nomenclature CCAM** (jeu de données « CCAM Ameli », data.gouv.fr / InterHop) |

Dans l’assistant :

- l’utilisateur **recherche un acte** (par code ou par mots-clés) : le code, le libellé et les
  trois indicateurs sont repris du référentiel et affichés, sans ressaisie ;
- l’utilisateur **recherche un médicament** (nom ou DCI) : l’assistant affiche s’il s’agit d’un
  **produit de la réserve hospitalière** — ce qui suffit à valider le pilier « soins » ;
- la recherche est **insensible à la casse et aux accents** (fonctions RPC `unaccent`) ;
- si le référentiel est **injoignable**, un repli local embarqué prend le relais et l’état est
  signalé dans l’en-tête.

### Comment la réserve hospitalière est déterminée

La colonne `est_reserve_hospitaliere` ne repose plus sur une appréciation de libellés : elle est
issue du **libellé officiel « réservé à l’usage HOSPITALIER »** du fichier `CIS_CPD_bdpm.txt`
(art. R. 5121-82 du code de la santé publique), qui est opposable.

| Situation de la spécialité | Valeur | Origine |
|---|---|---|
| porte le libellé « réservé à l’usage HOSPITALIER » | `true` | source officielle (CPD) |
| a des conditions de prescription/délivrance **sans** ce libellé | `false` | source officielle (CPD) |
| n’a **aucune** condition de prescription ni de délivrance | `true` si un motif de `data/reserve-hospitaliere.dci.txt` correspond, sinon `false` | inférence documentée : une spécialité réservée à l’usage hospitalier porte nécessairement ce libellé |

Résultat sur la base : **701 spécialités en réserve hospitalière** (677 par le libellé CPD,
24 rattrapées par la liste de travail — oxygène médicinal, citrate de bétaïne…), **12 908 hors
réserve**, **aucune non déterminée**. La liste de travail `data/reserve-hospitaliere.dci.txt`
n’est plus qu’un **filet de sécurité** : elle ne peut jamais contredire le CPD, et ses exclusions
(`!motif`) neutralisent les homonymies (préparations homéopathiques, produits de ville).

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
- `surveillance_renforcee` : reprise du champ « surveillance renforcée » de la BDPM.
- Une **validation par la pharmacie à usage intérieur** reste nécessaire.
- `acte_marqueur_hdj` / `necessite_plateau_lourd` / `exclusif_externe` : dérivés du **mode
  d’accès** de la nomenclature CCAM (un acte en « abord ouvert » ou « accès transpariétal »
  nécessite un plateau lourd ; une imagerie « sans accès » est réalisable en externe), corrigés
  par `data/ccam-overlay.csv` pour les cas connus (ECG `DEQP003`, etc.).

### Sécurité

`supabase/hardening.sql` active **Row Level Security** et réduit les privilèges de `anon` et
`authenticated` à `SELECT`. La clé `anon` est publique par conception ; **aucune écriture n’est
possible depuis le navigateur**.

### Mise à jour des référentiels

```bash
# 1. Contrôle à blanc : télécharge les sources officielles, prépare et vérifie les lignes
#    (cas de référence, intégrité des sources) sans rien écrire.
npm run import:referentiels:controle            # ou --export pour un CSV de secours

# 2. Import réel (écriture réservée au rôle service_role)
export SUPABASE_URL=https://<ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<clé service_role>   # ne jamais publier
npm run import:referentiels

# 3. Porte de contrôle après import (lecture seule, clé anon de l'application)
npm run verifier:referentiel                    # code retour 0 = conforme

# 4. Le cas échéant : appliquer supabase/hardening.sql et supabase/rpc-recherche.sql
```

`npm run verifier:referentiel` interroge la base **exactement comme l’application** et refuse (code retour 1) un référentiel dont la réserve hospitalière ne serait pas déterminée, dont la
DCI serait absente, ou dont une recherche par DCI (`infliximab`, `pembrolizumab`…) ne trouverait
pas la spécialité attendue. C’est la porte de contrôle des **données**, pendant de celle des
documents livrés.

Sans clé `service_role`, `npm run import:referentiels:controle -- --export` produit les deux CSV
prêts à charger (`referentiel_medicaments.csv`, `referentiel_ccam.csv`) pour un import par le
tableau de bord Supabase.

## 5. Tests

```bash
npm install
npm test              # 97 tests : moteur, portes, assistant (référentiel simulé),
                      #            lecture des référentiels officiels
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

Outil d’aide à la décision médico-administrative : il ne se substitue ni à l’appréciation du
médecin DIM, ni aux contrôles de l’Assurance Maladie.
