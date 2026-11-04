// Datos de ejemplo para el modo demo: Alex (sueldo fijo, 14 pagas) y Sara (camarera por horas + clases).
import { addDays, addMonths, todayIso, weekStart } from './calc.js';

export function exampleData() {
  const today = todayIso();
  const current = today.slice(0, 7);
  const months = [-3, -2, -1, 0].map((n) => addMonths(current, n));

  const people = [
    { id: 'p-alex', name: 'Alex', user_id: 'demo' },
    { id: 'p-sara', name: 'Sara', user_id: null },
  ];
  const jobs = [
    { id: 'j-dev', person_id: 'p-alex', name: 'Programador', type: 'fixed', monthly_net: 2150, payments: 14, usual_hours: 40 },
    { id: 'j-bar', person_id: 'p-sara', name: 'Camarera', type: 'hourly', hourly_rate: 9.8, usual_hours: 32 },
    { id: 'j-eng', person_id: 'p-sara', name: 'Clases de inglés', type: 'hourly', hourly_rate: 15, usual_hours: 3 },
  ];

  const patterns = [[6, 6, 0, 8, 8, 8, 0], [0, 6, 6, 6, 8, 8, 0], [6, 0, 6, 8, 8, 8, 4], [6, 6, 6, 0, 8, 8, 0], [0, 0, 6, 6, 8, 10, 6]];
  const shifts = [];
  const lastWeek = addDays(weekStart(today), 7);
  for (let w = weekStart(`${months[0]}-01`), k = 0; w <= lastWeek; w = addDays(w, 7), k++) {
    shifts.push({ job_id: 'j-bar', week_start: w, hours: patterns[k % patterns.length] });
    shifts.push({ job_id: 'j-eng', week_start: w, hours: [0, 1.5, 0, 1.5, 0, 0, 0] });
  }

  let seed = 7;
  const rnd = (a, b) => {
    seed = (seed * 9301 + 49297) % 233280;
    return Math.round((a + ((b - a) * seed) / 233280) * 100) / 100;
  };
  const expenses = [];
  let id = 0;
  const add = (date, category, amount, note, person_id, extra = {}) => {
    if (date > today && extra.status !== 'planned') return;
    expenses.push({ id: `e-${++id}`, date, category, amount, planned: null, status: 'real', note, person_id, ...extra });
  };
  for (const ym of months) {
    add(`${ym}-01`, 'vivienda', 750, 'Alquiler', 'p-alex');
    add(`${ym}-05`, 'facturas', rnd(48, 75), 'Luz', 'p-alex');
    add(`${ym}-08`, 'facturas', 35, 'Fibra y móvil', 'p-sara');
    add(`${ym}-03`, 'transporte', 40, 'Abono de transporte', 'p-sara');
    for (const d of ['04', '11', '18', '25']) add(`${ym}-${d}`, 'supermercado', rnd(62, 118), 'Compra semanal', 'p-alex');
    add(`${ym}-09`, 'ocio', rnd(15, 40), 'Cine', 'p-sara');
    add(`${ym}-21`, 'ocio', rnd(20, 60), 'Concierto', null);
    add(`${ym}-14`, 'restaurantes', rnd(30, 55), 'Cena fuera', 'p-alex');
    add(`${ym}-27`, 'restaurantes', rnd(18, 35), 'Vermú', 'p-sara');
    if (ym === months[2]) add(`${ym}-16`, 'supermercado', 140.35, 'Compra grande del mes', 'p-alex', { planned: 160 });
  }
  add(addDays(today, 2), 'supermercado', null, 'Compra grande', 'p-alex', { status: 'planned', planned: 160 });
  add(addDays(today, 6), 'ocio', null, 'Escapada de fin de semana', null, { status: 'planned', planned: 120 });
  expenses.sort((a, b) => b.date.localeCompare(a.date));

  const budgets = { vivienda: 750, supermercado: 400, facturas: 110, transporte: 40, ocio: 120, restaurantes: 100, salud: 30, ropa: 50, otros: 40 };
  const plans = { [months[0]]: { month: `${months[0]}-01`, savings_goal: 500, budgets } };

  return { people, jobs, shifts, expenses, plans };
}
