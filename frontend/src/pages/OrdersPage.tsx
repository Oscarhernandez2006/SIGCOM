import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  ClipboardList,
  Download,
  Ban,
  Eye,
  X,
  Pencil,
  Lock,
  ArrowRight,
  Search,
} from 'lucide-react';
import {
  useOrders,
  useCancelOrder,
  useSiesaStates,
  useClients,
  downloadOrderPdf,
} from '@/hooks/useApi';
import { useAuth } from '@/auth/useAuth';
import { useCompany } from '@/company/useCompany';
import { formatCurrency, cn, orderNos } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import { ApprovalCountdown } from '@/components/ApprovalCountdown';
import { EditOrderModal } from '@/components/EditOrderModal';
import type { Order, SiesaState, Client } from '@/types';

/** Formatea una fecha como "YYYY-MM-DD" para el input type="date" y la API. */
function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Trazabilidad del pedido en Siesa: estado (Elaborado / Aprobado / Cumplido /
 * Anulado / Retenido) y, si aplica, si ya fue facturado y/o despachado.
 */
function SiesaStateBadge({ state }: { state?: SiesaState }) {
  if (!state) return null;
  const normalized = state.estado.toLowerCase();

  let label = state.estado;
  let className = 'bg-muted text-muted-foreground';
  if (normalized.includes('elabora')) {
    label = 'Elaborado';
    className = 'bg-amber-100 text-amber-700';
  } else if (normalized.includes('aprobad')) {
    label = 'Aprobado';
    className = 'bg-sky-100 text-sky-700';
  } else if (normalized.includes('cumplid')) {
    label = 'Cumplido';
    className = 'bg-[var(--success)]/15 text-[var(--success)]';
  } else if (normalized.includes('anulad')) {
    label = 'Anulado';
    className = 'bg-destructive/10 text-destructive';
  } else if (normalized.includes('reten')) {
    label = 'Retenido';
    className = 'bg-orange-100 text-orange-700';
  }

  return (
    <>
      <Badge variant="secondary" className={cn('border-transparent', className)}>
        {label}
      </Badge>
      {state.facturado && (
        <Badge
          variant="secondary"
          className="border-transparent bg-indigo-100 text-indigo-700"
        >
          Facturado
        </Badge>
      )}
      {state.despachado && (
        <Badge
          variant="secondary"
          className="border-transparent bg-teal-100 text-teal-700"
        >
          Despachado
        </Badge>
      )}
    </>
  );
}

/** Motivos de anulación más frecuentes para seleccionar sin digitar. */
const CANCEL_REASONS = [
  'El cliente canceló el pedido',
  'Error al digitar el pedido',
  'Producto sin disponibilidad',
  'El cliente no recibe en este momento',
  'Pedido duplicado',
  'Cambio en la lista de precios',
] as const;

const OTHER_REASON = 'Otro';

