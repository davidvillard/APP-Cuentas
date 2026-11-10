// Piezas pequeñas compartidas por varias pantallas.
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths } from '@/lib/calc';
import { category } from '@/lib/categories';
import { monthLong } from '@/lib/format';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/** Icono de la categoría en un círculo de su color. */
export function CategoryIcon({ id, size = 'md' }: { id: string; size?: 'sm' | 'md' | 'lg' }) {
  const c = category(id);
  const Icon = c.icon;
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-full', size === 'sm' ? 'size-7' : size === 'lg' ? 'size-11' : 'size-9')}
      style={{ background: `${c.color}1f`, color: c.color }}
      aria-hidden
    >
      <Icon className={size === 'sm' ? 'size-3.5' : size === 'lg' ? 'size-5' : 'size-4'} />
    </span>
  );
}

/** Mes visible, con flechas para pasar de mes. */
export function MonthSwitcher({ className }: { className?: string }) {
  const { ym, setYm, today } = useApp();
  const current = today.slice(0, 7);
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Button variant="ghost" size="icon" aria-label="Mes anterior" onClick={() => setYm(addMonths(ym, -1))}><ChevronLeft /></Button>
      <button
        className="first-cap min-w-[9.5rem] rounded-md px-2 py-1 text-center font-semibold hover:bg-accent"
        onClick={() => setYm(current)}
        title={ym === current ? undefined : 'Volver al mes actual'}
      >
        {monthLong(ym)}
      </button>
      <Button variant="ghost" size="icon" aria-label="Mes siguiente" onClick={() => setYm(addMonths(ym, 1))}><ChevronRight /></Button>
    </div>
  );
}

/** Cabecera de pantalla: título y, a la derecha, lo que haga falta (selector de mes, botones). */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-5">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
      {children}
    </header>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('rounded-xl border bg-card p-4 md:p-5', className)}>{children}</section>;
}

export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-base font-semibold">{children}</h2>
      {aside && <div className="text-sm text-muted-foreground">{aside}</div>}
    </div>
  );
}

/** Campo con etiqueta encima. */
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5 text-sm font-medium text-muted-foreground', className)}>
      {label}
      {children}
    </label>
  );
}

/** Desplegable nativo con el aspecto de los campos (en el móvil abre el selector del sistema). */
export function NativeSelect(props: React.ComponentProps<'select'>) {
  return (
    <select
      {...props}
      className={cn(
        'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 md:text-sm',
        props.className,
      )}
    />
  );
}

export function Tag({ tone, children }: { tone: 'plan' | 'good' | 'bad' | 'neutral'; children: ReactNode }) {
  const tones = {
    plan: 'bg-planned-soft text-planned',
    good: 'bg-income-soft text-income',
    bad: 'bg-over-soft text-over',
    neutral: 'bg-muted text-muted-foreground',
  };
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap', tones[tone])}>{children}</span>;
}

export function EmptyState({ icon: Icon, title, text, children }: { icon: React.ElementType; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><Icon className="size-6" /></span>
      <p className="font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
      {children}
    </div>
  );
}
