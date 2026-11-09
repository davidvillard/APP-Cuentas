-- Cada uno edita solo su perfil, sus trabajos y sus horarios; el resto del hogar los ve.
-- Los perfiles sin cuenta (user_id null) no son de nadie: los puede editar cualquier miembro.

create or replace function public.can_edit_person(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from people
    where id = p and is_member(household_id) and (user_id is null or user_id = auth.uid()));
$$;

create or replace function public.can_edit_job(j uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from jobs where id = j and can_edit_person(person_id));
$$;

-- Perfiles
drop policy "miembros gestionan people" on public.people;
create policy "miembros ven los perfiles" on public.people
  for select using (is_member(household_id));
create policy "crear tu perfil o uno sin cuenta" on public.people
  for insert with check (is_member(household_id) and (user_id is null or user_id = auth.uid()));
create policy "editar tu perfil o uno sin cuenta" on public.people
  for update using (is_member(household_id) and (user_id is null or user_id = auth.uid()))
  with check (is_member(household_id) and (user_id is null or user_id = auth.uid()));
create policy "borrar perfiles sin cuenta" on public.people
  for delete using (is_member(household_id) and user_id is null);

-- Trabajos
drop policy "miembros gestionan jobs" on public.jobs;
create policy "miembros ven los trabajos" on public.jobs
  for select using (is_member(household_id));
create policy "crear trabajos propios" on public.jobs
  for insert with check (is_member(household_id) and can_edit_person(person_id));
create policy "editar trabajos propios" on public.jobs
  for update using (is_member(household_id) and can_edit_person(person_id))
  with check (is_member(household_id) and can_edit_person(person_id));
create policy "borrar trabajos propios" on public.jobs
  for delete using (is_member(household_id) and can_edit_person(person_id));

-- Horarios
drop policy "miembros gestionan shifts" on public.shifts;
create policy "miembros ven los horarios" on public.shifts
  for select using (is_member(household_id));
create policy "apuntar horarios propios" on public.shifts
  for insert with check (is_member(household_id) and can_edit_job(job_id));
create policy "editar horarios propios" on public.shifts
  for update using (is_member(household_id) and can_edit_job(job_id))
  with check (is_member(household_id) and can_edit_job(job_id));
create policy "borrar horarios propios" on public.shifts
  for delete using (is_member(household_id) and can_edit_job(job_id));
