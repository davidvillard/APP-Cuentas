// Estado de la app con sesión iniciada: datos del hogar (TanStack Query), mes visible, cambios en directo
// y las acciones de escritura. Las pantallas leen todo con useApp().
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { backend, type ChangePayload } from './backend';
import { expenseValue, recurringDue, todayIso } from './calc';
import { categoryName } from './categories';
import { money, uuid } from './format';
import type { Data, Expense, Household, Person, Recurring, Session } from './types';

/** Lo que se abre en la hoja de gasto: nuevo (con valores por defecto), editar o marcar como pagado. */
export type SheetState =
  | { mode: 'new'; defaults?: Partial<Expense> }
  | { mode: 'edit'; expense: Expense }
  | { mode: 'pay'; expense: Expense };

interface AppContext {
  session: Session;
  household: Household;
  data: Data;
  today: string;
  /** perfil del usuario con sesión */
  me: Person | undefined;
  /** Cada uno edita lo suyo; un perfil sin cuenta lo edita cualquiera (la base de datos impone lo mismo). */
  canEdit: (p: Person | undefined) => boolean;
  personName: (id: string | null) => string;
  ym: string;
  setYm: (ym: string) => void;
  sheet: SheetState | null;
  openSheet: (s: SheetState) => void;
  closeSheet: () => void;
  /** Ejecuta una escritura, recarga los datos y avisa. Devuelve false si falló. */
  run: (fn: () => Promise<unknown>, okMsg?: string) => Promise<boolean>;
  actions: ReturnType<typeof makeActions>;
}

const Ctx = createContext<AppContext | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp fuera de DataProvider');
  return c;
};

/**
 * Apunta como previstos los gastos fijos que faltan hasta upTo (el mes visible o el actual, si es posterior).
 * Si dos móviles lo hacen a la vez, la base de datos ignora los repetidos.
 */
async function syncRecurring(recurring: Recurring[], upTo: string) {
  const due = recurringDue(recurring, upTo) as { template: Recurring; date: string }[];
  if (!due.length) return false;
  await backend.insertIgnore('expenses', due.map(({ template: t, date }) => ({
    id: uuid(), date, category: t.category, note: t.note, person_id: t.person_id,
    status: 'planned', planned: Number(t.amount), amount: null, recurring_id: t.id, recipient: null,
  })), 'recurring_id,date');
  for (const t of new Set(due.map((x) => x.template))) {
    await backend.upsert('recurring_expenses', { ...t, last_month: `${upTo}-01` });
  }
  return true;
}

export function DataProvider({ session, household, children }: { session: Session; household: Household; children: ReactNode }) {
  const qc = useQueryClient();
  const today = todayIso();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const query = useQuery({ queryKey: ['data', household.id], queryFn: () => backend.load() });
  const data = query.data;

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['data', household.id] }), [qc, household.id]);

  const run = useCallback(async (fn: () => Promise<unknown>, okMsg?: string) => {
    try {
      await fn();
      await refresh();
      if (okMsg) toast.success(okMsg);
      return true;
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo guardar.');
      await refresh();
      return false;
    }
  }, [refresh]);

  // Gastos fijos pendientes hasta el mes visible.
  const syncing = useRef(false);
  useEffect(() => {
    if (!data || syncing.current) return;
    const now = today.slice(0, 7);
    const upTo = ym > now ? ym : now;
    if (!recurringDue(data.recurring, upTo).length) return;
    syncing.current = true;
    syncRecurring(data.recurring, upTo)
      .then(refresh)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => { syncing.current = false; });
  }, [data, ym, today, refresh]);

  // Cambios en directo: cuando la otra persona cambia algo, se recargan los datos.
  // Los formularios guardan su borrador en su propio estado, así que recargar no borra lo que escribes.
  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const isOurs = (old: Record<string, unknown>) => {
      const d = dataRef.current;
      if (!d) return false;
      if (old.household_id && old.household_id === household.id) return true;
      return [d.people, d.jobs, d.expenses, d.recurring].some((list) => list.some((r) => r.id === old.id))
        || Boolean(old.job_id && d.jobs.some((j) => j.id === old.job_id));
    };
    const stop = backend.subscribe((p: ChangePayload) => {
      // Los borrados llegan de todos los hogares y solo con la clave: se ignoran los que no son nuestros.
      if (p.eventType === 'DELETE' && !isOurs((p.old ?? {}) as Record<string, unknown>)) return;
      clearTimeout(timer);
      timer = setTimeout(refresh, 400); // agrupa varios cambios seguidos en una recarga
    });
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stop(); clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [household.id, refresh]);

  const value = useMemo<AppContext | null>(() => {
    if (!data) return null;
    const me = data.people.find((p) => p.user_id === session.user.id);
    const ctx: AppContext = {
      session, household, data, today, me, ym, setYm, sheet,
      canEdit: (p) => Boolean(p) && (!p!.user_id || p!.user_id === session.user.id),
      personName: (id) => (id ? data.people.find((p) => p.id === id)?.name ?? '—' : 'Común'),
      openSheet: setSheet,
      closeSheet: () => setSheet(null),
      run,
      actions: null as never,
    };
    ctx.actions = makeActions(ctx);
    return ctx;
  }, [data, session, household, today, ym, sheet, run]);

  if (query.isError) {
    return <FullMessage title="No se pudieron cargar los datos" text={(query.error as Error).message} action={() => query.refetch()} />;
  }
  if (!value) return <FullMessage title="Cargando…" />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Escrituras con sus mensajes. Eliminar un gasto se puede deshacer desde el aviso. */
