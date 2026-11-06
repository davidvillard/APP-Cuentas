import { backend, isConfigured } from './backend.js';
import {
  CATEGORIES, categoryName, addDays, addMonths, parseDate, todayIso, weekStart, toNumber,
  monthSummary, plannedVsPaid, expenseValue, recurringDue,
} from './calc.js';

// ---------- Formato ----------
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: 'always' });
const eur0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });
const eur2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
// Sin decimales si el importe es entero; si no, siempre dos (352,80 €, no 352,8 €).
const money = (v) => {
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? eur.format(r) : eur2.format(r);
};
const money0 = (v) => eur0.format(v);
const decimal = (v) => (v ? String(Math.round(v * 100) / 100).replace('.', ',') : '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const monthName = (ym) => parseDate(`${ym}-01`).toLocaleDateString('es-ES', { month: 'long' });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const monthLong = (ym) => parseDate(`${ym}-01`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
const monthShort = (ym) => parseDate(`${ym}-01`).toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
const dayLong = (s) => parseDate(s).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const uuid = () => crypto.randomUUID();

// ---------- Estado ----------
const today = todayIso();
const S = {
  screen: 'boot', // boot | auth | onboarding | app
  authMode: 'login',
  session: null,
  household: null,
  data: null,
  tab: 'resumen',
  ym: today.slice(0, 7),
  week: weekStart(today),
  reportYm: null,
  payId: null,
  confirmId: null,
  editId: null, // gasto que se está editando en el formulario de arriba
  // El enlace del correo de recuperación vuelve con #...type=recovery
  recovering: location.hash.includes('type=recovery'),
  busy: false,
  error: '',
  info: '',
};

const app = document.getElementById('app');
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

// Re-render conservando el foco y la selección del campo activo.
function render() {
  const active = document.activeElement;
  const focusId = active && app.contains(active) ? active.id : null;
  const sel = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  app.innerHTML = screens[S.screen]();
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      if (sel && el.setSelectionRange) try { el.setSelectionRange(...sel); } catch {}
    }
  }
}

// ---------- Flujo de sesión ----------
async function enter(session) {
  S.session = session;
  if (session && S.recovering) {
    S.screen = 'reset';
    return render();
  }
  if (!session) {
    stopLiveUpdates();
    S.screen = 'auth';
    S.household = null;
    S.data = null;
    return render();
  }
  try {
    S.household = await backend.household();
    if (!S.household) {
      S.screen = 'onboarding';
      return render();
    }
    S.data = await backend.load();
    await syncRecurring();
    S.screen = 'app';
    startLive();
  } catch (e) {
    S.screen = 'auth';
    S.error = e.message;
  }
  render();
}

async function reload() {
  pendingRefresh = false;
  S.data = await backend.load();
  render();
}

// ---------- Cambios en directo ----------
// Cuando la otra persona cambia algo, se recargan los datos. Si estás escribiendo
// (un campo con el foco, el formulario a medias, editando o marcando un pago), se espera.
let stopLive = null;
let refreshTimer;
let pendingRefresh = false;

function startLive() {
  stopLive?.();
  stopLive = backend.subscribe(onRemoteChange);
}
function stopLiveUpdates() {
  stopLive?.();
  stopLive = null;
}

function onRemoteChange(payload) {
  // Los borrados llegan de todos los hogares y solo con la clave: se ignoran los que no son nuestros.
  if (payload.eventType === 'DELETE' && !isOurs(payload.old || {})) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(tryRefresh, 400); // agrupa varios cambios seguidos en una recarga
}
function isOurs(old) {
  const d = S.data;
  if (!d) return false;
  if (old.household_id && old.household_id === S.household?.id) return true;
  return [d.people, d.jobs, d.expenses, d.recurring].some((list) => list.some((r) => r.id === old.id))
    || (old.job_id && d.jobs.some((j) => j.id === old.job_id));
}
function canRefresh() {
  const a = document.activeElement;
  const typing = a && app.contains(a) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(a.tagName);
  const draft = document.getElementById('f-amount')?.value || document.getElementById('f-note')?.value;
  return S.screen === 'app' && !typing && !draft && !S.editId && !S.payId;
}
function tryRefresh() {
  if (!canRefresh()) { pendingRefresh = true; return; }
  reload().catch(() => {});
}
// Al salir de un campo, aplica la recarga que estaba esperando.
app.addEventListener('focusout', () => setTimeout(() => { if (pendingRefresh) tryRefresh(); }, 0));

/**
 * Apunta como previstos los gastos fijos que faltan hasta el mes visible (o el actual, si es posterior).
 * Si dos móviles lo hacen a la vez, la base de datos ignora los repetidos.
 */
async function syncRecurring() {
  const now = today.slice(0, 7);
  const upTo = S.ym > now ? S.ym : now;
  const due = recurringDue(S.data.recurring, upTo);
  if (!due.length) return;
  await backend.insertIgnore('expenses', due.map(({ template: t, date }) => ({
    id: uuid(), date, category: t.category, note: t.note, person_id: t.person_id,
    status: 'planned', planned: Number(t.amount), amount: null, recurring_id: t.id,
  })), 'recurring_id,date');
  for (const t of new Set(due.map((x) => x.template))) {
    await backend.upsert('recurring_expenses', { ...t, last_month: `${upTo}-01` });
  }
  S.data = await backend.load();
}

/** Ejecuta una escritura, recarga los datos y muestra el error si falla. */
async function mutate(fn, okMsg) {
  try {
    await fn();
    await reload();
    if (okMsg) toast(okMsg);
  } catch (e) {
    toast(e.message || 'No se pudo guardar.');
    await reload().catch(() => {});
  }
}

// ---------- Pantallas ----------
const screens = {
  boot: () => `<p class="muted" style="padding-top:40px">Cargando…</p>`,
  auth: authScreen,
  reset: resetScreen,
  onboarding: onboardingScreen,
  app: appScreen,
};

const brand = `<div class="brand"><img class="brand-mark" src="/tilo-hoja.svg" alt="" width="28" height="28">tilo</div>`;

