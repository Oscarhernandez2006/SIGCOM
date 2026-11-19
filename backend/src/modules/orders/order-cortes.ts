/**
 * Utilidades de horario para la subida de pedidos al ERP.
 *
 * Los pedidos se suben automáticamente al ERP al crearse (o al aprobarse en
 * cartera), siempre dentro de la ventana operativa de Colombia.
 */

/**
 * Extrae la fecha (YYYY-MM-DD), la hora (0-23) y el minuto (0-59) de una fecha
 * en horario de Colombia (America/Bogota), independientemente de la zona del
 * servidor.
 */
export function bogotaParts(date: Date): {
  date: string;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  // 'en-CA' entrega 24h pero puede devolver '24' a medianoche: lo normalizamos.
  const rawHour = Number(get('hour'));
  const hour = rawHour === 24 ? 0 : rawHour;

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour,
    minute: Number(get('minute')),
  };
}

/** Fecha de hoy (YYYY-MM-DD) en horario de Colombia. */
export function bogotaToday(): string {
  return bogotaParts(new Date()).date;
}

/** Máximo de días hacia adelante para la fecha de entrega de un pedido. */
export const MAX_DELIVERY_DAYS_AHEAD = 60;

/**
 * Valida la fecha de entrega (YYYY-MM-DD): no puede ser pasada ni de más de
 * MAX_DELIVERY_DAYS_AHEAD días. Evita años mal digitados (p. ej. "0026"),
 * que Siesa rechaza. Devuelve el mensaje de error o null si es válida.
 */
export function deliveryDateError(
  value: string | null | undefined,
  today = bogotaToday(),
): string | null {
  const date = (value ?? '').trim().slice(0, 10);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    return 'La fecha de entrega no es válida.';
  }
  const max = new Date(`${today}T00:00:00Z`);
  max.setUTCDate(max.getUTCDate() + MAX_DELIVERY_DAYS_AHEAD);
  if (date < today || date > max.toISOString().slice(0, 10)) {
    return (
      `La fecha de entrega (${date}) debe estar entre hoy y los próximos ` +
      `${MAX_DELIVERY_DAYS_AHEAD} días. Revisa el año.`
    );
  }
  return null;
}

/**
 * Ventana operativa diaria (hora de Colombia):
 *   - Los pedidos solo se pueden CREAR a partir de las 7:00 a.m.
 *   - Los pedidos ya no se pueden SUBIR a Siesa después de las 4:00 p.m.
 */
export const ORDER_OPEN_HOUR = 7;
export const ORDER_UPLOAD_CLOSE_HOUR = 16;

/**
 * Horas que tiene un pedido retenido por cartera para ser aprobado o
 * desaprobado. Al vencer, se libera el inventario y queda DISAPPROVED.
 */
export const APPROVAL_WINDOW_HOURS = 2;

/** Hora actual (0-23) en horario de Colombia. */
export function bogotaCurrentHour(): number {
  return bogotaParts(new Date()).hour;
}

/** ¿Ya se pueden crear pedidos? (entre las 7:00 a.m. y las 4:00 p.m.) */
export function isOrderCreationOpen(): boolean {
  const hour = bogotaCurrentHour();
  return hour >= ORDER_OPEN_HOUR && hour < ORDER_UPLOAD_CLOSE_HOUR;
}

/** ¿Todavía se pueden subir pedidos a Siesa? (antes de las 4:00 p.m.) */
export function isOrderUploadOpen(): boolean {
  return bogotaCurrentHour() < ORDER_UPLOAD_CLOSE_HOUR;
}

/** Configuración de la ventana horaria para crear pedidos (hora de Colombia). */
export interface OrderScheduleConfig {
  enabled: boolean;
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
}

/**
 * ¿Se pueden crear pedidos ahora según la configuración dada? Si la restricción
 * está desactivada, siempre devuelve true. Tiene en cuenta horas y minutos.
 */
export function isOrderCreationOpenFor(cfg: OrderScheduleConfig): boolean {
  if (!cfg.enabled) return true;
  const { hour, minute } = bogotaParts(new Date());
  const now = hour * 60 + minute;
  const open = cfg.openHour * 60 + cfg.openMinute;
  const close = cfg.closeHour * 60 + cfg.closeMinute;
  return now >= open && now < close;
}

/** Formatea una hora/minuto (24h) como texto am/pm en español (p. ej. 4:30 p.m.). */
export function formatScheduleTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'p.m.' : 'a.m.';
  let h = hour % 12;
  if (h === 0) h = 12;
  const mm = minute.toString().padStart(2, '0');
  return `${h}:${mm} ${period}`;
}

