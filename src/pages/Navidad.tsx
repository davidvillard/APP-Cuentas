// Navidad: sección de temporada (1 de noviembre – 6 de enero), a todo el ancho, con dos pestañas.
// «Regalos que hago»: un regalo es un gasto con destinatario y pasa por tres fases:
//   idea (no cuenta en el resumen) → decidido (cuenta como previsto) → comprado (cuenta como pagado).
// Cada regalo tiene prioridad, que se ve en el color del paquete. «Listas de deseos»: components/wishes.
import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, Undo2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Tag } from '@/components/bits';
import { ExpenseAmount, LinkField } from '@/components/expenses';
import { WishLists } from '@/components/wishes';
import { LinkButton, PriorityLegend, XmasCard, XmasRow } from '@/components/xmas';
import { PriorityPicker } from '@/components/priority';
import { christmasSeason, expenseValue, toNumber } from '@/lib/calc';
import { dayShort, money, monthName, parseLink, safeLink, uuid } from '@/lib/format';
import { byPriority } from '@/lib/priority';
import type { Expense, Priority } from '@/lib/types';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';

type Tab = 'gifts' | 'lists';
const TABS: [Tab, string][] = [['gifts', 'Regalos que hago'], ['lists', 'Listas de deseos']];
// La pestaña elegida se recuerda en este navegador; si no se puede leer, se empieza por los regalos.
const readTab = (): Tab => { try { return localStorage.getItem('tilo.navidad') === 'lists' ? 'lists' : 'gifts'; } catch { return 'gifts'; } };
const writeTab = (t: Tab) => { try { localStorage.setItem('tilo.navidad', t); } catch { /* sin almacenamiento */ } };

export function Navidad() {
  const { data, today } = useApp();
  const [tab, setTab] = useState<Tab>(readTab);
  const { from, to } = christmasSeason(today);
  const inSeason = (e: Expense) => Boolean(e.recipient) && e.date >= from && e.date <= to;
  const order = (a: Expense, b: Expense) => byPriority(a, b) || a.recipient!.localeCompare(b.recipient!, 'es') || a.date.localeCompare(b.date);
  const groups = {
    decided: data.expenses.filter((e) => inSeason(e) && e.status === 'planned').sort(order),
    ideas: data.giftIdeas.filter(inSeason).sort(order),
    bought: data.expenses.filter((e) => inSeason(e) && e.status === 'real').sort(order),
  };
  const counted = [...groups.decided, ...groups.bought];
  const total = counted.reduce((s, e) => s + expenseValue(e), 0);

  return (
    <div className="xmas flex-1">
      <div className="xmas-lights" aria-hidden>{Array.from({ length: 40 }, (_, i) => <i key={i} />)}</div>
      <div className="mx-auto w-full max-w-5xl px-4 pb-28 md:px-8 md:pb-14">
        <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6 pt-4 pb-8 md:pt-6">
          <div>
            <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight md:text-5xl">Regalos de Navidad</h1>
            <p className="mt-3 max-w-[52ch] text-base text-[#fffdf8]/85 md:text-lg">
              {tab === 'lists'
                ? 'Apunta lo que te gustaría y mira qué quieren los demás. Desde su lista, «Regalar» lo pasa a tus regalos.'
                : 'Apunta ideas de regalo y, cuando lo tengas claro, márcalas como decididas: entonces cuentan como gasto previsto del mes. Lo ve todo el hogar.'}
            </p>
          </div>
          {counted.length > 0 && (
            <div className="xmas-tag">
              <b className="text-3xl font-extrabold tracking-tight">{money(total)}</b>
              <span className="text-sm font-semibold">
                {counted.length} {counted.length === 1 ? 'decidido' : 'decididos'}{groups.bought.length ? ` · ${groups.bought.length} ya ${groups.bought.length === 1 ? 'comprado' : 'comprados'}` : ''}
              </span>
            </div>
          )}
        </header>

        <div role="tablist" aria-label="Navidad" className="mb-6 inline-flex max-w-full rounded-full bg-black/25 p-1">
          {TABS.map(([id, label]) => (
            <button
              key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); writeTab(id); }}
              className={cn('rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors sm:px-5',
                tab === id ? 'bg-[#fffdf8] text-[#0d4a37]' : 'text-[#fffdf8]/80 hover:text-[#fffdf8]')}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'lists' ? <WishLists /> : <Gifts groups={groups} />}
      </div>
    </div>
  );
}

type Groups = { decided: Expense[]; ideas: Expense[]; bought: Expense[] };

