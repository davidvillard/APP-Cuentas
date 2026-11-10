// Navidad: sección de temporada (1 de noviembre – 6 de enero). Un regalo es un gasto con destinatario:
// cuenta en el resumen como previsto y lo ve todo el hogar, con su precio.
import { useState } from 'react';
import { Pencil, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag } from '@/components/bits';
import { ExpenseAmount } from '@/components/expenses';
import { christmasSeason, expenseValue, toNumber } from '@/lib/calc';
import { dayShort, monthName, uuid } from '@/lib/format';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';

const giftIcon = (i: number) => (
  <svg className={`gift-ico g${i % 3} size-8 shrink-0`} viewBox="0 0 24 24" aria-hidden>
    <path className="bow" d="M12 7C10.4 3.2 6 3.2 6 5.6 6 7.5 9.6 7.4 12 7Zm0 0c1.6-3.8 6-3.8 6-1.4 0 1.9-3.6 1.8-6 1.4Z" />
    <rect className="lid" x="3" y="7" width="18" height="4.5" rx="1" />
    <rect className="box" x="4.5" y="11.5" width="15" height="9.5" rx="1" />
    <rect className="rib" x="10.5" y="7" width="3" height="14" />
  </svg>
);

export function Navidad() {
  const { data, today, me, personName, actions, openSheet } = useApp();
  const { from, to } = christmasSeason(today);
  const gifts = data.expenses.filter((e) => e.recipient && e.date >= from && e.date <= to)
    .sort((a, b) => a.recipient!.localeCompare(b.recipient!, 'es') || a.date.localeCompare(b.date));
  const total = gifts.reduce((s, e) => s + expenseValue(e), 0);
  const bought = gifts.filter((e) => e.status === 'real').length;

  const [idea, setIdea] = useState('');
  const [recipient, setRecipient] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(today);
  const valid = idea.trim() && recipient.trim() && toNumber(price) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const ok = await actions.saveExpense({
      id: uuid(), date, category: 'regalos', note: idea.trim(), recipient: recipient.trim(), person_id: me?.id ?? null,
      status: 'planned', planned: toNumber(price), amount: null, recurring_id: null,
    }, `Regalo apuntado: cuenta como previsto en ${monthName(date)}`);
    if (ok) { setIdea(''); setRecipient(''); setPrice(''); }
  };

  return (
    <div className="xmas -mx-4 rounded-none px-4 pb-8 md:mx-0 md:rounded-2xl md:px-7">
      <div className="xmas-lights -mx-4 md:-mx-7" aria-hidden>{Array.from({ length: 30 }, (_, i) => <i key={i} />)}</div>
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 pt-2 pb-6">
        <div>
          <h1 className="text-4xl font-extrabold leading-none tracking-tight md:text-5xl">Regalos de Navidad</h1>
          <p className="max-w-[46ch] pt-3 text-[#fffdf8]/85">Apunta qué vas a regalar, a quién y cuánto cuesta. Cada regalo cuenta como un gasto previsto del mes y lo ve todo el hogar.</p>
        </div>
        {gifts.length > 0 && (
          <div className="xmas-tag">
            <b className="text-3xl font-extrabold tracking-tight">{new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: total % 1 ? 2 : 0 }).format(total)}</b>
            <span className="text-sm font-semibold">{gifts.length} {gifts.length === 1 ? 'regalo' : 'regalos'}{bought ? ` · ${bought} ya ${bought === 1 ? 'comprado' : 'comprados'}` : ''}</span>
          </div>
        )}
      </header>

      <form onSubmit={add} className="mb-5 overflow-hidden rounded-xl bg-background text-foreground">
        <div className="xmas-ribbon" />
        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_8rem_10rem]">
          <label className="col-span-2 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground md:col-span-1">Regalo
            <Input className="h-10" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Auriculares, un libro…" />
          </label>
          <label className="col-span-2 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground md:col-span-1">Para quién
            <Input className="h-10" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Mamá, mi hermano…" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">Precio
            <Input className="h-10" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00 €" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">Fecha
            <Input className="h-10" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 md:col-span-4">
            <span className="text-sm text-muted-foreground">¿Es sorpresa? Ponle un nombre en clave: el precio se ve siempre.</span>
            <Button type="submit" variant="save" disabled={!valid}>Añadir regalo</Button>
          </div>
        </div>
      </form>

      <section className="rounded-xl bg-background p-4 text-foreground md:p-5">
        <h2 className="pb-1 font-semibold">La lista</h2>
        {gifts.length ? gifts.map((e, i) => (
          <div key={e.id} className="flex items-center gap-3 border-b py-3 last:border-b-0">
            {giftIcon(i)}
            <button className="min-w-0 flex-1 text-left" onClick={() => openSheet({ mode: 'edit', expense: e })}>
              <span className={cn('block truncate font-medium', e.status === 'real' && 'text-muted-foreground line-through')}>{e.note || 'Regalo'}</span>
              <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                Para {e.recipient} · paga {personName(e.person_id)} · {dayShort(e.date)}
                {e.status === 'real' ? <Tag tone="good">comprado</Tag> : <Tag tone="plan">previsto</Tag>}
              </span>
            </button>
            <ExpenseAmount e={e} />
            <div className="flex shrink-0 items-center">
              {e.status === 'planned' && <Button variant="outline" size="sm" onClick={() => openSheet({ mode: 'pay', expense: e })}><Wallet /> <span className="hidden sm:inline">Comprado</span></Button>}
              <Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label={`Editar ${e.note}`} onClick={() => openSheet({ mode: 'edit', expense: e })}><Pencil /></Button>
              <Button variant="delete-ghost" size="icon" aria-label={`Eliminar ${e.note}`} onClick={() => actions.deleteExpense(e)}><Trash2 /></Button>
            </div>
          </div>
        )) : <p className="pt-2 text-sm text-muted-foreground">Todavía no hay ningún regalo en la lista.</p>}
      </section>
    </div>
  );
}
