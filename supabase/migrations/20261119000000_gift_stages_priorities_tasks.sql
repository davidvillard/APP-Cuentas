-- Regalos: idea, decidido o comprado, con prioridad. Lista de deseos: prioridad y quién lo regala.
-- Y una lista de pendientes del hogar (vender la radio, llamar al fontanero…).

-- Un regalo es una idea hasta que se decide (decided); comprado es status = 'real'.
-- Las ideas no cuentan en el resumen del mes; lo decidido cuenta como previsto (lo hace la app).
-- priority: 1 alta, 2 media, 3 baja. wish_id: el deseo de la lista de alguien que regala este gasto.
alter table public.expenses
  add column decided  boolean  not null default false,
  add column priority smallint not null default 2 check (priority between 1 and 3),
  add column wish_id  uuid references public.wishes(id) on delete set null;
-- Lo ya comprado está decidido. Lo que aún no se ha comprado queda como idea, para decidirlo.
update public.expenses set decided = true where recipient is not null and status = 'real';

alter table public.wishes
  add column priority smallint not null default 2 check (priority between 1 and 3);

-- Pendientes: cosas por hacer en casa. Las ve y las edita todo el hogar.
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title        text not null check (length(btrim(title)) between 1 and 200),
  note         text not null default '' check (length(note) <= 2000),
  person_id    uuid references public.people(id) on delete set null,  -- quién se encarga; null = cualquiera
  due          date,                                                  -- para cuándo, opcional
  priority     smallint not null default 2 check (priority between 1 and 3),
  done_at      timestamptz,                                           -- null = pendiente
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index tasks_household on public.tasks (household_id);

alter table public.tasks enable row level security;
create policy "miembros gestionan tasks" on public.tasks for all
  using (is_member(household_id)) with check (is_member(household_id));

-- Misma comprobación de hogar de siempre, ahora también para el deseo de un regalo.
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
      if new.wish_id is not null then
        if not exists (select 1 from wishes where id = new.wish_id and household_id = new.household_id) then
          raise exception 'wish_not_in_household';
        end if;
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger tasks_same_household before insert or update on public.tasks
  for each row execute function check_same_household();

alter publication supabase_realtime add table public.tasks;
