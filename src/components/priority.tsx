// Selector de prioridad (alta, media, baja) para formularios. En Navidad usa los colores de los paquetes.
import { PRIORITIES } from '@/lib/priority';
import type { Priority } from '@/lib/types';
import { cn } from '@/lib/utils';

export function PriorityPicker({ value, onChange, xmas, className }: { value: Priority; onChange: (p: Priority) => void; xmas?: boolean; className?: string }) {
  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <legend className="pb-1.5 text-sm font-medium text-muted-foreground">Prioridad</legend>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Prioridad">
        {PRIORITIES.map((p) => {
          const on = p.id === value;
          return (
            <button
              key={p.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(p.id)}
              className={cn('inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors',
                on ? 'border-foreground/40 bg-accent text-foreground' : 'bg-background text-muted-foreground hover:bg-accent/60')}
            >
              <PriorityDot priority={p.id} xmas={xmas} />{p.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function PriorityDot({ priority, xmas, className }: { priority: Priority; xmas?: boolean; className?: string }) {
  const p = PRIORITIES.find((x) => x.id === priority)!;
  return <i aria-hidden className={cn('inline-block size-2.5 shrink-0 rounded-full', !xmas && p.dot, className)} style={xmas ? { background: p.xmas } : undefined} />;
}