function makeActions(ctx: AppContext) {
  const { run } = ctx;
  return {
    saveExpense: (row: Expense, msg: string) => run(() => backend.upsert('expenses', { ...row }), msg),
    payExpense: (e: Expense, value: number) => {
      const diff = value - Number(e.planned);
      return run(() => backend.upsert('expenses', { ...e, status: 'real', amount: value }),
        Math.abs(diff) < 0.005 ? 'Pagado justo lo previsto' : diff < 0 ? `Pagado: ${money(-diff)} menos de lo previsto` : `Pagado: ${money(diff)} más de lo previsto`);
    },
    deleteExpense: async (e: Expense) => {
      const ok = await run(() => backend.remove('expenses', { id: e.id }));
      if (!ok) return;
      toast(`${e.note || categoryName(e.category)} eliminado`, {
        description: money(expenseValue(e)),
        action: { label: 'Deshacer', onClick: () => run(() => backend.upsert('expenses', { ...e }), 'Gasto recuperado') },
      });
    },
    addRecurring: (t: Recurring, first: Expense) => run(async () => {
      await backend.upsert('recurring_expenses', { ...t });
      await backend.upsert('expenses', { ...first });
    }, 'Gasto fijo añadido: se apuntará cada mes'),
    saveRecurringAmount: (t: Recurring, amount: number) =>
      run(() => backend.upsert('recurring_expenses', { ...t, amount }), 'Importe actualizado para los próximos meses'),
    removeRecurring: (t: Recurring) => run(async () => {
      // Se quitan también sus previstos sin pagar; los ya pagados se quedan.
      await backend.remove('expenses', { recurring_id: t.id, status: 'planned' });
      await backend.remove('recurring_expenses', { id: t.id });
    }, 'Gasto fijo quitado'),
    savePlan: (patch: { savings_goal?: number; budgets?: Record<string, number> }, base: { savings_goal: number; budgets: Record<string, number> }, msg: string) =>
      run(() => backend.upsert('month_plans', {
        month: `${ctx.ym}-01`, savings_goal: Number(base.savings_goal || 0), budgets: { ...(base.budgets || {}) }, ...patch,
      }), msg),
  };
}

export function FullMessage({ title, text, action }: { title: string; text?: string; action?: () => void }) {
  return (
    <div className="grid min-h-svh place-items-center p-6 text-center">
      <div className="max-w-sm space-y-3">
        <p className="text-lg font-semibold">{title}</p>
        {text && <p className="text-muted-foreground">{text}</p>}
        {action && <button className="font-semibold text-ring underline" onClick={action}>Reintentar</button>}
      </div>
    </div>
  );
}