function authScreen() {
  const signup = S.authMode === 'signup';
  const forgot = S.authMode === 'forgot';
  return `
  <header class="top">${brand}${!isConfigured ? '<span class="pill">Modo demo</span>' : ''}</header>
  <div class="auth">
    <div class="auth-copy">
      <h1>Lo que entra, lo que sale y lo que os queda.</h1>
      <p>Sueldos fijos o por horas, gastos previstos y reales, y cada mes un informe de cuánto habéis ahorrado.</p>
      <div class="sample" aria-hidden="true">
        <div class="line"><span>Nómina de Alex</span><span>2.150 €</span></div>
        <div class="line"><span>Sara, 118 h a 9,80 €</span><span>1.156 €</span></div>
        <div class="line"><span>Gastos del mes</span><span>−1.902 €</span></div>
        <div class="line total"><span>Os quedan</span><span>1.404 €</span></div>
      </div>
    </div>
    ${forgot ? `<form class="auth-form" id="forgot-form" novalidate>
      <h2>Recuperar la contraseña</h2>
      <p class="muted">Escribe el email de tu cuenta y te enviamos un enlace para elegir una nueva.</p>
      <label class="field">Email<input id="forgot-email" name="email" type="email" autocomplete="email" required></label>
      ${S.error ? `<p class="error" role="alert">${esc(S.error)}</p>` : ''}
      ${S.info ? `<p class="note" role="status">${esc(S.info)}</p>` : ''}
      <button class="primary" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Un momento…' : 'Enviar enlace'}</button>
      <p class="small muted"><button type="button" class="link" data-act="auth-mode" data-mode="login">Volver a entrar</button></p>
    </form>` : `<form class="auth-form" id="auth-form" novalidate>
      <h2>${signup ? 'Crear cuenta' : 'Entrar'}</h2>
      ${!isConfigured ? `<p class="note">Supabase aún no está configurado. Puedes entrar con cualquier email y contraseña para ver la app con datos de ejemplo.</p>` : ''}
      <label class="field">Email<input id="auth-email" name="email" type="email" autocomplete="email" required></label>
      <label class="field">Contraseña<input id="auth-pass" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="8" required></label>
      ${signup ? '<p class="small muted">Mínimo 8 caracteres.</p>' : '<p class="small"><button type="button" class="link" data-act="auth-mode" data-mode="forgot">¿Has olvidado la contraseña?</button></p>'}
      ${S.error ? `<p class="error" role="alert">${esc(S.error)}</p>` : ''}
      ${S.info ? `<p class="note" role="status">${esc(S.info)}</p>` : ''}
      <button class="primary" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Un momento…' : signup ? 'Crear cuenta' : 'Entrar'}</button>
      <p class="small muted">${signup ? '¿Ya tienes cuenta?' : '¿Es tu primera vez?'}
        <button type="button" class="link" data-act="auth-mode" data-mode="${signup ? 'login' : 'signup'}">${signup ? 'Entrar' : 'Crear cuenta'}</button></p>
    </form>`}
  </div>`;
}

// Pantalla a la que lleva el enlace del correo de recuperación.
function resetScreen() {
  return `
  <header class="top">${brand}</header>
  <div class="auth">
    <form class="auth-form" id="reset-form" novalidate>
      <h2>Elige una contraseña nueva</h2>
      <p class="muted">Para ${esc(S.session?.user?.email)}. Mínimo 8 caracteres.</p>
      <label class="field">Contraseña nueva<input id="reset-pass" name="password" type="password" autocomplete="new-password" minlength="8" required></label>
      ${S.error ? `<p class="error" role="alert">${esc(S.error)}</p>` : ''}
      <button class="primary" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Un momento…' : 'Guardar contraseña'}</button>
    </form>
  </div>`;
}

function onboardingScreen() {
  return `
  <header class="top">${brand}<div class="who">${esc(S.session?.user?.email)}<button class="quiet" data-act="logout">Salir</button></div></header>
  <div class="cols" style="padding-top:24px">
    <form class="section" id="create-form">
      <h2>Crear vuestro hogar</h2>
      <p class="muted">Es donde se guardan los sueldos y gastos. Luego invitas a tu pareja o compañeros con un código.</p>
      <label class="field">Tu nombre<input id="ob-name" name="person" required placeholder="Por ejemplo, David"></label>
      <label class="field">Nombre del hogar<input id="ob-house" name="house" placeholder="Casa"></label>
      <div><button class="primary" type="submit" ${S.busy ? 'disabled' : ''}>Crear hogar</button></div>
    </form>
    <form class="section" id="join-form">
      <h2>Unirme a un hogar</h2>
      <p class="muted">Si alguien ya lo creó, pídele el código de invitación. Lo tiene en Perfiles.</p>
      <label class="field">Tu nombre<input id="ob-name2" name="person" required></label>
      <label class="field">Código de invitación<input id="ob-code" name="code" required maxlength="8" style="text-transform:uppercase;letter-spacing:.1em"></label>
      <div><button type="submit" ${S.busy ? 'disabled' : ''}>Unirme</button></div>
    </form>
  </div>
  ${S.error ? `<p class="error" role="alert" style="padding-top:20px">${esc(S.error)}</p>` : ''}`;
}

function appScreen() {
  const tabs = [['resumen', 'Resumen'], ['gastos', 'Gastos'], ['horarios', 'Horarios'], ['perfiles', 'Perfiles'], ['informe', 'Informe']];
  const showMonth = S.tab !== 'horarios' && S.tab !== 'perfiles';
  return `
  <header class="top">
    ${brand}
    <div class="who">${backend.demo ? '<span class="pill">Modo demo<span class="pill-long">: los cambios no se guardan</span></span>' : ''}
      <span class="hh">${esc(S.household?.name)}</span><span class="faint hh">·</span><span class="email">${esc(S.session?.user?.email)}</span>
      <button class="quiet" data-act="logout">Salir</button></div>
  </header>
  <div class="nav">
    <nav class="tabs" aria-label="Secciones">${tabs.map(([id, name]) => `<button data-act="tab" data-tab="${id}" ${S.tab === id ? 'aria-current="page"' : ''}>${name}</button>`).join('')}</nav>
    ${showMonth ? `<div class="month">
      <button class="quiet" data-act="month" data-n="-1" aria-label="Mes anterior">‹</button>
      <strong>${monthLong(S.ym)}</strong>
      <button class="quiet" data-act="month" data-n="1" aria-label="Mes siguiente">›</button></div>` : ''}
  </div>
  <main>${views[S.tab]()}</main>`;
}

