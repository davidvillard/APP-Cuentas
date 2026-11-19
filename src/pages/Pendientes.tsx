// Pendientes: cosas por hacer en casa (vender la radio, pedir cita para la ITV…). Las ve y las edita todo
// el hogar. Cada una puede tener quién se encarga, para cuándo y prioridad (alta, media, baja).
import { useState } from 'react';
import { Check, ChevronDown, ListTodo, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Card, CardTitle, EmptyState, Field, NativeSelect, PageHeader, Tag } from '@/components/bits';
import { PriorityDot, PriorityPicker } from '@/components/priority';
import { dayShort, uuid } from '@/lib/format';
import { byPriority, priority as priorityOf } from '@/lib/priority';
import { useApp } from '@/lib/store';
import type { Priority, Task } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Lo más urgente arriba: prioridad, luego fecha (sin fecha al final), luego lo más antiguo. */
const order = (a: Task, b: Task) =>
  byPriority(a, b) || (a.due ?? '9999').localeCompare(b.due ?? '9999') || (a.created_at ?? '').localeCompare(b.created_at ?? '');

export function Pendientes() {
  const { data } = useApp();
  const [editing, setEditing] = useState<Task | null>(null);
  const [showDone, setShowDone] = useState(false);
  const todo = data.tasks.filter((t) => !t.done_at).sort(order);
  const done = data.tasks.filter((t) => t.done_at).sort((a, b) => b.done_at!.localeCompare(a.done_at!));

  return (
    <>
      <PageHeader title="Pendientes">
        {todo.length > 0 && <span className="text-sm text-muted-foreground">{todo.length} por hacer</span>}
      </PageHeader>
      <div className="flex max-w-3xl flex-col gap-6">
        <NewTask />

        {todo.length ? (
          <Card>
            <CardTitle>Por hacer</CardTitle>
            <ul className="divide-y">{todo.map((t) => <TaskRow key={t.id} t={t} onEdit={() => setEditing(t)} />)}</ul>
          </Card>
        ) : (
          <EmptyState icon={ListTodo} title={done.length ? 'Todo hecho' : 'Nada pendiente'}
            text="Apunta lo que tengáis por hacer en casa: vender algo, una gestión, un arreglo…" />
        )}

        {done.length > 0 && (
          <Card>
            <button type="button" className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
              <h2 className="text-base font-semibold">Hechas <span className="font-normal text-muted-foreground">· {done.length}</span></h2>
              <ChevronDown className={cn('size-5 text-muted-foreground transition-transform', showDone && 'rotate-180')} />
            </button>
            {showDone && <ul className="mt-2 divide-y">{done.map((t) => <TaskRow key={t.id} t={t} onEdit={() => setEditing(t)} />)}</ul>}
          </Card>
        )}
      </div>
      <TaskSheet task={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function TaskRow({ t, onEdit }: { t: Task; onEdit: () => void }) {
  const { today, personName, actions } = useApp();
  const isDone = Boolean(t.done_at);
  const late = !isDone && t.due != null && t.due < today;
  return (
    <li className="flex items-start gap-3 py-3">
      <button
        type="button" role="checkbox" aria-checked={isDone} aria-label={isDone ? `Volver a pendiente: ${t.title}` : `Marcar como hecho: ${t.title}`}
        onClick={() => actions.toggleTask(t)}
        className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors',
          isDone ? 'border-income bg-income text-white' : 'border-ink-3 hover:border-income hover:bg-income-soft')}
      >
        {isDone && <Check className="size-4" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onEdit} className={cn('block max-w-full text-left font-medium break-words underline-offset-4 hover:underline', isDone && 'text-muted-foreground line-through')}>
          {t.title}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5" title={`Prioridad ${priorityOf(t.priority).name.toLowerCase()}`}>
            <PriorityDot priority={t.priority} /> {priorityOf(t.priority).name}
          </span>
          <span>· {t.person_id ? personName(t.person_id) : 'Cualquiera'}</span>
          {t.due && <span>· para el {dayShort(t.due)}</span>}
          {late && <Tag tone="bad">vencido</Tag>}
          {!isDone && t.due === today && <Tag tone="plan">hoy</Tag>}
        </div>
        {t.note && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.note}</p>}
      </div>
      <div className="flex shrink-0 items-center">
        <Button variant="ghost" size="icon-sm" className="hidden sm:inline-flex" aria-label={`Editar ${t.title}`} onClick={onEdit}><Pencil /></Button>
        <Button variant="delete-ghost" size="icon-sm" aria-label={`Eliminar ${t.title}`} onClick={() => actions.deleteTask(t)}><Trash2 /></Button>
      </div>
    </li>
  );
}

