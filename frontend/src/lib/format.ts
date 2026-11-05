/** Formatos numéricos y de fecha iguales a utils/format.dart de la app móvil. */

const LOCALE = 'es-CO';

const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatMoney(value: number): string {
  return `$ ${integer.format(Math.round(value))}`;
}

/** Valores grandes en millones (p. ej. "$ 245,3 M") para textos compactos. */
export function formatMoneyShort(value: number): string {
  return Math.abs(value) >= 1e6
    ? `$ ${oneDecimal.format(value / 1e6)} M`
    : formatMoney(value);
}

export function formatInt(value: number): string {
  return integer.format(value);
}

/** `ratio` es una fracción (0.25 → "25,0 %"). */
export function formatPercent(ratio: number): string {
  return `${percent.format(ratio * 100)} %`;
}

/** Unidad de cantidad: kilos (cárnicos) o unidades (Carnes Frías). */
export interface QtyUnit {
  isUnits: boolean;
  /** "Kilos" / "Unidades". */
  label: string;
  /** "kilos" / "unidades". */
  word: string;
  soldLabel: string;
  format: (value: number) => string;
}

export function qtyUnit(isUnits: boolean): QtyUnit {
  const label = isUnits ? 'Unidades' : 'Kilos';
  return {
    isUnits,
    label,
    word: label.toLowerCase(),
    soldLabel: isUnits ? 'Unidades vendidas' : 'Kilos vendidos',
    format: (value) =>
      isUnits
        ? `${integer.format(Math.round(value))} und`
        : `${oneDecimal.format(value)} kg`,
  };
}

/** Cantidades: entero o con un decimal ("48.210,4"). */
export function formatQuantity(value: number): string {
  return Number.isInteger(value) ? integer.format(value) : oneDecimal.format(value);
}

function parseLocalDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00`);
}

/** Fecha local en formato YYYY-MM-DD. */
export function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/** Primer día del mes actual en formato YYYY-MM-01 (fecha local). */
export function firstOfMonthISO(): string {
  return `${todayISO().slice(0, 8)}01`;
}

/** "05/11/2026". */
export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** "04:52 p. m.". */
export function formatTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: true });
}

/** "4 nov" a partir de una fecha-hora completa (respeta la zona local). */
export function formatShortDateTimeDay(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }).replace(/\./g, '');
}

/** "4 nov" (sin punto). */
export function formatShortDate(iso: string): string {
  return parseLocalDate(iso)
    .toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })
    .replace(/\./g, '');
}

/** "martes 4 de noviembre". */
export function formatDayLabel(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** Rango "1 nov – 4 nov" (añade el año si cambia). */
export function formatRangeLabel(from: string, to: string): string {
  if (from === to) return formatShortDate(from);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${formatShortDate(from)} – ${formatShortDate(to)}${sameYear ? '' : ` ${to.slice(0, 4)}`}`;
}

/** "04/11/2026, 09:15 a. m." */
export function formatDateTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleString(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}
