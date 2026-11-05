import { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { firstOfMonthISO, formatRangeLabel, shiftDays, todayISO } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Chip de periodo con popover de presets (Hoy, Ayer, Este mes, Mes anterior)
 * y rango personalizado; igual que showRangeSheet en la app.
 */
export function RangeChip({
  from,
  to,
  onChange,
  variant = 'light',
  className,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  /** `light`: chip blanco sobre fondo verde; `field`: chip gris sobre blanco. */
  variant?: 'light' | 'field';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const today = todayISO();
  const presets: { label: string; from: string; to: string }[] = [
    { label: 'Hoy', from: today, to: today },
    { label: 'Ayer', from: shiftDays(today, -1), to: shiftDays(today, -1) },
    { label: 'Este mes', from: firstOfMonthISO(), to: today },
    {
      label: 'Mes anterior',
      from: `${shiftDays(firstOfMonthISO(), -1).slice(0, 8)}01`,
      to: shiftDays(firstOfMonthISO(), -1),
    },
  ];

  const apply = (f: string, t: string) => {
    onChange(f, t);
    setOpen(false);
  };

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-11 items-center gap-1.5 rounded-[14px] px-3 text-[13px] font-bold transition-colors',
          variant === 'light' ? 'bg-white hover:bg-white/90' : 'hover:brightness-95',
        )}
        style={{
          color: BRAND.text,
          backgroundColor: variant === 'field' ? BRAND.field : undefined,
        }}
      >
        <Calendar className="h-4 w-4" style={{ color: BRAND.primary }} />
        <span className="whitespace-nowrap">{formatRangeLabel(from, to)}</span>
        <ChevronDown
          className={cn('h-[18px] w-[18px] transition-transform', open && 'rotate-180')}
          style={{ color: BRAND.textSoft }}
        />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 z-20 mt-2 w-[min(300px,calc(100vw-2.5rem))] rounded-2xl bg-white p-3 shadow-xl"
            style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}
          >
            <p className="px-1 pb-2 text-base font-extrabold">Periodo</p>
            <div className="grid grid-cols-2 gap-1.5">
              {presets.map((p) => {
                const active = p.from === from && p.to === to;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => apply(p.from, p.to)}
                    className="rounded-xl px-3 py-2 text-left text-[13px] font-bold transition-colors"
                    style={{
                      backgroundColor: active ? `${BRAND.primary}1A` : BRAND.field,
                      color: active ? BRAND.primary : BRAND.text,
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <p
              className="mt-3 px-1 text-[11px] font-bold uppercase tracking-wide"
              style={{ color: BRAND.textSoft }}
            >
              Personalizado
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold" style={{ color: BRAND.textMuted }}>
                Desde
                <input
                  type="date"
                  value={from}
                  max={to || today}
                  onChange={(e) => onChange(e.target.value || today, to)}
                  className="mt-1 h-9 w-full rounded-xl px-2 text-sm font-semibold outline-none"
                  style={{ backgroundColor: BRAND.field, color: BRAND.text }}
                />
              </label>
              <label className="text-xs font-semibold" style={{ color: BRAND.textMuted }}>
                Hasta
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  max={today}
                  onChange={(e) => onChange(from, e.target.value || today)}
                  className="mt-1 h-9 w-full rounded-xl px-2 text-sm font-semibold outline-none"
                  style={{ backgroundColor: BRAND.field, color: BRAND.text }}
                />
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
