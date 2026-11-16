// Navidad: sección de temporada (1 de noviembre – 6 de enero), a todo el ancho, con dos pestañas.
// «Regalos que hago»: un regalo es un gasto con destinatario; cuenta en el resumen como previsto y lo ve
// todo el hogar, con su precio. «Listas de deseos»: lo que a cada uno le gustaría (components/wishes).
import { useState } from 'react';
import { Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Tag } from '@/components/bits';
import { ExpenseAmount, LinkField } from '@/components/expenses';
import { WishLists } from '@/components/wishes';
import { LinkButton, XmasCard, XmasRow } from '@/components/xmas';
import { christmasSeason, expenseValue, toNumber } from '@/lib/calc';
import { dayShort, money, monthName, parseLink, safeLink, uuid } from '@/lib/format';
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
  const gifts = data.expenses.filter((e) => e.recipient && e.date >= from && e.date <= to)
    .sort((a, b) => a.recipient!.localeCompare(b.recipient!, 'es') || a.date.localeCompare(b.date));
  const total = gifts.reduce((s, e) => s + expenseValue(e), 0);
  const bought = gifts.filter((e) => e.status === 'real').length;

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
                : 'Apunta qué vas a regalar, a quién y cuánto cuesta. Cada regalo cuenta como un gasto previsto del mes y lo ve todo el hogar.'}
            </p>
          </div>
          {gifts.length > 0 && (
            <div className="xmas-tag">
              <b className="text-3xl font-extrabold tracking-tight">{money(total)}</b>
              <span className="text-sm font-semibold">{gifts.length} {gifts.length === 1 ? 'regalo' : 'regalos'}{bought ? ` · ${bought} ya ${bought === 1 ? 'comprado' : 'comprados'}` : ''}</span>
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

        {tab === 'lists' ? <WishLists /> : <Gifts gifts={gifts} />}
      </div>
    </div>
  );
}

function Gifts({ gifts }: { gifts: ReturnType<typeof useApp>['data']['expenses'] }) {
  const { today, me, personName, actions, openSheet } = useApp();
  const [idea, setIdea] = useState('');
  const [recipient, setRecipient] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(today);
  const [link, setLink] = useState('');
  const parsedLink = parseLink(link);
  const valid = idea.trim() && recipient.trim() && toNumber(price) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && parsedLink !== undefined;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const ok = await actions.saveExpense({
      id: uuid(), date, category: 'regalos', note: idea.trim(), recipient: recipient.trim(), person_id: me?.id ?? null,
      status: 'planned', planned: toNumber(price), amount: null, recurring_id: null, link: parsedLink ?? null,
    }, `Regalo apuntado: cuenta como previsto en ${monthName(date)}`);
    if (ok) { setIdea(''); setRecipient(''); setPrice(''); setLink(''); }
  };

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
          <LinkField className="col-span-2 md:col-span-3" value={link} onChange={setLink} invalid={parsedLink === undefined} />
          <div className="col-span-2 flex items-end md:col-span-1">
            <Button type="submit" variant="save" size="lg" className="w-full" disabled={!valid}><Plus /> Añadir regalo</Button>
          </div>
        </form>
      </XmasCard>

      <XmasCard title="Regalos apuntados" description={gifts.length ? 'Ordenados por la persona que los recibe.' : undefined}>
        {gifts.length ? (
          <ul className="divide-y">
            {gifts.map((e, i) => {
              const url = safeLink(e.link);
              const name = e.note || 'Regalo';
              return (
                <XmasRow
                  key={e.id} index={i} title={name} done={e.status === 'real'}
                  onOpen={() => openSheet({ mode: 'edit', expense: e })}
                  meta={<>
                    <span>Para {e.recipient} · paga {personName(e.person_id)} · {dayShort(e.date)}</span>
                    {e.status === 'real' ? <Tag tone="good">comprado</Tag> : <Tag tone="plan">previsto</Tag>}
                  </>}
                  price={<ExpenseAmount e={e} className="font-bold" />}
                  actions={<>
                    {e.status === 'planned' && <Button variant="outline" size="sm" onClick={() => openSheet({ mode: 'pay', expense: e })}><Wallet /> Comprado</Button>}
                    {url && <LinkButton url={url} label={name} />}
                    <Button variant="ghost" size="icon-sm" aria-label={`Editar ${name}`} onClick={() => openSheet({ mode: 'edit', expense: e })}><Pencil /></Button>
                    <Button variant="delete-ghost" size="icon-sm" aria-label={`Eliminar ${name}`} onClick={() => actions.deleteExpense(e)}><Trash2 /></Button>
                  </>}
                />
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no hay ningún regalo apuntado. Empieza con el formulario de arriba.</p>
        )}
      </XmasCard>
    </div>
  );
}
