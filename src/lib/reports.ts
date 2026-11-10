// Descargas: los gastos de un mes en CSV (Excel/Sheets) y el informe del mes como página HTML imprimible.
import { expenseValue, monthSummary, monthsWithData } from './calc';
import { CATEGORIES, categoryName } from './categories';
import { cap, decimal, money, monthLong } from './format';
import type { Data } from './types';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csvFor(d: Data, ym: string) {
  const who = (id: string | null) => (id ? d.people.find((p) => p.id === id)?.name ?? '' : 'Común');
  const num = (v: number | null) => (v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ','));
  const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows: unknown[][] = [['Fecha', 'Concepto', 'Categoría', 'Para quién', 'Estado', 'Previsto', 'Pagado', 'Quién paga']];
  for (const e of d.expenses.filter((x) => x.date.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([e.date, e.note, categoryName(e.category), e.recipient ?? '', e.status === 'planned' ? 'Previsto' : 'Pagado',
      num(e.planned == null ? null : Number(e.planned)), num(e.status === 'planned' ? null : Number(e.amount)), who(e.person_id)]);
  }
  return '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n'); // BOM para que Excel lea las tildes
}

export function reportFor(d: Data, ym: string, householdName: string) {
  const ms = monthsWithData(d, ym);
  const m = monthSummary(d, ym);
  const cell = (c: string, right: boolean) => `<td style="padding:7px 10px;border-bottom:1px solid #e2e6ed;${right ? 'text-align:right' : ''}">${c}</td>`;
  const head = (cols: string[]) => `<tr>${cols.map((c, i) => `<th style="padding:7px 10px;border-bottom:2px solid #1d2a44;text-align:${i ? 'right' : 'left'}">${c}</th>`).join('')}</tr>`;
  const row = (cols: string[]) => `<tr>${cols.map((c, i) => cell(c, i > 0)).join('')}</tr>`;
  const table = (body: string) => `<table style="border-collapse:collapse;width:100%">${body}</table>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe de ${monthLong(ym)} – Tilo</title></head>
  <body style="font-family:system-ui,sans-serif;color:#1d2a44;max-width:820px;margin:40px auto;padding:0 20px;line-height:1.5">
  <h1 style="margin:0 0 4px">Informe de ${monthLong(ym)}</h1>
  <p style="color:#5a6578;margin:0 0 28px">${esc(householdName)} · generado el ${new Date().toLocaleDateString('es-ES')}</p>
  <h2>Resumen</h2>${table(
    row(['Ingresos', money(m.income.total)]) + (m.income.estimated > 0.5 ? row(['de ellos, estimados', money(m.income.estimated)]) : '') +
    row(['Gastado', money(m.spending.paid)]) + row(['Previsto sin pagar', money(m.spending.pending)]) +
    row(['Objetivo de ahorro', money(m.goal)]) + row(['<b>Ahorro</b>', `<b>${money(m.left)}</b>`]) +
    row(['Diferencia con el objetivo', money(m.left - m.goal)]))}
  <h2>Ingresos por trabajo</h2>${table(head(['Persona y trabajo', 'Horas', 'Importe']) + m.income.rows.map((r) =>
    row([`${esc(d.people.find((p) => p.id === r.job.person_id)?.name)} · ${esc(r.job.name)}`, r.job.type === 'fixed' ? 'fijo' : decimal(r.hours + r.estHours), money(r.amount + r.estimate)])).join(''))}
  <h2>Por categoría</h2>${table(head(['Categoría', 'Gastado', 'Presupuesto']) + CATEGORIES.map((c) => {
    const v = m.spending.byCategory[c.id] ?? { paid: 0, pending: 0 };
    const b = Number(m.plan.budgets?.[c.id] ?? 0);
    return v.paid || v.pending || b ? row([c.name, money(v.paid + v.pending), b ? money(b) : '—']) : '';
  }).join(''))}
  <h2>Meses con datos</h2>${table(head(['Mes', 'Ingresos', 'Gastos', 'Objetivo', 'Ahorro']) + ms.map((x) =>
    row([cap(monthLong(x.ym)), money(x.income.total), money(x.spending.paid + x.spending.pending), money(x.goal), money(x.left)])).join(''))}
  <h2>Gastos del mes</h2>${table(head(['Fecha y concepto', 'Estado', 'Importe']) + [...m.spending.list].sort((a, b) => a.date.localeCompare(b.date)).map((e) =>
    row([`${e.date} · ${esc(e.note) || categoryName(e.category)}${e.recipient ? ` (para ${esc(e.recipient)})` : ''}`,
      e.status === 'planned' ? 'Previsto' : e.planned != null ? `Pagado (previsto ${money(Number(e.planned))})` : 'Pagado', money(expenseValue(e))])).join(''))}
  </body></html>`;
}
