import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthIncome, monthSummary, monthPlan, toNumber, weekStart, plannedVsPaid, recurringDue } from './calc.js';

test('gastos fijos: meses pendientes y día ajustado a meses cortos', () => {
  const t = { id: 'r', day: 31, last_month: '2026-12-01' };
  assert.deepEqual(recurringDue([t], '2027-03').map((d) => d.date), ['2027-01-31', '2027-02-28', '2027-03-31']);
  assert.deepEqual(recurringDue([t], '2026-12'), []);
  assert.deepEqual(recurringDue([{ ...t, day: 8 }], '2027-01').map((d) => d.date), ['2027-01-08']);
});

const base = { jobs: [], shifts: [], expenses: [], plans: {} };

test('toNumber acepta formato español', () => {
  assert.equal(toNumber('1.234,56'), 1234.56);
  assert.equal(toNumber('12,5'), 12.5);
  assert.equal(toNumber('12.5'), 12.5);
  assert.equal(toNumber('abc'), 0);
});

test('weekStart devuelve el lunes', () => {
  assert.equal(weekStart('2026-11-08'), '2026-11-02'); // domingo
  assert.equal(weekStart('2026-11-02'), '2026-11-02');
});

test('14 pagas: doble en junio y diciembre', () => {
  const data = { ...base, jobs: [{ id: 'a', type: 'fixed', monthly_net: 2000, payments: 14 }] };
  assert.equal(monthIncome(data, '2026-11').total, 2000);
  assert.equal(monthIncome(data, '2026-12').total, 4000);
});

test('por horas: horas apuntadas y estimación de semanas vacías', () => {
  // Febrero 2027: 1 lun a 28 dom = 4 semanas exactas
  const job = { id: 'j', type: 'hourly', hourly_rate: 10, usual_hours: 35 };
  const data = { ...base, jobs: [job], shifts: [{ job_id: 'j', week_start: '2027-02-01', hours: [8, 8, 0, 0, 8, 0, 0] }] };
  const r = monthIncome(data, '2027-02');
  assert.equal(r.rows[0].hours, 24);
  assert.ok(Math.abs(r.estimated - 3 * 35 * 10) < 1e-6);
  assert.ok(Math.abs(r.total - (240 + 1050)) < 1e-6);
});

test('ahorro = ingresos - pagado - previsto, y plan heredado', () => {
  const data = {
    ...base,
    jobs: [{ id: 'a', type: 'fixed', monthly_net: 2000, payments: 12 }],
    expenses: [
      { date: '2026-11-03', status: 'real', amount: 300, planned: 320, category: 'supermercado' },
      { date: '2026-11-20', status: 'planned', planned: 160, category: 'supermercado' },
    ],
    plans: { '2026-09': { savings_goal: 500, budgets: { supermercado: 400 } } },
  };
  const s = monthSummary(data, '2026-11');
  assert.equal(s.left, 1540);
  assert.equal(s.goal, 500);
  assert.equal(monthPlan(data, '2026-11').inheritedFrom, '2026-09');
  assert.equal(plannedVsPaid(data, '2026-11')[0].diff, -20);
});
