-- =====================================================================
-- HDJ Vérif — arborescence et recherche élargie de la nomenclature CCAM
--
-- OBJET
--   1. ajouter à `referentiel_ccam` la position de chaque acte dans
--      l'arborescence officielle (chapitre, sous-thème = site anatomique) et
--      une colonne `mots_cles` de synonymes « grand public » ;
--   2. élargir `rechercher_ccam` à ces mots-clés ;
--   3. exposer trois fonctions de navigation (chapitres, sous-thèmes, actes).
--
-- SOURCE DE L'ARBORESCENCE
--   La nomenclature CCAM est organisée en 19 chapitres par appareil/système
--   (1ᵉʳ niveau) puis par site anatomique, action et technique (axes officiels
--   « Appareils », « Actions », « Techniques » de l'arborescence CCAM publiée
--   par l'Assurance Maladie). Ces niveaux sont livrés par le jeu de données
--   « CCAM Ameli » lui-même : aucune classification n'est inventée ici.
--
-- À appliquer après un import comportant les nouvelles colonnes :
--   psql < supabase/ccam-arbres.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colonnes d'arborescence et de mots-clés
-- ---------------------------------------------------------------------
alter table public.referentiel_ccam
  add column if not exists chapitre_code          text,
  add column if not exists chapitre_libelle       text,
  add column if not exists sous_chapitre_code     text,
  add column if not exists sous_chapitre_libelle  text,
  add column if not exists mots_cles               text;

comment on column public.referentiel_ccam.chapitre_code is
  'Chapitre de la nomenclature CCAM (1ᵉʳ niveau de l''arborescence officielle : appareil ou système).';
comment on column public.referentiel_ccam.sous_chapitre_code is
  'Sous-thème : site anatomique de l''acte (axe « Appareils »), replié sur le chapitre si absent.';
comment on column public.referentiel_ccam.mots_cles is
  'Synonymes et vocabulaire courant rattachés à l''acte (ex. « scanner » pour une scanographie), interrogés par rechercher_ccam.';

-- ---------------------------------------------------------------------
-- 2. Index : recherche élargie (trigrammes) et navigation (arbre)
-- ---------------------------------------------------------------------
create extension if not exists pg_trgm;

create index if not exists idx_ccam_mots_cles_trgm
  on public.referentiel_ccam using gin (mots_cles gin_trgm_ops);

create index if not exists idx_ccam_chapitre
  on public.referentiel_ccam (chapitre_code);

create index if not exists idx_ccam_sous_chapitre
  on public.referentiel_ccam (sous_chapitre_code);

-- ---------------------------------------------------------------------
-- 3. Recherche élargie (code, libellé, mots-clés)
--
--    La fiche renvoyée porte le verdict de codage HDJ (acte classant, éligibilité,
--    motif, racines de GHM), défini pour tous les actes — voir rpc-recherche.sql.
-- ---------------------------------------------------------------------
drop function if exists public.rechercher_ccam(text, integer);

create function public.rechercher_ccam(
  p_terme  text,
  p_limite integer default 12
)
returns table (
  code                    varchar(255),
  libelle                 text,
  acte_marqueur_hdj       boolean,
  exclusif_externe        boolean,
  necessite_plateau_lourd boolean,
  acte_classant           boolean,
  eligibilite_hdj         text,
  motif_eligibilite_hdj   text,
  type_acte               text,
  racines_ghm             text
)
language sql
stable
security invoker
set search_path = public, extensions, pg_catalog
as $$
  with cible as (
    select nullif(btrim(unaccent(coalesce(p_terme, ''))), '') as t
  )
  select
    a.code,
    a.libelle,
    a.acte_marqueur_hdj,
    a.exclusif_externe,
    a.necessite_plateau_lourd,
    a.acte_classant,
    a.eligibilite_hdj,
    a.motif_eligibilite_hdj,
    a.type_acte,
    a.racines_ghm
  from public.referentiel_ccam a, cible
  where cible.t is not null
    and (
      lower(a.code) like lower(cible.t) || '%'
      or lower(a.code) = lower(cible.t)
      or unaccent(a.libelle) ilike '%' || cible.t || '%'
      -- Recherche élargie : synonymes et vocabulaire courant (« scanner », « IRM »…).
      or unaccent(coalesce(a.mots_cles, '')) ilike '%' || cible.t || '%'
    )
  order by
    -- 1. code exact, 2. préfixe de code, 3. libellé commençant par le terme,
    -- 4. libellé contenant le terme, 5. sinon (correspondance par mots-clés).
    (lower(a.code) = lower(cible.t)) desc,
    (lower(a.code) like lower(cible.t) || '%') desc,
    (unaccent(a.libelle) like cible.t || '%') desc,
    (unaccent(a.libelle) ilike '%' || cible.t || '%') desc,
    position(cible.t in unaccent(a.libelle)),
    length(a.libelle),
    a.code
  limit greatest(1, least(coalesce(p_limite, 12), 100));
$$;

-- ---------------------------------------------------------------------
-- 4. Navigation par arborescence
-- ---------------------------------------------------------------------

-- 4.a Chapitres (thématiques) avec le nombre d'actes.
drop function if exists public.chapitres_ccam();
create function public.chapitres_ccam()
returns table (code text, libelle text, actes integer)
language sql
stable
security invoker
set search_path = public, extensions, pg_catalog
as $$
  select
    a.chapitre_code as code,
    min(a.chapitre_libelle) as libelle,
    count(*)::int as actes
  from public.referentiel_ccam a
  where a.chapitre_code is not null
  group by a.chapitre_code
  order by a.chapitre_code;
$$;

-- 4.b Sous-thèmes (sites anatomiques) d'un chapitre.
drop function if exists public.sous_chapitres_ccam(text);
create function public.sous_chapitres_ccam(p_chapitre text)
returns table (code text, libelle text, actes integer)
language sql
stable
security invoker
set search_path = public, extensions, pg_catalog
as $$
  select
    a.sous_chapitre_code as code,
    min(a.sous_chapitre_libelle) as libelle,
    count(*)::int as actes
  from public.referentiel_ccam a
  where a.chapitre_code = btrim(coalesce(p_chapitre, ''))
    and a.sous_chapitre_code is not null
  group by a.sous_chapitre_code
  order by min(a.sous_chapitre_libelle);
$$;

-- 4.c Actes d'un chapitre (et, si fourni, d'un sous-thème).
drop function if exists public.actes_par_theme(text, text, integer);
create function public.actes_par_theme(
  p_chapitre       text,
  p_sous_chapitre  text default null,
  p_limite         integer default 200
)
returns table (
  code                    varchar(255),
  libelle                 text,
  acte_marqueur_hdj       boolean,
  exclusif_externe        boolean,
  necessite_plateau_lourd boolean,
  acte_classant           boolean,
  eligibilite_hdj         text,
  motif_eligibilite_hdj   text,
  type_acte               text,
  racines_ghm             text
)
language sql
stable
security invoker
set search_path = public, extensions, pg_catalog
as $$
  select
    a.code,
    a.libelle,
    a.acte_marqueur_hdj,
    a.exclusif_externe,
    a.necessite_plateau_lourd,
    a.acte_classant,
    a.eligibilite_hdj,
    a.motif_eligibilite_hdj,
    a.type_acte,
    a.racines_ghm
  from public.referentiel_ccam a
  where a.chapitre_code = btrim(coalesce(p_chapitre, ''))
    and (
      nullif(btrim(coalesce(p_sous_chapitre, '')), '') is null
      or a.sous_chapitre_code = btrim(p_sous_chapitre)
    )
  order by a.libelle, a.code
  limit greatest(1, least(coalesce(p_limite, 200), 500));
