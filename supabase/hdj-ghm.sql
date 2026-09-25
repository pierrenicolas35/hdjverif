-- =====================================================================
-- HDJ Vérif — référentiel ATIH : actes valorisables en hospitalisation de jour
--
-- OBJET
--   Ajouter à `referentiel_ccam` ce que la nomenclature CCAM ne porte pas et
--   qui commande la facturation en GHS d'hospitalisation de jour :
--
--     • l'acte est-il **classant** (peut-il valider une HDJ à lui seul) ?
--     • dans quelle(s) **racine(s) de GHM** classe-t-il ?
--     • l'une de ces racines décrit-elle un **séjour de 0 nuit** (GHM en « J ») ?
--     • l'acte est-il **reclassant dans un GHM médical** (annexe 11) ?
--
-- SOURCE — Manuel des GHM, version 2025 (arrêté publié au BO du 23/07/2025)
--   annexe 2 (GHM classés par CMD) · annexe 3 (« GHM courts » :
--   J = GHM ambulatoire strict (0 nuit), T0/T1/T2 = très courte durée)
--   annexe 8 (actes classants avec les CMD) · annexe 11 (actes mineurs reclassant
--   dans un GHM « médical ») · volume 2 par CMD (listes d'actes en CCAM rattachées
--   à chaque racine).
--   https://www.atih.sante.fr/manuel-des-ghm-2025-publication-bo
--
--   Les tables extraites de ces annexes sont versionnées dans `data/atih/`
--   (679 racines de GHM, 5 492 actes classants) ; l'import les croise avec la
--   nomenclature via `scripts/lib/ghm.mjs`.
--
-- SIGNIFICATION DE `eligible_hdj`
--   `true`  : au moins une racine de l'acte ne contient qu'un GHM en « J »
--             (ambulatoire strict, 0 nuit) — l'acte peut valider un GHS d'HDJ.
--   `false` : aucun GHM ambulatoire strict dans ses racines, ou acte non classant,
--             ou acte reclassant dans un GHM médical.
--   Le détail à trois états (« oui » / « sous condition » / « non ») est dans
--   `eligibilite_hdj`, et sa motivation dans `motif_eligibilite_hdj`.
--
--   ATTENTION — l'éligibilité HDJ est une propriété du **séjour**, pas de l'acte :
--   le GHM effectivement retenu dépend du diagnostic principal et du groupage. Un
--   acte peut classer dans plusieurs racines, dont certaines exigent une nuitée ;
--   `racines_ghm` les énumère toutes, et le commentaire de traçabilité nomme celles
--   qui portent le GHM ambulatoire strict.
--
-- À appliquer après un import portant les nouvelles colonnes :
--   psql < supabase/hdj-ghm.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colonnes du référentiel ATIH
-- ---------------------------------------------------------------------
alter table public.referentiel_ccam
  add column if not exists acte_classant            boolean,
  add column if not exists racines_ghm              text,
  add column if not exists cmd_classantes           text,
  add column if not exists ghm_ambulatoire_strict   boolean,
  add column if not exists admet_sejour_0_nuit      boolean,
  add column if not exists reclassant_ghm_medical   boolean,
  add column if not exists type_acte                text,
  add column if not exists eligible_hdj             boolean,
  add column if not exists eligibilite_hdj          text,
  add column if not exists motif_eligibilite_hdj    text,
  add column if not exists environnement_requis     text,
  add column if not exists commentaire_pmsi         text;

comment on column public.referentiel_ccam.acte_classant is
  'Acte classant (Manuel des GHM, annexes 8 et volume 2) : peut valider un GHS à lui seul.';
comment on column public.referentiel_ccam.racines_ghm is
  'Racines de GHM dans lesquelles l''acte classe (volume 2), séparées par une espace.';
comment on column public.referentiel_ccam.cmd_classantes is
  'Catégories majeures de diagnostic dans lesquelles l''acte est répertorié (annexe 8).';
comment on column public.referentiel_ccam.ghm_ambulatoire_strict is
  'Au moins une racine ne contient qu''un GHM en « J » : ambulatoire strict, 0 nuit.';
comment on column public.referentiel_ccam.admet_sejour_0_nuit is
  'Au moins une racine porte un marqueur « GHM courts » (J/T0/T1/T2) : séjour de 0 nuit possible.';
comment on column public.referentiel_ccam.reclassant_ghm_medical is
  'Annexe 11 : acte mineur reclassant dans un GHM « médical » — ne valide pas l''HDJ.';
comment on column public.referentiel_ccam.type_acte is
  'Catégorie majeure de GHM : acte interventionnel classant, acte lourd non opératoire, acte reclassant en GHM médical, acte non classant.';
