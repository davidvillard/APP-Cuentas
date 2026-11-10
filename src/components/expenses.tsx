// Fila de gasto y hoja para apuntar, editar o pagar un gasto. La hoja se abre desde cualquier pantalla
// con openSheet(): sube desde abajo en el móvil y se centra en escritorio.
import { useEffect, useState } from 'react';
import { CalendarClock, Pencil, Repeat, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer';
import { CategoryIcon, Field, NativeSelect, Tag } from '@/components/bits';
import { expenseValue, toNumber } from '@/lib/calc';
import { CATEGORIES, category, categoryName } from '@/lib/categories';
import { dayLong, decimal, money, monthName, uuid } from '@/lib/format';
import { useApp, type SheetState } from '@/lib/store';
import type { Expense, Recurring } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Importe; si se pagó distinto de lo previsto, lo previsto va tachado delante. */
export function ExpenseAmount({ e, className }: { e: Expense; className?: string }) {
  const planned = e.status === 'planned';
  const changed = !planned && e.planned != null && Math.abs(Number(e.amount) - Number(e.planned)) > 0.004;
  return (
    <span className={cn('font-semibold whitespace-nowrap', planned && 'text-planned', className)}>
      {changed && <s className="mr-1.5 font-normal text-ink-3">{money(Number(e.planned))}</s>}
      {money(expenseValue(e))}
    </span>
  );
}

export function ExpenseRow({ e, showDate = false }: { e: Expense; showDate?: boolean }) {
  const { openSheet, personName, actions } = useApp();
  const planned = e.status === 'planned';
  const diff = !planned && e.planned != null ? Number(e.amount) - Number(e.planned) : 0;
  return (
    <div className="group flex items-center gap-3 border-b py-3 last:border-b-0">
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openSheet({ mode: 'edit', expense: e })}>
        <CategoryIcon id={e.category} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block font-medium break-words">{e.note || categoryName(e.category)}</span>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
            <span>{showDate ? dayLong(e.date) : categoryName(e.category)} · {personName(e.person_id)}{e.recipient ? ` · para ${e.recipient}` : ''}</span>
            {planned && <Tag tone="plan">previsto</Tag>}
            {e.recurring_id && <Tag tone="neutral"><Repeat className="mr-1 size-3" />cada mes</Tag>}
            {Math.abs(diff) > 0.004 && <Tag tone={diff < 0 ? 'good' : 'bad'}>{diff < 0 ? `${money(-diff)} menos` : `${money(diff)} más`}</Tag>}
          </span>
        </span>
        <ExpenseAmount e={e} />
      </button>
      <div className="flex shrink-0 items-center">
        {planned && (
          <Button variant="outline" size="sm" onClick={() => openSheet({ mode: 'pay', expense: e })}>
            <Wallet /> <span className="hidden sm:inline">Pagar</span>
          </Button>
        )}
        <Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label={`Editar ${e.note || 'gasto'}`} onClick={() => openSheet({ mode: 'edit', expense: e })}>
          <Pencil />
        </Button>
        <Button variant="delete-ghost" size="icon" aria-label={`Eliminar ${e.note || 'gasto'}`} onClick={() => actions.deleteExpense(e)}>
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

const LAST_PAYER = 'tilo.quienPaga';
const readLastPayer = () => { try { return localStorage.getItem(LAST_PAYER); } catch { return null; } };
const writeLastPayer = (v: string) => { try { localStorage.setItem(LAST_PAYER, v); } catch { /* sin almacenamiento */ } };

export function ExpenseSheet() {
  const { sheet, closeSheet } = useApp();
  // La hoja se queda montada al cerrar para que la animación de salida tenga contenido.
  const [last, setLast] = useState<SheetState | null>(sheet);
  useEffect(() => { if (sheet) setLast(sheet); }, [sheet]);
  const s = sheet ?? last;
  return (
    <Drawer open={Boolean(sheet)} onOpenChange={(open) => { if (!open) closeSheet(); }} repositionInputs={false}>
      <DrawerContent className="mx-auto max-h-[92svh] w-full max-w-lg">
        {s && (s.mode === 'pay'
          ? <PayForm key={s.expense.id} expense={s.expense} />
          : <ExpenseForm key={s.mode === 'edit' ? s.expense.id : 'new'} sheet={s} />)}
      </DrawerContent>
    </Drawer>
  );
}

function PayForm({ expense: e }: { expense: Expense }) {
  const { actions, closeSheet } = useApp();
  const [value, setValue] = useState(decimal(Number(e.planned)));
  const amount = toNumber(value);
  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!(amount > 0)) return;
    closeSheet();
    await actions.payExpense(e, amount);
  };
  return (
    <form onSubmit={save} className="flex flex-col">
      <DrawerHeader>
        <DrawerTitle>¿Cuánto has pagado?</DrawerTitle>
        <DrawerDescription>{e.note || categoryName(e.category)} · previsto {money(Number(e.planned))}</DrawerDescription>
      </DrawerHeader>
      <div className="px-4">
        <AmountInput value={value} onChange={setValue} />
      </div>
      <DrawerFooter className="flex-row justify-end">
        <Button type="button" variant="ghost" onClick={closeSheet}>Cancelar</Button>
        <Button type="submit" variant="save" disabled={!(amount > 0)}>Guardar pago</Button>
      </DrawerFooter>
    </form>
  );
}

function AmountInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-baseline gap-2 border-b-2 border-foreground/80 pb-1 focus-within:border-ring">
      <input
        autoFocus
        inputMode="decimal"
        placeholder="0"
        aria-label="Importe"
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        className="w-full min-w-0 bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-ink-3"
      />
      <span className="text-2xl font-semibold text-muted-foreground">€</span>
    </div>
  );
}

function ExpenseForm({ sheet }: { sheet: Exclude<SheetState, { mode: 'pay' }> }) {
  const { data, me, today, ym, actions, closeSheet } = useApp();
  const ed = sheet.mode === 'edit' ? sheet.expense : null;
  const defaults = sheet.mode === 'new' ? sheet.defaults ?? {} : {};
  const defaultDate = ym === today.slice(0, 7) ? today : `${ym}-01`;
  const lastPayer = readLastPayer();

  const [value, setValue] = useState(ed ? decimal(expenseValue(ed)) : '');
  const [cat, setCat] = useState(ed?.category ?? defaults.category ?? 'supermercado');
  const [date, setDate] = useState(ed?.date ?? defaults.date ?? defaultDate);
  const [who, setWho] = useState<string>(ed ? ed.person_id ?? '' : defaults.person_id ?? (lastPayer !== null && (lastPayer === '' || data.people.some((p) => p.id === lastPayer)) ? lastPayer : me?.id ?? ''));
  const [note, setNote] = useState(ed?.note ?? defaults.note ?? '');
  const [recipient, setRecipient] = useState(ed?.recipient ?? defaults.recipient ?? '');
  const [planned, setPlanned] = useState(ed ? ed.status === 'planned' : defaults.status === 'planned');
  const [repeat, setRepeat] = useState(false);

  const amount = toNumber(value);
  const isGift = cat === 'regalos';
  const valid = amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && (!isGift || recipient.trim());

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!valid) return;
    writeLastPayer(who);
    const fields = {
      date, category: cat, note: note.trim(), person_id: who || null,
      status: planned ? 'planned' as const : 'real' as const,
      recipient: isGift ? recipient.trim() : null,
    };
    closeSheet();
    if (ed) {
      // Al editar un gasto pagado se conserva lo previsto, para seguir viendo la diferencia.
      await actions.saveExpense({ ...ed, ...fields, planned: planned ? amount : ed.planned ?? null, amount: planned ? null : amount }, 'Gasto actualizado');
      return;
    }
    const row: Expense = { id: uuid(), ...fields, planned: planned ? amount : null, amount: planned ? null : amount, recurring_id: null };
    if (repeat) {
      const month = `${date.slice(0, 7)}-01`;
      const t: Recurring = { id: uuid(), person_id: row.person_id, category: cat, note: row.note, amount, day: Number(date.slice(8)), start_month: month, last_month: month };
      await actions.addRecurring(t, { ...row, recurring_id: t.id });
    } else {
      await actions.saveExpense(row, isGift ? `Regalo apuntado en ${monthName(date)}` : planned ? 'Gasto previsto añadido' : 'Gasto añadido');
    }
  };

  return (
    <form onSubmit={save} className="flex min-h-0 flex-col">
      <DrawerHeader className="pb-2">
        <DrawerTitle>{ed ? 'Editar gasto' : isGift ? 'Nuevo regalo' : 'Nuevo gasto'}</DrawerTitle>
        <DrawerDescription className="sr-only">Importe, categoría, fecha y quién paga</DrawerDescription>
      </DrawerHeader>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-2">
        <AmountInput value={value} onChange={setValue} />

        <fieldset>
          <legend className="pb-2 text-sm font-medium text-muted-foreground">Categoría</legend>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {CATEGORIES.map((c) => {
              const on = c.id === cat;
              return (
                <button
                  type="button" key={c.id} onClick={() => setCat(c.id)} aria-pressed={on}
                  className={cn('flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-medium leading-tight transition-colors',
                    on ? 'border-transparent text-white' : 'bg-background hover:bg-accent')}
                  style={on ? { background: category(c.id).color } : undefined}
                >
                  <c.icon className="size-5" style={on ? undefined : { color: c.color }} />
                  <span className="w-full truncate">{c.name}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {isGift && (
          <Field label="Para quién">
            <Input className="h-10" value={recipient} onChange={(ev) => setRecipient(ev.target.value)} placeholder="Mamá, mi hermano…" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha"><Input className="h-10" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} required /></Field>
          <Field label="Quién paga">
            <NativeSelect value={who} onChange={(ev) => setWho(ev.target.value)}>
              <option value="">Común</option>
              {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </NativeSelect>
          </Field>
        </div>
        <Field label="Concepto">
          <Input className="h-10" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder={isGift ? 'Auriculares, un libro…' : 'Compra semanal, cine, luz…'} />
        </Field>

        <div className="flex flex-col gap-2 pb-1">
          <Toggle checked={planned} onChange={setPlanned} icon={CalendarClock} label="Aún no lo he pagado" hint="Cuenta como previsto hasta que lo pagues." />
          {!ed && <Toggle checked={repeat} onChange={setRepeat} icon={Repeat} label="Se repite cada mes" hint="Se apuntará solo como previsto el mismo día de cada mes." />}
        </div>
      </div>
      <DrawerFooter className="flex-row items-center border-t pt-3">
        {ed && (
          <Button type="button" variant="delete-ghost" className="mr-auto" onClick={() => { closeSheet(); actions.deleteExpense(ed); }}>
            <Trash2 /> Eliminar
          </Button>
        )}
        <Button type="button" variant="ghost" className={ed ? '' : 'ml-auto'} onClick={closeSheet}>Cancelar</Button>
        <Button type="submit" variant="save" disabled={!valid}>{ed ? 'Guardar cambios' : 'Guardar'}</Button>
      </DrawerFooter>
    </form>
  );
}

function Toggle({ checked, onChange, icon: Icon, label, hint }: { checked: boolean; onChange: (v: boolean) => void; icon: React.ElementType; label: string; hint: string }) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors', checked ? 'border-foreground/30 bg-accent' : 'hover:bg-accent/60')}>
      <Icon className="size-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(ev) => onChange(ev.target.checked)} className="size-5 accent-[var(--primary)]" />
    </label>
  );
}
