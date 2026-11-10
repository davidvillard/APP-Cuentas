// Datos de ejemplo para el modo demo: Alex (sueldo fijo, 14 pagas) y Sara (camarera por horas + clases).
// En la demo entras como Sara; Alex tiene su propia cuenta, así que su perfil se ve pero no se edita.
import { addDays, addMonths, todayIso, weekStart } from './calc';
import type { Data, Expense, Shift } from './types';

export function exampleData(): Data {
  const today = todayIso();
  const current = today.slice(0, 7);
  const months = [-3, -2, -1, 0].map((m) => addMonths(current, m));

  const people = [
    { id: 'p-alex', name: 'Alex', user_id: 'demo-alex' },
    { id: 'p-sara', name: 'Sara', user_id: 'demo' },
  ];
  const jobs: Data['jobs'] = [
    { id: 'j-dev', person_id: 'p-alex', name: 'Programador', type: 'fixed', monthly_net: 2150, payments: 14, hourly_rate: null, usual_hours: 40 },
    { id: 'j-bar', person_id: 'p-sara', name: 'Camarera', type: 'hourly', monthly_net: null, payments: null, hourly_rate: 9.8, usual_hours: 32 },
    { id: 'j-eng', person_id: 'p-sara', name: 'Clases de inglés', type: 'hourly', monthly_net: null, payments: null, hourly_rate: 15, usual_hours: 3 },
  ];

  const patterns = [[6, 6, 0, 8, 8, 8, 0], [0, 6, 6, 6, 8, 8, 0], [6, 0, 6, 8, 8, 8, 4], [6, 6, 6, 0, 8, 8, 0], [0, 0, 6, 6, 8, 10, 6]];
  const shifts: Shift[] = [];
  const lastWeek = addDays(weekStart(today), 7);
  for (let w = weekStart(`${months[0]}-01`), k = 0; w <= lastWeek; w = addDays(w, 7), k++) {
    shifts.push({ job_id: 'j-bar', week_start: w, hours: patterns[k % patterns.length] });
    shifts.push({ job_id: 'j-eng', week_start: w, hours: [0, 1.5, 0, 1.5, 0, 0, 0] });
  }

  let seed = 7;
  const rnd = (a: number, b: number) => {
    seed = (seed * 9301 + 49297) % 233280;
    return Math.round((a + ((b - a) * seed) / 233280) * 100) / 100;
  };
  const expenses: Expense[] = [];
  let id = 0;
  const add = (date: string, category: string, amount: number | null, note: string, person_id: string | null, extra: Partial<Expense> = {}) => {
    if (date > today && extra.status !== 'planned') return;
    expenses.push({ id: `e-${++id}`, date, category, amount, planned: null, status: 'real', note, person_id, recurring_id: null, recipient: null, ...extra });
  };
  for (const ym of months) {
    add(`${ym}-01`, 'vivienda', 750, 'Alquiler', 'p-alex', { recurring_id: 'r-alquiler' });
    add(`${ym}-05`, 'facturas', rnd(48, 75), 'Luz', 'p-alex');
    add(`${ym}-08`, 'facturas', 35, 'Fibra y móvil', 'p-sara', { recurring_id: 'r-fibra' });
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
  // Regalos de Navidad: son gastos con destinatario.
  add(addDays(today, -1), 'regalos', 32, 'Bufanda de lana', 'p-sara', { planned: 35, recipient: 'Mamá' });
  add(addDays(today, 9), 'regalos', null, 'Auriculares', 'p-sara', { status: 'planned', planned: 89, recipient: 'Alex' });
  add(addDays(today, 12), 'regalos', null, 'Juego de mesa', 'p-alex', { status: 'planned', planned: 28.5, recipient: 'Sobrinos' });
  expenses.sort((a, b) => b.date.localeCompare(a.date));

  const budgets = { vivienda: 750, supermercado: 400, facturas: 110, transporte: 40, ocio: 120, restaurantes: 100, salud: 30, ropa: 50, otros: 40 };
  const plans = { [months[0]]: { month: `${months[0]}-01`, savings_goal: 500, budgets } };

  // Gastos fijos: ya apuntados hasta este mes; al pasar al siguiente se apuntan solos como previstos.
  const recurring = [
    { id: 'r-alquiler', person_id: 'p-alex', category: 'vivienda', note: 'Alquiler', amount: 750, day: 1, start_month: `${months[0]}-01`, last_month: `${current}-01` },
    { id: 'r-fibra', person_id: 'p-sara', category: 'facturas', note: 'Fibra y móvil', amount: 35, day: 8, start_month: `${months[0]}-01`, last_month: `${current}-01` },
  ];

  return { people, jobs, shifts, expenses, plans, recurring };
}
