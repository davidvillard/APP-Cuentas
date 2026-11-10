// Armazón con sesión iniciada. Escritorio: barra lateral con las secciones. Móvil: barra inferior
// con Inicio, Movimientos, el botón «+» en el centro, Horarios y «Más» (el resto, en una hoja).
import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowLeftRight, CalendarClock, ChartColumnBig, Gift, House, LogOut, Menu, Plus, Users, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ExpenseSheet } from '@/components/expenses';
import { backend } from '@/lib/backend';
import { christmasSeason } from '@/lib/calc';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';

export type Route = 'inicio' | 'movimientos' | 'horarios' | 'informes' | 'hogar' | 'navidad';
interface NavItem { id: Route; label: string; icon: LucideIcon }

const ALL: NavItem[] = [
  { id: 'inicio', label: 'Inicio', icon: House },
  { id: 'movimientos', label: 'Movimientos', icon: ArrowLeftRight },
  { id: 'horarios', label: 'Horarios', icon: CalendarClock },
  { id: 'informes', label: 'Informes', icon: ChartColumnBig },
  { id: 'hogar', label: 'Hogar', icon: Users },
  { id: 'navidad', label: 'Navidad', icon: Gift },
];

/** Sección actual, guardada en la URL (#/movimientos) para que atrás y recargar funcionen. */
export function useRoute(): [Route, (r: Route) => void] {
  const read = (): Route => {
    const r = location.hash.replace(/^#\/?/, '').split(/[?&]/)[0] as Route;
    return ALL.some((x) => x.id === r) ? r : 'inicio';
  };
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const onHash = () => setRoute(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (r: Route) => {
    if (r !== route) location.hash = `/${r}`;
    window.scrollTo({ top: 0 });
  };
  return [route, go];
}

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 text-xl font-extrabold tracking-tight', className)}>
      <img src="/tilo-hoja.svg" alt="" className="size-7" />tilo
    </span>
  );
}

export function AppShell({ route, go, children }: { route: Route; go: (r: Route) => void; children: ReactNode }) {
  const { session, household, today, openSheet } = useApp();
  const [more, setMore] = useState(false);
  const items = ALL.filter((i) => i.id !== 'navidad' || christmasSeason(today).visible);
  const mobileMain: Route[] = ['inicio', 'movimientos', 'horarios'];
  const extra = items.filter((i) => !mobileMain.includes(i.id));
  const newExpense = () => openSheet({ mode: 'new', defaults: route === 'navidad' ? { category: 'regalos', status: 'planned' } : undefined });
  const logout = () => backend.signOut();

  return (
    <div className="min-h-svh md:grid md:grid-cols-[15rem_1fr]">
      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-0 hidden h-svh flex-col gap-6 border-r bg-muted/40 p-4 md:flex">
        <Brand className="px-2 pt-1" />
        <Button variant="save" size="lg" className="w-full" onClick={newExpense}><Plus /> Nuevo gasto</Button>
        <nav className="flex flex-col gap-1" aria-label="Secciones">
          {items.map((i) => (
            <NavLink key={i.id} item={i} active={route === i.id} onClick={() => go(i.id)} />
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t pt-4 text-sm">
          <p className="truncate px-2 font-semibold">{household.name}</p>
          <p className="truncate px-2 text-muted-foreground">{session.user.email}</p>
          {backend.demo && <DemoPill />}
          <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={logout}><LogOut /> Salir</Button>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Cabecera (móvil) */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur md:hidden">
          <Brand />
          {backend.demo && <DemoPill />}
        </header>
        <main className="mx-auto w-full max-w-5xl px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-12">{children}</main>
      </div>

      {/* Barra inferior (móvil) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Secciones">
        <div className="grid grid-cols-5 items-end">
          {items.filter((i) => mobileMain.slice(0, 2).includes(i.id)).map((i) => (
            <TabButton key={i.id} item={i} active={route === i.id} onClick={() => go(i.id)} />
          ))}
          <div className="flex justify-center">
            <button
              onClick={newExpense}
              aria-label="Nuevo gasto"
              className="-mt-5 mb-2 grid size-14 place-items-center rounded-full bg-income text-white shadow-lg shadow-income/30 transition-transform active:scale-95"
            >
              <Plus className="size-7" />
            </button>
          </div>
          {items.filter((i) => i.id === 'horarios').map((i) => (
            <TabButton key={i.id} item={i} active={route === i.id} onClick={() => go(i.id)} />
          ))}
          <TabButton item={{ id: 'hogar', label: 'Más', icon: Menu }} active={extra.some((i) => i.id === route)} onClick={() => setMore(true)} />
        </div>
      </nav>

      {/* «Más» (móvil) */}
      <Drawer open={more} onOpenChange={setMore}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{household.name}</DrawerTitle>
            <DrawerDescription>{session.user.email}</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-1 px-4 pb-6">
            {extra.map((i) => (
              <NavLink key={i.id} item={i} active={route === i.id} big onClick={() => { setMore(false); go(i.id); }} />
            ))}
            <Button variant="ghost" size="lg" className="justify-start text-muted-foreground" onClick={logout}><LogOut /> Salir</Button>
          </div>
        </DrawerContent>
      </Drawer>

      <ExpenseSheet />
    </div>
  );
}

function NavLink({ item, active, onClick, big }: { item: NavItem; active: boolean; onClick: () => void; big?: boolean }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 font-medium transition-colors',
        big ? 'py-3 text-base' : 'py-2 text-sm',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        item.id === 'navidad' && !active && 'text-[#0d4a37]',
      )}
    >
      <Icon className="size-5" />{item.label}
    </button>
  );
}

function TabButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn('flex flex-col items-center gap-1 pt-2 pb-2.5 text-[11px] font-medium', active ? 'text-foreground' : 'text-muted-foreground')}
    >
      <span className={cn('grid h-7 w-12 place-items-center rounded-full transition-colors', active && 'bg-accent')}>
        <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
      </span>
      {item.label}
    </button>
  );
}

function DemoPill() {
  return <span className="inline-block rounded-full bg-planned-soft px-2.5 py-1 text-xs font-semibold text-planned">Modo demo</span>;
}
