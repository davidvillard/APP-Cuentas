-- Cambios en directo: Supabase Realtime avisa a la app cuando cambia una fila de estas tablas.
-- Los avisos respetan las reglas de seguridad (RLS): cada uno solo recibe los de su hogar.
alter publication supabase_realtime add table
  public.people,
  public.jobs,
  public.shifts,
  public.expenses,
  public.month_plans,
  public.recurring_expenses;
