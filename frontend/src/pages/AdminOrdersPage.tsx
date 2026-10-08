import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  Building2,
  Calendar,
  Search,
  RefreshCw,
  X,
  User as UserIcon,
  Wallet,
  Download,
  Truck,
  FileText,
  CheckCircle2,
  XCircle,
  Link2,
} from 'lucide-react';
import {
  useAdminOrders,
  type AdminOrderDetail,
  type AdminOrdersFilters,
} from '@/hooks/useAdminApi';
import { downloadOrderPdf } from '@/hooks/useApi';
import { COMPANIES } from '@/lib/companies';
import { cn, orderNos } from '@/lib/utils';
import { useCompany } from '@/company/useCompany';
import { useAuth } from '@/auth/useAuth';
import { OrderStatusBadge } from '@/components/OrderStatusBadge';
import type { OrderStatus } from '@/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'pending_approval', label: 'Pendiente en cartera' },
  { value: 'confirmed', label: 'Pendiente por envío' },
  { value: 'synced', label: 'Enviado a Siesa' },
  { value: 'bounced', label: 'Rebotado' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'disapproved', label: 'Desaprobado' },
  { value: 'expired', label: 'Vencido' },
  { value: 'failed', label: 'Error' },
];

function money(value?: number | null): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function dateTime(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Muestra el estado de trazabilidad del pedido en Siesa (Comprometido,
 * Despachado, Facturado, etc.). El color resalta el avance: verde cuando ya
 * está despachado/facturado, ámbar mientras está en proceso. Si el pedido aún
 * no se ha enviado a Siesa, no hay estado que mostrar.
 */
function SiesaTrackingBadge({ order }: { order: AdminOrderDetail }) {
  const estado = order.siesaEstado?.trim();

  if (!estado) {
    const pending = order.status === 'synced';
    return (
      <span className="text-xs text-muted-foreground">
        {pending ? 'En espera de Siesa…' : '—'}
      </span>
    );
  }

  const lower = estado.toLowerCase();
  const isFinal = lower.includes('despach') || lower.includes('factur');
  const isCancelled = lower.includes('anulad');

  const tone = isCancelled
    ? 'bg-destructive/10 text-destructive'
    : isFinal
      ? 'bg-[var(--success)]/10 text-[var(--success)]'
      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        tone,
      )}
      title={
        order.siesaStatePrevious
          ? `Anterior: ${order.siesaStatePrevious}`
          : undefined
      }
    >
      <Truck className="h-3 w-3" />
      {estado}
    </span>
  );
}

