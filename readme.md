# HDJ Vérif — assistant d’éligibilité à l’hospitalisation de jour

Assistant pas-à-pas d’aide à la décision : une prise en charge ambulatoire doit-elle être
facturée en **GHS d’hospitalisation de jour** ou requalifiée en **actes et consultations
externes (ACE)** ?

Fondement : **Instruction N° DGOS/R1/DSS/1A/2020/52 du 10 septembre 2020** (NOR : SSAH2007743J,
BO Santé n° 2020/9 du 15 octobre 2020) relative à la gradation des prises en charge ambulatoires.

Site : <https://pierrenicolas35.github.io/hdjverif/>

---

## 1. Interface : un assistant pédagogique, pas un formulaire

**Philosophie** : l’outil n’interroge pas l’identité professionnelle de l’utilisateur
(pas de « profil par métier »). Il propose de choisir une **discipline clinique**, dans le seul
but d’illustrer les règles par des cas concrets de cette discipline. Ce choix est **facultatif**
et ne modifie **aucun** critère de décision.

- **Une question par écran**, avec **barre de progression** et compteur (`Question n sur 13`).
- **Gros boutons Oui / Non** pour toutes les questions fermées ; pas de liste déroulante pour
  les décisions.
- **Boutons à bascule** (maintenus enfoncés) pour les choix multiples : profession des
  intervenants, durée de présence, caractéristiques d’un acte, statut d’un produit.
- **Verdict provisoire en direct** dans l’en-tête, dès la première réponse.
- **Volet pédagogique** sur chaque écran : « pourquoi cette question ? », règle applicable citée,
  et **cas typiques de la discipline choisie**, étiquetés *Relève du GHS* / *Relève de l’externe* /
  *Piège fréquent* / *Hors champ*. 14 disciplines sont proposées (endocrinologie, cardiologie,
  oncologie, neurologie, rhumatologie, gastro-entérologie, néphrologie, pneumologie, pédiatrie,
  gériatrie, douleur, psychiatrie, chirurgie, cas général).
- **Raccourcis décisionnels** : une séance de dialyse/chimiothérapie ou un champ SMR/psychiatrie
  conduit directement au résultat, sans dérouler inutilement l’assistant.
- **Fiche de traçabilité T2A** imprimable (PDF) ou exportable en `.txt`, avec zones de visa et
  rappel du dispositif de rescrit tarifaire.

### Charte et ergonomie

- **Blanc sur fond bleu** : le bleu du logo du CHU Grenoble Alpes (`#008FDB`) structure le fond et
  les surfaces ; textes, boutons et pastilles sont blancs. Les états « sélectionné » s’inversent
  en blanc sur texte bleu, ce qui matérialise clairement les bascules enfoncées.
- **Optimisé smartphone et poste de travail** :
  - une colonne et **barre d’action fixée en bas** (espace réservé, rien n’est recouvert) sur
    téléphone et tablette ;
  - **volet d’aide repliable** sur petit écran, toujours déplié et collant sur grand écran ;
  - cibles tactiles ≥ 44 px, `color-scheme: dark` (sélecteurs natifs de date lisibles),
    prise en charge de `prefers-reduced-motion` et des `safe-area-inset` (encoches).

## 2. Architecture

```
index.html                        Structure de l’assistant (en-tête, progression, carte, aide)
src/
  config.ts                       Accès au référentiel Supabase (clé publique anon)
  core/rules-engine/              MOTEUR — pur, typé strict, découplé de l’UI
    types.ts                      Schéma métier + ResultatAudit
    references.ts                 Citations littérales de l’instruction
    helpers.ts                    Primitives (intervenants actifs, dénombrement des interventions)
    validation.ts                 Garde-fous d’entrée
    engine.ts                     Orchestration séquentielle des 5 portes
    synthese.ts                   Synthèse d’audit opposable
    ports/                        porte0-champ · porte1-prerequis · porte2-acte-isole
                                  porte3-densite · porte4-decision
  ui/
    wizard.ts                     Assistant pas-à-pas (état, navigation, rendu, recherche)
    store.ts                      État de l’assistant → DossierHDJ
    referentiels.ts               Client Supabase (médicaments, CCAM) + repli local
    pedagogie.ts                  Disciplines cliniques, cas typiques, aide par étape
    fiche.ts                      Fiche de traçabilité T2A
    styles.css                    Charte CHU Grenoble Alpes
supabase/                         SQL du projet Supabase (durcissement, RPC de recherche)
scripts/import-referentiels.mjs   Import des référentiels officiels
data/                             Listes de travail (réserve hospitalière, surcharges CCAM)
tests/                            Moteur (5 cas obligatoires), portes, assistant
```