// ---------- Resumen ----------
function resumen() {
  const d = S.data;
  if (!d.jobs.length && !d.expenses.length) {
    return `<div class="empty"><h2>Todavía no hay nada que sumar</h2>
      <p class="muted">Empieza añadiendo tu trabajo en Perfiles: sueldo fijo o por horas. Después apunta los gastos del mes.</p>
      <button class="primary" data-act="tab" data-tab="perfiles">Añadir mi trabajo</button></div>`;
  }
  const M = monthSummary(d, S.ym);
  const { income, spending, plan, goal, left } = M;
  const plural = d.people.length > 1;
  const isPast = S.ym < today.slice(0, 7);
  const verb = isPast ? (plural ? 'os quedaron' : 'te quedaron') : plural ? 'os quedarán' : 'te quedarán';

  const scale = Math.max(income.total, spending.paid + spending.pending, 1);
  const pct = (v) => `${Math.max(0, (v / scale) * 100)}%`;
  const free = Math.max(0, left);
  const overflow = Math.max(0, -left);
  const goalPos = income.total > 0 && goal > 0 ? Math.min(100, ((income.total - goal) / scale) * 100) : null;

  const rows = CATEGORIES.map((c) => {
    const v = spending.byCategory[c.id] || { paid: 0, pending: 0 };
    const b = Number(plan.budgets?.[c.id] || 0);
    return { c, v, b, total: v.paid + v.pending };
  });
  const shown = rows.filter((r) => r.b || r.total);
  const hidden = rows.filter((r) => !r.b && !r.total);
  const max = Math.max(1, ...shown.map((r) => Math.max(r.b, r.total)));

  let goalLine = '';
  if (goal > 0) goalLine = left >= goal
    ? ` El objetivo era ahorrar <b>${money0(goal)}</b>: ${plural ? 'vais' : 'vas'} <b>${money0(left - goal)}</b> por encima.`
    : ` El objetivo era ahorrar <b>${money0(goal)}</b>: ${plural ? 'os faltan' : 'te faltan'} <b>${money0(goal - left)}</b>.`;

  return `
  <section class="hero">
    <h1>En ${monthName(S.ym)} ${verb} <span class="amt ${left < 0 ? 'neg' : ''}">${money0(left)}</span></h1>
    <p>Entran <b>${money0(income.total)}</b>${income.estimated > 0.5 ? ` (${money0(income.estimated)} estimados por semanas sin horario)` : ''},
      ${plural ? 'lleváis' : 'llevas'} gastados <b>${money0(spending.paid)}</b>${spending.pending ? ` y hay <b>${money0(spending.pending)}</b> previstos` : ''}.${goalLine}</p>
    <div class="bar-wrap">
      <div class="bar" role="img" aria-label="Reparto de los ingresos del mes">
        <i class="paid" style="width:${pct(Math.min(spending.paid, scale))}"></i>
        <i class="pending" style="width:${pct(spending.pending)}"></i>
        <i class="free" style="width:${pct(free)}"></i>
        <i class="overflow" style="width:${pct(overflow)}"></i>
      </div>
      ${goalPos != null ? `<div class="goal-mark" style="left:${goalPos}%"><span>ahorro ${money0(goal)}</span></div>` : ''}
    </div>
    <div class="legend">
      <span><i style="background:var(--ink)"></i>Gastado</span>
      <span><i style="background:var(--plan)"></i>Previsto</span>
      <span><i style="background:var(--in-soft);outline:1px solid var(--in)"></i>Libre</span>
      ${overflow ? '<span><i style="background:var(--over)"></i>Por encima de los ingresos</span>' : ''}
    </div>
  </section>
  <div class="cols">
    <section class="section">
      <div class="section-head"><h2>Por categoría</h2><span class="small muted">La raya verde es el presupuesto</span></div>
      <div class="scroll"><table>
        <thead><tr><th>Categoría</th><th style="width:34%"></th><th class="r">Gastado</th><th class="r">Presupuesto</th></tr></thead>
        <tbody>${shown.map(({ c, v, b, total }) => {
          const over = b > 0 && total > b;
          return `<tr>
            <td>${c.name} ${over ? '<span class="tag bad">pasado</span>' : ''}</td>
            <td><div class="meter">
              <i class="m-pending" style="width:${(total / max) * 100}%"></i>
              <i class="m-paid ${over ? 'over' : ''}" style="width:${(v.paid / max) * 100}%"></i>
              ${b ? `<b style="left:calc(${(b / max) * 100}% - 1px)"></b>` : ''}</div></td>
            <td class="r">${money(total)}</td>
            <td class="r"><input class="amount" id="bud-${c.id}" inputmode="decimal" data-act="budget" data-cat="${c.id}" value="${decimal(b)}" placeholder="—" aria-label="Presupuesto de ${c.name}"></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      ${hidden.length ? `<div class="row small"><span class="muted">Añadir:</span>${hidden.map((r) => `<button class="quiet" data-act="show-cat" data-cat="${r.c.id}">${r.c.name}</button>`).join('')}</div>` : ''}
      ${plan.inheritedFrom ? `<p class="small muted">Presupuesto copiado de ${monthLong(plan.inheritedFrom)}. Si cambias algo, se guarda para ${monthName(S.ym)}.</p>` : ''}
    </section>
    <aside class="stack">
      <section class="section">
        <h2>Objetivo de ahorro</h2>
        <label class="field">Cuánto queréis ahorrar en ${monthName(S.ym)}
          <input class="amount" style="width:100%;text-align:left" id="goal" inputmode="decimal" data-act="goal" value="${decimal(goal)}" placeholder="Por ejemplo, 400"></label>
      </section>
      <section class="section">
        <h2>Ingresos</h2>
        <table><tbody>${d.people.map((p) => {
          const rs = income.rows.filter((r) => r.job.person_id === p.id);
          if (!rs.length) return '';
          const total = rs.reduce((s, r) => s + r.amount + r.estimate, 0);
          const detail = rs.map((r) => r.job.type === 'fixed'
            ? `${esc(r.job.name)}${Number(r.job.payments) === 14 && /-(06|12)$/.test(S.ym) ? ', con paga extra' : ''}`
            : `${esc(r.job.name)}, ${decimal(r.hours) || 0} h${r.estHours > 0.1 ? ` + ${Math.round(r.estHours)} h estimadas` : ''}`).join('<br>');
          return `<tr><td><b>${esc(p.name)}</b><div class="small muted">${detail}</div></td><td class="r">${money(total)}</td></tr>`;
        }).join('')}</tbody></table>
      </section>
    </aside>
  </div>`;
}

// ---------- Gastos ----------
function gastos() {
  const d = S.data;
  const list = d.expenses.filter((e) => e.date.startsWith(S.ym))
    .sort((a, b) => b.date.localeCompare(a.date) || (a.status === 'planned' ? -1 : 1));
  const paid = list.filter((e) => e.status === 'real').reduce((s, e) => s + expenseValue(e), 0);
  const pending = list.filter((e) => e.status === 'planned').reduce((s, e) => s + expenseValue(e), 0);
  const byDay = {};
  for (const e of list) (byDay[e.date] ??= []).push(e);
  const who = (id) => (id ? esc(d.people.find((p) => p.id === id)?.name || '—') : 'Común');
  const defaultDate = S.ym === today.slice(0, 7) ? today : `${S.ym}-01`;
  const ed = S.editId && d.expenses.find((e) => e.id === S.editId);

  return `
  <div class="stack" style="gap:32px">
    <form class="add-form ${ed ? 'editing' : ''}" id="add-expense" novalidate>
      ${ed ? `<p class="edit-note">Editando <b>${esc(ed.note) || categoryName(ed.category)}</b> del ${dayLong(ed.date)}</p>` : ''}
      <label class="field">Fecha<input type="date" id="f-date" name="date" value="${ed ? ed.date : defaultDate}" required></label>
      <label class="field">Importe<input id="f-amount" name="amount" inputmode="decimal" placeholder="0,00 €" value="${ed ? decimal(expenseValue(ed)) : ''}" required></label>
      <label class="field">Categoría<select id="f-cat" name="category">${CATEGORIES.map((c) => `<option value="${c.id}" ${ed?.category === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select></label>
      <label class="field">Quién paga<select id="f-who" name="person"><option value="">Común</option>${d.people.map((p) => `<option value="${p.id}" ${ed?.person_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="field wide">Concepto<input id="f-note" name="note" placeholder="Compra semanal, cine, luz…" value="${ed ? esc(ed.note) : ''}"></label>
      <div class="actions">
        <label class="check"><input type="checkbox" id="f-planned" name="planned" ${ed?.status === 'planned' ? 'checked' : ''}> Aún no lo he pagado</label>
        ${ed ? '' : '<label class="check"><input type="checkbox" id="f-repeat" name="repeat"> Se repite cada mes</label>'}
        ${ed ? '<button type="button" class="quiet" data-act="cancel-edit">Cancelar</button><button class="primary" type="submit">Guardar cambios</button>'
          : '<button class="primary" type="submit">Añadir gasto</button>'}
      </div>
    </form>
    <section class="section">
      <div class="section-head"><h2>Gastos de ${monthName(S.ym)}</h2>
        <span class="num">${money(paid)} <span class="muted small">pagado</span>${pending ? ` · ${money(pending)} <span class="muted small">previsto</span>` : ''}</span></div>
      ${list.length ? Object.entries(byDay).map(([day, items]) => `
        <div><div class="day">${dayLong(day)}</div>
        ${items.map((e) => {
          const planned = e.status === 'planned';
          const diff = !planned && e.planned != null ? Number(e.amount) - Number(e.planned) : null;
          return `<div class="exp ${S.editId === e.id ? 'sel' : ''}">
            <div class="what"><b>${esc(e.note) || categoryName(e.category)}</b>
              <div class="meta">${categoryName(e.category)} · ${who(e.person_id)}
                ${planned ? '<span class="tag plan">previsto</span>' : ''}
                ${e.recurring_id ? '<span class="tag fixed">cada mes</span>' : ''}
                ${diff != null && Math.abs(diff) > 0.004 ? `<span class="tag ${diff < 0 ? 'good' : 'bad'}">${diff < 0 ? `${money(-diff)} menos de lo previsto` : `${money(diff)} más de lo previsto`}</span>` : ''}</div></div>
            <div class="value ${planned ? 'planned' : ''}">${diff != null ? `<s>${money(Number(e.planned))}</s>` : ''}${money(expenseValue(e))}</div>
            <div class="acts">
              ${planned ? (S.payId === e.id
                ? `<input class="amount" id="pay-${e.id}" inputmode="decimal" value="${decimal(Number(e.planned))}" aria-label="Importe pagado"><button class="primary" data-act="pay-save" data-id="${e.id}">Guardar</button>`
                : `<button data-act="pay" data-id="${e.id}">Marcar pagado</button>`) : ''}
              ${S.payId === e.id ? '' : `<button class="quiet" data-act="edit-expense" data-id="${e.id}" aria-label="Editar ${esc(e.note) || 'gasto'}">Editar</button>`}
              ${S.confirmId === e.id
                ? `<button class="danger" data-act="delete-expense" data-id="${e.id}">Borrar</button><button class="quiet" data-act="cancel">No</button>`
                : `<button class="quiet" data-act="confirm" data-id="${e.id}" aria-label="Borrar ${esc(e.note) || 'gasto'}">✕</button>`}
            </div></div>`;
        }).join('')}</div>`).join('')
      : `<p class="muted">Sin gastos en ${monthName(S.ym)}. Apunta el primero arriba; si aún no lo has pagado, márcalo como previsto.</p>`}
    </section>
    <section class="section">
      <div class="section-head"><h2>Gastos fijos</h2></div>
      <p class="muted small" style="max-width:62ch">Se apuntan solos como previstos al empezar cada mes. Cuando los pagues, márcalos como pagados con el importe real. Para añadir uno, marca «Se repite cada mes» al apuntar un gasto.</p>
      ${d.recurring.length ? d.recurring.map((t) => `<div class="exp rec">
          <div class="what"><b>${esc(t.note) || categoryName(t.category)}</b>
            <div class="meta">${categoryName(t.category)} · ${who(t.person_id)} · día ${t.day}</div></div>
          <input class="amount" id="rec-${t.id}" inputmode="decimal" data-act="rec-amount" data-id="${t.id}" value="${decimal(Number(t.amount))}" aria-label="Importe de ${esc(t.note) || 'gasto fijo'}">
          <div class="acts">${S.confirmId === t.id
            ? `<button class="danger" data-act="delete-rec" data-id="${t.id}">Quitar</button><button class="quiet" data-act="cancel">No</button>`
            : `<button class="quiet" data-act="confirm" data-id="${t.id}" aria-label="Quitar ${esc(t.note) || 'gasto fijo'}">✕</button>`}</div>
        </div>`).join('')
      : '<p class="muted small">Todavía no hay ninguno.</p>'}
    </section>
  </div>`;
}

// ---------- Horarios ----------
function horarios() {
  const d = S.data;
  const jobs = d.jobs.filter((j) => j.type === 'hourly');
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(S.week, i));
  const shiftOf = (job) => d.shifts.find((s) => s.job_id === job.id && s.week_start === S.week);
  const first = parseDate(days[0]), last = parseDate(days[6]);
  const range = first.getMonth() === last.getMonth()
    ? `${first.getDate()} al ${last.getDate()} de ${last.toLocaleDateString('es-ES', { month: 'long' })}`
    : `${first.getDate()} de ${first.toLocaleDateString('es-ES', { month: 'long' })} al ${last.getDate()} de ${last.toLocaleDateString('es-ES', { month: 'long' })}`;
  const thisWeek = weekStart(today);

  return `
  <section class="section">
    <div class="section-head">
      <h2>Semana del ${range}</h2>
      <div class="row">
        <button class="quiet" data-act="week" data-n="-7" aria-label="Semana anterior">‹</button>
        <button data-act="week-set" data-w="${thisWeek}" ${S.week === thisWeek ? 'disabled' : ''}>Esta semana</button>
        <button data-act="week-set" data-w="${addDays(thisWeek, 7)}" ${S.week === addDays(thisWeek, 7) ? 'disabled' : ''}>La que viene</button>
        <button class="quiet" data-act="week" data-n="7" aria-label="Semana siguiente">›</button>
      </div>
    </div>
    <p class="muted" style="max-width:68ch">Cuando te llegue el horario, apunta las horas de cada día. Las semanas sin horario cuentan con las horas habituales del trabajo, marcadas como estimadas.</p>
    ${jobs.length ? `<div class="week">
      ${jobs.map((job) => {
        const s = shiftOf(job);
        const person = d.people.find((p) => p.id === job.person_id);
        const total = s ? s.hours.reduce((a, b) => a + Number(b || 0), 0) : 0;
        return `<div class="wjob">
          <div class="wjob-info"><b>${esc(job.name)}</b><div class="small muted">${esc(person?.name)} · ${money(Number(job.hourly_rate || 0))}/h</div></div>
          <div class="wdays">${days.map((day, i) => `<label class="wday ${day === today ? 'today' : ''}"><span>${DOW[i]} ${parseDate(day).getDate()}</span><input class="hours" id="h-${job.id}-${i}" inputmode="decimal" data-act="shift" data-job="${job.id}" value="${s ? decimal(Number(s.hours[i])) : ''}" placeholder="–" aria-label="${esc(job.name)}, ${dayLong(day)}, horas"></label>`).join('')}</div>
          <div class="sum">${s
            ? `<b>${decimal(total) || 0} h</b><div class="small">${money(total * Number(job.hourly_rate || 0))}</div>`
            : `<span class="tag plan">estimado</span><div class="small muted">${decimal(Number(job.usual_hours || 0))} h · ${money(Number(job.usual_hours || 0) * Number(job.hourly_rate || 0))}</div>`}</div>
        </div>`;
      }).join('')}
    </div>`
    : `<div class="empty"><p class="muted">Aquí aparecen los trabajos por horas. Ahora mismo no hay ninguno.</p><button data-act="tab" data-tab="perfiles">Añadir un trabajo por horas</button></div>`}
  </section>`;
}

// ---------- Perfiles ----------
function perfiles() {
  const d = S.data;
  const me = S.session?.user?.id;
  const input = (job, f, extra = '') => `id="j-${f}-${job.id}" data-act="job" data-job="${job.id}" data-f="${f}" ${extra}`;
  return `
  <div class="stack" style="gap:28px">
    <div class="invite">
      <div><h3>Invita a tu hogar</h3><p class="small muted">Quien se registre puede unirse con este código y verá los mismos datos.</p></div>
      <div class="row"><span class="code">${esc(S.household.invite_code)}</span><button data-act="copy-code">Copiar</button></div>
    </div>
    <div>
    ${d.people.map((p) => {
      const jobs = d.jobs.filter((j) => j.person_id === p.id);
      return `<section class="person">
        <div class="row between">
          <input class="person-name" id="pn-${p.id}" data-act="person-name" data-id="${p.id}" value="${esc(p.name)}" aria-label="Nombre">
          ${p.user_id ? `<span class="small muted">${p.user_id === me ? 'Tu perfil' : 'Tiene cuenta'}</span>`
            : S.confirmId === p.id ? `<div class="row"><button class="danger" data-act="delete-person" data-id="${p.id}">Borrar a ${esc(p.name)} y sus trabajos</button><button class="quiet" data-act="cancel">No</button></div>`
            : `<button class="quiet" data-act="confirm" data-id="${p.id}">Borrar perfil</button>`}
        </div>
        ${jobs.map((j) => `<div class="job">
          <label class="field job-name">Trabajo<input ${input(j, 'name')} value="${esc(j.name)}"></label>
          <label class="field">Tipo<select ${input(j, 'type')}>
            <option value="fixed" ${j.type === 'fixed' ? 'selected' : ''}>Sueldo fijo</option>
            <option value="hourly" ${j.type === 'hourly' ? 'selected' : ''}>Por horas</option></select></label>
          ${j.type === 'fixed' ? `
            <label class="field">Neto por paga<input class="amount" style="width:100%" inputmode="decimal" ${input(j, 'monthly_net')} value="${decimal(Number(j.monthly_net || 0))}"></label>
            <label class="field">Pagas al año<select ${input(j, 'payments')}>
              <option value="12" ${Number(j.payments) !== 14 ? 'selected' : ''}>12 pagas</option>
              <option value="14" ${Number(j.payments) === 14 ? 'selected' : ''}>14 pagas</option></select></label>
            <label class="field">Horas a la semana<input class="amount" style="width:100%" inputmode="decimal" ${input(j, 'usual_hours')} value="${decimal(Number(j.usual_hours || 0))}"></label>`
          : `
            <label class="field">€ por hora<input class="amount" style="width:100%" inputmode="decimal" ${input(j, 'hourly_rate')} value="${decimal(Number(j.hourly_rate || 0))}"></label>
            <label class="field">Horas a la semana<input class="amount" style="width:100%" inputmode="decimal" ${input(j, 'usual_hours')} value="${decimal(Number(j.usual_hours || 0))}"></label>
            <div class="field">Al mes, aprox.<span class="derived">${money((Number(j.hourly_rate || 0) * Number(j.usual_hours || 0) * 52) / 12)}</span></div>`}
          ${S.confirmId === j.id
            ? `<button class="danger" data-act="delete-job" data-id="${j.id}">Quitar</button>`
            : `<button class="quiet" data-act="confirm" data-id="${j.id}" aria-label="Quitar ${esc(j.name)}">✕</button>`}
        </div>`).join('') || '<p class="muted">Sin trabajos todavía.</p>'}
        <div class="row"><button data-act="add-job" data-person="${p.id}" data-type="fixed">Añadir sueldo fijo</button><button data-act="add-job" data-person="${p.id}" data-type="hourly">Añadir trabajo por horas</button></div>
      </section>`;
    }).join('')}
    </div>
    <div><button data-act="add-person">Añadir otra persona sin cuenta</button></div>
  </div>`;
}

// ---------- Informe ----------
function informe() {
  const d = S.data;
  const yms = [-5, -4, -3, -2, -1, 0].map((n) => addMonths(S.ym, n));
  const ms = yms.map((ym) => monthSummary(d, ym));
  const sel = ms.find((m) => m.ym === S.reportYm) || ms.at(-1);

  const W = 680, H = 250, L = 60, B = 30, T = 12;
  const max = Math.max(100, ...ms.map((m) => Math.max(m.income.total, m.spending.paid + m.spending.pending))) * 1.08;
  const step = niceStep(max / 4);
  const ticks = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const gw = (W - L) / ms.length, bw = gw * 0.28;
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y gastos de los últimos seis meses">
    ${ticks.map((v) => `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 10}" y="${y(v) + 4}" text-anchor="end">${money0(v)}</text>`).join('')}
    ${ms.map((m, i) => {
      const x = L + i * gw, spent = m.spending.paid + m.spending.pending;
      return `<g class="g ${m === sel ? 'sel' : ''}" data-act="report-month" data-ym="${m.ym}" tabindex="0" role="button" aria-label="Ver ${monthLong(m.ym)}">
        <rect class="hit" x="${x + 3}" y="${T}" width="${gw - 6}" height="${H - T - B}" rx="6"/>
        <rect x="${x + gw / 2 - bw - 2}" y="${y(m.income.total)}" width="${bw}" height="${y(0) - y(m.income.total)}" fill="var(--in)" rx="2"/>
        <rect x="${x + gw / 2 + 2}" y="${y(m.spending.paid)}" width="${bw}" height="${y(0) - y(m.spending.paid)}" fill="${spent > m.income.total ? 'var(--over)' : 'var(--ink)'}" rx="2"/>
        ${m.spending.pending > 0 ? `<rect x="${x + gw / 2 + 2}" y="${y(spent)}" width="${bw}" height="${y(m.spending.paid) - y(spent)}" fill="var(--plan)" rx="2"/>` : ''}
        <text class="m" x="${x + gw / 2}" y="${H - 9}" text-anchor="middle">${monthShort(m.ym)}</text></g>`;
    }).join('')}
  </svg>`;

  const comps = plannedVsPaid(d, sel.ym);
  const compTotal = comps.reduce((s, c) => s + c.diff, 0);
  const cats = CATEGORIES.map((c) => {
    const v = sel.spending.byCategory[c.id] || { paid: 0, pending: 0 };
    return { c, total: v.paid + v.pending, b: Number(sel.plan.budgets?.[c.id] || 0) };
  }).filter((r) => r.total || r.b);

  return `
  <section class="section chart">
    <div class="section-head"><h2>Últimos seis meses</h2>
      <div class="legend" style="padding:0"><span><i style="background:var(--in)"></i>Ingresos</span><span><i style="background:var(--ink)"></i>Gastado</span><span><i style="background:var(--plan)"></i>Previsto</span></div></div>
    <div class="scroll">${svg}</div>
    <div class="scroll"><table>
      <thead><tr><th>Mes</th><th class="r">Ingresos</th><th class="r">Gastado</th><th class="r">Previsto</th><th class="r">Objetivo</th><th class="r">Ahorro</th><th></th></tr></thead>
      <tbody>${ms.map((m) => `<tr class="${m === sel ? 'sel' : ''}">
        <td>${cap(monthLong(m.ym))}</td><td class="r">${money0(m.income.total)}</td>
        <td class="r">${money0(m.spending.paid)}</td><td class="r">${money0(m.spending.pending)}</td>
        <td class="r">${m.goal ? money0(m.goal) : '—'}</td><td class="r"><b>${money0(m.left)}</b></td>
        <td class="r">${m.goal > 0 ? (m.left >= m.goal ? '<span class="tag good">cumplido</span>' : `<span class="tag bad">faltan ${money0(m.goal - m.left)}</span>`) : ''}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>
  <div class="cols">
    <section class="section">
      <h2>${cap(monthLong(sel.ym))}, por categoría</h2>
      <table><thead><tr><th>Categoría</th><th class="r">Gastado</th><th class="r">Presupuesto</th><th class="r">Diferencia</th></tr></thead>
      <tbody>${cats.map(({ c, total, b }) => {
        const diff = b - total;
        return `<tr><td>${c.name}</td><td class="r">${money(total)}</td><td class="r">${b ? money(b) : '—'}</td>
          <td class="r" style="color:var(${!b ? '--ink-3' : diff >= 0 ? '--in' : '--over'})">${b ? `${diff >= 0 ? 'sobran ' : 'pasado '}${money(Math.abs(diff))}` : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="4" class="muted">Sin gastos este mes.</td></tr>'}</tbody></table>
    </section>
    <aside class="stack">
      <section class="section">
        <h2>Previsto frente a pagado</h2>
        ${comps.length ? `<table><tbody>${comps.map(({ expense: e, diff }) => `<tr>
            <td>${esc(e.note) || categoryName(e.category)}<div class="small muted">previsto ${money(Number(e.planned))}, pagado ${money(Number(e.amount))}</div></td>
            <td class="r"><span class="tag ${diff <= 0 ? 'good' : 'bad'}">${diff <= 0 ? '−' : '+'}${money(Math.abs(diff))}</span></td></tr>`).join('')}</tbody></table>
          <p>${compTotal <= 0 ? `En total, <b>${money(-compTotal)}</b> menos de lo previsto.` : `En total, <b>${money(compTotal)}</b> más de lo previsto.`}</p>`
          : '<p class="muted">Cuando marques como pagado un gasto previsto, aquí verás la diferencia.</p>'}
      </section>
      <section class="section">
        <h2>Descargar</h2>
        <div class="row"><button data-act="download-csv" data-ym="${sel.ym}">Gastos en CSV</button><button data-act="download-report" data-ym="${sel.ym}">Informe del mes</button></div>
        <p class="small muted">El CSV se abre en Excel o Google Sheets. El informe es una página que puedes imprimir o guardar como PDF.</p>
      </section>
    </aside>
  </div>`;
}
function niceStep(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

const views = { resumen, gastos, horarios, perfiles, informe };

// ---------- Descargas ----------
function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csvFor(ym) {
  const d = S.data;
  const who = (id) => (id ? d.people.find((p) => p.id === id)?.name || '' : 'Común');
  const num = (v) => (v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ','));
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['Fecha', 'Concepto', 'Categoría', 'Estado', 'Previsto', 'Pagado', 'Quién']];
  for (const e of d.expenses.filter((e) => e.date.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([e.date, e.note, categoryName(e.category), e.status === 'planned' ? 'Previsto' : 'Pagado',
      num(e.planned == null ? null : Number(e.planned)), num(e.status === 'planned' ? null : Number(e.amount)), who(e.person_id)]);
  }
  return '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n');
}
function reportFor(ym) {
  const d = S.data;
  const ms = [-5, -4, -3, -2, -1, 0].map((n) => monthSummary(d, addMonths(ym, n)));
  const m = ms.at(-1);
  const cell = (c, right) => `<td style="padding:7px 10px;border-bottom:1px solid #e2e6ed;${right ? 'text-align:right' : ''}">${c}</td>`;
  const head = (cols) => `<tr>${cols.map((c, i) => `<th style="padding:7px 10px;border-bottom:2px solid #1d2a44;text-align:${i ? 'right' : 'left'}">${c}</th>`).join('')}</tr>`;
  const row = (cols) => `<tr>${cols.map((c, i) => cell(c, i > 0)).join('')}</tr>`;
  const table = (body) => `<table style="border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums">${body}</table>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe de ${monthLong(ym)} – Tilo</title></head>
  <body style="font-family:system-ui,sans-serif;color:#1d2a44;max-width:820px;margin:40px auto;padding:0 20px;line-height:1.5">
  <h1 style="margin:0 0 4px">Informe de ${monthLong(ym)}</h1>
  <p style="color:#5a6578;margin:0 0 28px">${esc(S.household.name)} · generado el ${new Date().toLocaleDateString('es-ES')}</p>
  <h2>Resumen</h2>${table(
    row(['Ingresos', money(m.income.total)]) + (m.income.estimated > 0.5 ? row(['de ellos, estimados', money(m.income.estimated)]) : '') +
    row(['Gastado', money(m.spending.paid)]) + row(['Previsto sin pagar', money(m.spending.pending)]) +
    row(['Objetivo de ahorro', money(m.goal)]) + row(['<b>Ahorro</b>', `<b>${money(m.left)}</b>`]) +
    row(['Diferencia con el objetivo', money(m.left - m.goal)]))}
  <h2>Ingresos por trabajo</h2>${table(head(['Persona y trabajo', 'Horas', 'Importe']) + m.income.rows.map((r) =>
    row([`${esc(d.people.find((p) => p.id === r.job.person_id)?.name)} · ${esc(r.job.name)}`, r.job.type === 'fixed' ? 'fijo' : decimal(r.hours + r.estHours), money(r.amount + r.estimate)])).join(''))}
  <h2>Por categoría</h2>${table(head(['Categoría', 'Gastado', 'Presupuesto']) + CATEGORIES.map((c) => {
    const v = m.spending.byCategory[c.id] || { paid: 0, pending: 0 };
    const b = Number(m.plan.budgets?.[c.id] || 0);
    return v.paid || v.pending || b ? row([c.name, money(v.paid + v.pending), b ? money(b) : '—']) : '';
  }).join(''))}
  <h2>Últimos seis meses</h2>${table(head(['Mes', 'Ingresos', 'Gastos', 'Objetivo', 'Ahorro']) + ms.map((x) =>
    row([cap(monthLong(x.ym)), money(x.income.total), money(x.spending.paid + x.spending.pending), money(x.goal), money(x.left)])).join(''))}
  <h2>Gastos del mes</h2>${table(head(['Fecha y concepto', 'Estado', 'Importe']) + [...m.spending.list].sort((a, b) => a.date.localeCompare(b.date)).map((e) =>
    row([`${e.date} · ${esc(e.note) || categoryName(e.category)}`, e.status === 'planned' ? 'Previsto' : e.planned != null ? `Pagado (previsto ${money(Number(e.planned))})` : 'Pagado', money(expenseValue(e))])).join(''))}
  </body></html>`;
}

// ---------- Eventos ----------
const findJob = (id) => S.data.jobs.find((j) => j.id === id);
const planRow = (patch) => {
  const p = monthSummary(S.data, S.ym).plan;
  return { month: `${S.ym}-01`, savings_goal: Number(p.savings_goal || 0), budgets: { ...(p.budgets || {}) }, ...patch };
};

app.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
  const { act, id } = el.dataset;
  if (!['confirm', 'delete-expense', 'delete-person', 'delete-job', 'delete-rec'].includes(act)) S.confirmId = null;

  switch (act) {
    case 'auth-mode': S.authMode = el.dataset.mode; S.error = S.info = ''; break;
    case 'logout': await backend.signOut(); await enter(null); return;
    case 'tab': S.tab = el.dataset.tab; S.payId = S.editId = null; window.scrollTo(0, 0); break;
    case 'month':
      S.ym = addMonths(S.ym, Number(el.dataset.n)); S.reportYm = null; S.editId = null;
      if (S.ym > today.slice(0, 7)) return mutate(syncRecurring);
      break;
    case 'edit-expense':
      S.editId = id; S.payId = null; render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      document.getElementById('f-amount')?.select();
      return;
    case 'cancel-edit': S.editId = null; break;
    case 'delete-rec':
      S.confirmId = null;
      // Se quitan también sus previstos sin pagar; los ya pagados se quedan.
      return mutate(async () => {
        await backend.remove('expenses', { recurring_id: id, status: 'planned' });
        await backend.remove('recurring_expenses', { id });
      }, 'Gasto fijo quitado');
    case 'week': S.week = addDays(S.week, Number(el.dataset.n)); break;
    case 'week-set': S.week = el.dataset.w; break;
    case 'confirm': S.confirmId = id; break;
    case 'cancel': break;
    case 'report-month': S.reportYm = el.dataset.ym; break;
    case 'show-cat':
      return mutate(() => backend.upsert('month_plans', planRow({ budgets: { ...planRow().budgets, [el.dataset.cat]: 10 } })))
        .then(() => document.getElementById(`bud-${el.dataset.cat}`)?.select());
    case 'pay':
      S.payId = id; render();
      document.getElementById(`pay-${id}`)?.select();
      return;
    case 'pay-save': {
      const e = S.data.expenses.find((x) => x.id === id);
      const value = toNumber(document.getElementById(`pay-${id}`)?.value);
      if (!(value > 0)) return toast('Escribe cuánto pagaste.');
      S.payId = null;
      const diff = value - Number(e.planned);
      return mutate(() => backend.upsert('expenses', { ...e, status: 'real', amount: value }),
        Math.abs(diff) < 0.005 ? 'Pagado justo lo previsto' : diff < 0 ? `Pagado: ${money(-diff)} menos de lo previsto` : `Pagado: ${money(diff)} más de lo previsto`);
    }
    case 'delete-expense': S.confirmId = null; if (S.editId === id) S.editId = null; return mutate(() => backend.remove('expenses', { id }), 'Gasto borrado');
    case 'delete-job': S.confirmId = null; return mutate(() => backend.remove('jobs', { id }), 'Trabajo quitado');
    case 'delete-person': S.confirmId = null; return mutate(() => backend.remove('people', { id }), 'Perfil borrado');
    case 'add-person': return mutate(() => backend.upsert('people', { id: uuid(), name: 'Nueva persona', user_id: null }));
    case 'add-job': {
      const fixed = el.dataset.type === 'fixed';
      const job = { id: uuid(), person_id: el.dataset.person, type: el.dataset.type,
        name: fixed ? 'Mi trabajo' : 'Trabajo por horas', usual_hours: fixed ? 40 : 20,
        monthly_net: fixed ? 0 : null, payments: fixed ? 12 : null, hourly_rate: fixed ? null : 0 };
      return mutate(() => backend.upsert('jobs', job)).then(() => document.getElementById(`j-name-${job.id}`)?.select());
    }
    case 'copy-code':
      try { await navigator.clipboard.writeText(S.household.invite_code); toast('Código copiado'); }
      catch { toast(`El código es ${S.household.invite_code}`); }
      return;
    case 'download-csv': download(`gastos-${el.dataset.ym}.csv`, csvFor(el.dataset.ym), 'text/csv;charset=utf-8'); return;
    case 'download-report': download(`informe-${el.dataset.ym}.html`, reportFor(el.dataset.ym), 'text/html;charset=utf-8'); return;
    default: return;
  }
  render();
});

app.addEventListener('keydown', (ev) => {
  const g = ev.target.closest?.('.g');
  if (g && (ev.key === 'Enter' || ev.key === ' ')) {
    ev.preventDefault();
    g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
  if (ev.key === 'Enter' && ev.target.id?.startsWith('pay-')) {
    ev.preventDefault();
    ev.target.parentElement.querySelector('[data-act="pay-save"]')?.click();
  }
  if (ev.key === 'Escape' && (S.payId || S.confirmId || S.editId)) {
    S.payId = S.confirmId = S.editId = null;
    render();
  }
});

app.addEventListener('change', (ev) => {
  const el = ev.target;
  const { act } = el.dataset;
  if (act === 'budget') {
    const base = planRow();
    mutate(() => backend.upsert('month_plans', { ...base, budgets: { ...base.budgets, [el.dataset.cat]: toNumber(el.value) } }));
  } else if (act === 'goal') {
    mutate(() => backend.upsert('month_plans', planRow({ savings_goal: toNumber(el.value) })), 'Objetivo guardado');
  } else if (act === 'shift') {
    const job = el.dataset.job;
    const hours = [0, 1, 2, 3, 4, 5, 6].map((i) => Math.min(24, Math.max(0, toNumber(document.getElementById(`h-${job}-${i}`).value))));
    mutate(() => backend.upsert('shifts', { job_id: job, week_start: S.week, hours }));
  } else if (act === 'rec-amount') {
    const t = S.data.recurring.find((x) => x.id === el.dataset.id);
    const amount = toNumber(el.value);
    if (!(amount > 0)) { el.value = decimal(Number(t.amount)); return toast('Escribe un importe mayor que 0.'); }
    mutate(() => backend.upsert('recurring_expenses', { ...t, amount }), 'Importe actualizado para los próximos meses');
  } else if (act === 'person-name') {
    const p = S.data.people.find((x) => x.id === el.dataset.id);
    const name = el.value.trim();
    if (p && name && name !== p.name) mutate(() => backend.upsert('people', { id: p.id, name, user_id: p.user_id }));
  } else if (act === 'job') {
    const job = findJob(el.dataset.job);
    const f = el.dataset.f;
    let value = el.value;
    if (f === 'name') value = value.trim() || job.name;
    else if (f === 'payments') value = Number(value);
    else if (f !== 'type') value = toNumber(value);
    const next = { ...job, [f]: value };
    if (f === 'type' && value === 'fixed') Object.assign(next, { monthly_net: job.monthly_net ?? 0, payments: job.payments ?? 12, hourly_rate: null });
    if (f === 'type' && value === 'hourly') Object.assign(next, { hourly_rate: job.hourly_rate ?? 0, monthly_net: null, payments: null });
    mutate(() => backend.upsert('jobs', next));
  }
});

app.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const f = new FormData(form);

  if (form.id === 'auth-form') {
    const email = String(f.get('email')).trim();
    const password = String(f.get('password'));
    S.error = S.info = '';
    if (!/^\S+@\S+\.\S+$/.test(email)) { S.error = 'Escribe un email válido.'; return render(); }
    if (password.length < 8) { S.error = 'La contraseña necesita al menos 8 caracteres.'; return render(); }
    S.busy = true; render();
    try {
      if (S.authMode === 'signup') {
        const { needsConfirmation } = await backend.signUp(email, password);
        if (needsConfirmation) { S.info = `Te hemos enviado un correo a ${email}. Abre el enlace para confirmar la cuenta y luego entra.`; S.authMode = 'login'; }
      } else {
        await backend.signIn(email, password);
      }
    } catch (e) {
      S.error = e.message;
    }
    S.busy = false;
    if (S.screen === 'auth') render();
    return;
  }

  if (form.id === 'forgot-form') {
    const email = String(f.get('email')).trim();
    S.error = S.info = '';
    if (!/^\S+@\S+\.\S+$/.test(email)) { S.error = 'Escribe un email válido.'; return render(); }
    S.busy = true; render();
    try {
      await backend.resetPassword(email);
      S.info = `Si hay una cuenta con ${email}, te llegará un correo con el enlace. Revisa también el spam.`;
    } catch (e) {
      S.error = e.message;
    }
    S.busy = false;
    return render();
  }

  if (form.id === 'reset-form') {
    const password = String(f.get('password'));
    S.error = '';
    if (password.length < 8) { S.error = 'La contraseña necesita al menos 8 caracteres.'; return render(); }
    S.busy = true; render();
    try {
      await backend.updatePassword(password);
      S.recovering = false;
      history.replaceState(null, '', location.pathname);
      S.busy = false;
      await enter(S.session);
      toast('Contraseña cambiada');
    } catch (e) {
      S.busy = false;
      S.error = e.message;
      render();
    }
    return;
  }

  if (form.id === 'create-form' || form.id === 'join-form') {
    const person = String(f.get('person') || '').trim();
    if (!person) { S.error = 'Escribe tu nombre.'; return render(); }
    S.busy = true; S.error = ''; render();
    try {
      if (form.id === 'create-form') await backend.createHousehold(String(f.get('house') || '').trim(), person);
      else await backend.joinHousehold(String(f.get('code') || ''), person);
      S.busy = false;
      await enter(S.session);
      S.tab = 'perfiles';
      render();
    } catch (e) {
      S.busy = false;
      S.error = e.message;
      render();
    }
    return;
  }

  if (form.id === 'add-expense') {
    const amount = toNumber(f.get('amount'));
    if (!(amount > 0)) return toast('Escribe un importe mayor que 0.');
    const planned = Boolean(f.get('planned'));
    const date = String(f.get('date'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast('Elige una fecha.');
    const fields = {
      date, category: f.get('category'), note: String(f.get('note') || '').trim(), person_id: f.get('person') || null,
      status: planned ? 'planned' : 'real',
    };

    const ed = S.editId && S.data.expenses.find((e) => e.id === S.editId);
    if (ed) {
      // Al editar un gasto pagado se conserva lo previsto, para seguir viendo la diferencia.
      const row = { ...ed, ...fields, planned: planned ? amount : ed.planned ?? null, amount: planned ? null : amount };
      S.editId = null;
      return mutate(() => backend.upsert('expenses', row), 'Gasto actualizado');
    }

    const row = { id: uuid(), ...fields, planned: planned ? amount : null, amount: planned ? null : amount, recurring_id: null };
    if (f.get('repeat')) {
      const month = `${date.slice(0, 7)}-01`;
      const t = { id: uuid(), person_id: row.person_id, category: row.category, note: row.note, amount,
        day: Number(date.slice(8)), start_month: month, last_month: month };
      row.recurring_id = t.id;
      await mutate(async () => {
        await backend.upsert('recurring_expenses', t);
        await backend.upsert('expenses', row);
        await syncRecurring();
      }, 'Gasto fijo añadido: se apuntará cada mes');
    } else {
      await mutate(() => backend.upsert('expenses', row), planned ? 'Gasto previsto añadido' : 'Gasto añadido');
    }
    const keep = { 'f-date': date, 'f-cat': row.category, 'f-who': row.person_id || '' };
    for (const [k, v] of Object.entries(keep)) { const i = document.getElementById(k); if (i) i.value = v; }
    document.getElementById('f-amount')?.focus();
  }
});

// Al volver a la pestaña, recarga por si algún aviso se perdió con el móvil bloqueado.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.screen === 'app') tryRefresh();
});

// ---------- Arranque ----------
backend.onAuthChange((session, event) => {
  if (event === 'PASSWORD_RECOVERY') {
    S.recovering = true;
    return enter(session);
  }
  const was = S.session?.user?.id ?? S.session?.user?.email;
  const now = session?.user?.id ?? session?.user?.email;
  if (was !== now) enter(session);
});
render();
backend.session().then(enter);
