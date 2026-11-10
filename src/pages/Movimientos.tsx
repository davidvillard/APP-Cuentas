// Movimientos: los gastos del mes por día, con buscador y filtros, y los gastos fijos.
import { useMemo, useState } from 'react';
import { Plus, Repeat, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Card, CardTitle, CategoryIcon, EmptyState, MonthSwitcher, NativeSelect, PageHeader } from '@/components/bits';
import { ExpenseRow } from '@/components/expenses';
import { useConfirm } from '@/components/confirm';
import { expenseValue, toNumber } from '@/lib/calc';
import { CATEGORIES, categoryName } from '@/lib/categories';
import { cap, dayLong, decimal, money, monthName } from '@/lib/format';
import { useApp } from '@/lib/store';
import type { Recurring } from '@/lib/types';
import { cn } from '@/lib/utils';

type Status = 'all' | 'real' | 'planned';

export function Movimientos() {
  const { data, ym, openSheet } = useApp();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [cat, setCat] = useState('');

  const month = useMemo(() => data.expenses.filter((e) => e.date.startsWith(ym)), [data.expenses, ym]);
  const paid = month.filter((e) => e.status === 'real').reduce((s, e) => s + expenseValue(e), 0);
  const pending = month.filter((e) => e.status === 'planned').reduce((s, e) => s + expenseValue(e), 0);

  const needle = q.trim().toLowerCase();
  const list = month
    .filter((e) => status === 'all' || e.status === status)
    .filter((e) => !cat || e.category === cat)
    .filter((e) => !needle || [e.note, categoryName(e.category), e.recipient ?? ''].some((s) => s.toLowerCase().includes(needle)))
    .sort((a, b) => b.date.localeCompare(a.date) || (a.status === 'planned' ? -1 : 1));
  const byDay = new Map<string, typeof list>();
  for (const e of list) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const filtered = Boolean(needle || cat || status !== 'all');

  return (
    <>
      <PageHeader title="Movimientos"><MonthSwitcher /></PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
        <Stat label="Pagado" value={money(paid)} />
        <Stat label="Previsto" value={money(pending)} tone="text-planned" />
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-10 pl-9" placeholder="Buscar gastos…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar gastos" />
        </div>
        <div className="flex gap-2">
          <Segmented value={status} onChange={setStatus} options={[['all', 'Todos'], ['real', 'Pagados'], ['planned', 'Previstos']]} />
          <NativeSelect className="w-auto" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría">
            <option value="">Categorías</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </div>
      </div>

      {list.length ? (
        <Card className="py-1 md:py-1">
          {[...byDay.entries()].map(([day, items]) => (
            <div key={day}>
              <p className="first-cap pt-4 pb-1 text-xs font-semibold tracking-wide text-muted-foreground">{dayLong(day)}</p>
              {items.map((e) => <ExpenseRow key={e.id} e={e} />)}
            </div>
          ))}
        </Card>
      ) : filtered ? (
        <EmptyState icon={Search} title="Nada coincide con la búsqueda" text="Prueba con otra palabra o quita los filtros.">
          <Button variant="outline" onClick={() => { setQ(''); setCat(''); setStatus('all'); }}><X /> Quitar filtros</Button>
        </EmptyState>
      ) : (
        <EmptyState icon={Plus} title={`Sin gastos en ${monthName(ym)}`} text="Apunta el primero. Si aún no lo has pagado, márcalo como previsto y saldrá en «Próximos pagos».">
          <Button variant="save" onClick={() => openSheet({ mode: 'new' })}><Plus /> Nuevo gasto</Button>
        </EmptyState>
      )}

      <Fixed />
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn('text-xl font-bold', tone)}>{value}</p>
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="inline-flex h-10 rounded-md border bg-muted p-0.5" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cn('rounded px-3 text-sm font-medium transition-colors', value === v ? 'bg-background shadow-xs' : 'text-muted-foreground hover:text-foreground')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Gastos fijos: plantillas que se apuntan solas cada mes. Se tocan desde una hoja con Guardar y Quitar. */
function Fixed() {
  const { data, personName } = useApp();
  const [open, setOpen] = useState<Recurring | null>(null);
  return (
    <Card className="mt-6">
      <CardTitle><span className="flex items-center gap-2"><Repeat className="size-4" /> Gastos fijos</span></CardTitle>
      <p className="-mt-1 mb-2 max-w-[62ch] text-sm text-muted-foreground">
        Se apuntan solos como previstos al empezar cada mes. Para añadir uno, marca «Se repite cada mes» al apuntar un gasto.
      </p>
      {data.recurring.length ? data.recurring.map((t) => (
        <button key={t.id} onClick={() => setOpen(t)} className="flex w-full items-center gap-3 border-b py-3 text-left last:border-b-0 hover:bg-accent/40">
          <CategoryIcon id={t.category} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{t.note || categoryName(t.category)}</span>
            <span className="block text-sm text-muted-foreground">{categoryName(t.category)} · {personName(t.person_id)} · día {t.day}</span>
          </span>
          <span className="font-semibold">{money(Number(t.amount))}</span>
        </button>
      )) : <p className="text-sm text-muted-foreground">Todavía no hay ninguno.</p>}
      <RecurringSheet t={open} onClose={() => setOpen(null)} />
    </Card>
  );
}

function RecurringSheet({ t, onClose }: { t: Recurring | null; onClose: () => void }) {
  const { actions } = useApp();
  const confirm = useConfirm();
  const [value, setValue] = useState('');
  const [shown, setShown] = useState<Recurring | null>(null);
  if (t && t !== shown) { setShown(t); setValue(decimal(Number(t.amount))); }
  const r = t ?? shown;
  const amount = toNumber(value);
  return (
    <Drawer open={Boolean(t)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerContent className="mx-auto w-full max-w-lg">
        {r && (
          <form onSubmit={async (e) => { e.preventDefault(); if (amount > 0 && await actions.saveRecurringAmount(r, amount)) onClose(); }}>
            <DrawerHeader>
              <DrawerTitle>{cap(r.note || categoryName(r.category))}</DrawerTitle>
              <DrawerDescription>Gasto fijo, el día {r.day} de cada mes. El importe nuevo se aplica a los meses que aún no se han apuntado.</DrawerDescription>
            </DrawerHeader>
            <div className="px-4">
              <label className="text-sm font-medium text-muted-foreground">Importe
                <Input autoFocus className="mt-1.5 h-11 text-lg" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
              </label>
            </div>
            <DrawerFooter className="flex-row items-center">
              <Button
                type="button" variant="delete-ghost" className="mr-auto"
                onClick={async () => {
                  const ok = await confirm({
                    title: '¿Quitar este gasto fijo?',
                    text: `«${r.note || categoryName(r.category)}» dejará de apuntarse cada mes. Se borran sus previstos sin pagar; los que ya pagaste se quedan.`,
                    ok: 'Quitar',
                  });
                  if (ok && await actions.removeRecurring(r)) onClose();
                }}
              >
                <Trash2 /> Quitar
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button type="submit" variant="save" disabled={!(amount > 0)}>Guardar</Button>
            </DrawerFooter>
          </form>
        )}
      </DrawerContent>
    </Drawer>
  );
}
