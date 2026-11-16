// Formato de importes y fechas en español.
import { parseDate } from './calc';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: 'always' });
const eur2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });

/** Sin decimales si el importe es entero; si no, siempre dos (352,80 €, no 352,8 €). */
export const money = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? eur.format(r) : eur2.format(r);
};
/** Redondeado a euros, para cifras grandes. */
export const money0 = (v: number) => eur.format(Math.round(v));
/** Número para un campo de texto: «12,5»; vacío si es 0. */
export const decimal = (v: number | null | undefined) => (v ? String(Math.round(v * 100) / 100).replace('.', ',') : '');

const date = (s: string, o: Intl.DateTimeFormatOptions) => parseDate(s.length === 7 ? `${s}-01` : s).toLocaleDateString('es-ES', o);
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const monthName = (ym: string) => date(ym, { month: 'long' });
export const monthLong = (ym: string) => date(ym, { month: 'long', year: 'numeric' });
export const monthShort = (ym: string) => date(ym, { month: 'short' }).replace('.', '');
export const dayLong = (s: string) => date(s, { weekday: 'long', day: 'numeric', month: 'long' });
export const dayShort = (s: string) => date(s, { day: 'numeric', month: 'short' }).replace('.', '');
export const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export const uuid = () => crypto.randomUUID();

/**
 * Enlace escrito a mano → dirección http(s) completa. Vacío → null; si no vale → undefined.
 * Sin esquema se supone https: «amazon.es/libro» → «https://amazon.es/libro».
 */
export function parseLink(s: string): string | null | undefined {
  const t = s.trim();
  if (!t) return null;
  try {
    const u = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(t) ? t : `https://${t}`);
    const ok = (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.') && u.href.length <= 2000;
    return ok ? u.href : undefined;
  } catch {
    return undefined;
  }
}
/** Solo se pinta como enlace lo que es http(s), venga de donde venga el dato. */
export const safeLink = (url: string | null | undefined) => (url && /^https?:\/\//i.test(url) ? url : null);
/** La tienda, para mostrar: «amazon.es». */
export const linkHost = (url: string) => new URL(url).hostname.replace(/^www\./, '');
