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
  /** enlace opcional (dónde comprar el regalo); solo http(s) */
  link?: string | null;
  /** regalo: false = idea (no cuenta en el resumen), true = decidido. Comprado es status 'real'. */
  decided?: boolean;
  /** 1 alta, 2 media, 3 baja (se usa en los regalos) */
  priority?: Priority;
  /** el deseo de la lista de alguien que este regalo cumple */
  wish_id?: ID | null;
  household_id?: ID;
  created_by?: string;
  created_at?: string;
}

/** 1 alta, 2 media, 3 baja. */
export type Priority = 1 | 2 | 3;

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

/** Algo de la lista de deseos de una persona: lo que le gustaría que le regalasen. */
export interface Wish {
  id: ID;
  /** de quién es la lista */
  person_id: ID;
  item: string;
  /** precio aproximado, opcional */
  price: number | null;
  link: string | null;
  priority?: Priority;
  household_id?: ID;
  created_at?: string;
}

/** Algo pendiente en casa: vender la radio, llamar al fontanero… */
export interface Task {
  id: ID;
  title: string;
  note: string;
  /** quién se encarga; null = cualquiera */
  person_id: ID | null;
  /** para cuándo, YYYY-MM-DD; opcional */
  due: string | null;
  priority: Priority;
  /** cuándo se hizo; null = pendiente */
  done_at: string | null;
  household_id?: ID;
  created_at?: string;
}

/** Cuenta que forma parte del hogar. Los admins pueden sacar a alguien y nombrar otros admins. */
export interface Member {
  user_id: string;
  is_admin: boolean;
  joined_at?: string;
}

export interface Data {
  people: Person[];
  jobs: Job[];
  shifts: Shift[];
  /** gastos que cuentan: todo menos las ideas de regalo */
  expenses: Expense[];
  /** regalos aún sin decidir: se ven en Navidad pero no cuentan en el resumen */
  giftIdeas: Expense[];
  /** por mes 'YYYY-MM' */
  plans: Record<string, MonthPlan>;
  recurring: Recurring[];
  wishes: Wish[];
  members: Member[];
  tasks: Task[];
}

export type Table = 'people' | 'jobs' | 'shifts' | 'expenses' | 'month_plans' | 'recurring_expenses' | 'wishes' | 'household_members' | 'tasks';

export interface Session {
  user: { id: string; email?: string };
}
