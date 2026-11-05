import type { ReactNode } from 'react';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

/** Fondo degradado de página (igual que BrandBackground en la app). */
export function PageBackground({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className="-m-4 min-h-full p-4 md:-m-6 md:p-6"
      style={{
        background: `linear-gradient(135deg, #FFFFFF 0%, ${BRAND.background} 50%, #E8F5EC 100%)`,
        color: BRAND.text,
      }}
    >
      <div className={cn('mx-auto max-w-7xl', className)}>{children}</div>
    </div>
  );
}

/** Encabezado verde con degradado y círculos decorativos (_Hero / _Header en la app). */
export function Hero({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('relative rounded-[26px] text-white', className)}
      style={{
        background: `linear-gradient(135deg, #0F6B35 0%, ${BRAND.primary} 55%, #34B868 100%)`,
        boxShadow: `0 12px 24px ${BRAND.primaryDark}47`,
      }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[26px]">
        <div className="absolute -right-10 -top-[50px] h-[170px] w-[170px] rounded-full bg-white/[0.08]" />
        <div className="absolute -bottom-[70px] right-[50px] h-[130px] w-[130px] rounded-full bg-white/[0.06]" />
      </div>
      <div className="relative px-4 pb-4 pt-4 sm:px-5 sm:pb-[18px] sm:pt-5">{children}</div>
    </div>
  );
}

/** Mensaje centrado con icono (_Message en la app). */
export function EmptyMessage({
  icon: Icon,
  text,
  onRetry,
}: {
  icon: IconType;
  text: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <Icon className="h-11 w-11" style={{ color: BRAND.textSoft }} />
      <p className="mt-2.5 text-sm" style={{ color: BRAND.textMuted }}>
        {text}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-sm font-bold"
          style={{ color: BRAND.primary }}
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Píldora de estado (StatusPill en la app). */
export function StatusPill({
  label,
  color,
  outlined = false,
  className,
}: {
  label: string;
  color: string;
  outlined?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg px-2 py-1 text-[11px] font-extrabold leading-none',
        className,
      )}
      style={{
        color,
        backgroundColor: outlined ? '#FFFFFF' : `${color}1F`,
        border: outlined ? `1px solid ${color}80` : undefined,
      }}
    >
      {label}
    </span>
  );
}

/** Nota resaltada dentro de una tarjeta (_InlineNote en la app). */
export function InlineNote({
  icon: Icon,
  color,
  children,
}: {
  icon: IconType;
  color: string;
  children: ReactNode;
}) {
  return (
    <div
      className="flex items-start gap-1.5 rounded-[10px] px-2.5 py-2 text-xs font-semibold"
      style={{ backgroundColor: `${color}14`, color }}
    >
      <Icon className="mt-px h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

const BUTTON_STYLES: Record<string, React.CSSProperties> = {
  filled: { backgroundColor: BRAND.primary, color: '#fff' },
  outlined: { backgroundColor: '#fff', color: BRAND.primary, border: `1px solid ${BRAND.primary}` },
  danger: { backgroundColor: '#DC2626', color: '#fff' },
  'danger-outlined': { backgroundColor: '#fff', color: '#DC2626', border: '1px solid #DC2626' },
  text: { backgroundColor: 'transparent', color: BRAND.primary },
};

/** Botón de la marca (FilledButton / OutlinedButton / TextButton en la app). */
export function BrandButton({
  children,
  className,
  variant = 'filled',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_STYLES;
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-[14px] px-4 text-sm font-extrabold transition-opacity disabled:cursor-not-allowed disabled:opacity-40',
        variant === 'text' ? 'hover:bg-[#F4FAF6]' : 'hover:opacity-90',
        className,
      )}
      style={BUTTON_STYLES[variant]}
      {...props}
    >
      {children}
    </button>
  );
}

/** Campo de texto con fondo gris claro (InputDecoration de la app). */
export function BrandInput({
  icon: Icon,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon?: IconType }) {
  return (
    <div className={cn('relative', className)}>
      {Icon && (
        <Icon
          className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2"
          style={{ color: BRAND.textSoft }}
        />
      )}
      <input
        {...props}
        className={cn(
          'brand-input h-11 w-full rounded-[14px] text-sm font-medium outline-none placeholder:font-normal',
          Icon ? 'pl-10 pr-3' : 'px-3',
        )}
        style={{ backgroundColor: BRAND.field, color: BRAND.text }}
      />
    </div>
  );
}

export function BrandTextarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'brand-input w-full resize-none rounded-[14px] px-3 py-2.5 text-sm font-medium outline-none placeholder:font-normal',
        className,
      )}
      style={{ backgroundColor: BRAND.field, color: BRAND.text }}
    />
  );
}

/** Modal centrado con tarjeta blanca redondeada. */
export function Modal({
  children,
  onClose,
  className,
}: {
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className={cn(
          'login-fade-in flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-[24px]',
          className,
        )}
        style={{ color: BRAND.text }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/** Control segmentado (SegmentedButton en la app). */
export function Segmented<T extends string | boolean>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: ReactNode; icon?: IconType }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn('grid rounded-[14px] bg-white p-1', className)}
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        border: `1px solid ${BRAND.border}`,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className="flex h-9 items-center justify-center gap-1.5 rounded-[11px] px-2 text-[13px] font-bold transition-colors"
            style={{
              backgroundColor: active ? `${BRAND.primary}1A` : 'transparent',
              color: active ? BRAND.primary : BRAND.textMuted,
            }}
          >
            {o.icon && <o.icon className="h-4 w-4" />}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Fila "etiqueta → valor" de los detalles (_Field en la app). Oculta valores vacíos. */
export function Field({ label, value }: { label: string; value?: ReactNode | null }) {
  if (value === null || value === undefined || value === '' || value === '—') return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-[13px]">
      <span className="shrink-0" style={{ color: BRAND.textSoft }}>
        {label}
      </span>
      <span className="min-w-0 text-right font-semibold">{value}</span>
    </div>
  );
}

/** Tarjeta con título en mayúsculas e icono (_Card / FormSection en la app). */
export function TitledCard({
  title,
  icon: Icon,
  trailing,
  children,
  className,
}: {
  title?: ReactNode;
  icon?: IconType;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('rounded-[20px] bg-white p-4', className)}
      style={{ border: `1px solid ${BRAND.border}CC` }}
    >
      {title && (
        <div className="mb-3 flex items-center gap-2">
          {Icon && <Icon className="h-[18px] w-[18px] shrink-0" style={{ color: BRAND.primary }} />}
          <h3
            className="min-w-0 flex-1 truncate text-[12.5px] font-extrabold uppercase tracking-[0.6px]"
            style={{ color: BRAND.textMuted }}
          >
            {title}
          </h3>
          {trailing}
        </div>
      )}
      {children}
    </div>
  );
}

/** Fila de total (AmountRow / _TotalRow en la app). */
export function AmountRow({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={cn('flex items-center justify-between py-1', bold ? 'text-base font-extrabold' : 'text-sm')}
      style={bold ? undefined : { color: BRAND.textMuted }}
    >
      <span>{label}</span>
      <span className={cn(!bold && 'font-semibold')} style={bold ? undefined : { color: BRAND.text }}>
        {value}
      </span>
    </div>
  );
}