comment on column public.referentiel_ccam.eligible_hdj is
  'Vrai si l''acte peut valider un GHS d''hospitalisation de jour (GHM ambulatoire strict).';
comment on column public.referentiel_ccam.eligibilite_hdj is
  'Éligibilité HDJ à trois états : oui, sous condition (très courte durée), non.';
comment on column public.referentiel_ccam.motif_eligibilite_hdj is
  'Motivation du statut d''éligibilité, reprise dans la fiche de traçabilité.';
comment on column public.referentiel_ccam.environnement_requis is
  'Environnement que l''acte mobilise : bloc/salle interventionnelle, anesthésie mentionnée par la racine, aucun plateau lourd.';
comment on column public.referentiel_ccam.commentaire_pmsi is
  'Règles de traçabilité PMSI opposables au dossier en cas de contrôle T2A.';

-- `acte_marqueur_hdj` et `exclusif_externe` naissent de la nomenclature CCAM ; le croisement
-- avec le Manuel des GHM en donne la valeur **définitive** pour les actes hors jeu libéral.
-- Un acte marqueur d'HDJ n'est pas un « acte lourd » : c'est un acte qui **peut ouvrir un GHS
-- d'hospitalisation de jour**. La confusion entre les deux faisait afficher « acte marqueur
-- HDJ : oui » sur des actes qui ne peuvent pas valider une HDJ (contrôle DIM du 25/09/2026).
comment on column public.referentiel_ccam.acte_marqueur_hdj is
  'Acte marqueur d''hospitalisation de jour : l''acte est classant et admet un séjour de 0 nuit (éligibilité « oui » ou « sous condition »). Valeur définie pour tous les actes, issue du Manuel des GHM.';
comment on column public.referentiel_ccam.exclusif_externe is
  'Acte réalisable en externe (mode d''accès CCAM « sans accès », corrigé par ccam-overlay). Faux dès que l''acte est classant ; absent (NULL) hors de ce cas — l''absence n''est jamais convertie en « non ».';

-- ---------------------------------------------------------------------
-- 2. Index : sélection des actes classants et de ceux éligibles à l'HDJ
-- ---------------------------------------------------------------------
create index if not exists idx_ccam_acte_classant
  on public.referentiel_ccam (acte_classant)
  where acte_classant;

create index if not exists idx_ccam_eligible_hdj
  on public.referentiel_ccam (eligible_hdj)
  where eligible_hdj;

-- ---------------------------------------------------------------------
-- 3. Vue de restitution
--    [Code CCAM] | [Libellé] | [Racine GHM / Type d'acte] | [Éligibilité HDJ]
--    | [Acte marqueur HDJ] | [Plateau technique lourd requis]
--    | [Réalisable en externe] | [Motif] | [Commentaires / traçabilité PMSI]
--
--    Les trois indicateurs binaires sont rendus à **trois états** : « oui », « non » et
--    « non renseigné » lorsque la source est muette. Aucune valeur absente n'est convertie
--    en « non » (l'ancienne vue le faisait pour le plateau technique, et affichait donc un
--    refus là où le référentiel ne disait rien).
--
--    La vue est **supprimée puis recréée** : `create or replace view` ne sait ni renommer ni
--    réordonner une colonne, et la nouvelle restitution ajoute l'acte marqueur d'HDJ.
-- ---------------------------------------------------------------------
drop view if exists public.base_hdj_actes;

create view public.base_hdj_actes as
select
  a.code                                                        as code_ccam,
  a.libelle                                                     as libelle,
  case
    when a.racines_ghm is null then a.type_acte
    else a.racines_ghm || ' — ' || a.type_acte
  end                                                           as racine_ghm_type_acte,
  coalesce(a.eligibilite_hdj, 'non')                            as eligible_hdj,
  case when a.acte_marqueur_hdj then 'oui' else 'non' end       as acte_marqueur_hdj,
  case
    when a.necessite_plateau_lourd is null then 'non renseigné'
    when a.necessite_plateau_lourd then 'oui' else 'non'
  end                                                           as plateau_technique_lourd_requis,
  case
    when a.exclusif_externe is null then 'non renseigné'
    when a.exclusif_externe then 'oui' else 'non'
  end                                                           as realisable_en_externe,
  a.motif_eligibilite_hdj                                       as motif_eligibilite_hdj,
  a.commentaire_pmsi                                            as commentaire_pmsi
from public.referentiel_ccam a;

comment on view public.base_hdj_actes is
  'Base des actes techniques valorisables en HDJ : nomenclature CCAM croisée au Manuel des GHM MCO 2025 (ATIH). Les indicateurs binaires sont rendus à trois états (oui / non / non renseigné).';

grant select on public.base_hdj_actes to anon, authenticated;
