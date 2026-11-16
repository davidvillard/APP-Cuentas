-- Listas de deseos: lo que a cada uno le gustaría que le regalasen. Las ve todo el hogar;
-- cada uno edita la suya (y las de los perfiles sin cuenta), igual que perfiles y trabajos.

create table public.wishes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  person_id    uuid not null references public.people(id) on delete cascade,  -- de quién es la lista
  item         text not null check (length(btrim(item)) between 1 and 200),
  price        numeric(10,2) check (price is null or price >= 0),          -- aproximado, opcional
  link         text constraint wishes_link_http check (link is null or (link ~* '^https?://' and length(link) <= 2000)),
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index wishes_household on public.wishes (household_id);

alter table public.wishes enable row level security;
create policy "miembros ven las listas" on public.wishes
  for select using (is_member(household_id));
create policy "apuntar en tu lista" on public.wishes
  for insert with check (is_member(household_id) and can_edit_person(person_id));
create policy "editar tu lista" on public.wishes
  for update using (is_member(household_id) and can_edit_person(person_id))
  with check (is_member(household_id) and can_edit_person(person_id));
create policy "borrar de tu lista" on public.wishes
  for delete using (is_member(household_id) and can_edit_person(person_id));

-- La persona tiene que ser del mismo hogar (check_same_household ya mira person_id en cualquier tabla).
create trigger wishes_same_household before insert or update on public.wishes
  for each row execute function check_same_household();

alter publication supabase_realtime add table public.wishes;
