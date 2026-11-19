// Prioridad de regalos, deseos y pendientes: 1 alta, 2 media, 3 baja.
import type { Priority } from './types';

export const PRIORITIES: {
  id: Priority; name: string;
  /** punto de color en la app */ dot: string;
  /** en Navidad: clase del paquete y su color */ gift: string; xmas: string;
}[] = [
  { id: 1, name: 'Alta', dot: 'bg-over', gift: 'g0', xmas: '#c8372d' },     // rojo
  { id: 2, name: 'Media', dot: 'bg-planned', gift: 'g2', xmas: '#e2b24a' }, // ámbar / oro
  { id: 3, name: 'Baja', dot: 'bg-ink-3', gift: 'g1', xmas: '#0d4a37' },    // gris / abeto
];

export const priority = (p: Priority | null | undefined) => PRIORITIES.find((x) => x.id === (p ?? 2)) ?? PRIORITIES[1];

/** Al pulsar el color: media → alta → baja → media. */
export const nextPriority = (p: Priority | null | undefined): Priority => (p === 1 ? 3 : p === 3 ? 2 : 1);

/** Para ordenar: primero lo más prioritario. */
export const byPriority = (a: { priority?: Priority | null }, b: { priority?: Priority | null }) => (a.priority ?? 2) - (b.priority ?? 2);
