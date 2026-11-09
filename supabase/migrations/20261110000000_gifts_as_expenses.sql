-- Los regalos pasan a ser gastos: un gasto con destinatario (recipient) es un regalo.
-- Así cuentan en el resumen y el informe como cualquier otro gasto, y los ve todo el hogar con su precio.

alter table public.expenses add column recipient text;  -- para quién es el regalo; null = gasto normal

-- Los regalos ya apuntados se convierten en gastos previstos de la categoría "regalos",
-- pagados por quien los apuntó. Los que eran sorpresa dejan de serlo.
insert into public.expenses (household_id, person_id, date, category, note, status, planned, created_by, recipient)
select g.household_id,
       (select p.id from public.people p
         where p.household_id = g.household_id and p.user_id = g.created_by limit 1),
       g.created_at::date, 'regalos', g.idea, 'planned', g.price, g.created_by, g.recipient
from public.gifts g;

drop table public.gifts;  -- se lleva sus políticas y su entrada en supabase_realtime
