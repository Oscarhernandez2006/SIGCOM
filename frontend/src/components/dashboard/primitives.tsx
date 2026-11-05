import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, Clock } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

type IconType = ComponentType<{ className?: string; style?: React.CSSProperties }>;

/** Tarjeta blanca con radio 22 y sombra verde suave (_CardShell en la app). */
export function CardShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('rounded-[22px] bg-white p-3.5 sm:p-[18px]', className)}
      style={{
        border: `1px solid ${BRAND.border}CC`,
        boxShadow: `0 8px 20px ${BRAND.primaryDark}0D`,
      }}
    >
      {children}
    </div>
  );
}

export function IconBadge({ icon: Icon, color }: { icon: IconType; color: string }) {
  return (
    <div
      className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px]"
      style={{ backgroundColor: `${color}21` }}
    >
      <Icon className="h-6 w-6" style={{ color }} />
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3
      className="text-[13px] font-extrabold uppercase tracking-[0.6px]"
      style={{ color: BRAND.textMuted }}
    >
      {children}
    </h3>
  );
}

/** Encabezado de sección: badge con icono + título + acción opcional. */
export function SectionHeader({
  icon,
  color,
  title,
  trailing,
}: {
  icon: IconType;
  color: string;
  title: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <IconBadge icon={icon} color={color} />
      <div className="min-w-0 flex-1">
        <SectionLabel>{title}</SectionLabel>
      </div>
      {trailing}
    </div>
  );
}

export function PendingChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ backgroundColor: '#FEF3C7', color: '#B45309' }}
    >
      <Clock className="h-3 w-3" />
      {label}
    </span>
  );
}

export function MiniStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p
        className="text-[10.5px] font-bold uppercase tracking-[0.4px]"
        style={{ color: BRAND.textSoft }}
      >
        {label}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function StatText({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <p
      className="truncate text-[15px] font-extrabold"
      style={{ color: muted ? BRAND.textSoft : BRAND.text }}
    >
      {children}
    </p>
  );
}

/** Variación porcentual con flecha (ratio en fracción; null → "—"). */
export function GrowthChip({ ratio }: { ratio: number | null | undefined }) {
  if (ratio == null) return <StatText muted>—</StatText>;
  const up = ratio >= 0;
  const color = up ? '#059669' : '#DC2626';
  const Arrow = up ? ArrowUp : ArrowDown;
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-2 py-[3px] text-[13px] font-extrabold"
      style={{ backgroundColor: `${color}1A`, color }}
    >
      <Arrow className="h-3.5 w-3.5" />
      {formatPercent(Math.abs(ratio))}
    </span>
  );
}

export interface KpiMetric {
  label: string;
  value: string | null;
}

/** Tarjeta KPI compacta: icono, título, valor grande y métricas secundarias. */
export function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  metrics = [],
  footnote,
  emptyLabel = 'Pendiente SIESA',
  className,
}: {
  title: string;
  value: string | null;
  icon: IconType;
  color: string;
  metrics?: KpiMetric[];
  footnote?: string | null;
  emptyLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn('rounded-[20px] bg-white p-3.5', className)}
      style={{
        border: `1px solid ${BRAND.border}CC`,
        boxShadow: `0 6px 16px ${BRAND.primaryDark}0D`,
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
          style={{ backgroundColor: `${color}21` }}
        >
          <Icon className="h-[18px] w-[18px]" style={{ color }} />
        </div>
        <p
          className="line-clamp-2 text-[11px] font-extrabold uppercase tracking-[0.4px]"
          style={{ color: BRAND.textMuted }}
        >
          {title}
        </p>
      </div>
      <div className="mt-3">
        {value == null ? (
          <PendingChip label={emptyLabel} />
        ) : (
          <p
            className="truncate text-[20px] font-extrabold tracking-[-0.4px]"
            style={{ color: BRAND.text }}
            title={value}
          >
            {value}
          </p>
        )}
      </div>
      {metrics.map((m) => (
        <div key={m.label} className="mt-2">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.4px]"
            style={{ color: BRAND.textSoft }}
          >
            {m.label}
          </p>
          <p
            className="truncate text-[13.5px] font-extrabold"
            style={{ color: m.value == null ? BRAND.textSoft : BRAND.text }}
          >
            {m.value ?? '—'}
          </p>
        </div>
      ))}
      {footnote && (
        <p className="mt-1.5 text-[10.5px]" style={{ color: BRAND.textSoft }}>
          {footnote}
        </p>
      )}
    </div>
  );
}

/** Chip blanco del encabezado (filtro de vendedor / periodo). */
export function HeroChip({
  icon: Icon,
  label,
  onClick,
  active = false,
}: {
  icon: IconType;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-[14px] bg-white px-3 text-[13px] font-bold transition-shadow hover:shadow-md',
        active && 'ring-2 ring-white/70',
      )}
      style={{ color: BRAND.text }}
    >
      <Icon className="h-[17px] w-[17px]" style={{ color: BRAND.primary }} />
      <span className="max-w-[190px] truncate sm:max-w-[260px]">{label}</span>
      <ChevronDown className="h-[18px] w-[18px]" style={{ color: BRAND.textSoft }} />
    </button>
  );
}

export function NoticeCard({ message }: { message: string }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-2xl p-3.5"
      style={{ backgroundColor: '#FEF3C7', border: '1px solid #FCD34D' }}
    >
      <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: '#B45309' }} />
      <p className="text-[13px] font-semibold" style={{ color: '#92400E' }}>
        {message}
      </p>
    </div>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl p-3.5"
      style={{ backgroundColor: '#FEE2E2', border: '1px solid #FCA5A5' }}
    >
      <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: '#B91C1C' }} />
      <p className="flex-1 text-[13px] font-semibold" style={{ color: '#991B1B' }}>
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg px-3 py-1.5 text-[13px] font-bold hover:bg-white/60"
        style={{ color: '#B91C1C' }}
      >
        Reintentar
      </button>
    </div>
  );
}

/** Esqueleto animado mientras llega la primera respuesta. */
export function SkeletonGrid() {
  const block = (h: string, extra = '') => (
    <div
      className={cn('animate-pulse rounded-[22px]', h, extra)}
      style={{ backgroundColor: `${BRAND.border}99` }}
    />
  );
  return (
    <div className="space-y-3.5">
      <div className="grid gap-3.5 lg:grid-cols-5">
        {block('h-48', 'lg:col-span-3')}
        {block('h-48', 'lg:col-span-2')}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {block('h-32')}
        {block('h-32')}
        {block('h-32')}
        {block('h-32')}
      </div>
      {block('h-72')}
    </div>
  );
}

/** Entrada animada escalonada, como FadeSlideIn en la app. */
export function FadeIn({
  index,
  children,
  className,
}: {
  index: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('login-fade-in min-w-0', className)} style={{ animationDelay: `${index * 50}ms` }}>
      {children}
    </div>
  );
}
