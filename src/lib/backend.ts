// Acceso a datos. Con .env configurado usa Supabase (login real y datos compartidos por hogar);
// sin él, un modo demo en memoria con datos de ejemplo para probar la interfaz.
import { createClient, type RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { exampleData } from './example';
import type { Data, Household, Session, Table } from './types';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isConfigured = Boolean(url && key && !url.includes('TU-PROYECTO'));

type Row = Record<string, unknown>;
export type ChangePayload = RealtimePostgresChangesPayload<Row>;
export type AuthEvent = string;

export interface Backend {
  demo: boolean;
  session(): Promise<Session | null>;
  onAuthChange(cb: (session: Session | null, event?: AuthEvent) => void): void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  household(): Promise<Household | null>;
  createHousehold(name: string, personName: string): Promise<void>;
  joinHousehold(code: string, personName: string): Promise<void>;
  load(): Promise<Data>;
  upsert(table: Table, row: Row): Promise<void>;
  insertIgnore(table: Table, rows: Row[], onConflict: string): Promise<void>;
  remove(table: Table, match: Row): Promise<void>;
  /** Avisa cuando cambia algo del hogar en otro dispositivo. Devuelve la función para dejar de escuchar. */
  subscribe(onChange: (payload: ChangePayload) => void): () => void;
}

const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: 'El email o la contraseña no son correctos.',
  email_not_confirmed: 'Confirma tu email con el enlace que te enviamos antes de entrar.',
  user_already_exists: 'Ya hay una cuenta con ese email. Entra con tu contraseña.',
  weak_password: 'La contraseña es demasiado débil: usa al menos 8 caracteres.',
  over_email_send_rate_limit: 'Se han enviado demasiados correos. Espera unos minutos.',
  same_password: 'La nueva contraseña es igual a la anterior. Elige otra.',
};

function fail(error: { code?: string; message?: string } | null, fallback?: string): void {
  if (!error) return;
  const msg = (error.code && AUTH_ERRORS[error.code]) ||
    (error.code === '42501' ? 'No puedes cambiar esto: solo puede hacerlo la persona a la que pertenece.' : null) ||
    (/invalid_code/.test(error.message ?? '') ? 'Ese código de invitación no existe. Revísalo.' : null) ||
    fallback || 'No se pudo guardar el cambio. Inténtalo otra vez.';
  console.error(error); // el error original de Supabase, para poder diagnosticar
  throw new Error(msg, { cause: error });
}

const LIVE_TABLES: Table[] = ['people', 'jobs', 'shifts', 'expenses', 'month_plans', 'recurring_expenses'];

function supabaseBackend(): Backend {
  const sb = createClient(url!, key!);
  let hid: string | null = null;
  const withHousehold = (row: Row) => ({ ...row, household_id: hid });

  const api: Backend = {
    demo: false,
    async session() {
      const { data } = await sb.auth.getSession();
      return data.session;
    },
    onAuthChange(cb) {
      // Diferido: llamar a Supabase dentro de este callback puede bloquear el cliente.
      sb.auth.onAuthStateChange((event, session) => setTimeout(() => cb(session, event), 0));
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
      fail(error);
    },
    async updatePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      fail(error);
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      fail(error);
    },
    async signUp(email, password) {
      // El enlace de confirmación vuelve a esta misma web (no a la Site URL de Supabase).
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
      fail(error);
      return { needsConfirmation: !data.session };
    },
    async signOut() {
      await sb.auth.signOut();
      hid = null;
    },
    async household() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return null;
      const { data, error } = await sb
        .from('household_members')
        .select('households(id, name, invite_code)')
        .eq('user_id', user.id)
        .limit(1);
      fail(error);
      const h = (data?.[0]?.households ?? null) as unknown as Household | null;
      hid = h?.id ?? null;
      return h;
    },
    async createHousehold(name, personName) {
      const { data, error } = await sb.rpc('create_household', { p_name: name });
      fail(error);
      hid = data;
      await addSelf(personName);
    },
    async joinHousehold(code, personName) {
      const { data, error } = await sb.rpc('join_household', { p_code: code });
      fail(error);
      hid = data;
      await addSelf(personName);
    },
    async load() {
      const q = (t: Table) => sb.from(t).select('*').eq('household_id', hid);
      const [people, jobs, shifts, expenses, plans, recurring] = await Promise.all([
        q('people').order('created_at'),
        q('jobs').order('created_at'),
        q('shifts'),
        q('expenses').order('date', { ascending: false }),
        q('month_plans'),
        q('recurring_expenses').order('created_at'),
      ]);
      for (const r of [people, jobs, shifts, expenses, plans, recurring]) fail(r.error, 'No se pudieron cargar los datos.');
      return {
        people: people.data ?? [],
        jobs: jobs.data ?? [],
        shifts: shifts.data ?? [],
        expenses: expenses.data ?? [],
        plans: Object.fromEntries((plans.data ?? []).map((p) => [String(p.month).slice(0, 7), p])),
        recurring: recurring.data ?? [],
      } as Data;
    },
    async upsert(table, row) {
      const { error } = await sb.from(table).upsert(withHousehold(row));
      fail(error);
    },
    async insertIgnore(table, rows, onConflict) {
      const { error } = await sb.from(table).upsert(rows.map(withHousehold), { onConflict, ignoreDuplicates: true });
      fail(error);
    },
    async remove(table, match) {
      const { error } = await sb.from(table).delete().match({ ...match, household_id: hid });
      fail(error);
    },
    subscribe(onChange) {
      const ch = sb.channel(`hogar-${hid}`);
      for (const table of LIVE_TABLES) {
        // Los borrados no se pueden filtrar por hogar: llegan de todos y solo con la clave de la fila.
        ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `household_id=eq.${hid}` }, onChange);
        ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `household_id=eq.${hid}` }, onChange);
        ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, onChange);
      }
      ch.subscribe();
      return () => { sb.removeChannel(ch); };
    },
  };

  async function addSelf(name: string) {
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from('people').insert(withHousehold({ name, user_id: user!.id }));
    fail(error);
  }
  return api;
}

