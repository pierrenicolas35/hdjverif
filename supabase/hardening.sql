-- =====================================================================
-- HDJ Vérif — durcissement du projet Supabase « Hdjverif »
--
-- Contexte : les tables de référentiel sont destinées à être lues
-- directement par l'application (clé publique `anon`). Elles ne doivent en
-- revanche jamais être modifiables depuis le navigateur.
--
-- À appliquer après `scripts/import-referentiels.mjs`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Row Level Security : lecture publique, écriture interdite
-- ---------------------------------------------------------------------

alter table public.referentiel_medicaments enable row level security;
alter table public.referentiel_ccam enable row level security;
alter table public.referentiel_medicaments force row level security;
alter table public.referentiel_ccam force row level security;

drop policy if exists "lecture publique des medicaments" on public.referentiel_medicaments;
create policy "lecture publique des medicaments"
  on public.referentiel_medicaments
  for select
  to anon, authenticated
  using (true);

drop policy if exists "lecture publique de la ccam" on public.referentiel_ccam;
create policy "lecture publique de la ccam"
  on public.referentiel_ccam
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------
-- 2. Privilèges : SELECT uniquement pour les rôles exposés
-- ---------------------------------------------------------------------

revoke all on public.referentiel_medicaments from anon, authenticated;
revoke all on public.referentiel_ccam from anon, authenticated;

grant select on public.referentiel_medicaments to anon, authenticated;
grant select on public.referentiel_ccam to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Recherche : index trigramme pour les recherches par sous-chaîne
--    (les index GIN to_tsvector existants servent la recherche plein texte ;
--     ceux-ci accélèrent les recherches `ilike '%…%'` du formulaire).
-- ---------------------------------------------------------------------

create extension if not exists pg_trgm;

create index if not exists idx_med_denomination_trgm
  on public.referentiel_medicaments using gin (denomination gin_trgm_ops);

create index if not exists idx_med_dci_trgm
  on public.referentiel_medicaments using gin (dci gin_trgm_ops);

create index if not exists idx_ccam_code_trgm
  on public.referentiel_ccam using gin (code gin_trgm_ops);

create index if not exists idx_ccam_libelle_trgm
  on public.referentiel_ccam using gin (libelle gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 4. Vues de lecture exposées à l'application
--    (n'exposent que les colonnes utiles au moteur décisionnel)
-- ---------------------------------------------------------------------

create or replace view public.v_medicaments_hdj
with (security_invoker = true) as
select
  cis,
  denomination,
  dci,
  est_reserve_hospitaliere,
  est_liste_en_sus,
  surveillance_renforcee
from public.referentiel_medicaments;

create or replace view public.v_ccam_hdj
with (security_invoker = true) as
select
  code,
  libelle,
  acte_marqueur_hdj,
  exclusif_externe,
  necessite_plateau_lourd
from public.referentiel_ccam;

grant select on public.v_medicaments_hdj to anon, authenticated;
grant select on public.v_ccam_hdj to anon, authenticated;
