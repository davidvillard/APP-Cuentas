// Hogar: el código para invitar, los perfiles y sus trabajos. Cada uno edita lo suyo (y los perfiles
// sin cuenta); los demás se ven en modo lectura. Todo se guarda con un botón; eliminar pide confirmación.
import { useState } from 'react';
import { Briefcase, Check, Copy, Lock, Plus, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, Field, NativeSelect, PageHeader } from '@/components/bits';
import { useConfirm } from '@/components/confirm';
import { backend } from '@/lib/backend';
import { monthlyApprox, n, toNumber } from '@/lib/calc';
import { decimal, money, money0, uuid } from '@/lib/format';
import { useApp } from '@/lib/store';
import type { Job, JobType, Person } from '@/lib/types';

export function Hogar() {
  const { data, household, me, run } = useApp();
  const people = [...data.people].sort((a, b) => Number(b.id === me?.id) - Number(a.id === me?.id)); // tu perfil, primero
  const copy = async () => {
    try { await navigator.clipboard.writeText(household.invite_code); toast.success('Código copiado'); }
    catch { toast(`El código es ${household.invite_code}`); }
  };
  return (
    <>
      <PageHeader title="Hogar" />
      <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 border-dashed">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold"><UserPlus className="size-4" /> Invita a {household.name}</p>
          <p className="text-sm text-muted-foreground">Quien se registre puede unirse con este código y verá los mismos datos.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xl font-bold tracking-[0.2em]">{household.invite_code}</span>
          <Button variant="outline" onClick={copy}><Copy /> Copiar</Button>
        </div>
      </Card>

      <div className="flex flex-col gap-6">
        {people.map((p) => <PersonCard key={p.id} person={p} />)}
      </div>
      <Button
        variant="outline" className="mt-6"
        onClick={() => run(() => backend.upsert('people', { id: uuid(), name: 'Nueva persona', user_id: null }), 'Persona añadida')}
      >
        <UserPlus /> Añadir otra persona sin cuenta
      </Button>
    </>
  );
}

function PersonCard({ person: p }: { person: Person }) {
  const { data, me, canEdit, run } = useApp();
  const confirm = useConfirm();
  const editable = canEdit(p);
  const jobs = data.jobs.filter((j) => j.person_id === p.id);
  const [name, setName] = useState(p.name);
  const nameChanged = name.trim() && name.trim() !== p.name;

  const addJob = (type: JobType) => {
    const fixed = type === 'fixed';
    const job = {
      id: uuid(), person_id: p.id, type, name: fixed ? 'Mi trabajo' : 'Trabajo por horas', usual_hours: fixed ? 40 : 20,
      monthly_net: fixed ? 0 : null, payments: fixed ? 12 : null, hourly_rate: fixed ? null : 0,
    };
    run(() => backend.upsert('jobs', job), 'Trabajo añadido: rellena sus datos y pulsa Guardar');
  };
  const removePerson = async () => {
    const ok = await confirm({
      title: `¿Eliminar el perfil de ${p.name}?`,
      text: 'Se eliminan también sus trabajos y horarios. Los gastos que pagó se quedan, sin persona asignada. No se puede deshacer.',
    });
    if (ok) run(() => backend.remove('people', { id: p.id }), 'Perfil eliminado');
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {editable ? (
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (nameChanged) run(() => backend.upsert('people', { id: p.id, name: name.trim(), user_id: p.user_id }), 'Nombre guardado'); }}>
            <Input className="h-10 w-48 text-lg font-bold" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre" />
            {nameChanged && <Button type="submit" variant="save" size="sm"><Check /> Guardar</Button>}
          </form>
        ) : (
          <h2 className="text-xl font-bold">{p.name}</h2>
        )}
        {p.id === me?.id ? <span className="text-sm text-muted-foreground">Tu perfil</span>
          : p.user_id ? <span className="flex items-center gap-1 text-sm text-muted-foreground"><Lock className="size-3.5" /> Solo puede editarlo {p.name}</span>
          : <Button variant="delete-ghost" size="sm" onClick={removePerson}><Trash2 /> Eliminar perfil</Button>}
      </div>

      {jobs.length ? jobs.map((j) => (editable
        ? <JobForm key={`${j.id}-${j.name}-${j.type}-${j.monthly_net}-${j.payments}-${j.hourly_rate}-${j.usual_hours}`} job={j} />
        : <JobSummary key={j.id} job={j} />))
        : <p className="text-sm text-muted-foreground">Sin trabajos todavía.</p>}

      {editable && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => addJob('fixed')}><Plus /> Sueldo fijo</Button>
          <Button variant="outline" onClick={() => addJob('hourly')}><Plus /> Trabajo por horas</Button>
        </div>
      )}
    </section>
  );
}

