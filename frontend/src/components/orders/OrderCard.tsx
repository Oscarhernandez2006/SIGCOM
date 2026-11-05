import { Info, Timer, Link2 } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { formatMoney, formatShortDateTimeDay, formatTime } from '@/lib/format';
import { cn, orderNos } from '@/lib/utils';
import type { Order, SiesaState } from '@/types';
import { InlineNote, StatusPill } from '@/components/brand/PageShell';
import { ApprovalCountdown } from '@/components/ApprovalCountdown';
import {
  SIESA_DISPATCHED,
  SIESA_INVOICED,
  SUBPRODUCT_PILL,
  orderNote,
  siesaStyle,
  statusStyle,
} from './order-status';

/** Tarjeta de pedido con franja de color por estado (OrderCard en la app). */
export function OrderCard({
  order,
  siesa,
  showSeller,
  onOpen,
  actions,
  dimmed = false,
}: {
  order: Order;
  siesa?: SiesaState;
  showSeller: boolean;
  onOpen: () => void;
  /** Botones de acción (Documento, Editar, Anular…) que se muestran bajo la tarjeta. */
  actions?: React.ReactNode;
  dimmed?: boolean;
}) {
  const status = statusStyle(order.status);
  const siesaPill = siesaStyle(siesa ?? order.siesaEstado);
  const pendingApproval = order.status === 'pending_approval' && order.approvalDeadline;
  const note = orderNote(order);
  const branch = order.customer.branchName || order.customer.branch || order.customer.code;
  const seller = showSeller ? order.seller?.name : null;

  return (
    <div
      className={cn(
        'flex overflow-hidden rounded-[20px] bg-white transition-opacity duration-200',
        dimmed && 'opacity-55',
      )}
      style={{ border: `1px solid ${BRAND.border}CC` }}
    >
      <div className="w-[5px] shrink-0" style={{ backgroundColor: status.color }} />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpen}
          className="block w-full px-3.5 pb-3 pt-3.5 text-left transition-colors hover:bg-[#F4FAF6]/70"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-base font-extrabold">
              #{orderNos(order.orderNumber, order.secondNumber)}
            </span>
            {order.type === 'subproducto' && (
              <StatusPill label={SUBPRODUCT_PILL.label} color={SUBPRODUCT_PILL.color} />
            )}
            <span className="ml-auto shrink-0 text-xs" style={{ color: BRAND.textSoft }}>
              {formatShortDateTimeDay(order.createdAt)} · {formatTime(order.createdAt)}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-[14.5px] font-bold leading-tight">
            {order.customer.name}
          </p>
          <p className="truncate text-[12.5px]" style={{ color: BRAND.textSoft }}>
            {[branch, seller].filter(Boolean).join(' · ')}
          </p>
          <div className="mt-2.5 flex items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              <StatusPill label={status.label} color={status.color} />
              {siesaPill && <StatusPill label={siesaPill.label} color={siesaPill.color} outlined />}
              {siesa?.facturado && (
                <StatusPill label={SIESA_INVOICED.label} color={SIESA_INVOICED.color} outlined />
              )}
              {siesa?.despachado && (
                <StatusPill label={SIESA_DISPATCHED.label} color={SIESA_DISPATCHED.color} outlined />
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-base font-extrabold leading-tight">{formatMoney(Number(order.total))}</p>
              <p className="text-xs" style={{ color: BRAND.textSoft }}>
                {order.items.length} producto{order.items.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          {pendingApproval ? (
            <div className="mt-2">
              <InlineNote icon={Timer} color="#CA8A04">
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  Cartera decide antes de las {formatTime(order.approvalDeadline!)} ·
                  <ApprovalCountdown deadline={order.approvalDeadline} />
                </span>
              </InlineNote>
            </div>
          ) : (
            note && (
              <div className="mt-2">
                <InlineNote icon={Info} color={status.color}>
                  <span className="line-clamp-3">{note}</span>
                </InlineNote>
              </div>
            )
          )}
          {order.linkedOrderNumber && (
            <p
              className="mt-2 flex items-center gap-1 text-xs font-semibold"
              style={{ color: BRAND.primary }}
            >
              <Link2 className="h-[15px] w-[15px]" />
              Asociado a #{orderNos(order.linkedOrderNumber, order.linkedSecondNumber)}
            </p>
          )}
        </button>
        {actions && (
          <div
            className="flex flex-wrap items-center gap-1.5 px-3 py-2"
            style={{ borderTop: `1px solid ${BRAND.border}99` }}
          >
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

/** Botón pequeño de acción dentro de la tarjeta. */
export function CardAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-bold transition-colors hover:bg-[#F4FAF6] disabled:opacity-50"
      style={{ color: danger ? '#DC2626' : BRAND.textMuted }}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
