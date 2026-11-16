-- Administradores del hogar y eliminar cuenta.
--
-- Un hogar puede tener varios administradores. Solo ellos pueden sacar a alguien del hogar y
-- nombrar o quitar administradores; siempre queda al menos uno. Quien crea un hogar es su admin.
--
-- Cuando alguien sale del hogar (lo echa un admin o elimina su cuenta) no se rompe nada: su perfil
-- se queda como perfil sin cuenta, con sus gastos, trabajos y horarios, y el resto del hogar puede
-- editarlo o borrarlo después. Si era el último administrador, pasa a serlo el miembro más antiguo;
-- si era el último miembro, el hogar se elimina con sus datos (ya no lo vería nadie).

alter table public.household_members add column is_admin boolean not null default false;

-- Admins actuales: David y Lua (con o sin tilde) en su hogar; en cualquier hogar que se quede sin
-- ninguno, el miembro que entró primero.
update public.household_members m set is_admin = true
from public.people p
where p.household_id = m.household_id and p.user_id = m.user_id
  and lower(translate(btrim(p.name), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) ~ '^(david|lua)( |$)';

update public.household_members m set is_admin = true
from (
  select distinct on (household_id) household_id, user_id
  from public.household_members
  where household_id not in (select household_id from public.household_members where is_admin)
  order by household_id, joined_at
) first
where m.household_id = first.household_id and m.user_id = first.user_id;

create or replace function public.is_admin(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members where household_id = h and user_id = auth.uid() and is_admin);
$$;

-- Quien crea el hogar es su administrador.
create or replace function public.create_household(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into households(name) values (coalesce(nullif(trim(p_name), ''), 'Mi casa')) returning id into h;
  insert into household_members(household_id, user_id, is_admin) values (h, auth.uid(), true);
  return h;
end $$;

-- Salir del hogar pasa siempre por aquí, para mantener las reglas de arriba. Por eso se quita
-- también el permiso directo de borrar tu fila de miembros (la app no lo usaba).
drop policy "cada uno puede salir del hogar" on public.household_members;

create or replace function public.detach_member(h uuid, u uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from household_members where household_id = h and user_id = u;
  update people set user_id = null where household_id = h and user_id = u;
  if not exists (select 1 from household_members where household_id = h) then
    delete from households where id = h;
  elsif not exists (select 1 from household_members where household_id = h and is_admin) then
    update household_members set is_admin = true
    where household_id = h and user_id = (
      select user_id from household_members where household_id = h order by joined_at limit 1);
  end if;
end $$;
revoke execute on function public.detach_member(uuid, uuid) from public, anon, authenticated;

-- Un admin saca a otro miembro del hogar. A uno mismo no: para eso está eliminar la cuenta.
create or replace function public.remove_member(p_household uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_household) then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'cannot_remove_self'; end if;
  if not exists (select 1 from household_members where household_id = p_household and user_id = p_user) then
    raise exception 'not_a_member';
  end if;
  perform detach_member(p_household, p_user);
end $$;

-- Un admin nombra o quita administradores. Siempre queda al menos uno.
create or replace function public.set_member_admin(p_household uuid, p_user uuid, p_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(p_household) then raise exception 'not_admin' using errcode = '42501'; end if;
  update household_members set is_admin = p_admin where household_id = p_household and user_id = p_user;
  if not found then raise exception 'not_a_member'; end if;
  if not exists (select 1 from household_members where household_id = p_household and is_admin) then
    raise exception 'last_admin';
  end if;
end $$;

-- Eliminar tu cuenta: sales de tus hogares (con las reglas de arriba) y se borra tu usuario.
-- Lo que apuntaste se queda en el hogar; «creado por» pasa a vacío.
alter table public.expenses drop constraint expenses_created_by_fkey,
  add constraint expenses_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
alter table public.wishes drop constraint wishes_created_by_fkey,
  add constraint wishes_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); h uuid;
begin
  if u is null then raise exception 'not_authenticated'; end if;
  for h in select household_id from household_members where user_id = u loop
    perform detach_member(h, u);
  end loop;
  delete from auth.users where id = u;
end $$;

revoke execute on function public.remove_member(uuid, uuid), public.set_member_admin(uuid, uuid, boolean),
  public.delete_my_account() from public, anon;
grant execute on function public.remove_member(uuid, uuid), public.set_member_admin(uuid, uuid, boolean),
  public.delete_my_account() to authenticated;

-- Que los cambios de miembros (admins, alguien que sale) lleguen en directo a los demás.
alter publication supabase_realtime add table public.household_members;
