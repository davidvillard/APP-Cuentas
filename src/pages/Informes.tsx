// Informes: el informe de un solo mes (solo si ese mes tiene algo apuntado) y la comparación con
// los meses con datos. Descargas en CSV y como página imprimible.
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartColumnBig, Download, FileSpreadsheet, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardTitle, CategoryIcon, EmptyState, MonthSwitcher, PageHeader, Tag } from '@/components/bits';
import type { Route } from '@/components/AppShell';
import { monthHasData, monthSummary, monthsWithData, n, plannedVsPaid } from '@/lib/calc';
import { CATEGORIES, categoryName } from '@/lib/categories';
import { cap, money, money0, monthLong, monthName, monthShort } from '@/lib/format';
import { csvFor, download, reportFor } from '@/lib/reports';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';

export function Informes({ go }: { go: (r: Route) => void }) {
  const { data, ym, setYm, household, openSheet } = useApp();
  const history = monthsWithData(data, ym);

  if (!monthHasData(data, ym)) {
    const last = history.at(-1);
    return (
      <>
        <PageHeader title="Informes"><MonthSwitcher /></PageHeader>
        <EmptyState icon={ChartColumnBig} title={`${cap(monthLong(ym))} no tiene informe`} text={`En ${monthName(ym)} no hay gastos, previstos ni presupuesto apuntados, así que el mes no cuenta. El informe aparece en cuanto apuntes algo.`}>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="save" onClick={() => { go('movimientos'); openSheet({ mode: 'new' }); }}><Plus /> Apuntar un gasto</Button>
            {last && <Button variant="outline" onClick={() => setYm(last.ym)}>Ver {monthLong(last.ym)}</Button>}
          </div>
        </EmptyState>
      </>
    );
  }

  const m = monthSummary(data, ym);
  const comps = plannedVsPaid(data, ym);
  const compTotal = comps.reduce((s, c) => s + c.diff, 0);
  const cats = CATEGORIES.map((c) => {
    const v = m.spending.byCategory[c.id] ?? { paid: 0, pending: 0 };
    return { c, total: v.paid + v.pending, b: n(m.plan.budgets?.[c.id]) };
  }).filter((r) => r.total || r.b);
  const chart = history.map((x) => ({ ym: x.ym, mes: monthShort(x.ym), Ingresos: Math.round(x.income.total), Gastado: Math.round(x.spending.paid), Previsto: Math.round(x.spending.pending) }));

  return (
    <>
      <PageHeader title="Informes"><MonthSwitcher /></PageHeader>

      <Card className="mb-5 md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Informe de {monthLong(ym)}</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => download(`gastos-${ym}.csv`, csvFor(data, ym), 'text/csv;charset=utf-8')}><FileSpreadsheet /> CSV</Button>
            <Button variant="outline" size="sm" onClick={() => download(`informe-${ym}.html`, reportFor(data, ym, household.name), 'text/html;charset=utf-8')}><Download /> Informe</Button>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Ingresos" value={money0(m.income.total)} note={m.income.estimated > 0.5 ? `${money0(m.income.estimated)} estimados` : undefined} />
          <Stat label="Gastado" value={money0(m.spending.paid)} />
          <Stat label="Previsto sin pagar" value={money0(m.spending.pending)} />
          <Stat label="Objetivo de ahorro" value={m.goal ? money0(m.goal) : '—'} />
          <Stat
            label="Ahorro" value={money0(m.left)} tone={m.left < 0 ? 'text-over' : 'text-income'}
            tag={m.goal > 0 ? (m.left >= m.goal ? <Tag tone="good">objetivo cumplido</Tag> : <Tag tone="bad">faltan {money0(m.goal - m.left)}</Tag>) : undefined}
          />
        </dl>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardTitle>Por categoría</CardTitle>
          {cats.length ? cats.map(({ c, total, b }) => {
            const diff = b - total;
            return (
              <div key={c.id} className="flex items-center gap-3 border-b py-2.5 last:border-b-0">
                <CategoryIcon id={c.id} size="sm" />
                <span className="min-w-0 flex-1 text-sm font-medium">{c.name}</span>
                <span className="text-right text-sm">
                  <b>{money(total)}</b>{b > 0 && <span className="text-muted-foreground"> / {money(b)}</span>}
                  {b > 0 && <span className={cn('block text-xs', diff >= 0 ? 'text-income' : 'text-over')}>{diff >= 0 ? 'sobran' : 'pasado'} {money(Math.abs(diff))}</span>}
                </span>
              </div>
            );
          }) : <p className="text-sm text-muted-foreground">Sin gastos este mes.</p>}
        </Card>
        <Card>
          <CardTitle>Previsto frente a pagado</CardTitle>
          {comps.length ? (
            <>
              {comps.map(({ expense: e, diff }) => (
                <div key={e.id} className="flex items-center justify-between gap-3 border-b py-2.5 last:border-b-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{e.note || categoryName(e.category)}</p>
                    <p className="text-xs text-muted-foreground">previsto {money(Number(e.planned))}, pagado {money(Number(e.amount))}</p>
                  </div>
                  <Tag tone={diff <= 0 ? 'good' : 'bad'}>{diff <= 0 ? '−' : '+'}{money(Math.abs(diff))}</Tag>
                </div>
              ))}
              <p className="pt-3 text-sm">En total, <b>{money(Math.abs(compTotal))}</b> {compTotal <= 0 ? 'menos' : 'más'} de lo previsto.</p>
            </>
          ) : <p className="text-sm text-muted-foreground">Cuando marques como pagado un gasto previsto, aquí verás la diferencia.</p>}
        </Card>
      </div>

      {history.length > 1 && (
        <Card className="mt-5">
          <CardTitle aside="solo los meses con algo apuntado">Comparado con otros meses</CardTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 0, left: 0, bottom: 0 }} onClick={(s) => { const p = (s as { activeLabel?: string } | null)?.activeLabel; const hit = chart.find((x) => x.mes === p); if (hit) setYm(hit.ym); }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} width={56} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} tickFormatter={(v) => money0(Number(v))} />
                <Tooltip formatter={(v) => money0(Number(v))} cursor={{ fill: 'var(--accent)' }} />
                <Bar dataKey="Ingresos" fill="var(--income)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Gastado" stackId="g" fill="var(--primary)" maxBarSize={28}>
                  {chart.map((x) => <Cell key={x.ym} fill={x.ym === ym ? 'var(--primary)' : '#4a5670'} />)}
                </Bar>
                <Bar dataKey="Previsto" stackId="g" fill="var(--planned)" radius={[3, 3, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Mes</th><th className="text-right font-medium">Ingresos</th><th className="text-right font-medium">Gastado</th><th className="text-right font-medium">Previsto</th><th className="text-right font-medium">Ahorro</th></tr></thead>
              <tbody>
                {history.map((x) => (
                  <tr key={x.ym} onClick={() => setYm(x.ym)} className={cn('cursor-pointer border-t hover:bg-accent/50', x.ym === ym && 'bg-accent')}>
                    <td className="py-2 font-medium">{cap(monthLong(x.ym))}</td>
                    <td className="text-right">{money0(x.income.total)}</td>
                    <td className="text-right">{money0(x.spending.paid)}</td>
                    <td className="text-right">{money0(x.spending.pending)}</td>
                    <td className={cn('text-right font-semibold', x.left < 0 ? 'text-over' : 'text-income')}>{money0(x.left)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function Stat({ label, value, note, tone, tag }: { label: string; value: string; note?: string; tone?: string; tag?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('text-2xl font-bold tracking-tight', tone)}>{value}</dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
      {tag && <dd className="pt-1">{tag}</dd>}
    </div>
  );
}