function Gifts({ groups }: { groups: Groups }) {
  const { today, me, actions } = useApp();
  const [idea, setIdea] = useState('');
  const [recipient, setRecipient] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(today);
  const [link, setLink] = useState('');
  const [prio, setPrio] = useState<Priority>(2);
  const [decided, setDecided] = useState(false);
  const parsedLink = parseLink(link);
  const valid = idea.trim() && recipient.trim() && toNumber(price) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && parsedLink !== undefined;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const ok = await actions.saveExpense({
      id: uuid(), date, category: 'regalos', note: idea.trim(), recipient: recipient.trim(), person_id: me?.id ?? null,
      status: 'planned', planned: toNumber(price), amount: null, recurring_id: null, link: parsedLink ?? null,
      decided, priority: prio,
    }, decided ? `Regalo decidido: cuenta como previsto en ${monthName(date)}` : 'Idea apuntada: no cuenta en el resumen hasta que la decidas');
    if (ok) { setIdea(''); setRecipient(''); setPrice(''); setLink(''); setDecided(false); setPrio(2); }
  };

  const empty = !groups.decided.length && !groups.ideas.length && !groups.bought.length;
  return (
    <div className="flex flex-col gap-6">
      <XmasCard ribbon title="Apuntar un regalo" description="¿Es sorpresa? Ponle un nombre en clave: el precio se ve siempre.">
        <form onSubmit={add} className="grid grid-cols-2 gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_8rem_10rem]">
          <Field label="Regalo" className="col-span-2 md:col-span-1">
            <Input className="h-10" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Auriculares, un libro…" />
          </Field>
          <Field label="Para quién" className="col-span-2 md:col-span-1">
            <Input className="h-10" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Mamá, mi hermano…" />
          </Field>
          <Field label="Precio">
            <Input className="h-10" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00 €" />
          </Field>
          <Field label="Fecha">
            <Input className="h-10" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <LinkField className="col-span-2" value={link} onChange={setLink} invalid={parsedLink === undefined} />
          <PriorityPicker xmas className="col-span-2" value={prio} onChange={setPrio} />
          <label className="col-span-2 flex items-center gap-3 rounded-lg border p-3 md:col-span-3">
            <input type="checkbox" className="size-5 shrink-0 accent-[var(--income)]" checked={decided} onChange={(e) => setDecided(e.target.checked)} />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Ya lo tengo decidido</span>
              <span className="block text-xs text-muted-foreground">
                {decided ? 'Cuenta como gasto previsto del mes.' : 'Se guarda como idea: no cuenta en el resumen hasta que lo decidas.'}
              </span>
            </span>
          </label>
          <div className="col-span-2 flex items-end md:col-span-1">
            <Button type="submit" variant="save" size="lg" className="w-full" disabled={!valid}><Plus /> {decided ? 'Añadir regalo' : 'Añadir idea'}</Button>
          </div>
        </form>
      </XmasCard>

      <XmasCard title="Regalos" description="Las ideas no cuentan en el resumen. Cuando decides un regalo pasa a previsto, y al comprarlo, a pagado.">
        <PriorityLegend />
        {empty ? (
          <p className="text-sm text-muted-foreground">Todavía no hay ningún regalo. Empieza con el formulario de arriba.</p>
        ) : (
          <>
            <GiftGroup title="Decididos" hint="cuentan como previstos" list={groups.decided} />
            <GiftGroup title="Ideas" hint="aún no cuentan" list={groups.ideas} />
            <GiftGroup title="Comprados" list={groups.bought} />
          </>
        )}
      </XmasCard>
    </div>
  );
}

function GiftGroup({ title, hint, list }: { title: string; hint?: string; list: Expense[] }) {
  const { personName, actions, openSheet } = useApp();
  if (!list.length) return null;
  const sum = list.reduce((s, e) => s + expenseValue(e), 0);
  return (
    <section className="mt-5 first:mt-3" aria-label={title}>
      <h3 className="flex items-baseline justify-between gap-3 border-b pb-2 text-sm font-semibold">
        <span>{title} <span className="font-normal text-muted-foreground">· {list.length}{hint ? ` · ${hint}` : ''}</span></span>
        <span className="whitespace-nowrap">{money(sum)}</span>
      </h3>
      <ul className="divide-y">
        {list.map((e) => {
          const url = safeLink(e.link);
          const name = e.note || 'Regalo';
          const stage = e.status === 'real' ? 'bought' : e.decided ? 'decided' : 'idea';
          return (
            <XmasRow
              key={e.id} title={name} done={stage === 'bought'} faded={stage === 'idea'}
              priority={e.priority} onPriority={(p) => actions.giftPriority(e, p)}
              onOpen={() => openSheet({ mode: 'edit', expense: e })}
              meta={<>
                <span>Para {e.recipient} · paga {personName(e.person_id)} · {dayShort(e.date)}</span>
                {stage === 'bought' ? <Tag tone="good">comprado</Tag> : stage === 'decided' ? <Tag tone="plan">decidido</Tag> : <Tag tone="neutral">idea</Tag>}
              </>}
              price={<ExpenseAmount e={e} className={cn('font-bold', stage === 'idea' && 'text-muted-foreground')} />}
              actions={<>
                {stage === 'idea' && <Button variant="outline" size="sm" onClick={() => actions.decideGift(e, true)}><Check /> Decidido</Button>}
                {stage === 'decided' && <Button variant="outline" size="sm" onClick={() => openSheet({ mode: 'pay', expense: e })}><Wallet /> Comprado</Button>}
                {url && <LinkButton url={url} label={name} />}
                {stage === 'decided' && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Devolver ${name} a ideas`} title="Volver a ideas" onClick={() => actions.decideGift(e, false)}><Undo2 /></Button>
                )}
                <Button variant="ghost" size="icon-sm" className="hidden sm:inline-flex" aria-label={`Editar ${name}`} onClick={() => openSheet({ mode: 'edit', expense: e })}><Pencil /></Button>
                <Button variant="delete-ghost" size="icon-sm" aria-label={`Eliminar ${name}`} onClick={() => actions.deleteExpense(e)}><Trash2 /></Button>
              </>}
            />
          );
        })}
      </ul>
    </section>
  );
}