**Principe** : l’interface ne décide rien. Elle collecte les réponses, les convertit en
`DossierHDJ`, appelle `evaluerDossier()` et affiche le `ResultatAudit`. Le moteur est une
fonction pure (pas de DOM, pas de réseau, pas d’horloge : la date d’évaluation est injectable).

## 3. Algorithme : 5 portes séquentielles

| Porte | Objet | Issue bloquante |
|---|---|---|
| **0** | Filtre de champ d’application | `REJET_VERS_FORFAIT_SEANCE` (dialyse, chimiothérapie)<br>`REJET_HORS_MCO` (SMR, psychiatrie) |
| **1** | Prérequis médico-administratifs et traçabilité | `REJET_NON_PROGRAMME` · `SUSPENDU_POUR_REGULARISATION` · `REJET_VERS_ACE` |
| **2** | Exclusion des actes isolés réalisables en externe | `REJET_VERS_ACE` |
| **3** | Densité en ressources mobilisées (≥ 1 pilier) | — (alimente la porte 4) |
| **4** | Décision finale et alertes qualité | `REJET_VERS_ACE` si aucun pilier validé |

**Piliers de densité (porte 3)**

1. **Soins / surveillance active** — surveillance documentée, ou administration d’un produit de
   la réserve hospitalière (art. R. 5121-82 CSP) ou à surveillance continue.
2. **Plateau technique lourd / actes coordonnés** — au moins un acte sur plateau lourd, ou au
   moins deux actes CCAM dénombrables distincts. L’ECG `DEQP003` est exclu du décompte
   (annexe 4, point 2.b.iii).
3. **Pluriprofessionnalité concertée** — seuls les intervenants ayant
   `note_evolution_tracee === true` comptent : **3A** ≥ 2 médecins de spécialités distinctes,
   **3B** ≥ 1 médecin + ≥ 2 professions paramédicales/sociales distinctes.

**Alertes qualité** (non bloquantes) : durée de présence < 180 min ; lettre de liaison non remise.

## 4. Référentiels Supabase

Projet Supabase `Hdjverif` — deux tables publiques en lecture seule :

| Table | Contenu | Source |
|---|---|---|
| `referentiel_medicaments` | 13 609 spécialités (CIS, dénomination, DCI, réserve hospitalière, liste en sus, surveillance renforcée) | **Base de données publique des médicaments** (BDPM, ANSM / Assurance Maladie), fichier `CIS_bdpm.txt` |
| `referentiel_ccam` | 1 969 actes (code, libellé, acte marqueur HDJ, exclusif externe, plateau technique lourd) | **Nomenclature CCAM** (jeu de données « CCAM Ameli », data.gouv.fr / InterHop) |

Dans l’assistant :

- l’utilisateur **recherche un acte** (par code ou par mots-clés) : le code, le libellé et les
  trois indicateurs sont repris du référentiel, et restent **corrigeables** par des bascules ;
- l’utilisateur **recherche un médicament** (nom ou DCI) : l’assistant affiche s’il s’agit d’un
  **produit de la réserve hospitalière** — ce qui suffit à valider le pilier « soins » ;
- la recherche est **insensible à la casse et aux accents** (fonctions RPC `unaccent`) ;
- si le référentiel est **injoignable**, un repli local embarqué prend le relais et l’état est
  signalé dans l’en-tête.

### Points de vigilance sur les données

- `est_reserve_hospitaliere` et `est_liste_en_sus` : `TRUE` pour les listes de travail
  (`data/reserve-hospitaliere.dci.txt`), **`NULL` = non déterminé** (et non « hors réserve »).
  L’assistant invite alors l’utilisateur à trancher. Une **validation par la pharmacie à usage
  intérieur** reste nécessaire.
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
export SUPABASE_URL=https://<ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<clé service_role>   # ne jamais publier
node scripts/import-referentiels.mjs
# puis appliquer supabase/hardening.sql et supabase/rpc-recherche.sql
```

## 5. Tests

```bash
npm install
npm test              # 60 tests : moteur, portes, assistant (référentiel simulé)
npm run test:coverage # couverture du moteur (~99 %)
npm run typecheck     # TypeScript strict
npm run dev           # serveur de développement
npm run build         # build de production dans dist/
```

Les **5 cas obligatoires** :

| # | Cas | Statut attendu |
|---|---|---|
| 1 | Bilan diabète : Médecin + IDE + Diététicien, notes tracées | `VALIDE_GHS` |
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