/** Apuntar algo nuevo: el título basta; quién, cuándo y prioridad son opcionales. */
function NewTask() {
  const { data, actions } = useApp();
  const [title, setTitle] = useState('');
  const [who, setWho] = useState('');
  const [due, setDue] = useState('');
  const [prio, setPrio] = useState<Priority>(2);
  const valid = title.trim().length > 0;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const ok = await actions.saveTask({ id: uuid(), title: title.trim(), note: '', person_id: who || null, due: due || null, priority: prio, done_at: null }, 'Apuntado');
    if (ok) { setTitle(''); setDue(''); setPrio(2); }
  };

  return (
    <Card>
      <form onSubmit={add} className="grid grid-cols-2 gap-4 md:grid-cols-[minmax(0,1fr)_10rem_10rem]">
        <Field label="¿Qué hay que hacer?" className="col-span-2 md:col-span-3">
          <Input className="h-10" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Vender la radio, pedir cita para la ITV…" maxLength={200} />
        </Field>
        <PriorityPicker className="col-span-2 md:col-span-1" value={prio} onChange={setPrio} />
        <Field label="Quién">
          <NativeSelect value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Cualquiera</option>
            {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Para cuándo">
          <Input className="h-10" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <div className="col-span-2 flex justify-end md:col-span-3">
          <Button type="submit" variant="save" size="lg" className="w-full sm:w-auto" disabled={!valid}><Plus /> Añadir</Button>
        </div>
      </form>
    </Card>
  );
}

function TaskSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { data, actions } = useApp();
  const [shown, setShown] = useState<Task | null>(null);
  const [f, setF] = useState<Task | null>(null);
  if (task && task !== shown) { setShown(task); setF({ ...task }); }
  const t = f;
  const valid = Boolean(t?.title.trim());

  return (
    <Drawer open={Boolean(task)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerContent className="mx-auto w-full max-w-lg">
        {t && (
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            if (await actions.saveTask({ ...t, title: t.title.trim(), note: t.note.trim() }, 'Guardado')) onClose();
          }}>
            <DrawerHeader>
              <DrawerTitle>Editar pendiente</DrawerTitle>
              <DrawerDescription>Lo ve y lo puede cambiar todo el hogar.</DrawerDescription>
            </DrawerHeader>
            <div className="flex flex-col gap-3 overflow-y-auto px-4">
              <Field label="Qué"><Input autoFocus className="h-10" value={t.title} onChange={(e) => setF({ ...t, title: e.target.value })} maxLength={200} /></Field>
              <Field label="Notas">
                <textarea
                  rows={3} maxLength={2000} value={t.note} onChange={(e) => setF({ ...t, note: e.target.value })} placeholder="Opcional"
                  className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quién">
                  <NativeSelect value={t.person_id ?? ''} onChange={(e) => setF({ ...t, person_id: e.target.value || null })}>
                    <option value="">Cualquiera</option>
                    {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="Para cuándo"><Input className="h-10" type="date" value={t.due ?? ''} onChange={(e) => setF({ ...t, due: e.target.value || null })} /></Field>
              </div>
              <PriorityPicker value={t.priority} onChange={(p) => setF({ ...t, priority: p })} />
            </div>
            <DrawerFooter className="flex-row items-center">
              <Button type="button" variant="delete-ghost" className="mr-auto" onClick={() => { onClose(); actions.deleteTask(shown!); }}>
                <Trash2 /> Eliminar
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
