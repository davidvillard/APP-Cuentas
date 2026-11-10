// Horarios: las horas de cada día de la semana en los trabajos por horas. Cada uno apunta solo las suyas
// (la base de datos lo impone). Las horas se guardan con el botón verde de cada trabajo.
import { useState } from 'react';
import { CalendarClock, Check, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, PageHeader, Tag } from '@/components/bits';
import type { Route } from '@/components/AppShell';
import { addDays, n, parseDate, toNumber, weekStart } from '@/lib/calc';
import { DOW, dayLong, decimal, money } from '@/lib/format';
import { backend } from '@/lib/backend';
import { useApp } from '@/lib/store';
import type { Job } from '@/lib/types';
import { cn } from '@/lib/utils';

export function Horarios({ go }: { go: (r: Route) => void }) {
  const { data, today } = useApp();
  const thisWeek = weekStart(today);
  const [week, setWeek] = useState(thisWeek);
  const jobs = data.jobs.filter((j) => j.type === 'hourly');
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const first = parseDate(days[0]), last = parseDate(days[6]);
  const mon = (d: Date) => d.toLocaleDateString('es-ES', { month: 'long' });
  const range = first.getMonth() === last.getMonth()
    ? `${first.getDate()} al ${last.getDate()} de ${mon(last)}`
    : `${first.getDate()} de ${mon(first)} al ${last.getDate()} de ${mon(last)}`;

  return (
    <>
      <PageHeader title="Horarios">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Semana anterior" onClick={() => setWeek(addDays(week, -7))}><ChevronLeft /></Button>
          <Button variant={week === thisWeek ? 'secondary' : 'ghost'} size="sm" onClick={() => setWeek(thisWeek)}>Esta semana</Button>
          <Button variant={week === addDays(thisWeek, 7) ? 'secondary' : 'ghost'} size="sm" onClick={() => setWeek(addDays(thisWeek, 7))}>La que viene</Button>
          <Button variant="ghost" size="icon" aria-label="Semana siguiente" onClick={() => setWeek(addDays(week, 7))}><ChevronRight /></Button>
        </div>
      </PageHeader>
      <p className="-mt-2 mb-1 font-semibold">Semana del {range}</p>
      <p className="mb-5 max-w-[68ch] text-sm text-muted-foreground">
        Cuando te llegue el horario, apunta las horas de cada día y pulsa Guardar. Las semanas sin horario cuentan con las horas habituales del trabajo, como estimadas.
      </p>
      {jobs.length ? (
        <div className="flex flex-col gap-4">
          {jobs.map((job) => {
            // La clave incluye las horas guardadas: si cambian (en otro dispositivo), el borrador se rehace.
            const saved = data.shifts.find((s) => s.job_id === job.id && s.week_start === week)?.hours.join(',') ?? '';
            return <JobWeek key={`${job.id}-${week}-${saved}`} job={job} week={week} days={days} />;
          })}
        </div>
      ) : (
        <EmptyState icon={CalendarClock} title="No hay trabajos por horas" text="Aquí aparecen los trabajos por horas para apuntar el horario de cada semana.">
          <Button variant="outline" onClick={() => go('hogar')}>Añadir un trabajo por horas</Button>
        </EmptyState>
      )}
    </>
  );
}

function JobWeek({ job, week, days }: { job: Job; week: string; days: string[] }) {
  const { data, today, canEdit, run } = useApp();
  const person = data.people.find((p) => p.id === job.person_id);
  const editable = canEdit(person);
  const shift = data.shifts.find((s) => s.job_id === job.id && s.week_start === week);
  const initial = days.map((_, i) => (shift ? decimal(n(shift.hours[i])) : ''));
  const [draft, setDraft] = useState(initial);
  const dirty = draft.some((v, i) => v !== initial[i]);
  const hours = draft.map((v) => Math.min(24, Math.max(0, toNumber(v))));
  const total = hours.reduce((a, b) => a + b, 0);
  const rate = n(job.hourly_rate);

  const save = async () => {
    await run(() => backend.upsert('shifts', { job_id: job.id, week_start: week, hours }), 'Horas guardadas');
  };

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{job.name}</p>
          <p className="text-sm text-muted-foreground">
            {person?.name} · {money(rate)}/h
            {!editable && <span className="ml-1 inline-flex items-center gap-1"><Lock className="size-3" /> solo lo apunta {person?.name}</span>}
          </p>
        </div>
        <div className="text-right">
          {shift || dirty ? (
            <>
              <p className="font-bold">{decimal(total) || 0} h</p>
              <p className="text-sm text-muted-foreground">{money(total * rate)}</p>
            </>
          ) : (
            <>
              <Tag tone="plan">estimado</Tag>
              <p className="pt-1 text-sm text-muted-foreground">{decimal(n(job.usual_hours))} h · {money(n(job.usual_hours) * rate)}</p>
            </>
          )}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:max-w-xl">
        {days.map((day, i) => (
          <label key={day} className={cn('flex flex-col items-center gap-1 text-xs font-semibold', day === today ? 'text-foreground' : 'text-muted-foreground')}>
            <span>{DOW[i]} {parseDate(day).getDate()}</span>
            <input
              inputMode="decimal" placeholder="–" disabled={!editable}
              value={draft[i]}
              onChange={(e) => setDraft(draft.map((v, k) => (k === i ? e.target.value : v)))}
              aria-label={`${job.name}, ${dayLong(day)}, horas`}
              className={cn('h-11 w-full min-w-0 rounded-md border text-center text-base font-semibold text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:bg-muted disabled:text-muted-foreground',
                day === today && 'border-foreground/40')}
            />
          </label>
        ))}
      </div>
      {editable && (
        <div className="flex justify-end gap-2 pt-3">
          {dirty && <Button variant="ghost" onClick={() => setDraft(initial)}>Descartar</Button>}
          <Button variant="save" disabled={!dirty} onClick={save}><Check /> Guardar</Button>
        </div>
      )}
    </Card>
  );
}
