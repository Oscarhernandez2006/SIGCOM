import { useMemo, useState } from 'react';
import {
  ClipboardCheck,
  Search,
  Plus,
  Minus,
  Trash2,
  Check,
  X,
  AlertCircle,
  RefreshCw,
  Pencil,
  Beef,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import {
  useControlSubproductoOrders,
  useSubproductoCatalog,
  useEditControlSubproducto,
  useApproveControlSubproducto,
  useRejectControlSubproducto,
} from '@/hooks/useAdminApi';
import { formatCurrency, cn, orderNos } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Order, SellableProduct } from '@/types';

interface EditLine {
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  discountPct: number;
  category?: string;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const msg = error.response?.data?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return fallback;
}

export function ControladorSubproductosPage() {
  const { data: orders = [], isLoading, isFetching, refetch } =
    useControlSubproductoOrders();
  const [editing, setEditing] = useState<Order | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Order | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const approve = useApproveControlSubproducto();
  const reject = useRejectControlSubproducto();

  const handleApprove = async (order: Order) => {
    setActionError('');
    setBusyId(order.id);
    try {
      const result = await approve.mutateAsync(order.id);
      if (result.status === 'failed') {
        setActionError(
          `El pedido ${order.orderNumber} no se pudo subir a Siesa: ` +
            (result.syncError ?? 'error desconocido'),
        );
      }
    } catch (e) {
      setActionError(getErrorMessage(e, 'No se pudo aprobar el pedido.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setActionError('');
    setBusyId(rejectTarget.id);
    try {
      await reject.mutateAsync({
        id: rejectTarget.id,
        reason: rejectReason.trim() || undefined,
      });
      setRejectTarget(null);
      setRejectReason('');
    } catch (e) {
      setActionError(getErrorMessage(e, 'No se pudo rechazar el pedido.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            Controlador Subproductos
          </h2>
          <p className="text-muted-foreground">
            Revisa, edita y aprueba los pedidos de subproductos antes de subirlos
            a Siesa.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          Actualizar
        </Button>
      </div>

      {actionError && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {actionError}
        </div>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Cargando…
        </p>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ClipboardCheck className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No hay pedidos de subproductos pendientes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id} className="overflow-hidden">
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-semibold">
                      Pedido #{orderNos(order.orderNumber, order.secondNumber)}
                      {order.status === 'failed' && (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                          Error al subir
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {order.customer.name} · {order.customer.code}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Vendedor: {order.seller?.name} ·{' '}
                      {new Date(order.createdAt).toLocaleString('es-CO')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">
                      {formatCurrency(Number(order.total))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.items.length} ítem(s)
                    </p>
                  </div>
                </div>

                {order.status === 'failed' && order.syncError && (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {order.syncError}
                  </p>
                )}

                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">
                          Producto
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Cant.
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Precio
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((it) => (
                        <tr key={it.id} className="border-t border-border">
                          <td className="px-3 py-2">
                            <span className="font-medium">{it.productName}</span>
                            <span className="ml-2 font-mono text-xs text-muted-foreground">
                              {it.sku}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {Number(it.quantity)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatCurrency(Number(it.unitPrice))}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatCurrency(Number(it.lineTotal))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(order)}
                    disabled={busyId === order.id}
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRejectTarget(order);
                      setRejectReason('');
                    }}
                    disabled={busyId === order.id}
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    <X className="h-4 w-4" />
                    Rechazar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleApprove(order)}
                    disabled={busyId === order.id}
                  >
                    <Check className="h-4 w-4" />
                    {busyId === order.id ? 'Subiendo…' : 'Aprobar y subir'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <EditSubproductoModal
          order={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <h3 className="text-lg font-bold">Rechazar pedido</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Se devolverá el inventario reservado del pedido #
              {rejectTarget.orderNumber}.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Motivo del rechazo (opcional)"
              className="mt-3 h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setRejectTarget(null)}
                disabled={busyId === rejectTarget.id}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleReject}
                disabled={busyId === rejectTarget.id}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {busyId === rejectTarget.id ? 'Rechazando…' : 'Rechazar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Modal de edición: agregar/quitar productos por categoría y cambiar cantidades. */
function EditSubproductoModal({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<EditLine[]>(() =>
    order.items.map((it) => ({
      sku: it.sku,
      name: it.productName,
      unitPrice: Number(it.unitPrice),
      quantity: Number(it.quantity),
      discountPct: Number(it.discountPct),
    })),
  );
  const [category, setCategory] = useState<'CERDO' | 'RES'>('CERDO');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const { data: catalog = [] } = useSubproductoCatalog(
    order.companyId,
    order.customer.priceList,
    search,
  );
  const editMutation = useEditControlSubproducto();

  const visibleCatalog = catalog.filter(
    (p) => !p.category || p.category === category,
  );

  const total = useMemo(
    () =>
      lines.reduce((acc, l) => {
        const gross = l.unitPrice * l.quantity;
        return acc + (gross - (gross * l.discountPct) / 100);
      }, 0),
    [lines],
  );

  const addProduct = (p: SellableProduct) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.sku === p.sku);
      if (existing) {
        return prev.map((l) =>
          l.sku === p.sku ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          sku: p.sku,
          name: p.name,
          unitPrice: Number(p.price),
          quantity: 1,
          discountPct: 0,
          category: p.category,
        },
      ];
    });
  };

  const changeQty = (sku: string, delta: number) => {
    setLines((prev) =>
      prev
        .map((l) =>
          l.sku === sku ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l,
        )
        .filter((l) => l.quantity > 0),
    );
  };

  const removeLine = (sku: string) =>
    setLines((prev) => prev.filter((l) => l.sku !== sku));

  const handleSave = async () => {
    if (lines.length === 0) {
      setError('El pedido debe tener al menos un producto.');
      return;
    }
    setError('');
    try {
      await editMutation.mutateAsync({
        id: order.id,
        items: lines.map((l) => ({
          sku: l.sku,
          quantity: l.quantity,
          discountPct: l.discountPct,
        })),
      });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudieron guardar los cambios.'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h3 className="font-bold">
              Editar pedido #{orderNos(order.orderNumber, order.secondNumber)}
            </h3>
            <p className="text-xs text-muted-foreground">
              {order.customer.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto p-5 md:grid-cols-2">
          {/* Catálogo */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {(['CERDO', 'RES'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
                    category === cat
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  <Beef className="h-4 w-4" />
                  {cat === 'CERDO' ? 'Cerdo' : 'Res'}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto…"
                className="pl-9"
              />
            </div>
            <div className="max-h-[46vh] space-y-1.5 overflow-auto pr-0.5">
              {visibleCatalog.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  Sin productos en esta categoría.
                </p>
              ) : (
                visibleCatalog.map((p) => {
                  const hasStock = Number(p.stock) > 0;
                  return (
                    <button
                      key={p.sku}
                      onClick={() => addProduct(p)}
                      disabled={!hasStock}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                        hasStock
                          ? 'border-border hover:border-primary/40 hover:bg-accent'
                          : 'cursor-not-allowed border-border opacity-60',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {p.sku} · Stock {Number(p.stock)}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold">
                        {formatCurrency(Number(p.price))}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Líneas del pedido */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">Productos del pedido</p>
            <div className="max-h-[52vh] space-y-1.5 overflow-auto pr-0.5">
              {lines.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  Agrega productos desde el catálogo.
                </p>
              ) : (
                lines.map((l) => (
                  <div
                    key={l.sku}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {l.sku}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => changeQty(l.sku, -1)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-accent"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold tabular-nums">
                        {l.quantity}
                      </span>
                      <button
                        onClick={() => changeQty(l.sku, 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-accent"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={() => removeLine(l.sku)}
                      className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {error && (
          <p className="px-5 text-sm text-destructive">{error}</p>
        )}

        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <span className="text-sm text-muted-foreground">
            Subtotal:{' '}
            <span className="font-bold text-foreground">
              {formatCurrency(total)}
            </span>
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={editMutation.isPending}>
              {editMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
