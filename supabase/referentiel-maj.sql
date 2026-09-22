-- =====================================================================
-- HDJ Vérif — suivi des mises à jour des référentiels
--
-- Table de service : une ligne par table de référentiel, avec la date de sa
-- dernière mise à jour effective. L'application l'affiche dans son en-tête
-- (« Référentiel connecté · MAJ 22/09/2026 »).
--
-- Alimentée par `scripts/import-referentiels.mjs` (rôle `service_role`).
-- Lecture publique, écriture interdite depuis le navigateur.
-- =====================================================================

create table if not exists public.referentiel_maj (
  nom       text primary key,
  libelle   text not null,
  -- Date de la dernière mise à jour **effective** : elle ne bouge que lorsque les
  -- sources officielles changent (la mise à jour mensuelle n'écrit rien sinon).
  maj_le    timestamptz not null default now(),
  lignes    integer,
  empreinte text,
  source    text
);

comment on table public.referentiel_maj is
  'Date de dernière mise à jour de chaque table de référentiel (affichée par l''application).';
comment on column public.referentiel_maj.maj_le is
  'Dernière mise à jour effective : ne bouge que si les sources officielles ont changé.';
comment on column public.referentiel_maj.empreinte is
  'Empreinte SHA-256 des sources officielles utilisées (BDPM, CCAM) au moment de l''import.';

-- ---------------------------------------------------------------------
-- Durcissement : lecture publique, écriture réservée au service_role
-- ---------------------------------------------------------------------
alter table public.referentiel_maj enable row level security;
alter table public.referentiel_maj force row level security;

drop policy if exists "lecture publique des mises a jour" on public.referentiel_maj;
create policy "lecture publique des mises a jour"
  on public.referentiel_maj
  for select
  to anon, authenticated
  using (true);

revoke all on public.referentiel_maj from anon, authenticated;
grant select on public.referentiel_maj to anon, authenticated;

-- ---------------------------------------------------------------------
-- Lignes attendues (l'import renseigne ensuite les dates et les volumes)
-- ---------------------------------------------------------------------
insert into public.referentiel_maj (nom, libelle, source) values
  ('referentiel_medicaments', 'Médicaments (BDPM)', 'BDPM — CIS_bdpm, CIS_COMPO, CIS_CPD'),
  ('referentiel_ccam', 'Nomenclature CCAM', 'CCAM Ameli — data.gouv.fr')
on conflict (nom) do nothing;