export function AdminOrdersPage() {
  const { user } = useAuth();
  const { companies: myCompanies } = useCompany();
  const isAdmin = user?.role === 'admin';

  // Compañías que el usuario puede ver en esta pantalla: admin ve todas; el
  // resto solo aquellas donde tiene asignado el permiso del módulo.
  const availableCompanies = useMemo(() => {
    if (isAdmin) return COMPANIES;
    return COMPANIES.filter((c) =>
      myCompanies.some(
        (mc) =>
          mc.id === c.id &&
          (mc.permissions ?? []).includes('/admin/pedidos'),
      ),
    );
  }, [isAdmin, myCompanies]);

  const [companyId, setCompanyId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminOrderDetail | null>(null);

  // Selecciona por defecto la primera compañía disponible y corrige si la
  // seleccionada deja de estar disponible.
  useEffect(() => {
    if (availableCompanies.length === 0) return;
    if (!availableCompanies.some((c) => c.id === companyId)) {
      setCompanyId(availableCompanies[0].id);
    }
  }, [availableCompanies, companyId]);

  const filters: AdminOrdersFilters = useMemo(
    () => ({ from, to, status, search, type }),
    [from, to, status, search, type],
  );

  const { data: orders, isLoading, isError, refetch, isFetching } =
    useAdminOrders(companyId, filters);

  const list = orders ?? [];
  const company = COMPANIES.find((c) => c.id === companyId);

  function clearFilters() {
    setFrom('');
    setTo('');
    setStatus('');
    setType('');
    setSearch('');
  }

  const hasFilters = Boolean(from || to || status || type || search);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Administración de pedidos
        </h2>
        <p className="text-muted-foreground">
          Seguimiento completo de los pedidos: quién los generó, cartera, estado
          en Siesa y descargas del documento.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardList className="h-5 w-5" />
            </span>
            Pedidos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Compañía */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Compañía</label>
            <div className="flex flex-wrap gap-2">
              {availableCompanies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCompanyId(c.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                    companyId === c.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  <Building2 className="h-4 w-4" />
                  {c.name}
                  <span className="text-xs opacity-70">#{c.id}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Filtros */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Desde
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Hasta
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Estado
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Tipo
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Todos los tipos</option>
                <option value="corte">Cortes</option>
                <option value="subproducto">Subproductos</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Buscar
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="N°, cliente o vendedor"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              Actualizar
            </Button>
            {hasFilters && (
              <Button variant="ghost" onClick={clearFilters}>
                <X className="h-4 w-4" />
                Limpiar filtros
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              {company?.name ?? '—'} · {list.length} pedido(s)
            </span>
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Pedido</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Trazabilidad Siesa</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Vendedor</th>
                  <th className="px-3 py-2">Fecha y hora</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-center">Descargas</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      Cargando pedidos...
                    </td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-destructive">
                      No se pudieron cargar los pedidos.
                    </td>
                  </tr>
                ) : list.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      No hay pedidos con esos filtros.
                    </td>
                  </tr>
                ) : (
                  list.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => setSelected(o)}
                      className="cursor-pointer border-t border-border transition-colors hover:bg-accent/40"
                    >
                      <td className="px-3 py-2 font-medium">
                        #{orderNos(o.orderNumber, o.secondNumber)}
                        {o.linkedOrderNumber && (
                          <div className="mt-0.5 flex items-center gap-1 text-xs font-normal text-primary">
                            <Link2 className="h-3 w-3 shrink-0" />
                            Asociado a #
                            {orderNos(o.linkedOrderNumber, o.linkedSecondNumber)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <OrderStatusBadge status={o.status as OrderStatus} />
                      </td>
                      <td className="px-3 py-2">
                        <SiesaTrackingBadge order={o} />
                        {o.type === 'subproducto' && (
                          <span className="mt-1 flex w-fit items-center rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-600 dark:text-blue-400">
                            Subproducto
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{o.customerName}</div>
                        <div className="text-xs text-muted-foreground">
                          {o.customerCode}
                        </div>
                      </td>
                      <td className="px-3 py-2">{o.sellerName}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {dateTime(o.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {money(o.total)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {o.downloadCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-[var(--success)]">
                            <Download className="h-3.5 w-3.5" />
                            {o.downloadCount}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">0</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selected && (
        <OrderDetailModal
          order={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

/** Fila de dato (etiqueta + valor) dentro del detalle. */
function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof UserIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </h4>
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  );
}

function deliveryLabel(t?: string): string {
  if (t === 'recoge_en_planta') return 'Recoge en planta';
  if (t === 'despacho') return 'Despacho';
  return t ?? '';
}

function OrderDetailModal({
  order,
  onClose,
}: {
  order: AdminOrderDetail;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const qc = useQueryClient();

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadOrderPdf(order.id, order.orderNumber, order.companyId);
      qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-3xl rounded-2xl border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">
              Pedido #{orderNos(order.orderNumber, order.secondNumber)}
            </h3>
            <OrderStatusBadge status={order.status as OrderStatus} />
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {/* Quién lo generó */}
          <Section icon={UserIcon} title="Generación del pedido">
            <Row label="Vendedor" value={order.sellerName} />
            <Row label="Documento" value={order.sellerDocument} />
            <Row label="Código vendedor" value={order.sellerCode} />
            <Row label="Creado" value={dateTime(order.createdAt)} />
            <Row label="Fecha de entrega" value={order.deliveryDate} />
            {order.linkedOrderNumber && (
              <Row
                label="Asociado al pedido"
                value={
                  <span className="inline-flex items-center gap-1 text-primary">
                    <Link2 className="h-3.5 w-3.5" />#
                    {orderNos(order.linkedOrderNumber, order.linkedSecondNumber)}
                  </span>
                }
              />
            )}
          </Section>

          {/* Cliente */}
          <Section icon={FileText} title="Cliente">
            <Row label="Nombre" value={order.customerName} />
            <Row label="NIT" value={order.customerCode} />
            <Row label="Ciudad" value={order.customerCity} />
          </Section>

          {/* Cartera */}
          <Section icon={Wallet} title="Cartera (aprobación)">
            <Row
              label="Saldo al crear"
              value={
                order.carteraBalance != null
                  ? money(order.carteraBalance)
                  : 'Sin cartera pendiente'
              }
            />
            <Row label="Límite de aprobación" value={dateTime(order.approvalDeadline)} />
            <Row label="Aprobado por" value={order.approvedBy} />
            <Row label="Aprobado el" value={dateTime(order.approvedAt)} />
            <Row label="Motivo desaprobación" value={order.disapprovalReason} />
            <Row label="Motivo de anulación" value={order.cancelReason} />
          </Section>

          {/* Siesa */}
          <Section icon={Truck} title="Estado en Siesa">
            <Row label="Estado actual" value={order.siesaEstado} />
            <Row label="Estado anterior" value={order.siesaStatePrevious} />
            <Row label="Enviado a Siesa" value={dateTime(order.syncedAt)} />
            <Row label="Documento Siesa" value={order.siesaDocumentId} />
            <Row label="Error de sincronización" value={order.syncError} />
          </Section>

          {/* Descargas */}
          <Section icon={Download} title="Descargas del documento">
            <Row
              label="Veces descargado"
              value={
                <span className="inline-flex items-center gap-1">
                  {order.downloadCount > 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                  {order.downloadCount}
                </span>
              }
            />
            <Row label="Última descarga" value={dateTime(order.downloadedAt)} />
            <Row label="Descargado por" value={order.downloadedBy} />
          </Section>

          {/* Logística / notas */}
          <Section icon={Truck} title="Entrega y notas">
            <Row label="Tipo de entrega" value={deliveryLabel(order.deliveryType)} />
            <Row label="Horario de recibido" value={order.deliverySchedule} />
            <Row label="Nota producto" value={order.notes} />
            <Row label="Nota logística" value={order.logisticsNote} />
          </Section>
        </div>

        {/* Productos */}
        <div className="px-5 pb-2">
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <ClipboardList className="h-4 w-4 text-primary" />
            Productos ({order.items.length})
          </h4>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Ref.</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Cant.</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it, i) => (
                  <tr key={`${it.sku}-${i}`} className="border-t border-border">
                    <td className="px-3 py-2">{it.sku}</td>
                    <td className="px-3 py-2">{it.productName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {it.quantity} {it.unitOfMeasure ?? ''}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(it.unitPrice)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(it.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totales + acciones */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-5">
          <div className="text-sm">
            <span className="text-muted-foreground">Subtotal: </span>
            <span className="font-medium">{money(order.subtotal)}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="text-muted-foreground">Impuestos: </span>
            <span className="font-medium">{money(order.taxes)}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="text-muted-foreground">Total: </span>
            <span className="text-base font-bold">{money(order.total)}</span>
          </div>
          <Button onClick={handleDownload} disabled={downloading}>
            <Download className={cn('h-4 w-4', downloading && 'animate-pulse')} />
            {downloading ? 'Generando...' : 'Descargar documento'}
          </Button>
        </div>
      </div>
    </div>
  );
}