function demoBackend(): Backend {
  let data: Data | null = null;
  let signedIn = false;
  const listeners: ((s: Session | null) => void)[] = [];
  const user = { id: 'demo', email: 'demo@ejemplo.es' };
  const household: Household = { id: 'demo', name: 'Casa de ejemplo', invite_code: 'DEMO2026' };
  const keyOf = (table: Table, row: Row) =>
    table === 'shifts' ? `${row.job_id}_${row.week_start}` : table === 'month_plans' ? row.month : row.id;
  // En los datos de ejemplo la tabla recurring_expenses se llama «recurring».
  const lists = () => (data ??= exampleData()) as unknown as Record<string, Row[]>;
  const field = (table: Table) => (table === 'recurring_expenses' ? 'recurring' : table);
  const get = (table: Table) => lists()[field(table)];
  const set = (table: Table, rows: Row[]) => { lists()[field(table)] = rows; };

  return {
    demo: true,
    async session() { return signedIn ? { user } : null; },
    onAuthChange(cb) { listeners.push(cb); },
    async signIn() { signedIn = true; listeners.forEach((cb) => cb({ user })); },
    async signUp() { signedIn = true; listeners.forEach((cb) => cb({ user })); return { needsConfirmation: false }; },
    async signOut() { signedIn = false; listeners.forEach((cb) => cb(null)); },
    async resetPassword() {},
    async updatePassword() {},
    async household() { return household; },
    async createHousehold() {},
    async joinHousehold() {},
    async load() {
      data ??= exampleData();
      return structuredClone(data);
    },
    async upsert(table, row) {
      data ??= exampleData();
      if (table === 'month_plans') {
        data.plans[String(row.month).slice(0, 7)] = { ...row } as unknown as Data['plans'][string];
        return;
      }
      const list = get(table);
      const i = list.findIndex((r) => keyOf(table, r) === keyOf(table, row));
      if (i >= 0) list[i] = { ...list[i], ...row };
      else list.unshift({ ...row });
    },
    async insertIgnore(table, rows, onConflict) {
      const keys = onConflict.split(',');
      const list = get(table);
      for (const row of rows) if (!list.some((r) => keys.every((k) => r[k] === row[k]))) list.unshift({ ...row });
    },
    async remove(table, match) {
      const ok = (r: Row) => Object.entries(match).every(([k, v]) => r[k] === v);
      set(table, get(table).filter((r) => !ok(r)));
      const d = data!;
      if (table === 'people') d.jobs = d.jobs.filter((j) => j.person_id !== match.id);
      if (table === 'jobs') d.shifts = d.shifts.filter((s) => s.job_id !== match.id);
      if (table === 'recurring_expenses') for (const e of d.expenses) if (e.recurring_id === match.id) e.recurring_id = null;
    },
    subscribe() { return () => {}; }, // en el modo demo no hay otro dispositivo
  };
}

export const backend: Backend = isConfigured ? supabaseBackend() : demoBackend();
