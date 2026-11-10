// Tipos de los datos tal como vienen de Supabase (y del modo demo).
// Los importes numeric de Postgres llegan como número; se leen siempre con n() en calc.ts por si llega null.

export type ID = string;

export interface Household {
  id: ID;
  name: string;
  invite_code: string;
}

export interface Person {
  id: ID;
  name: string;
  /** null = perfil sin cuenta: lo puede editar cualquiera del hogar */
  user_id: string | null;
  household_id?: ID;
  created_at?: string;
}

export type JobType = 'fixed' | 'hourly';

export interface Job {
  id: ID;
  person_id: ID;
  name: string;
  type: JobType;
  /** fijo: neto por paga */
  monthly_net: number | null;
  /** fijo: 12 o 14 pagas */
  payments: number | null;
  /** por horas: €/h */
  hourly_rate: number | null;
  usual_hours: number;
  household_id?: ID;
  created_at?: string;
}

export interface Shift {
  job_id: ID;
  /** lunes de la semana, YYYY-MM-DD */
  week_start: string;
  /** horas de lunes a domingo */
  hours: number[];
  household_id?: ID;
}

export type ExpenseStatus = 'planned' | 'real';

export interface Expense {
  id: ID;
  date: string;
  category: string;
  note: string;
  /** quién paga; null = común */
  person_id: ID | null;
  status: ExpenseStatus;
  /** importe previsto (se conserva al pagar para ver la diferencia) */
  planned: number | null;
  /** importe pagado */
  amount: number | null;
  recurring_id: ID | null;
  /** para quién es; con destinatario, el gasto es un regalo */
  recipient: string | null;
  household_id?: ID;
  created_by?: string;
  created_at?: string;
}

export interface MonthPlan {
  /** primer día del mes, YYYY-MM-01 */
  month: string;
  savings_goal: number;
  budgets: Record<string, number>;
  household_id?: ID;
}

export interface Recurring {
  id: ID;
  person_id: ID | null;
  category: string;
  note: string;
  amount: number;
  day: number;
  start_month: string;
  /** último mes ya apuntado, YYYY-MM-01 */
  last_month: string;
  household_id?: ID;
  created_at?: string;
}

export interface Data {
  people: Person[];
  jobs: Job[];
  shifts: Shift[];
  expenses: Expense[];
  /** por mes 'YYYY-MM' */
  plans: Record<string, MonthPlan>;
  recurring: Recurring[];
}

export type Table = 'people' | 'jobs' | 'shifts' | 'expenses' | 'month_plans' | 'recurring_expenses';

export interface Session {
  user: { id: string; email?: string };
}
