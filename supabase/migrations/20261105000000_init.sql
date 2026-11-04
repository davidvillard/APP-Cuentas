-- Cuentas de Casa: esquema para Supabase (Postgres).
-- Se aplica con la integración de GitHub de Supabase, con `supabase db push`, o pegándolo en SQL Editor.
-- Login: lo gestiona Supabase Auth (email + contraseña, cifrada por Supabase).
-- Cada usuario pertenece a un hogar; los datos son del hogar y solo sus miembros los ven (RLS).

create extension if not exists pgcrypto;

-- Hogares y miembros ---------------------------------------------------------

create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Mi casa',
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_at  timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index on public.household_members (user_id);

-- security definer para que las políticas no se llamen a sí mismas en bucle
create or replace function public.is_member(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = h and user_id = auth.uid());
$$;

-- Crea un hogar y mete al usuario actual como miembro
create or replace function public.create_household(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into households(name) values (coalesce(nullif(trim(p_name), ''), 'Mi casa')) returning id into h;
  insert into household_members(household_id, user_id) values (h, auth.uid());
  return h;
end $$;

-- Une al usuario actual a un hogar con su código de invitación
create or replace function public.join_household(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select id into h from households where invite_code = upper(trim(p_code));
  if h is null then raise exception 'invalid_code'; end if;
  insert into household_members(household_id, user_id) values (h, auth.uid()) on conflict do nothing;
  return h;
end $$;

-- Datos del hogar --------------------------------------------------------------

-- Perfil de una persona del hogar (puede o no tener usuario propio)
create table public.people (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  name         text not null,
  created_at   timestamptz not null default now()
);

create table public.jobs (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  person_id    uuid not null references public.people(id) on delete cascade,
  name         text not null,
  type         text not null check (type in ('fixed', 'hourly')),
  monthly_net  numeric(10,2),                          -- fijo: neto por paga
  payments     smallint check (payments in (12, 14)),  -- fijo: 12 o 14 pagas
  hourly_rate  numeric(8,2),                           -- por horas: €/h
  usual_hours  numeric(5,2) not null default 0,        -- horas habituales por semana
  created_at   timestamptz not null default now()
);

-- Horas de un trabajo por horas en una semana (lunes a domingo)
create table public.shifts (
  household_id uuid not null references public.households(id) on delete cascade,
  job_id       uuid not null references public.jobs(id) on delete cascade,
  week_start   date not null check (extract(isodow from week_start) = 1),
  hours        numeric(4,2)[] not null check (array_length(hours, 1) = 7),
  primary key (job_id, week_start)
);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  person_id    uuid references public.people(id) on delete set null,  -- null = común
  date         date not null,
  category     text not null,
  note         text not null default '',
  status       text not null check (status in ('planned', 'real')),
  planned      numeric(10,2),   -- importe previsto
  amount       numeric(10,2),   -- importe pagado
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  check (status = 'real' and amount is not null or status = 'planned' and planned is not null)
);
create index on public.expenses (household_id, date);

-- Objetivo de ahorro y presupuesto por categoría de un mes
create table public.month_plans (
  household_id uuid not null references public.households(id) on delete cascade,
  month        date not null check (extract(day from month) = 1),
  savings_goal numeric(10,2) not null default 0,
  budgets      jsonb not null default '{}'::jsonb,  -- { "supermercado": 400, ... }
  primary key (household_id, month)
);

-- Seguridad por filas -----------------------------------------------------------

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.people            enable row level security;
alter table public.jobs              enable row level security;
alter table public.shifts            enable row level security;
alter table public.expenses          enable row level security;
alter table public.month_plans       enable row level security;

create policy "miembros ven su hogar" on public.households
  for select using (is_member(id));
create policy "miembros renombran su hogar" on public.households
  for update using (is_member(id)) with check (is_member(id));

create policy "miembros ven a los miembros" on public.household_members
  for select using (is_member(household_id));
create policy "cada uno puede salir del hogar" on public.household_members
  for delete using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['people', 'jobs', 'shifts', 'expenses', 'month_plans'] loop
    execute format('create policy "miembros gestionan %1$s" on public.%1$I for all
                    using (is_member(household_id)) with check (is_member(household_id))', t);
  end loop;
end $$;

-- Un trabajo y su persona deben ser del mismo hogar (lo mismo para horarios)
create or replace function public.check_same_household()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'jobs' and not exists
     (select 1 from people where id = new.person_id and household_id = new.household_id) then
    raise exception 'person_not_in_household';
  end if;
  if tg_table_name = 'shifts' and not exists
     (select 1 from jobs where id = new.job_id and household_id = new.household_id) then
    raise exception 'job_not_in_household';
  end if;
  if tg_table_name = 'expenses' and new.person_id is not null and not exists
     (select 1 from people where id = new.person_id and household_id = new.household_id) then
    raise exception 'person_not_in_household';
  end if;
  return new;
end $$;

create trigger jobs_same_household     before insert or update on public.jobs     for each row execute function check_same_household();
create trigger shifts_same_household   before insert or update on public.shifts   for each row execute function check_same_household();
create trigger expenses_same_household before insert or update on public.expenses for each row execute function check_same_household();

grant execute on function public.create_household(text), public.join_household(text) to authenticated;
