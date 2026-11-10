import { describe, expect, test } from 'vitest';
import {
  christmasSeason, monthHasData, monthIncome, monthPlan, monthSummary, monthsWithData,
  plannedVsPaid, recurringDue, toNumber, weekStart,
} from './calc';
import type { Data, Expense, Job } from './types';

const job = (j: Partial<Job>): Job => ({
  id: 'a', person_id: 'p', name: 'x', type: 'fixed', monthly_net: null, payments: null, hourly_rate: null, usual_hours: 0, ...j,
});
const expense = (e: Partial<Expense>): Expense => ({
  id: Math.random().toString(36), date: '2026-11-01', category: 'otros', note: '', person_id: null,
  status: 'real', planned: null, amount: null, recurring_id: null, recipient: null, ...e,
});
const data = (d: Partial<Data>): Data => ({ people: [], jobs: [], shifts: [], expenses: [], plans: {}, recurring: [], ...d });

test('Navidad: visible del 1 de noviembre al 6 de enero, con los regalos de esa campaña', () => {
  expect(christmasSeason('2026-10-31').visible).toBe(false);
  expect(christmasSeason('2026-11-01')).toEqual({ year: 2026, visible: true, from: '2026-07-01', to: '2027-06-30' });
  expect(christmasSeason('2027-01-06')).toEqual({ year: 2026, visible: true, from: '2026-07-01', to: '2027-06-30' });
  expect(christmasSeason('2027-01-07').visible).toBe(false);
});

describe('meses con datos', () => {
  const d = data({
    jobs: [job({ monthly_net: 2000, payments: 12 })],
    expenses: [expense({ date: '2026-10-03', status: 'planned', planned: 50, category: 'ocio' })],
    plans: { '2026-08': { month: '2026-08-01', savings_goal: 500, budgets: {} } },
  });
  test('un mes cuenta solo si tiene gastos, previstos o plan propio', () => {
    expect(monthHasData(d, '2026-08')).toBe(true); // plan propio
    expect(monthHasData(d, '2026-09')).toBe(false); // solo hereda el plan de agosto y tiene sueldo
    expect(monthHasData(d, '2026-10')).toBe(true); // un previsto
  });
  test('el histórico se salta los meses vacíos', () => {
    expect(monthsWithData(d, '2026-11').map((m) => m.ym)).toEqual(['2026-08', '2026-10']);
  });
});

test('gastos fijos: meses pendientes y día ajustado a meses cortos', () => {
  const t = { day: 31, last_month: '2026-12-01' };
  expect(recurringDue([t], '2027-03').map((x) => x.date)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  expect(recurringDue([t], '2026-12')).toEqual([]);
  expect(recurringDue([{ ...t, day: 8 }], '2027-01').map((x) => x.date)).toEqual(['2027-01-08']);
});

test('toNumber acepta formato español', () => {
  expect(toNumber('1.234,56')).toBe(1234.56);
  expect(toNumber('12,5')).toBe(12.5);
  expect(toNumber('12.5')).toBe(12.5);
  expect(toNumber('abc')).toBe(0);
});

test('weekStart devuelve el lunes', () => {
  expect(weekStart('2026-11-08')).toBe('2026-11-02'); // domingo
  expect(weekStart('2026-11-02')).toBe('2026-11-02');
});

test('14 pagas: doble en junio y diciembre', () => {
  const d = data({ jobs: [job({ monthly_net: 2000, payments: 14 })] });
  expect(monthIncome(d, '2026-11').total).toBe(2000);
  expect(monthIncome(d, '2026-12').total).toBe(4000);
});

test('por horas: horas apuntadas y estimación de semanas vacías', () => {
  // Febrero 2027: del lunes 1 al domingo 28, 4 semanas exactas
  const d = data({
    jobs: [job({ id: 'j', type: 'hourly', hourly_rate: 10, usual_hours: 35 })],
    shifts: [{ job_id: 'j', week_start: '2027-02-01', hours: [8, 8, 0, 0, 8, 0, 0] }],
  });
  const r = monthIncome(d, '2027-02');
  expect(r.rows[0].hours).toBe(24);
  expect(r.estimated).toBeCloseTo(3 * 35 * 10);
  expect(r.total).toBeCloseTo(240 + 1050);
});

test('ahorro = ingresos - pagado - previsto, y plan heredado', () => {
  const d = data({
    jobs: [job({ monthly_net: 2000, payments: 12 })],
    expenses: [
      expense({ date: '2026-11-03', status: 'real', amount: 300, planned: 320, category: 'supermercado' }),
      expense({ date: '2026-11-20', status: 'planned', planned: 160, category: 'supermercado' }),
    ],
    plans: { '2026-09': { month: '2026-09-01', savings_goal: 500, budgets: { supermercado: 400 } } },
  });
  const s = monthSummary(d, '2026-11');
  expect(s.left).toBe(1540);
  expect(s.goal).toBe(500);
  expect(monthPlan(d, '2026-11').inheritedFrom).toBe('2026-09');
  expect(plannedVsPaid(d, '2026-11')[0].diff).toBe(-20);
});
