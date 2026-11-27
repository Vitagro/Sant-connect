alter table public.users
  add column if not exists session_version integer not null default 0,
  add column if not exists recovery_code_hash text,
  add column if not exists recovery_expires_at timestamptz;