$$;

-- ---------------------------------------------------------------------
-- 5. Vue de lecture (colonnes d'arborescence incluses)
-- ---------------------------------------------------------------------
-- La vue est supprimée puis recréée : `create or replace view` ne sait pas réordonner
-- les colonnes, et la restitution ajoute le verdict de codage HDJ.
drop view if exists public.v_ccam_hdj;

create view public.v_ccam_hdj
with (security_invoker = true) as
select
  code,
  libelle,
  acte_marqueur_hdj,
  exclusif_externe,
  necessite_plateau_lourd,
  acte_classant,
  eligibilite_hdj,
  motif_eligibilite_hdj,
  type_acte,
  racines_ghm,
  chapitre_code,
  chapitre_libelle,
  sous_chapitre_code,
  sous_chapitre_libelle,
  mots_cles
from public.referentiel_ccam;

grant select on public.v_ccam_hdj to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Droits d'exécution
-- ---------------------------------------------------------------------
revoke all on function public.chapitres_ccam() from public;
revoke all on function public.sous_chapitres_ccam(text) from public;
revoke all on function public.actes_par_theme(text, text, integer) from public;

grant execute on function public.chapitres_ccam() to anon, authenticated;
grant execute on function public.sous_chapitres_ccam(text) to anon, authenticated;
grant execute on function public.actes_par_theme(text, text, integer) to anon, authenticated;

-- `rechercher_ccam` est recréée ici (nouvelle signature) : les privilèges posés par
-- `rpc-recherche.sql` sont repris, sinon la fonction retomberait sur le droit PUBLIC par défaut.
-- `supabase/thesaurus.sql` la reprend ensuite pour y brancher le thésaurus : c'est lui qui
-- doit être appliqué en DERNIER.
revoke all on function public.rechercher_ccam(text, integer) from public;
grant execute on function public.rechercher_ccam(text, integer) to anon, authenticated;
