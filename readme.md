# HDJ Vérif — moteur décisionnel de cotation HDJ (GHS) vs ACE

Moteur d'évaluation **opposable en contrôle T2A** des séjours d'hospitalisation de jour
(HDJ / GHS) au regard des actes et consultations externes (ACE), conformément à
l'**Instruction N° DGOS/R1/DSS/1A/2020/52 du 10 septembre 2020**
(NOR : SSAH2007743J — BO Santé n° 2020/9 du 15 octobre 2020).

> Précédente version : questionnaire « Akinator » (`app.js` + `rules.json`), fondé sur un
> entonnoir de questions. Il est **remplacé** par une architecture modulaire : un moteur
> typé, pur et testé, plus une interface de saisie structurée.

---

## 1. Architecture

```
index.html                      Interface (formulaire dynamique + panneau temps réel)
src/
  core/rules-engine/            MOTEUR — pur, typé, découplé de l'UI
    types.ts                    Schéma métier + ResultatAudit
    references.ts               Citations littérales de l'instruction (opposabilité)
    helpers.ts                  Primitives (intervenants actifs, dénombrement…)
    validation.ts               Garde-fous d'entrée
    engine.ts                   Orchestration séquentielle des 5 portes
    synthese.ts                 Génération de la synthèse d'audit
    index.ts                    API publique
    ports/
      porte0-champ.ts           Filtre de champ d'application
      porte1-prerequis.ts       Prérequis médico-administratifs et traçabilité
      porte2-acte-isole.ts      Exclusion des actes isolés réalisables en externe
      porte3-densite.ts         Piliers de densité en ressources
      porte4-decision.ts        Décision finale + alertes qualité
  ui/                           INTERFACE — aucune règle métier
    main.ts                     Formulaire dynamique, rendu temps réel
    store.ts                    État de l'écran → DossierHDJ
    presets.ts                  Cas de démonstration (= cas de test)
    fiche.ts                    Fiche de traçabilité T2A (impression / export)
tests/
  engine.test.ts                Les 5 cas obligatoires
  portes.test.ts                Couverture porte par porte
  ui.test.ts                    Intégration UI ↔ moteur
```

**Principe de conception** : l'UI ne décide rien. Elle collecte la saisie, la convertit en
`DossierHDJ`, appelle `evaluerDossier()` et affiche le `ResultatAudit`. Le moteur est une
fonction pure : aucune dépendance au DOM, au réseau ou à l'horloge système (la date
d'évaluation est injectable), ce qui garantit sa testabilité et son déterminisme.

---

## 2. Algorithme : 5 portes séquentielles

| Porte | Objet | Issue bloquante |
|---|---|---|
| **0** | Filtre de champ d'application | `REJET_VERS_FORFAIT_SEANCE` (dialyse, chimiothérapie)<br>`REJET_HORS_MCO` (SMR, psychiatrie) |
| **1** | Prérequis médico-administratifs et traçabilité | `REJET_NON_PROGRAMME` (séjour non programmé)<br>`SUSPENDU_POUR_REGULARISATION` (pièce manquante, ressources présentes)<br>`REJET_VERS_ACE` (pièce manquante et aucune ressource) |
| **2** | Exclusion des actes isolés réalisables en externe | `REJET_VERS_ACE` |
| **3** | Densité en ressources mobilisées (≥ 1 pilier) | — (alimente la porte 4) |
| **4** | Décision finale et alertes qualité | `REJET_VERS_ACE` si aucun pilier validé |

### Piliers de densité (porte 3)

1. **Soins / surveillance active** — surveillance active documentée, **ou** administration
   d'un produit de la réserve hospitalière (art. R. 5121-82 CSP) / à surveillance continue.
2. **Plateau technique lourd / actes coordonnés** — au moins un acte `est_plateau_lourd`,
   **ou** au moins deux actes CCAM dénombrables distincts.
   L'ECG `DEQP003` est exclu du décompte (annexe 4, point 2.b.iii).
