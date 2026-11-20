import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import type { DeliverySchedule } from '@/types';
import {
  WEEK_DAYS,
  formatDeliverySchedule,
  isScheduleComplete,
} from '@/lib/delivery-schedule';
import { cn } from '@/lib/utils';

interface DeliverySchedulePickerProps {
  value: DeliverySchedule | null;
  onChange: (value: DeliverySchedule | null) => void;
}

const DEFAULT_FROM = '07:00';
const DEFAULT_TO = '17:00';

/**
 * Selector tipo calendario para el horario de recibido de mercancía:
 * los días se marcan uno por uno (toggle) y un rango de horas.
 */
export function DeliverySchedulePicker({
  value,
  onChange,
}: DeliverySchedulePickerProps) {
  const preview = useMemo(() => formatDeliverySchedule(value), [value]);

  // Indica si un día está seleccionado.
  const isSelected = (day: number): boolean => !!value?.days?.includes(day);

  const handleDayClick = (day: number) => {
    const current = value?.days ?? [];
    const days = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    if (days.length === 0) {
      onChange(null);
      return;
    }
    onChange({
      days,
      hourFrom: value?.hourFrom ?? DEFAULT_FROM,
      hourTo: value?.hourTo ?? DEFAULT_TO,
    });
  };

  const handleHourChange = (field: 'hourFrom' | 'hourTo', hour: string) => {
    onChange({
      days: value?.days ?? [],
      hourFrom: field === 'hourFrom' ? hour : value?.hourFrom ?? DEFAULT_FROM,
      hourTo: field === 'hourTo' ? hour : value?.hourTo ?? DEFAULT_TO,
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      {/* Selector de días */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          Días de recibido
        </p>
        <div className="flex flex-wrap gap-1.5">
          {WEEK_DAYS.map((d, i) => {
            const active = isSelected(i);
            return (
              <button
                key={i}
                type="button"
                title={d.long}
                onClick={() => handleDayClick(i)}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent',
                )}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selector de horas */}
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Desde
          </span>
          <input
            type="time"
            value={value?.hourFrom ?? DEFAULT_FROM}
            onChange={(e) => handleHourChange('hourFrom', e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Hasta
          </span>
          <input
            type="time"
            value={value?.hourTo ?? DEFAULT_TO}
            onChange={(e) => handleHourChange('hourTo', e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          />
        </label>
      </div>

      {/* Vista previa legible */}
      {isScheduleComplete(value) ? (
        <div className="flex items-center gap-2 rounded-md bg-[var(--success)]/10 px-3 py-2 text-sm text-[var(--success)]">
          <Clock className="h-4 w-4 shrink-0" />
          <span className="font-medium">{preview}</span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Marca los días en que el cliente puede recibir la mercancía.
        </p>
      )}
    </div>
  );
}
