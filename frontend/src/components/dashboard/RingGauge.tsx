import { BRAND } from '@/lib/brand';
import { formatPercent } from '@/lib/format';

/**
 * Anillo de cumplimiento con marca del ritmo esperado (`pace`), igual que
 * RingGaugePainter en la app. `ratio` y `pace` son fracciones (0–1+).
 */
export function RingGauge({
  label,
  ratio,
  pace,
  detail,
  target,
}: {
  label: string;
  ratio: number | null;
  pace: number | null;
  detail: string | null;
  target: string;
}) {
  const size = 124;
  const stroke = 12;
  const r = (size - stroke) / 2 - 1;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const progress = Math.max(0, Math.min(1, ratio ?? 0));
  const onTrack = ratio != null && (pace == null || ratio >= pace);
  const color = ratio == null ? BRAND.border : onTrack ? BRAND.primary : '#F59E0B';

  let paceLine: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (pace != null) {
    const angle = -Math.PI / 2 + 2 * Math.PI * Math.max(0, Math.min(1, pace));
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const inner = r - stroke / 2 - 3;
    const outer = r + stroke / 2 + 3;
    paceLine = { x1: c + dx * inner, y1: c + dy * inner, x2: c + dx * outer, y2: c + dy * outer };
  }

  return (
    <div className="flex min-w-0 flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={c} cy={c} r={r} fill="none" stroke={BRAND.field} strokeWidth={stroke} />
          {progress > 0 && (
            <circle
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - progress)}
              transform={`rotate(-90 ${c} ${c})`}
              style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.33, 1, 0.68, 1)' }}
            />
          )}
          {paceLine && (
            <line {...paceLine} stroke={BRAND.text} strokeWidth={3} strokeLinecap="round" />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-[19px] font-extrabold leading-tight"
            style={{ color: ratio == null ? BRAND.textSoft : BRAND.text }}
          >
            {ratio == null ? '—' : formatPercent(ratio)}
          </span>
          <span className="text-xs font-bold" style={{ color: BRAND.textSoft }}>
            {label}
          </span>
        </div>
      </div>
      <p className="mt-2.5 max-w-full truncate text-sm font-extrabold" style={{ color: BRAND.text }}>
        {detail ?? '—'}
      </p>
      <p className="max-w-full truncate text-xs" style={{ color: BRAND.textSoft }}>
        de {target}
      </p>
    </div>
  );
}
