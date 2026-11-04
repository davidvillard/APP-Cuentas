-- Corrige check_same_household: la versión inicial fallaba en jobs, shifts y expenses
-- ("record new has no field ...") porque mezclaba columnas de varias tablas en una condición.
create or replace function public.check_same_household()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Cada tabla en su propio IF: plpgsql prepara la condición entera,
  -- y new.job_id no existe en jobs ni new.person_id en shifts.
  if tg_table_name = 'shifts' then
    if not exists (select 1 from jobs where id = new.job_id and household_id = new.household_id) then
      raise exception 'job_not_in_household';
    end if;
  elsif new.person_id is not null then
    if not exists (select 1 from people where id = new.person_id and household_id = new.household_id) then
      raise exception 'person_not_in_household';
    end if;
  end if;
  return new;
end $$;
