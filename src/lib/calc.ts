// Cálculos puros del presupuesto. No tocan la interfaz ni la base de datos.
// Fechas como texto 'YYYY-MM-DD' en hora local; meses como 'YYYY-MM'.
import type { Data, Expense, Job, MonthPlan, Recurring } from './types';

const pad = (v: number) => String(v).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayIso = () => isoDate(new Date());
export function addMonths(ym: string, months: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + months, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function addDays(s: string, days: number) {
  const d = parseDate(s);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}
/** Lunes de la semana de una fecha. */
export function weekStart(s: string) {
  const d = parseDate(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDate(d);
}
export function daysInMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${ym}-${pad(i + 1)}`);
}
/** Acepta "1.234,56", "1234,5" o "12.5". Devuelve 0 si no es un número. */
export function toNumber(v: unknown) {
  let s = String(v ?? '').trim().replace(/\s|€/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const x = parseFloat(s);
  return Number.isFinite(x) ? x : 0;
}
/** Lee un número de la base de datos (puede venir null). */
export const n = (v: unknown) => (v == null ? 0 : Number(v) || 0);

export interface IncomeRow {
  job: Job;
  amount: number;
  estimate: number;
  hours: number;
  estHours: number;
}

/**
 * Ingresos de un mes. Sueldo fijo: neto por paga (doble en junio y diciembre con 14 pagas).
 * Por horas: horas apuntadas × €/h; los días de semanas sin horario se estiman con las horas habituales.
 */
export function monthIncome(data: Pick<Data, 'jobs' | 'shifts'>, ym: string) {
  const shifts = new Map(data.shifts.map((s) => [`${s.job_id}_${s.week_start}`, s]));
  const days = daysInMonth(ym);
  const month = Number(ym.slice(5));
  const rows: IncomeRow[] = [];
  let total = 0;
  let estimated = 0;
  for (const job of data.jobs) {
    let amount = 0, estimate = 0, hours = 0, estHours = 0;
    if (job.type === 'fixed') {
      const extra = n(job.payments) === 14 && (month === 6 || month === 12);
      amount = n(job.monthly_net) * (extra ? 2 : 1);
    } else {
      for (const day of days) {
        const s = shifts.get(`${job.id}_${weekStart(day)}`);
        const i = (parseDate(day).getDay() + 6) % 7;
        if (s) hours += n(s.hours?.[i]);
        else estHours += n(job.usual_hours) / 7;
      }
      amount = hours * n(job.hourly_rate);
      estimate = estHours * n(job.hourly_rate);
    }
    rows.push({ job, amount, estimate, hours, estHours });
    total += amount + estimate;
    estimated += estimate;
  }
  return { total, estimated, rows };
}

export const expenseValue = (e: Pick<Expense, 'status' | 'planned' | 'amount'>) =>
  e.status === 'planned' ? n(e.planned) : n(e.amount);

export function monthSpending(data: Pick<Data, 'expenses'>, ym: string) {
  const list = data.expenses.filter((e) => (e.date || '').startsWith(ym));
  let paid = 0, pending = 0;
  const byCategory: Record<string, { paid: number; pending: number }> = {};
  for (const e of list) {
    const v = expenseValue(e);
    const key = e.status === 'planned' ? 'pending' : 'paid';
    if (key === 'pending') pending += v; else paid += v;
    (byCategory[e.category] ??= { paid: 0, pending: 0 })[key] += v;
  }
  return { paid, pending, byCategory, list };
}

export type PlanView = Pick<MonthPlan, 'savings_goal' | 'budgets'> & { inheritedFrom: string | null };

/** Plan del mes; si no existe se hereda el último mes anterior que tenga plan. */
export function monthPlan(data: Pick<Data, 'plans'>, ym: string): PlanView {
  if (data.plans[ym]) return { ...data.plans[ym], inheritedFrom: null };
  const prev = Object.keys(data.plans).filter((k) => k < ym).sort().pop();
  return prev
    ? { ...data.plans[prev], inheritedFrom: prev }
    : { savings_goal: 0, budgets: {}, inheritedFrom: null };
}

/**
 * Campaña de Navidad. La pestaña se ve del 1 de noviembre al 6 de enero (Reyes);
 * sus regalos son los gastos con destinatario fechados entre julio de ese año y junio del siguiente.
 */
export function christmasSeason(today: string) {
  const [y, m, d] = today.split('-').map(Number);
  const year = m === 1 ? y - 1 : y; // en enero sigue siendo la Navidad del año anterior
  return { year, visible: m >= 11 || (m === 1 && d <= 6), from: `${year}-07-01`, to: `${year + 1}-06-30` };
}

/** Un mes cuenta para el informe si se le apuntó algo: un gasto, un previsto o su propio presupuesto u objetivo. */
export function monthHasData(data: Pick<Data, 'plans' | 'expenses'>, ym: string) {
  return Boolean(data.plans[ym]) || data.expenses.some((e) => (e.date || '').startsWith(ym));
}

export function monthSummary(data: Data, ym: string) {
  const income = monthIncome(data, ym);
  const spending = monthSpending(data, ym);
  const plan = monthPlan(data, ym);
  const goal = n(plan.savings_goal);
  const left = income.total - spending.paid - spending.pending;
  return { ym, income, spending, plan, goal, left };
}
export type MonthSummary = ReturnType<typeof monthSummary>;

/**
 * Meses que le faltan por apuntar a cada gasto fijo, hasta upToYm incluido.
 * El día se ajusta al último del mes si el mes es más corto.
 */
export function recurringDue(templates: Pick<Recurring, 'day' | 'last_month'>[] | undefined, upToYm: string) {
  const due: { template: (typeof templates & {})[number]; date: string }[] = [];
  for (const t of templates || []) {
    for (let ym = addMonths(t.last_month.slice(0, 7), 1); ym <= upToYm; ym = addMonths(ym, 1)) {
      const days = daysInMonth(ym);
      due.push({ template: t, date: days[Math.min(Number(t.day), days.length) - 1] });
    }
  }
  return due;
}

/** Gastos que eran previstos y ya se pagaron: diferencia negativa = gastaste menos. */
export function plannedVsPaid(data: Pick<Data, 'expenses'>, ym: string) {
  return data.expenses
    .filter((e) => e.status === 'real' && e.planned != null && (e.date || '').startsWith(ym))
    .map((e) => ({ expense: e, diff: n(e.amount) - n(e.planned) }));
}

/** Hasta `count` meses con algo apuntado, acabando en ym o antes; del más antiguo al más reciente. */
export function monthsWithData(data: Data, ym: string, count = 6) {
  const out: MonthSummary[] = [];
  for (let m = ym, i = 0; i < 36 && out.length < count; m = addMonths(m, -1), i++) {
    if (monthHasData(data, m)) out.unshift(monthSummary(data, m));
  }
  return out;
}

/** Ingreso mensual aproximado de un trabajo por horas (52 semanas / 12 meses). */
export const monthlyApprox = (rate: unknown, hours: unknown) => (n(rate) * n(hours) * 52) / 12;
