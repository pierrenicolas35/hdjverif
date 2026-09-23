-- =====================================================================
-- HDJ Vérif — fonctions de recherche exposées à l'application (RPC)
--
-- Recherche insensible à la casse ET aux accents (extension `unaccent`),
-- pour que « paracetamol » trouve « PARACÉTAMOL ».
--
-- Les fonctions sont `security invoker` : elles s'exécutent avec les droits de
-- l'appelant (rôle `anon`), donc soumises à la RLS et en lecture seule.
-- =====================================================================

create extension if not exists unaccent;

-- ---------------------------------------------------------------------
-- Colonne « surveillance particulière » (libellé CPD officiel).
-- NULL = valeur absente du référentiel (non déterminée), jamais « non ».
-- ---------------------------------------------------------------------
alter table public.referentiel_medicaments
  add column if not exists surveillance_particuliere boolean;

comment on column public.referentiel_medicaments.surveillance_particuliere is
  'Libellé CPD « médicament nécessitant une surveillance particulière pendant le traitement » : trace de la variable « surveillance particulière » de l''annexe 4, point 2.b.iii. NULL = valeur absente du référentiel.';

-- ---------------------------------------------------------------------
-- Recherche de médicaments
-- ---------------------------------------------------------------------
drop function if exists public.rechercher_medicaments(text, integer);

create function public.rechercher_medicaments(
  p_terme  text,
  p_limite integer default 12
)
returns table (
  cis                    varchar(255),
  denomination           text,
  dci                    text,
  est_reserve_hospitaliere boolean,
  est_liste_en_sus       boolean,
  surveillance_particuliere boolean,
  surveillance_renforcee boolean
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
    m.cis,
    m.denomination,
    m.dci,
    m.est_reserve_hospitaliere,
    m.est_liste_en_sus,
    m.surveillance_particuliere,
    m.surveillance_renforcee
  from public.referentiel_medicaments m, cible
  where cible.t is not null
    and (
      unaccent(m.denomination) ilike '%' || cible.t || '%'
      or unaccent(coalesce(m.dci, '')) ilike '%' || cible.t || '%'
    )
  order by
    -- 1. égalité exacte sur la DCI, 2. préfixe de DCI, 3. dénomination la plus courte
    (unaccent(coalesce(m.dci, '')) = cible.t) desc,
    (unaccent(coalesce(m.dci, '')) ilike cible.t || '%') desc,
    (unaccent(m.denomination) ilike cible.t || '%') desc,
    length(m.denomination),
    m.denomination
  limit greatest(1, least(coalesce(p_limite, 12), 50));
$$;

-- ---------------------------------------------------------------------
-- Recherche d'actes CCAM (par code ou par libellé)
--
-- NB : `supabase/ccam-arbres.sql` REDÉFINIT cette fonction pour y ajouter la
--      recherche par mots-clés (§ « grand public ») et l'arborescence. Le
--      présent fichier reste la version de base ; en cas d'installation neuve,
--      appliquer `ccam-arbres.sql` APRÈS celui-ci.
-- ---------------------------------------------------------------------
create or replace function public.rechercher_ccam(
  p_terme  text,
  p_limite integer default 12
)
returns table (
  code                   varchar(255),
  libelle                text,
  acte_marqueur_hdj      boolean,
  exclusif_externe       boolean,
  necessite_plateau_lourd boolean
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
    a.necessite_plateau_lourd
  from public.referentiel_ccam a, cible
  where cible.t is not null
    and (
      lower(a.code) like lower(cible.t) || '%'
      or lower(a.code) = lower(cible.t)
      or unaccent(a.libelle) ilike '%' || cible.t || '%'
    )
  order by
    (lower(a.code) = lower(cible.t)) desc,
    (lower(a.code) like lower(cible.t) || '%') desc,
    (unaccent(a.libelle) like cible.t || '%') desc,
    position(cible.t in unaccent(a.libelle)),
    length(a.libelle),
    a.code
  limit greatest(1, least(coalesce(p_limite, 12), 50));
$$;

-- ---------------------------------------------------------------------
-- Lookup unitaires (saisie d'un code connu)
-- ---------------------------------------------------------------------
create or replace function public.acte_ccam(p_code text)
returns table (
  code                   varchar(255),
  libelle                text,
  acte_marqueur_hdj      boolean,
  exclusif_externe       boolean,
  necessite_plateau_lourd boolean
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select a.code, a.libelle, a.acte_marqueur_hdj, a.exclusif_externe, a.necessite_plateau_lourd
  from public.referentiel_ccam a
  where lower(a.code) = lower(btrim(coalesce(p_code, '')))
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------
revoke all on function public.rechercher_medicaments(text, integer) from public;
revoke all on function public.rechercher_ccam(text, integer) from public;
revoke all on function public.acte_ccam(text) from public;

grant execute on function public.rechercher_medicaments(text, integer) to anon, authenticated;
grant execute on function public.rechercher_ccam(text, integer) to anon, authenticated;
grant execute on function public.acte_ccam(text) to anon, authenticated;
