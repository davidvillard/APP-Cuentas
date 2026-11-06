// Acceso a datos. Con .env configurado usa Supabase (login real y datos compartidos por hogar);
// sin él, un modo demo en memoria con datos de ejemplo para probar la interfaz.
import { createClient } from '@supabase/supabase-js';
import { exampleData } from './example.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isConfigured = Boolean(url && key && !url.includes('TU-PROYECTO'));

const AUTH_ERRORS = {
  invalid_credentials: 'El email o la contraseña no son correctos.',
  email_not_confirmed: 'Confirma tu email con el enlace que te enviamos antes de entrar.',
  user_already_exists: 'Ya hay una cuenta con ese email. Entra con tu contraseña.',
  weak_password: 'La contraseña es demasiado débil: usa al menos 8 caracteres.',
  over_email_send_rate_limit: 'Se han enviado demasiados correos. Espera unos minutos.',
  same_password: 'La nueva contraseña es igual a la anterior. Elige otra.',
};
function fail(error, fallback) {
  if (!error) return;
  const msg = AUTH_ERRORS[error.code] ||
    (/invalid_code/.test(error.message) ? 'Ese código de invitación no existe. Revísalo.' : null) ||
    fallback || 'No se pudo guardar el cambio. Inténtalo otra vez.';
  console.error(error); // el error original de Supabase, para poder diagnosticar
  const e = new Error(msg);
  e.cause = error;
  throw e;
}

const LIVE_TABLES = ['people', 'jobs', 'shifts', 'expenses', 'month_plans', 'recurring_expenses'];

function supabaseBackend() {
  const sb = createClient(url, key);
  let hid = null;
  const withHousehold = (row) => ({ ...row, household_id: hid });

  return {
    demo: false,
    async session() {
      const { data } = await sb.auth.getSession();
      return data.session;
    },
    onAuthChange(cb) {
      // Diferido: llamar a Supabase dentro de este callback puede bloquear el cliente.
      sb.auth.onAuthStateChange((event, session) => setTimeout(() => cb(session, event), 0));
    },
    /** Envía el enlace para elegir otra contraseña; vuelve a esta misma web. */
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
      const { data, error } = await sb.auth.signUp({ email, password });
      fail(error);
      return { needsConfirmation: !data.session };
    },
    async signOut() {
      await sb.auth.signOut();
      hid = null;
    },
    async household() {
      const { data: { user } } = await sb.auth.getUser();
      const { data, error } = await sb
        .from('household_members')
        .select('households(id, name, invite_code)')
        .eq('user_id', user.id)
        .limit(1);
      fail(error);
      const h = data?.[0]?.households || null;
      hid = h?.id || null;
      return h;
    },
    async createHousehold(name, personName) {
      const { data, error } = await sb.rpc('create_household', { p_name: name });
      fail(error);
      hid = data;
      await this.addSelf(personName);
    },
    async joinHousehold(code, personName) {
      const { data, error } = await sb.rpc('join_household', { p_code: code });
      fail(error);
      hid = data;
      await this.addSelf(personName);
    },
    async addSelf(name) {
      const { data: { user } } = await sb.auth.getUser();
      const { error } = await sb.from('people').insert(withHousehold({ name, user_id: user.id }));
      fail(error);
    },
    async load() {
      const q = (t, cols = '*') => sb.from(t).select(cols).eq('household_id', hid);
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
        people: people.data,
        jobs: jobs.data,
        shifts: shifts.data,
        expenses: expenses.data,
        plans: Object.fromEntries(plans.data.map((p) => [p.month.slice(0, 7), p])),
        recurring: recurring.data,
      };
    },
    async upsert(table, row) {
      const { error } = await sb.from(table).upsert(withHousehold(row));
      fail(error);
    },
    /**
     * Avisa (onChange(payload)) cuando cambia algo del hogar en otro dispositivo.
     * Los borrados no se pueden filtrar por hogar, así que llegan aparte y solo con la clave de la fila.
     * Devuelve una función para dejar de escuchar.
     */
    subscribe(onChange) {
      const ch = sb.channel(`hogar-${hid}`);
      for (const table of LIVE_TABLES) {
        ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `household_id=eq.${hid}` }, onChange);
        ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `household_id=eq.${hid}` }, onChange);
        ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, onChange);
      }
      ch.subscribe();
      return () => sb.removeChannel(ch);
    },
    /** Inserta filas y se salta las que ya existen según onConflict ('col1,col2'). */
    async insertIgnore(table, rows, onConflict) {
      const { error } = await sb.from(table).upsert(rows.map(withHousehold), { onConflict, ignoreDuplicates: true });
      fail(error);
    },
    async remove(table, match) {
      const { error } = await sb.from(table).delete().match({ ...match, household_id: hid });
      fail(error);
    },
  };
}

function demoBackend() {
  let data = null;
  let signedIn = false;
  const listeners = [];
  const household = { id: 'demo', name: 'Casa de ejemplo', invite_code: 'DEMO2026' };
  const keyOf = (table, row) =>
    table === 'shifts' ? `${row.job_id}_${row.week_start}` : table === 'month_plans' ? row.month : row.id;
  const field = (table) => (table === 'recurring_expenses' ? 'recurring' : table);
  const tableOf = (table) => (table === 'month_plans' ? null : data[field(table)]);

  return {
    demo: true,
    async session() {
      return signedIn ? { user: { id: 'demo', email: 'demo@ejemplo.es' } } : null;
    },
    onAuthChange(cb) {
      listeners.push(cb);
    },
    async signIn() {
      signedIn = true;
      listeners.forEach((cb) => cb({ user: { id: 'demo', email: 'demo@ejemplo.es' } }));
    },
    async signUp() {
      await this.signIn();
      return { needsConfirmation: false };
    },
    async resetPassword() {},
    async updatePassword() {},
    subscribe() {
      return () => {}; // en el modo demo no hay otro dispositivo
    },
    async signOut() {
      signedIn = false;
      listeners.forEach((cb) => cb(null));
    },
    async household() {
      return household;
    },
    async load() {
      data ??= exampleData();
      return structuredClone(data);
    },
    async upsert(table, row) {
      if (table === 'month_plans') {
        data.plans[row.month.slice(0, 7)] = { ...row };
        return;
      }
      const list = tableOf(table);
      const i = list.findIndex((r) => keyOf(table, r) === keyOf(table, row));
      if (i >= 0) list[i] = { ...list[i], ...row };
      else list.unshift({ ...row });
    },
    async insertIgnore(table, rows, onConflict) {
      const keys = onConflict.split(',');
      const list = tableOf(table);
      for (const row of rows) {
        if (!list.some((r) => keys.every((k) => r[k] === row[k]))) list.unshift({ ...row });
      }
    },
    async remove(table, match) {
      const ok = (r) => Object.entries(match).every(([k, v]) => r[k] === v);
      data[field(table)] = tableOf(table).filter((r) => !ok(r));
      if (table === 'people') data.jobs = data.jobs.filter((j) => j.person_id !== match.id);
      if (table === 'jobs') data.shifts = data.shifts.filter((s) => s.job_id !== match.id);
      if (table === 'recurring_expenses') for (const e of data.expenses) if (e.recurring_id === match.id) e.recurring_id = null;
    },
  };
}

export const backend = isConfigured ? supabaseBackend() : demoBackend();
