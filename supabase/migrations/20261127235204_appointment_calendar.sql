create table public.appointment_slots (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.users(id),
  local_day date not null,
  starts_at timestamptz not null,
  status text not null check (status in ('available','blocked','booked')),
  patient_id uuid references public.users(id),
  unique (doctor_id, starts_at),
  check ((status = 'booked') = (patient_id is not null))
);
alter table public.appointment_slots enable row level security;
revoke all on public.appointment_slots from public, anon, authenticated;
grant select, insert, update on public.appointment_slots to service_role;
create index on public.appointment_slots (doctor_id, local_day, starts_at);
create index on public.appointment_slots (patient_id, starts_at) where patient_id is not null;

create function public.calendar_doctors()
returns table (id uuid, name text)
language sql stable security invoker set search_path = ''
as $$
  select u.id, coalesce(nullif(btrim(concat_ws(' ',u.prenom,u.nom)),''),u.username)
  from public.users u
  where u.role='medecin' and u.is_active
    and exists (select 1 from public.appointment_slots s where s.doctor_id=u.id and s.status in ('available','booked') and s.starts_at > now())
  order by 2, 1;
$$;

create function public.calendar_set_range(p_doctor uuid, p_day date, p_start time, p_end time, p_status text)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare changed integer;
begin
  if p_status not in ('available','blocked') or p_day < (now() at time zone 'Africa/Casablanca')::date
    or p_day > (now() at time zone 'Africa/Casablanca')::date + 90
    or p_start < time '07:00' or p_end > time '22:00' or p_start >= p_end
    or extract(minute from p_start) not in (0,30) or extract(minute from p_end) not in (0,30)
    or extract(second from p_start)<>0 or extract(second from p_end)<>0 then
    raise exception 'invalid calendar range' using errcode='22023';
  end if;
  insert into public.appointment_slots as s (doctor_id,local_day,starts_at,status)
  select p_doctor,p_day,instant,p_status
  from pg_catalog.generate_series((p_day+p_start) at time zone 'Africa/Casablanca',
    (p_day+p_end) at time zone 'Africa/Casablanca' - interval '30 minutes',interval '30 minutes') as instant
  where instant > now()
  on conflict (doctor_id,starts_at) do update set status=excluded.status
  where s.status <> 'booked' and s.status <> excluded.status;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create function public.calendar_book(p_slot uuid, p_patient uuid)
returns table (id uuid, doctor_id uuid, starts_at timestamptz)
language sql volatile security invoker set search_path = ''
as $$
  update public.appointment_slots s set status='booked',patient_id=p_patient
  where s.id=p_slot and s.status='available' and s.starts_at > now()
    and exists (select 1 from public.users u where u.id=s.doctor_id and u.role='medecin' and u.is_active)
    and exists (select 1 from public.users u where u.id=p_patient and u.role='patient' and u.is_active)
  returning s.id,s.doctor_id,s.starts_at;
$$;

revoke all on function public.calendar_doctors() from public, anon, authenticated;
revoke all on function public.calendar_set_range(uuid,date,time,time,text) from public, anon, authenticated;
revoke all on function public.calendar_book(uuid,uuid) from public, anon, authenticated;
grant execute on function public.calendar_doctors(), public.calendar_set_range(uuid,date,time,time,text), public.calendar_book(uuid,uuid) to service_role;
