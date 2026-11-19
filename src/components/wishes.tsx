// Listas de deseos: lo que a cada uno le gustaría que le regalasen. Las ve todo el hogar; cada uno apunta
// en la suya (y en las de los perfiles sin cuenta) y le pone prioridad, que se ve en el color del paquete.
// Desde la lista de otro, «Regalar» abre la hoja de regalo ya rellena y lo deja decidido: a partir de ahí
// el resto ve «Lo regala X» para no repetir. En tu propia lista no se ve quién te regala qué.
import { useMemo, useState } from 'react';
import { Gift, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Field } from '@/components/bits';
import { LinkField } from '@/components/expenses';
import { LinkButton, PriorityLegend, XmasCard, XmasRow } from '@/components/xmas';
import { PriorityPicker } from '@/components/priority';
import { toNumber } from '@/lib/calc';
import { decimal, money, parseLink, safeLink, uuid } from '@/lib/format';
import { byPriority } from '@/lib/priority';
import { useApp } from '@/lib/store';
import type { Expense, Person, Priority, Wish } from '@/lib/types';
import { Tag } from '@/components/bits';

export function WishLists() {
  const { data, me } = useApp();
  const [editing, setEditing] = useState<Wish | null>(null);
  const people = [...data.people].sort((a, b) => Number(b.id === me?.id) - Number(a.id === me?.id)); // la tuya, primero
  // Qué deseo ya tiene regalo apuntado (decidido o comprado) y de quién.
  const taken = useMemo(() => {
    const m = new Map<string, Expense>();
    for (const e of [...data.expenses, ...data.giftIdeas]) if (e.wish_id) m.set(e.wish_id, e);
    return m;
  }, [data.expenses, data.giftIdeas]);
  return (
    <div className="flex flex-col gap-6">
      {people.map((p) => <PersonList key={p.id} person={p} taken={taken} onEdit={setEditing} />)}
      <WishSheet wish={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function PersonList({ person: p, taken, onEdit }: { person: Person; taken: Map<string, Expense>; onEdit: (w: Wish) => void }) {
  const { data, me, today, canEdit, personName, actions, openSheet } = useApp();
  const mine = p.id === me?.id;
  const editable = canEdit(p);
  const wishes = data.wishes.filter((w) => w.person_id === p.id).sort(byPriority);

  const give = (w: Wish) => openSheet({
    mode: 'new',
    defaults: {
      category: 'regalos', note: w.item, recipient: p.name, link: w.link, status: 'planned', planned: w.price, date: today,
      person_id: me?.id ?? null, decided: true, priority: w.priority ?? 2, wish_id: w.id,
    },
  });

  return (
    <XmasCard
      title={mine ? 'Mi lista' : `La lista de ${p.name}`}
      description={mine ? 'Lo que te gustaría que te regalasen. La ve todo el hogar.'
        : editable ? `${p.name} no tiene cuenta, así que cualquiera puede apuntar en su lista.`
        : 'Pulsa Regalar y se apunta en tus regalos con su precio y su enlace.'}
    >
      {wishes.length > 0 && <PriorityLegend editable={editable} />}
      {wishes.length ? (
        <ul className="divide-y">
          {wishes.map((w) => {
            const url = safeLink(w.link);
            // En tu propia lista no se ve si alguien ya te lo regala (sería un chivatazo).
            const gift = mine ? undefined : taken.get(w.id);
            const giver = gift && (gift.person_id === me?.id ? 'Lo regalas tú' : `Lo regala ${personName(gift.person_id)}`);
            return (
              <XmasRow
                key={w.id} title={w.item} priority={w.priority}
                onPriority={editable ? (pr: Priority) => actions.wishPriority(w, pr) : undefined}
                onOpen={editable ? () => onEdit(w) : undefined}
                faded={Boolean(gift)}
                meta={gift ? <>
                  <span>{giver}</span>
                  {gift.status === 'real' ? <Tag tone="good">comprado</Tag> : gift.decided ? <Tag tone="plan">decidido</Tag> : <Tag tone="neutral">idea</Tag>}
                </> : w.price ? 'Precio aproximado' : 'Sin precio'}
                price={w.price ? money(w.price) : undefined}
                actions={<>
                  {!mine && !gift && <Button variant="outline" size="sm" onClick={() => give(w)}><Gift /> Regalar</Button>}
                  {url && <LinkButton url={url} label={w.item} />}
                  {editable && (
                    <>
                      <Button variant="ghost" size="icon-sm" aria-label={`Editar ${w.item}`} onClick={() => onEdit(w)}><Pencil /></Button>
                      <Button variant="delete-ghost" size="icon-sm" aria-label={`Quitar ${w.item}`} onClick={() => actions.deleteWish(w)}><Trash2 /></Button>
                    </>
                  )}
                </>}
              />
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{mine ? 'Todavía no has apuntado nada.' : `${p.name} aún no ha apuntado nada.`}</p>
      )}

      {editable && <WishForm person={p} mine={mine} />}
    </XmasCard>
  );
}

function WishForm({ person, mine }: { person: Person; mine: boolean }) {
  const { actions } = useApp();
  const [item, setItem] = useState('');
  const [price, setPrice] = useState('');
  const [link, setLink] = useState('');
  const [prio, setPrio] = useState<Priority>(2);
  const parsedLink = parseLink(link);
  const valid = item.trim() && parsedLink !== undefined;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const ok = await actions.saveWish({
      id: uuid(), person_id: person.id, item: item.trim(), price: toNumber(price) > 0 ? toNumber(price) : null, link: parsedLink ?? null, priority: prio,
    }, mine ? 'Apuntado en tu lista' : `Apuntado en la lista de ${person.name}`);
    if (ok) { setItem(''); setPrice(''); setLink(''); setPrio(2); }
  };

  return (
    <form onSubmit={add} className="mt-5 grid grid-cols-[minmax(0,1fr)_7.5rem] gap-4 rounded-xl bg-muted/60 p-4 md:grid-cols-[minmax(0,1.3fr)_7.5rem_minmax(0,1fr)_auto]">
      <Field label={mine ? '¿Qué te gustaría?' : '¿Qué le gustaría?'}>
        <Input className="h-10 bg-background" value={item} onChange={(e) => setItem(e.target.value)} placeholder="Unas zapatillas, un libro…" maxLength={200} />
      </Field>
      <Field label="Precio aprox.">
        <Input className="h-10 bg-background" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Opcional" />
      </Field>
      <LinkField className="col-span-2 md:col-span-1 [&_input]:bg-background" value={link} onChange={setLink} invalid={parsedLink === undefined} />
      <PriorityPicker xmas className="col-span-2 md:col-span-3 [&_button]:bg-background" value={prio} onChange={setPrio} />
      <div className="col-span-2 flex items-end md:col-span-1">
        <Button type="submit" variant="save" size="lg" className="w-full" disabled={!valid}><Plus /> Añadir</Button>
      </div>
    </form>
  );
}

function WishSheet({ wish, onClose }: { wish: Wish | null; onClose: () => void }) {
  const { actions } = useApp();
  const [shown, setShown] = useState<Wish | null>(null);
  const [f, setF] = useState<{ item: string; price: string; link: string; priority: Priority }>({ item: '', price: '', link: '', priority: 2 });
  if (wish && wish !== shown) { setShown(wish); setF({ item: wish.item, price: decimal(wish.price), link: wish.link ?? '', priority: wish.priority ?? 2 }); }
  const w = wish ?? shown;
  const parsedLink = parseLink(f.link);
  const valid = f.item.trim() && parsedLink !== undefined;

  return (
    <Drawer open={Boolean(wish)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerContent className="mx-auto w-full max-w-lg">
        {w && (
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            const price = toNumber(f.price);
            if (await actions.saveWish({ ...w, item: f.item.trim(), price: price > 0 ? price : null, link: parsedLink ?? null, priority: f.priority }, 'Lista actualizada')) onClose();
          }}>
            <DrawerHeader>
              <DrawerTitle>Editar deseo</DrawerTitle>
              <DrawerDescription>Lo ve todo el hogar.</DrawerDescription>
            </DrawerHeader>
            <div className="flex flex-col gap-3 px-4">
              <Field label="Qué"><Input autoFocus className="h-10" value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} maxLength={200} /></Field>
              <Field label="Precio aprox."><Input className="h-10" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="Opcional" /></Field>
              <LinkField value={f.link} onChange={(v) => setF({ ...f, link: v })} invalid={parsedLink === undefined} />
              <PriorityPicker xmas value={f.priority} onChange={(v) => setF({ ...f, priority: v })} />
            </div>
            <DrawerFooter className="flex-row items-center">
              <Button type="button" variant="delete-ghost" className="mr-auto" onClick={() => { onClose(); actions.deleteWish(w); }}>
                <Trash2 /> Quitar
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button type="submit" variant="save" disabled={!valid}>Guardar</Button>
            </DrawerFooter>
          </form>
        )}
      </DrawerContent>
    </Drawer>
  );
}
