-- =====================================================================
-- HDJ Vérif — suivi des mises à jour des référentiels
--
-- Table de service : une ligne par table de référentiel, avec la date de sa
-- dernière mise à jour effective **et** la date de son dernier contrôle.
-- L'application l'affiche dans son en-tête (« Référentiel connecté · MAJ 22/09/2026 »)
-- et s'en sert pour avertir l'utilisateur quand le référentiel n'est plus suivi.
--
-- Deux dates, deux questions différentes :
--   • `maj_le`     — quand les données ont-elles réellement changé ? (n'bouge que si les
--                    sources officielles ont changé : c'est la date affichée) ;
--   • `verifie_le` — quand les sources ont-elles été recontrôlées pour la dernière fois,
--                    même sans changement ? C'est ce « battement de cœur » qui permet de
--                    distinguer « rien à mettre à jour » de « plus personne ne contrôle ».
--
-- Alimentée par `scripts/import-referentiels.mjs` et `scripts/maj-referentiels.mjs`
-- (rôle `service_role`), y compris par le cron mensuel. Lecture publique, écriture
-- interdite depuis le navigateur.
-- =====================================================================

create table if not exists public.referentiel_maj (
  nom       text primary key,
  libelle   text not null,
  -- Date de la dernière mise à jour **effective** : elle ne bouge que lorsque les
  -- sources officielles changent (la mise à jour mensuelle n'écrit rien sinon).
  maj_le    timestamptz not null default now(),
  lignes    integer,
  empreinte text,
  source    text,
  -- Battement de cœur du contrôle : dernière exécution **réussie** de la vérification
  -- des sources (import ou « sources inchangées »).
  verifie_le      timestamptz,
  -- `importe` : sources modifiées et importées ; `a_jour` : sources inchangées ;
  -- `echec` : dernière tentative en échec ; `inconnu` : jamais contrôlé.
  etat_controle   text not null default 'inconnu',
  derniere_erreur text,
  -- Qui a contrôlé : `cron`, `manuel`, `actions`…
  verifie_par     text
);

-- Migration des bases déjà installées (idempotent).
alter table public.referentiel_maj
  add column if not exists verifie_le      timestamptz,
  add column if not exists etat_controle   text not null default 'inconnu',
  add column if not exists derniere_erreur text,
  add column if not exists verifie_par     text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'referentiel_maj_etat_controle_valide'
  ) then
    alter table public.referentiel_maj
      add constraint referentiel_maj_etat_controle_valide
      check (etat_controle in ('inconnu', 'a_jour', 'importe', 'echec'));
  end if;
end $$;

comment on table public.referentiel_maj is
  'Date de dernière mise à jour et de dernier contrôle de chaque table de référentiel (affichées par l''application).';
comment on column public.referentiel_maj.maj_le is
  'Dernière mise à jour effective : ne bouge que si les sources officielles ont changé.';
comment on column public.referentiel_maj.empreinte is
  'Empreinte SHA-256 des sources officielles utilisées (BDPM, CCAM) au moment de l''import.';
comment on column public.referentiel_maj.verifie_le is
  'Dernier contrôle réussi des sources officielles, même sans changement : battement de cœur du suivi mensuel.';
comment on column public.referentiel_maj.etat_controle is
  'Résultat du dernier contrôle : importe, a_jour, echec ou inconnu.';
comment on column public.referentiel_maj.derniere_erreur is
  'Message de la dernière tentative de mise à jour en échec, affiché à l''utilisateur.';

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