export function OrdersPage() {
  // Por defecto se filtra el mes en curso para no cargar todo el histórico.
  const today = new Date();
  const [fromDate, setFromDate] = useState(
    toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)),
  );
  const [toDate, setToDate] = useState(toDateInput(today));
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState<Client | null>(null);

  const { data: orders = [], isLoading } = useOrders({
    from: fromDate || undefined,
    to: toDate || undefined,
    customerId: customerFilter?.id,
  });
  const { data: clientResults = [] } = useClients(customerSearch);
  const { data: siesaStates = {} } = useSiesaStates();
  const cancelMutation = useCancelOrder();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { company } = useCompany();

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [detailTarget, setDetailTarget] = useState<Order | null>(null);
  const [editTarget, setEditTarget] = useState<Order | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelOption, setCancelOption] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [showTypeModal, setShowTypeModal] = useState(false);

  const handleDownload = async (order: Order) => {
    setDownloadingId(order.id);
    try {
      await downloadOrderPdf(order.id, order.orderNumber);
    } finally {
      setDownloadingId(null);
    }
  };

  const openCancel = (order: Order) => {
    setCancelTarget(order);
    setCancelOption('');
    setCancelReason('');
    setCancelError('');
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    if (!cancelOption) {
      setCancelError('Selecciona un motivo de la anulación.');
      return;
    }
    const reason =
      cancelOption === OTHER_REASON ? cancelReason.trim() : cancelOption;
    if (!reason) {
      setCancelError('Redacta lo sucedido para anular el pedido.');
      return;
    }
    try {
      await cancelMutation.mutateAsync({
        orderId: cancelTarget.id,
        reason,
      });
      setCancelTarget(null);
    } catch {
      setCancelError('No se pudo anular el pedido. Intenta de nuevo.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pedidos</h2>
          <p className="text-muted-foreground">
            Gestiona y sincroniza tus pedidos con Siesa.
          </p>
        </div>
        <Button onClick={() => setShowTypeModal(true)}>
          <Plus className="h-4 w-4" />
          Nuevo
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Desde
            </label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Hasta
            </label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="relative min-w-[240px] flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Cliente
            </label>
            {customerFilter ? (
              <div className="flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 text-sm">
                <span className="truncate">
                  {customerFilter.name}{' '}
                  <span className="text-muted-foreground">
                    (NIT {customerFilter.code})
                  </span>
                </span>
                <button
                  onClick={() => {
                    setCustomerFilter(null);
                    setCustomerSearch('');
                  }}
                  aria-label="Quitar filtro de cliente"
                  className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Buscar cliente por nombre o NIT..."
                  className="pl-9"
                />
                {customerSearch && (
                  <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-background shadow-md">
                    {clientResults.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-muted-foreground">
                        No se encontraron clientes.
                      </p>
                    ) : (
                      clientResults.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setCustomerFilter(c);
                            setCustomerSearch('');
                          }}
                          className="flex w-full flex-col items-start px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                        >
                          <span className="font-medium">{c.name}</span>
                          <span className="text-xs text-muted-foreground">
                            NIT {c.code}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No hay pedidos en el rango o filtro seleccionado.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const canCancel =
              order.status !== 'cancelled' && order.status !== 'synced';
            const canEdit =
              order.status === 'confirmed' || order.status === 'failed';
            return (
              <Card key={order.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">Pedido #{orderNos(order.orderNumber, order.secondNumber)}</p>
                      <OrderStatusBadge status={order.status} />
                      <SiesaStateBadge state={siesaStates[order.orderNumber]} />
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {order.customer.name} · {order.items.length} items
                    </p>
                    {order.syncError && (
                      <p className="mt-1 text-xs text-destructive">
                        {order.syncError}
                      </p>
                    )}
                    {order.status === 'pending_approval' && (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Retenido por cartera. Tiempo restante:
                        </span>
                        <ApprovalCountdown deadline={order.approvalDeadline} />
                      </div>
                    )}
                    {order.status === 'disapproved' && order.disapprovalReason && (
                      <p className="mt-1 text-xs text-destructive">
                        Desaprobado: {order.disapprovalReason}
                      </p>
                    )}
                    {order.status === 'expired' && (
                      <p className="mt-1 text-xs text-destructive">
                        Vencido: {order.disapprovalReason ??
                          'No se aprobó dentro de las 2 horas. El inventario fue devuelto.'}
                      </p>
                    )}
                    {order.status === 'cancelled' && order.cancelReason && (
                      <p className="mt-1 text-xs text-destructive">
                        Anulado: {order.cancelReason}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-2 font-semibold">
                      {formatCurrency(Number(order.total))}
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDetailTarget(order)}
                    >
                      <Eye className="h-4 w-4" />
                      Detalles
                    </Button>

                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditTarget(order)}
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={downloadingId === order.id}
                      onClick={() => handleDownload(order)}
                    >
                      <Download className="h-4 w-4" />
                      Documento
                    </Button>

                    {canCancel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => openCancel(order)}
                      >
                        <Ban className="h-4 w-4" />
                        Anular
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de detalle del pedido */}
      {detailTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDetailTarget(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border p-5">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">
                    Pedido #{orderNos(detailTarget.orderNumber, detailTarget.secondNumber)}
                  </h3>
                  <OrderStatusBadge status={detailTarget.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {new Date(detailTarget.createdAt).toLocaleString('es-CO')}
                </p>
              </div>
              <button
                onClick={() => setDetailTarget(null)}
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-auto p-5">
              {/* Datos del cliente */}
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="font-semibold leading-tight">
                  {detailTarget.customer.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  NIT {detailTarget.customer.code}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Sucursal:{' '}
                    <span className="font-medium text-[var(--success)]">
                      {detailTarget.customer.branchName ||
                        detailTarget.customer.branch ||
                        '—'}
                    </span>
                    {detailTarget.customer.branchName &&
                    detailTarget.customer.branch
                      ? ` (${detailTarget.customer.branch})`
                      : ''}
                  </span>
                  <span>
                    Lista de precios:{' '}
                    <span className="font-medium text-[var(--success)]">
                      {detailTarget.customer.priceListName ||
                        detailTarget.customer.priceList ||
                        '—'}
                    </span>
                  </span>
                  <span>
                    Cond. pago:{' '}
                    <span className="font-medium text-[var(--success)]">
                      {detailTarget.customer.paymentTerm || '—'}
                    </span>
                  </span>
                  <span>
                    Vendedor:{' '}
                    <span className="font-medium text-[var(--success)]">
                      {detailTarget.customer.sellerName ||
                        detailTarget.customer.sellerCode ||
                        '—'}
                    </span>
                    {detailTarget.customer.sellerName &&
                    detailTarget.customer.sellerCode
                      ? ` (${detailTarget.customer.sellerCode})`
                      : ''}
                  </span>
                  {detailTarget.customer.address && (
                    <span>
                      Dirección:{' '}
                      <span className="font-medium text-[var(--success)]">
                        {detailTarget.customer.address}
                      </span>
                    </span>
                  )}
                  {(detailTarget.customer.neighborhood ||
                    detailTarget.customer.city ||
                    detailTarget.customer.department) && (
                    <span>
                      Ubicación:{' '}
                      <span className="font-medium text-[var(--success)]">
                        {[
                          detailTarget.customer.neighborhood,
                          detailTarget.customer.city,
                          detailTarget.customer.department,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    </span>
                  )}
                  {detailTarget.customer.phone && (
                    <span>
                      Teléfono:{' '}
                      <span className="font-medium text-[var(--success)]">
                        {detailTarget.customer.phone}
                      </span>
                    </span>
                  )}
                  {detailTarget.customer.email && (
                    <span>
                      Email:{' '}
                      <span className="font-medium text-[var(--success)]">
                        {detailTarget.customer.email}
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Productos */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Producto</th>
                      <th className="py-2 pr-3 text-center font-medium">UM</th>
                      <th className="py-2 pr-3 text-right font-medium">Cant.</th>
                      <th className="py-2 pr-3 text-right font-medium">Precio</th>
                      <th className="py-2 pr-3 text-right font-medium">Dto.</th>
                      <th className="py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailTarget.items.map((item) => (
                      <tr key={item.id} className="border-b border-border/50">
                        <td className="py-2 pr-3">
                          <p className="font-medium">{item.productName}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {item.sku}
                          </p>
                        </td>
                        <td className="py-2 pr-3 text-center text-muted-foreground">
                          {item.unitOfMeasure || '—'}
                        </td>
                        <td className="py-2 pr-3 text-right">{item.quantity}</td>
                        <td className="py-2 pr-3 text-right">
                          {formatCurrency(Number(item.unitPrice))}
                        </td>
                        <td className="py-2 pr-3 text-right text-muted-foreground">
                          {Number(item.discountPct)}%
                        </td>
                        <td className="py-2 text-right font-medium">
                          {formatCurrency(Number(item.lineTotal))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {detailTarget.notes && (
                <div className="rounded-lg border border-border p-3 text-sm">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Nota producto
                  </p>
                  <p className="mt-1">{detailTarget.notes}</p>
                </div>
              )}

              {detailTarget.logisticsNote && (
                <div className="rounded-lg border border-border p-3 text-sm">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Nota logística
                  </p>
                  <p className="mt-1">{detailTarget.logisticsNote}</p>
                </div>
              )}

              {detailTarget.deliverySchedule && (
                <div className="rounded-lg border border-border p-3 text-sm">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Horario de recibido de pedidos
                  </p>
                  <p className="mt-1">{detailTarget.deliverySchedule}</p>
                </div>
              )}

              {detailTarget.status === 'cancelled' &&
                detailTarget.cancelReason && (
                  <p className="text-sm text-destructive">
                    Anulado: {detailTarget.cancelReason}
                  </p>
                )}

              {/* Totales */}
              <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(Number(detailTarget.subtotal))}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Impuestos</span>
                  <span>{formatCurrency(Number(detailTarget.taxes))}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(Number(detailTarget.total))}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border p-4">
              <Button
                variant="outline"
                disabled={downloadingId === detailTarget.id}
                onClick={() => handleDownload(detailTarget)}
              >
                <Download className="h-4 w-4" />
                Documento
              </Button>
              <Button onClick={() => setDetailTarget(null)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de edición del pedido */}
      {editTarget && (
        <EditOrderModal
          order={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Modal de anulación */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">
              Anular pedido {cancelTarget.orderNumber}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Esta acción devuelve el stock de los productos al inventario.
              Indica el motivo de la anulación.
            </p>

            <div className="mt-4 space-y-2">
              {CANCEL_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => {
                    setCancelOption(reason);
                    setCancelError('');
                  }}
                  className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    cancelOption === reason
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-input hover:bg-muted'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      cancelOption === reason
                        ? 'border-primary'
                        : 'border-muted-foreground/40'
                    }`}
                  >
                    {cancelOption === reason && (
                      <span className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </span>
                  {reason}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setCancelOption(OTHER_REASON);
                  setCancelError('');
                }}
                className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  cancelOption === OTHER_REASON
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-input hover:bg-muted'
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    cancelOption === OTHER_REASON
                      ? 'border-primary'
                      : 'border-muted-foreground/40'
                  }`}
                >
                  {cancelOption === OTHER_REASON && (
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </span>
                Otro
              </button>
            </div>

            {cancelOption === OTHER_REASON && (
              <div className="mt-3">
                <label className="mb-1 block text-sm font-medium">
                  Redacta lo sucedido
                </label>
                <textarea
                  autoFocus
                  value={cancelReason}
                  onChange={(e) => {
                    setCancelReason(e.target.value);
                    setCancelError('');
                  }}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Describe lo que sucedió..."
                />
              </div>
            )}

            {cancelError && (
              <p className="mt-2 text-xs text-destructive">{cancelError}</p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCancelTarget(null)}
                disabled={cancelMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={confirmCancel}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? 'Anulando...' : 'Anular pedido'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal selector del tipo de pedido */}
      {showTypeModal && (
        <OrderTypeModal
          isAdmin={user?.role === 'admin'}
          permissions={company?.permissions ?? []}
          onClose={() => setShowTypeModal(false)}
          onSelect={(tipo) => {
            setShowTypeModal(false);
            navigate(`/pedidos/nuevo?tipo=${tipo}`);
          }}
        />
      )}
    </div>
  );
}

/** Tipos de pedido disponibles en el modal selector. */
const ORDER_TYPES: {
  tipo: 'cortes' | 'canales' | 'subproductos';
  label: string;
  description: string;
  permission?: string;
}[] = [
  {
    tipo: 'cortes',
    label: 'Cortes',
    description: 'Toma de pedido de productos de cortes.',
  },
  {
    tipo: 'canales',
    label: 'Canales',
    description: 'Toma de pedido de canales.',
    permission: '/pedidos/canales',
  },
  {
    tipo: 'subproductos',
    label: 'Subproductos',
    description: 'Toma de pedido de subproductos.',
    permission: '/pedidos/subproductos',
  },
];

/** Modal que permite elegir el tipo de pedido antes de la toma. */
function OrderTypeModal({
  isAdmin,
  permissions,
  onClose,
  onSelect,
}: {
  isAdmin: boolean;
  permissions: string[];
  onClose: () => void;
  onSelect: (tipo: 'cortes' | 'canales' | 'subproductos') => void;
}) {
  const options = ORDER_TYPES.filter(
    (o) => !o.permission || isAdmin || permissions.includes(o.permission),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">Nuevo pedido</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Selecciona el tipo de pedido que vas a tomar.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {options.map((o) => (
            <button
              key={o.tipo}
              type="button"
              onClick={() => onSelect(o.tipo)}
              className="group flex w-full items-center gap-3 rounded-lg border border-input p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{o.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {o.description}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}

          {options.length === 1 && (
            <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              Canales y Subproductos requieren permiso del administrador.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
