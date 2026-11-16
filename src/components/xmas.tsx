// Piezas comunes de la sección de Navidad: tarjetas, filas de regalo y botón de enlace.
// Las usan los regalos y las listas de deseos para que todo tenga los mismos tamaños:
//   título de tarjeta  text-xl bold   · título de fila  text-base semibold · detalles  text-sm muted
//   precio             text-lg bold   · acciones de fila  botones sm (h-8)  · formularios  campos y botón h-10
import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { linkHost } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Paquete de regalo; el color va rotando (rojo, abeto, oro) según la posición. */
export function GiftIcon({ i }: { i: number }) {
  return (
    <svg className={`gift-ico g${i % 3} mt-0.5 size-9 shrink-0`} viewBox="0 0 24 24" aria-hidden>
      <path className="bow" d="M12 7C10.4 3.2 6 3.2 6 5.6 6 7.5 9.6 7.4 12 7Zm0 0c1.6-3.8 6-3.8 6-1.4 0 1.9-3.6 1.8-6 1.4Z" />
      <rect className="lid" x="3" y="7" width="18" height="4.5" rx="1" />
      <rect className="box" x="4.5" y="11.5" width="15" height="9.5" rx="1" />
      <rect className="rib" x="10.5" y="7" width="3" height="14" />
    </svg>
  );
}

/** Tarjeta blanca sobre el fondo de abeto. `ribbon` le pone la cinta de bastón de caramelo arriba. */
export function XmasCard({ title, description, aside, ribbon, className, children }: {
  title: string; description?: ReactNode; aside?: ReactNode; ribbon?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <section className={cn('overflow-hidden rounded-2xl bg-background text-foreground shadow-lg shadow-black/10', className)}>
      {ribbon && <div className="xmas-ribbon" />}
      <div className="p-5 md:p-6">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight">{title}</h2>
            {description && <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">{description}</p>}
          </div>
          {aside}
        </header>
        {children}
      </div>
    </section>
  );
}

/**
 * Fila de regalo o deseo. En el móvil las acciones van debajo del texto, para que el título no se
 * estreche; desde tablet, a la derecha.
 */
export function XmasRow({ index, title, onOpen, done, meta, price, actions }: {
  index: number; title: string; onOpen?: () => void; done?: boolean; meta?: ReactNode; price?: ReactNode; actions?: ReactNode;
}) {
  const titleCls = cn('block max-w-full truncate text-left text-base font-semibold', done && 'text-muted-foreground line-through');
  return (
    <li className="flex gap-3 py-4 first:pt-1 last:pb-1">
      <GiftIcon i={index} />
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start justify-between gap-3 sm:items-center">
          <div className="min-w-0">
            {onOpen
              ? <button type="button" onClick={onOpen} className={cn(titleCls, 'underline-offset-4 hover:underline')}>{title}</button>
              : <p className={titleCls}>{title}</p>}
            {meta && <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">{meta}</div>}
          </div>
          {price && <div className="shrink-0 text-right text-lg leading-7 font-bold">{price}</div>}
        </div>
        {actions && <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0 sm:shrink-0 sm:flex-nowrap">{actions}</div>}
      </div>
    </li>
  );
}

/** Abre la tienda en otra pestaña (en el móvil, solo el icono). Solo recibe direcciones ya comprobadas con safeLink(). */
export function LinkButton({ url, label }: { url: string; label: string }) {
  const host = linkHost(url);
  return (
    <Button asChild variant="outline" size="sm">
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${label} en ${host}`} title={url}>
        <ExternalLink /> <span className="hidden max-w-[9rem] truncate sm:inline">{host}</span>
      </a>
    </Button>
  );
}
