import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { BRAND } from '@/lib/brand';

const GOAL_COLOR = '#F59E0B';

/**
 * Área de ventas con curva suavizada, línea de meta punteada y punto
 * seleccionable (clic / arrastre / hover), igual que TrendChartPainter en la app.
 */
export function TrendChart({
  values,
  selected,
  goal,
  onSelect,
  height = 170,
}: {
  values: number[];
  selected: number;
  goal: number | null;
  onSelect: (index: number) => void;
  height?: number;
}) {
  const gradientId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Cambiar la key reinicia la animación de "dibujado" al cambiar los datos.
  const drawKey = values.join('|');

  const top = 8;
  const bottom = 4;
  const plotH = height - top - bottom;
  const count = values.length;

  const { linePath, areaPath, x, y } = useMemo(() => {
    const maxValue = Math.max(0, ...values, goal ?? 0);
    const maxY = maxValue <= 0 ? 1 : maxValue * 1.12;
    const x = (i: number) => (count === 1 ? width / 2 : (width * i) / (count - 1));
    const y = (v: number) => top + plotH - (Math.min(Math.max(v, 0), maxY) / maxY) * plotH;
    if (count === 0 || width === 0) return { linePath: '', areaPath: '', x, y };
    let d = `M ${x(0)} ${y(values[0])}`;
    for (let i = 1; i < count; i++) {
      const px = x(i - 1);
      const cx = x(i);
      const mid = (px + cx) / 2;
      d += ` C ${mid} ${y(values[i - 1])}, ${mid} ${y(values[i])}, ${cx} ${y(values[i])}`;
    }
    const area = `${d} L ${x(count - 1)} ${top + plotH} L ${x(0)} ${top + plotH} Z`;
    return { linePath: d, areaPath: area, x, y };
  }, [values, goal, width, count, plotH]);

  const pick = (clientX: number) => {
    const el = ref.current;
    if (!el || count === 0) return;
    const rect = el.getBoundingClientRect();
    const dx = clientX - rect.left;
    const index =
      count === 1 ? 0 : Math.min(count - 1, Math.max(0, Math.round((dx / rect.width) * (count - 1))));
    if (index !== selected) onSelect(index);
  };

  const sel = selected >= 0 && selected < count ? selected : -1;

  return (
    <div
      ref={ref}
      className="relative w-full min-w-0 cursor-crosshair touch-none select-none overflow-hidden"
      style={{ height }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons > 0 || e.pointerType === 'mouse') pick(e.clientX);
      }}
    >
      {width > 0 && count > 0 && (
        <svg width={width} height={height} className="absolute inset-0 block">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BRAND.primary} stopOpacity={0.28} />
              <stop offset="100%" stopColor={BRAND.primary} stopOpacity={0.02} />
            </linearGradient>
            <clipPath id={`${gradientId}-clip`}>
              <rect
                key={drawKey}
                x={0}
                y={0}
                height={height}
                width={width}
                className="trend-draw"
              />
            </clipPath>
          </defs>
          {[0, 1, 2, 3].map((i) => {
            const gy = top + (plotH * i) / 3;
            return <line key={i} x1={0} x2={width} y1={gy} y2={gy} stroke={BRAND.border} strokeWidth={1} />;
          })}
          <g clipPath={`url(#${gradientId}-clip)`}>
            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path
              d={linePath}
              fill="none"
              stroke={BRAND.primary}
              strokeWidth={2.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
          {goal != null && (
            <line
              x1={0}
              x2={width}
              y1={y(goal)}
              y2={y(goal)}
              stroke={GOAL_COLOR}
              strokeWidth={1.6}
              strokeDasharray="5 4"
            />
          )}
          {sel >= 0 && (
            <>
              <line
                x1={x(sel)}
                x2={x(sel)}
                y1={top}
                y2={top + plotH}
                stroke={BRAND.primary}
                strokeOpacity={0.35}
                strokeWidth={1.2}
              />
              <circle cx={x(sel)} cy={y(values[sel])} r={7} fill="#fff" stroke={BRAND.primary} strokeWidth={3} />
            </>
          )}
        </svg>
      )}
    </div>
  );
}
