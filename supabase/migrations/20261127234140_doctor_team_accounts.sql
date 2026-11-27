alter table public.users
  add column if not exists team_owner_id uuid references public.users(id),
  add column if not exists team_invite_hash text,
  add column if not exists team_invite_expires_at timestamptz,
  add column if not exists team_activated_at timestamptz;
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('medecin','patient','labo','pharmacie','assurance','super_admin','assistant','infirmier'));
alter table public.users add constraint users_team_owner_check
  check (role not in ('assistant','infirmier') or (team_owner_id is not null and team_owner_id <> id));
create index if not exists idx_users_team_owner on public.users(team_owner_id) where team_owner_id is not null;