3. **Pluriprofessionnalité concertée** — seuls les intervenants ayant
   `note_evolution_tracee === true` sont dénombrés :
   - **3A** : ≥ 2 médecins de spécialités médicales distinctes ;
   - **3B** : ≥ 1 médecin + ≥ 2 professions paramédicales/sociales distinctes.

### Alertes qualité (non bloquantes)
- durée de présence < 180 min → « Durée < 3h : vigilance accrue en contrôle T2A sur la
  densité des soins » ;
- lettre de liaison non remise → traçabilité incomplète (art. R. 1112-1-2 CSP).

---

## 3. Sortie : `ResultatAudit`

```ts
interface ResultatAudit {
  id_sejour: string;
  date_evaluation: string;
  statut: StatutAudit;              // VALIDE_GHS | REJET_VERS_ACE | …
  severite: 'VERT' | 'ORANGE' | 'ROUGE';
  ghs_autorise: boolean;
  piliers_valides: PilierId[];
  motifs_blocage: string[];
  alertes_controle: string[];
  piliers: PilierEvaluation[];      // détail et justifications par pilier
  constats: Constat[];              // constats élémentaires + référence normative
  porte_blocage: PorteId | null;
  portes: EtapePorte[];             // pyramide : franchies / bloquante / non évaluées
  synthese_audit: string;           // synthèse textuelle opposable
}
```

Utilisation :

```ts
import { evaluerDossier } from './src/core/rules-engine/index.js';

const audit = evaluerDossier(dossier);
if (audit.ghs_autorise) {
  // facturation GHS
} else {
  console.warn(audit.motifs_blocage.join('\n'));
}
```

---

## 4. Tests

```bash
npm install
npm test              # 50 tests (moteur, portes, UI)
npm run test:coverage # couverture du moteur (~99 %)
npm run typecheck     # TypeScript strict
npm run dev           # serveur de développement
npm run build         # build de production dans dist/
```

Les **5 cas obligatoires** du cahier des charges :

| # | Cas | Statut attendu |
|---|---|---|
| 1 | Bilan diabète : Médecin + IDE + Diététicien, notes tracées | `VALIDE_GHS` |
| 2 | Idem, note de la diététicienne non tracée | `REJET_VERS_ACE` |
| 3 | Absence de synthèse médicale signée | `SUSPENDU_POUR_REGULARISATION` |
| 4 | Perfusion isolée de fer, sans surveillance continue | `REJET_VERS_ACE` |
| 5 | Séance de chimiothérapie | `REJET_VERS_FORFAIT_SEANCE` |

---

## 5. Interface

- Formulaire en 4 blocs : en-tête administratif & programmation, intervenants (avec case
  **impérative** « note d'évolution rédigée dans le dossier »), actes CCAM & traitements UCD,
  surveillance & paramètres.
- Panneau de résultat **temps réel** : badge de statut (vert / orange / rouge), pyramide des
  5 portes, détail des piliers, motifs opposables, alertes qualité, constats et références.
- **Fiche de traçabilité T2A** : impression / PDF ou export `.txt`, avec zones de visa
  (rédacteur, DIM, médecin coordonnateur) et rappel du dispositif de rescrit tarifaire.
- 5 cas de démonstration pré-remplis, alignés sur les tests unitaires.

---

## 6. Références

- Instruction N° DGOS/R1/DSS/1A/2020/52 du 10 septembre 2020 — NOR : SSAH2007743J.
- Code de la sécurité sociale, art. L. 162-22-6, L. 162-26, L. 162-26-1, R. 162-33-1.
- Code de la santé publique, art. D. 6124-301-1 et s., R. 1112-1-2, R. 5121-82, L. 4111-1.
- Arrêté du 19 février 2015 modifié (art. 11 et 11 bis) ; arrêté du 23 décembre 2016.

Outil d'aide à la décision médico-administrative : il ne se substitue ni à l'appréciation du
médecin DIM ni aux contrôles de l'Assurance Maladie.
