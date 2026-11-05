import type { Order, OrderStatus, SiesaState } from '@/types';

export interface StatusStyle {
  label: string;
  color: string;
}

/** Etiquetas y colores de estado, iguales a OrderStatusStyle en la app. */
const STATUS_STYLES: Record<OrderStatus, StatusStyle> = {
  draft: { label: 'Borrador', color: '#64748B' },
  pending_approval: { label: 'Pendiente aprobación cartera', color: '#CA8A04' },
  pending_control: { label: 'Esperando controlador', color: '#2563EB' },
  confirmed: { label: 'Pendiente por envío', color: '#EA580C' },
  syncing: { label: 'Enviando', color: '#D97706' },
  synced: { label: 'Enviado a Siesa', color: '#16A34A' },
  failed: { label: 'Error', color: '#DC2626' },
  cancelled: { label: 'Cancelado', color: '#DC2626' },
  disapproved: { label: 'Desaprobado', color: '#DC2626' },
  expired: { label: 'Vencido', color: '#DC2626' },
  bounced: { label: 'Rebotado', color: '#C026D3' },
};

export function statusStyle(status: OrderStatus): StatusStyle {
  return STATUS_STYLES[status] ?? { label: status, color: '#64748B' };
}

/** Estado en Siesa (Elaborado / Aprobado / Cumplido / …) con el color de la app. */
export function siesaStyle(state?: SiesaState | string | null): StatusStyle | null {
  const raw = typeof state === 'string' ? state : state?.estado;
  if (!raw || !raw.trim()) return null;
  const s = raw.toLowerCase();
  if (s.includes('elabora')) return { label: 'Elaborado', color: '#B45309' };
  if (s.includes('aprobad')) return { label: 'Aprobado', color: '#0284C7' };
  if (s.includes('cumplid')) return { label: 'Cumplido', color: '#16A34A' };
  if (s.includes('anulad')) return { label: 'Anulado', color: '#DC2626' };
  if (s.includes('reten')) return { label: 'Retenido', color: '#EA580C' };
  if (s.includes('factur')) return { label: 'Facturado', color: '#4F46E5' };
  if (s.includes('despach')) return { label: 'Despachado', color: '#0D9488' };
  return { label: raw, color: '#64748B' };
}

export const SIESA_INVOICED: StatusStyle = { label: 'Facturado', color: '#4F46E5' };
export const SIESA_DISPATCHED: StatusStyle = { label: 'Despachado', color: '#0D9488' };
export const SUBPRODUCT_PILL: StatusStyle = { label: 'Subproducto', color: '#7C3AED' };

/** Agrupación de estados para los filtros (igual que en la API móvil). */
export type OrderGroup = 'in_progress' | 'synced' | 'issues' | 'cancelled';

export const ORDER_GROUPS: { key: OrderGroup; label: string; color: string; statuses: OrderStatus[] }[] = [
  {
    key: 'in_progress',
    label: 'En curso',
    color: '#EA580C',
    statuses: ['draft', 'pending_approval', 'pending_control', 'confirmed', 'syncing'],
  },
  { key: 'synced', label: 'Enviados', color: '#16A34A', statuses: ['synced'] },
  {
    key: 'issues',
    label: 'Con novedad',
    color: '#DC2626',
    statuses: ['failed', 'bounced', 'disapproved', 'expired'],
  },
  { key: 'cancelled', label: 'Anulados', color: '#64748B', statuses: ['cancelled'] },
];

export function groupOf(status: OrderStatus): OrderGroup {
  return ORDER_GROUPS.find((g) => g.statuses.includes(status))?.key ?? 'in_progress';
}

/** Nota corta del pedido para la tarjeta (motivo de rechazo, anulación o error). */
export function orderNote(order: Order): string | null {
  if (order.status === 'disapproved' && order.disapprovalReason) {
    return `Desaprobado: ${order.disapprovalReason}`;
  }
  if (order.status === 'expired') {
    return `Vencido: ${order.disapprovalReason ?? 'No se aprobó dentro de las 2 horas. El inventario fue devuelto.'}`;
  }
  if (order.status === 'cancelled' && order.cancelReason) return `Anulado: ${order.cancelReason}`;
  if (order.syncError) return order.syncError;
  return null;
}

export interface GroupTotals {
  count: number;
  total: number;
}

/** Totales por grupo (En curso / Enviados / Con novedad / Anulados) a partir de la lista. */
export function summarizeGroups(orders: Order[]): Record<OrderGroup, GroupTotals> {
  const summary = Object.fromEntries(
    ORDER_GROUPS.map((g) => [g.key, { count: 0, total: 0 }]),
  ) as Record<OrderGroup, GroupTotals>;
  for (const o of orders) {
    const g = summary[groupOf(o.status)];
    g.count += 1;
    g.total += Number(o.total) || 0;
  }
  return summary;
}
