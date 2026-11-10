// Inicio: la frase del mes («En noviembre os quedarán…»), el reparto de los ingresos, el gasto por
// categoría frente al presupuesto, el objetivo de ahorro, los ingresos de cada uno y lo próximo por pagar.
import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Briefcase, CalendarClock, Check, PiggyBank, Plus, SquarePen, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Card, CardTitle, CategoryIcon, MonthSwitcher, PageHeader, Tag } from '@/components/bits';
import { ExpenseAmount } from '@/components/expenses';
import type { Route } from '@/components/AppShell';
import { monthSummary, n, toNumber } from '@/lib/calc';
import { CATEGORIES, category } from '@/lib/categories';
import { cap, dayShort, decimal, money, money0, monthLong, monthName } from '@/lib/format';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';

export function Inicio({ go }: { go: (r: Route) => void }) {
  const { data, ym, today, me, openSheet } = useApp();
  const M = monthSummary(data, ym);
  const { income, spending, goal, left } = M;
  const plural = data.people.length > 1;
  const isPast = ym < today.slice(0, 7);
  const verb = isPast ? (plural ? 'os quedaron' : 'te quedaron') : plural ? 'os quedarán' : 'te quedarán';
  const started = data.jobs.length > 0 || data.expenses.length > 0;

  const scale = Math.max(income.total, spending.paid + spending.pending, 1);
  const pct = (v: number) => `${Math.max(0, (v / scale) * 100)}%`;
  const goalPos = income.total > 0 && goal > 0 ? Math.min(100, ((income.total - goal) / scale) * 100) : null;
  const upcoming = spending.list.filter((e) => e.status === 'planned').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);

  return (
    <>
      <PageHeader title="Inicio"><MonthSwitcher /></PageHeader>

      {!started ? (
        <Checklist go={go} hasJob={data.jobs.length > 0} hasPartner={data.people.length > 1} onExpense={() => openSheet({ mode: 'new' })} />
      ) : (
        <div className="flex flex-col gap-5">
          <Card className="space-y-4 md:p-6">
            <h2 className="text-3xl font-bold leading-tight tracking-tight md:text-[2.6rem]">
              En {monthName(ym)} {verb}{' '}
              <span className={left < 0 ? 'text-over' : 'text-income'}>{money0(left)}</span>
            </h2>
            <p className="max-w-[62ch] text-muted-foreground">
              Entran <b className="text-foreground">{money0(income.total)}</b>
              {income.estimated > 0.5 && <> ({money0(income.estimated)} estimados por semanas sin horario)</>},{' '}
              {plural ? 'lleváis' : 'llevas'} gastados <b className="text-foreground">{money0(spending.paid)}</b>
              {spending.pending > 0 && <> y hay <b className="text-foreground">{money0(spending.pending)}</b> previstos</>}.
              {goal > 0 && (left >= goal
                ? <> El objetivo era ahorrar <b className="text-foreground">{money0(goal)}</b>: {plural ? 'vais' : 'vas'} <b className="text-foreground">{money0(left - goal)}</b> por encima.</>
                : <> El objetivo era ahorrar <b className="text-foreground">{money0(goal)}</b>: {plural ? 'os faltan' : 'te faltan'} <b className="text-foreground">{money0(goal - left)}</b>.</>)}
            </p>
            <div className="relative pt-1 pb-6">
              <div className="flex h-4 overflow-hidden rounded-md bg-muted" role="img" aria-label="Reparto de los ingresos del mes">
                <i className="block h-full bg-primary" style={{ width: pct(Math.min(spending.paid, scale)) }} />
                <i className="block h-full" style={{ width: pct(spending.pending), background: 'repeating-linear-gradient(135deg, var(--planned) 0 5px, #d18a1d 5px 10px)' }} />
                <i className="block h-full bg-income-soft" style={{ width: pct(Math.max(0, left)) }} />
                <i className="block h-full bg-over" style={{ width: pct(Math.max(0, -left)) }} />
              </div>
              {goalPos != null && (
                <div className="absolute top-0 bottom-3 w-0.5 bg-income" style={{ left: `${goalPos}%` }}>
                  <span className="absolute top-full -translate-x-1/2 pt-1 text-xs font-semibold whitespace-nowrap text-income">ahorro {money0(goal)}</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <Legend color="var(--primary)">Gastado</Legend>
              <Legend color="var(--planned)">Previsto</Legend>
              <Legend color="var(--income-soft)" ring>Libre</Legend>
              {left < 0 && <Legend color="var(--over)">Por encima de los ingresos</Legend>}
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Categories />
            <div className="flex flex-col gap-5">
              <Card>
                <CardTitle aside={upcoming.length ? undefined : 'nada pendiente'}><span className="flex items-center gap-2"><CalendarClock className="size-4" /> Próximos pagos</span></CardTitle>
                {upcoming.length ? upcoming.map((e) => (
                  <button key={e.id} onClick={() => openSheet({ mode: 'pay', expense: e })} className="flex w-full items-center gap-3 border-b py-2 text-left last:border-b-0 hover:bg-accent/50">
                    <CategoryIcon id={e.category} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.note || category(e.category).name}</span>
                    <span className="text-xs text-muted-foreground">{dayShort(e.date)}</span>
                    <ExpenseAmount e={e} className="text-sm" />
                  </button>
                )) : <p className="text-sm text-muted-foreground">Los gastos previstos de este mes aparecerán aquí para marcarlos como pagados.</p>}
              </Card>
              <Goal />
              <Card>
                <CardTitle>Ingresos</CardTitle>
                {data.people.map((p) => {
                  const rs = income.rows.filter((r) => r.job.person_id === p.id);
                  if (!rs.length) return null;
                  const total = rs.reduce((s, r) => s + r.amount + r.estimate, 0);
                  return (
                    <div key={p.id} className="flex items-start justify-between gap-3 border-b py-2.5 last:border-b-0">
                      <div className="min-w-0">
                        <p className="font-medium">{p.name}{p.id === me?.id && <span className="text-muted-foreground"> (tú)</span>}</p>
                        {rs.map((r) => (
                          <p key={r.job.id} className="text-sm text-muted-foreground">
                            {r.job.name}
                            {r.job.type === 'fixed'
                              ? n(r.job.payments) === 14 && /-(06|12)$/.test(ym) ? ', con paga extra' : ''
                              : `, ${decimal(r.hours) || 0} h${r.estHours > 0.1 ? ` + ${Math.round(r.estHours)} h estimadas` : ''}`}
                          </p>
                        ))}
                      </div>
                      <span className="font-semibold">{money(total)}</span>
                    </div>
                  );
                })}
                {!income.rows.length && <p className="text-sm text-muted-foreground">Sin trabajos. <button className="font-semibold text-ring" onClick={() => go('hogar')}>Añadir uno</button></p>}
              </Card>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Legend({ color, ring, children }: { color: string; ring?: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={cn('inline-block size-2.5 rounded-sm', ring && 'outline outline-1 outline-income')} style={{ background: color }} />
      {children}
    </span>
  );
}

/** Gasto por categoría con su presupuesto. Los presupuestos se editan en bloque y se guardan con un botón. */
function Categories() {
  const { data, ym, actions } = useApp();
  const M = monthSummary(data, ym);
  const { spending, plan } = M;
  const [editing, setEditing] = useState<Record<string, string> | null>(null);
  const rows = CATEGORIES.map((c) => {
    const v = spending.byCategory[c.id] ?? { paid: 0, pending: 0 };
    return { c, v, b: n(plan.budgets?.[c.id]), total: v.paid + v.pending };
  });
  const shown = editing ? rows : rows.filter((r) => r.b || r.total);
  const pie = rows.filter((r) => r.total > 0).map((r) => ({ name: r.c.name, value: Math.round(r.total * 100) / 100, color: r.c.color }));

  const save = async () => {
    const budgets: Record<string, number> = {};
    for (const [k, v] of Object.entries(editing!)) if (toNumber(v) > 0) budgets[k] = toNumber(v);
    if (await actions.savePlan({ budgets }, plan, `Presupuesto de ${monthName(ym)} guardado`)) setEditing(null);
  };

  return (
    <Card>
      <CardTitle aside={editing ? undefined : (
        <Button variant="ghost" size="sm" onClick={() => setEditing(Object.fromEntries(rows.map((r) => [r.c.id, decimal(r.b)])))}>
          <SquarePen /> Presupuesto
        </Button>
      )}>Por categoría</CardTitle>
      {plan.inheritedFrom && !editing && (
        <p className="-mt-1 mb-3 text-xs text-muted-foreground">Presupuesto copiado de {monthLong(plan.inheritedFrom)}.</p>
      )}
      {pie.length > 0 && !editing && (
        <div className="mb-2 h-44">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pie} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="92%" paddingAngle={1.5} strokeWidth={0} isAnimationActive={false}>
                {pie.map((p) => <Cell key={p.name} fill={p.color} />)}
              </Pie>
              <Tooltip formatter={(v) => money(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="flex flex-col">
        {shown.map(({ c, v, b, total }) => {
          const over = b > 0 && total > b;
          const max = Math.max(b, total, 1);
          return (
            <div key={c.id} className="flex items-center gap-3 border-b py-2.5 last:border-b-0">
              <CategoryIcon id={c.id} size="sm" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 font-medium">{c.name}{over && <Tag tone="bad">pasado</Tag>}</span>
                  {!editing && (
                    <span>
                      <b>{money(total)}</b>
                      {b > 0 && <span className="text-muted-foreground"> / {money(b)}</span>}
                    </span>
                  )}
                </div>
                {!editing && (
                  <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                    <i className="absolute inset-y-0 left-0 rounded-full bg-planned/50" style={{ width: `${(total / max) * 100}%` }} />
                    <i className={cn('absolute inset-y-0 left-0 rounded-full', over ? 'bg-over' : 'bg-primary')} style={{ width: `${(v.paid / max) * 100}%` }} />
                  </div>
                )}
              </div>
              {editing && (
                <Input
                  className="h-9 w-24 text-right" inputMode="decimal" placeholder="—"
                  aria-label={`Presupuesto de ${c.name}`}
                  value={editing[c.id]} onChange={(e) => setEditing({ ...editing, [c.id]: e.target.value })}
                />
              )}
            </div>
          );
        })}
        {!shown.length && <p className="text-sm text-muted-foreground">Sin gastos este mes.</p>}
      </div>
      {editing && (
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
          <Button variant="save" onClick={save}><Check /> Guardar presupuesto</Button>
        </div>
      )}
    </Card>
  );
}

function Goal() {
  const { data, ym, actions } = useApp();
  const M = monthSummary(data, ym);
  const [value, setValue] = useState<string | null>(null);
  const progress = M.goal > 0 ? Math.max(0, Math.min(100, (M.left / M.goal) * 100)) : 0;
  const save = async () => {
    if (await actions.savePlan({ savings_goal: toNumber(value) }, M.plan, 'Objetivo guardado')) setValue(null);
  };
  return (
    <Card>
      <CardTitle aside={value == null && (
        <Button variant="ghost" size="sm" onClick={() => setValue(decimal(M.goal))}><SquarePen /> {M.goal ? 'Cambiar' : 'Poner'}</Button>
      )}>
        <span className="flex items-center gap-2"><PiggyBank className="size-4" /> Objetivo de ahorro</span>
      </CardTitle>
      {value != null ? (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Input autoFocus className="h-10" inputMode="decimal" placeholder="Por ejemplo, 400" value={value} onChange={(e) => setValue(e.target.value)} aria-label={`Cuánto ahorrar en ${monthName(ym)}`} />
          <Button type="button" variant="ghost" onClick={() => setValue(null)}>Cancelar</Button>
          <Button type="submit" variant="save">Guardar</Button>
        </form>
      ) : M.goal > 0 ? (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Previsto {money0(Math.max(0, M.left))} de {money0(M.goal)}</span>
            <span className={cn('font-semibold', M.left >= M.goal ? 'text-income' : 'text-planned')}>{Math.round(progress)} %</span>
          </div>
          <Progress value={progress} className="h-2.5 [&>*]:bg-income" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Elige cuánto queréis ahorrar en {monthName(ym)} y verás si vais bien.</p>
      )}
    </Card>
  );
}

/** Primer uso: tres pasos para empezar. */
function Checklist({ go, hasJob, hasPartner, onExpense }: { go: (r: Route) => void; hasJob: boolean; hasPartner: boolean; onExpense: () => void }) {
  const steps = [
    { done: hasJob, icon: Briefcase, title: 'Añade tu trabajo', text: 'Sueldo fijo o por horas: así Tilo sabe cuánto entra cada mes.', action: () => go('hogar'), label: 'Ir a Hogar' },
    { done: false, icon: Plus, title: 'Apunta tu primer gasto', text: 'Con el botón verde «+». Si aún no lo has pagado, márcalo como previsto.', action: onExpense, label: 'Nuevo gasto' },
    { done: hasPartner, icon: UserPlus, title: 'Invita a tu pareja', text: 'Comparte el código de invitación que tienes en Hogar.', action: () => go('hogar'), label: 'Ver el código' },
  ];
  return (
    <Card className="md:p-6">
      <h2 className="text-2xl font-bold tracking-tight">{cap('empecemos')}</h2>
      <p className="pt-1 pb-4 text-muted-foreground">Tres pasos y Tilo os dirá cada mes cuánto os queda.</p>
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-center gap-4 rounded-lg border p-4">
            <span className={cn('grid size-10 shrink-0 place-items-center rounded-full', s.done ? 'bg-income text-white' : 'bg-muted text-muted-foreground')}>
              {s.done ? <Check className="size-5" /> : <s.icon className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{i + 1}. {s.title}</p>
              <p className="text-sm text-muted-foreground">{s.text}</p>
            </div>
            {!s.done && <Button variant="outline" onClick={s.action}>{s.label}</Button>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
