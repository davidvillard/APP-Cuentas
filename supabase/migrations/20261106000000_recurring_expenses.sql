-- Gastos fijos: plantillas que cada mes se apuntan solas como gasto previsto.
-- last_month es el último mes ya apuntado; así, si borras el gasto de un mes, no vuelve a aparecer.

create table public.recurring_expenses (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  person_id    uuid references public.people(id) on delete set null,  -- null = común
  category     text not null,
  note         text not null default '',
  amount       numeric(10,2) not null check (amount > 0),
  day          smallint not null check (day between 1 and 31),   -- en meses cortos, el último día
  start_month  date not null check (extract(day from start_month) = 1),
  last_month   date not null check (extract(day from last_month) = 1),
  created_at   timestamptz not null default now()
);

alter table public.recurring_expenses enable row level security;
create policy "miembros gestionan recurring_expenses" on public.recurring_expenses for all
  using (is_member(household_id)) with check (is_member(household_id));

-- Cada gasto apuntado desde una plantilla la recuerda; el índice evita duplicados
-- si los dos móviles apuntan el mismo mes a la vez.
alter table public.expenses
  add column recurring_id uuid references public.recurring_expenses(id) on delete set null;
create unique index expenses_recurring_date on public.expenses (recurring_id, date);

-- Misma comprobación de hogar, ahora también para plantillas y para el recurring_id de un gasto.
create or replace function public.check_same_household()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Cada tabla en su propio IF: plpgsql prepara la condición entera,
  -- y una columna que la tabla no tiene rompe la consulta.
  if tg_table_name = 'shifts' then
    if not exists (select 1 from jobs where id = new.job_id and household_id = new.household_id) then
      raise exception 'job_not_in_household';
    end if;
  else
    if new.person_id is not null then
      if not exists (select 1 from people where id = new.person_id and household_id = new.household_id) then
        raise exception 'person_not_in_household';
      end if;
    end if;
    if tg_table_name = 'expenses' then
      if new.recurring_id is not null then
        if not exists (select 1 from recurring_expenses where id = new.recurring_id and household_id = new.household_id) then
          raise exception 'recurring_not_in_household';
        end if;
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger recurring_same_household before insert or update on public.recurring_expenses
  for each row execute function check_same_household();
