-- Regalos de Navidad: qué, para quién y cuánto cuesta.
-- Cada regalo es de quien lo apunta. Si es sorpresa (secret), nadie más del hogar lo ve.

create table public.gifts (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipient    text not null,
  idea         text not null,
  price        numeric(10,2) not null default 0 check (price >= 0),
  secret       boolean not null default false,
  created_at   timestamptz not null default now()
);
create index on public.gifts (household_id);

alter table public.gifts enable row level security;

create policy "ver regalos del hogar que no sean sorpresa, y los propios" on public.gifts
  for select using (is_member(household_id) and (not secret or created_by = auth.uid()));
create policy "apuntar regalos propios" on public.gifts
  for insert with check (is_member(household_id) and created_by = auth.uid());
create policy "editar regalos propios" on public.gifts
  for update using (is_member(household_id) and created_by = auth.uid())
  with check (is_member(household_id) and created_by = auth.uid());
create policy "borrar regalos propios" on public.gifts
  for delete using (is_member(household_id) and created_by = auth.uid());

alter publication supabase_realtime add table public.gifts;
