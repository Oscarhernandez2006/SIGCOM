import type { DeliverySchedule } from '@/types';

/** Días de la semana (0=Lunes … 6=Domingo). */
export const WEEK_DAYS = [
  { short: 'L', long: 'Lunes' },
  { short: 'M', long: 'Martes' },
  { short: 'M', long: 'Miércoles' },
  { short: 'J', long: 'Jueves' },
  { short: 'V', long: 'Viernes' },
  { short: 'S', long: 'Sábado' },
  { short: 'D', long: 'Domingo' },
] as const;

/** Convierte una hora "HH:mm" (24h) a formato legible de 12 horas. */
export function formatHour12(value: string): string {
  const [hStr, mStr] = value.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const period = h < 12 ? 'a. m.' : 'p. m.';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minutes = m === 0 ? '' : `:${String(m).padStart(2, '0')}`;
  return `${hour12}${minutes} ${period}`;
}

/** Indica si el horario tiene todos los datos necesarios. */
export function isScheduleComplete(
  schedule: DeliverySchedule | null,
): schedule is DeliverySchedule {
  return (
    !!schedule &&
    Array.isArray(schedule.days) &&
    schedule.days.length > 0 &&
    schedule.days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) &&
    typeof schedule.hourFrom === 'string' &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.hourFrom) &&
    typeof schedule.hourTo === 'string' &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.hourTo)
  );
}

/**
 * Texto legible de los días seleccionados, agrupando los consecutivos en
 * rangos. P. ej. [0,1,2,3,4] → "Lunes a viernes"; [0,2,4] → "Lunes,
 * miércoles y viernes"; [0,1,4] → "Lunes a martes y viernes".
 */
function formatDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 0) return '';

  // Agrupa los días en tramos de números consecutivos.
  const runs: number[][] = [];
  for (const day of sorted) {
    const last = runs[runs.length - 1];
    if (last && day === last[last.length - 1] + 1) {
      last.push(day);
    } else {
      runs.push([day]);
    }
  }

  const parts = runs.map((run) => {
    const from = WEEK_DAYS[run[0]]?.long ?? '';
    if (run.length === 1) return from;
    const to = WEEK_DAYS[run[run.length - 1]]?.long ?? '';
    return `${from} a ${to.toLowerCase()}`;
  });

  if (parts.length === 1) return parts[0];
  // El primer tramo en mayúscula; los siguientes en minúscula.
  const head = parts.slice(0, -1).map((p, i) => (i === 0 ? p : p.toLowerCase()));
  const tail = parts[parts.length - 1].toLowerCase();
  return `${head.join(', ')} y ${tail}`;
}

/**
 * Texto legible del horario de recibido, p. ej.
 * "Lunes a viernes de 7 a. m. a 5 p. m." o "Sábado de 8 a. m. a 12 p. m.".
 */
export function formatDeliverySchedule(
  schedule: DeliverySchedule | null,
): string {
  if (!isScheduleComplete(schedule)) return '';
  const days = formatDays(schedule.days);
  return `${days} de ${formatHour12(schedule.hourFrom)} a ${formatHour12(
    schedule.hourTo,
  )}`;
}