function JobSummary({ job: j }: { job: Job }) {
  const hours = `${decimal(n(j.usual_hours)) || 0} h a la semana`;
  return (
    <Card className="flex items-center gap-3 py-3">
      <Briefcase className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="font-medium">{j.name}</p>
        <p className="text-sm text-muted-foreground">
          {j.type === 'fixed'
            ? `Sueldo fijo · ${money(n(j.monthly_net))} netos por paga · ${n(j.payments) === 14 ? 14 : 12} pagas · ${hours}`
            : `Por horas · ${money(n(j.hourly_rate))}/h · ${hours} · unos ${money0(monthlyApprox(j.hourly_rate, j.usual_hours))} al mes`}
        </p>
      </div>
    </Card>
  );
}

/** Un trabajo es un formulario propio: nada se guarda hasta pulsar Guardar. */
function JobForm({ job }: { job: Job }) {
  const { run } = useApp();
  const confirm = useConfirm();
  const [f, setF] = useState({
    name: job.name, type: job.type, monthly_net: decimal(n(job.monthly_net)), payments: String(n(job.payments) === 14 ? 14 : 12),
    hourly_rate: decimal(n(job.hourly_rate)), usual_hours: decimal(n(job.usual_hours)),
  });
  const [dirty, setDirty] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); setDirty(true); };
  const fixed = f.type === 'fixed';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return toast.error('Ponle un nombre al trabajo.');
    const num = (v: string) => Math.max(0, toNumber(v));
    const next: Job = {
      ...job, name: f.name.trim(), type: f.type, usual_hours: num(f.usual_hours),
      monthly_net: fixed ? num(f.monthly_net) : null, payments: fixed ? Number(f.payments) : null, hourly_rate: fixed ? null : num(f.hourly_rate),
    };
    if (await run(() => backend.upsert('jobs', { ...next }), 'Trabajo guardado')) setDirty(false);
  };
  const remove = async () => {
    const ok = await confirm({
      title: '¿Eliminar este trabajo?',
      text: `Se elimina «${job.name}» con sus horarios apuntados, y sus ingresos dejan de contar en todos los meses. No se puede deshacer.`,
    });
    if (ok) run(() => backend.remove('jobs', { id: job.id }), 'Trabajo eliminado');
  };

  return (
    <Card className="bg-muted/50">
      <form onSubmit={save} className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))]">
        <Field label="Trabajo" className="col-span-2 md:col-span-1"><Input className="h-10 bg-background" value={f.name} onChange={set('name')} /></Field>
        <Field label="Tipo">
          <NativeSelect value={f.type} onChange={set('type')}>
            <option value="fixed">Sueldo fijo</option>
            <option value="hourly">Por horas</option>
          </NativeSelect>
        </Field>
        {fixed ? (
          <>
            <Field label="Neto por paga"><Input className="h-10 bg-background text-right" inputMode="decimal" value={f.monthly_net} onChange={set('monthly_net')} /></Field>
            <Field label="Pagas al año">
              <NativeSelect value={f.payments} onChange={set('payments')}>
                <option value="12">12 pagas</option>
                <option value="14">14 pagas</option>
              </NativeSelect>
            </Field>
            <Field label="Horas a la semana"><Input className="h-10 bg-background text-right" inputMode="decimal" value={f.usual_hours} onChange={set('usual_hours')} /></Field>
          </>
        ) : (
          <>
            <Field label="€ por hora"><Input className="h-10 bg-background text-right" inputMode="decimal" value={f.hourly_rate} onChange={set('hourly_rate')} /></Field>
            <Field label="Horas a la semana"><Input className="h-10 bg-background text-right" inputMode="decimal" value={f.usual_hours} onChange={set('usual_hours')} /></Field>
            <div className="flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
              Al mes, aprox.
              <span className="flex h-10 items-center font-semibold text-foreground">{money(monthlyApprox(toNumber(f.hourly_rate), toNumber(f.usual_hours)))}</span>
            </div>
          </>
        )}
        <div className="col-span-2 flex justify-end gap-2 md:col-span-5">
          <Button type="button" variant="delete" onClick={remove}><Trash2 /> Eliminar</Button>
          <Button type="submit" variant="save" disabled={!dirty}><Check /> Guardar</Button>
        </div>
      </form>
    </Card>
  );
}
