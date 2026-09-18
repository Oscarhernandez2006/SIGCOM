import { useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  ClipboardCheck,
  RefreshCw,
  CheckCircle2,
  Save,
  Search,
} from 'lucide-react';
import {
  useCanalControlOrders,
  useUpdateCanalOrderByControl,
  useApproveCanalOrderByControl,
} from '@/hooks/useApi';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { CanalOrder, CanalOrderItem } from '@/types';

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return 'No se pudo completar la acción.';
}

/** Tarjeta de un pedido en revisión: permite ajustar líneas y aprobar. */
function ControlCard({ order }: { order: CanalOrder }) {
  const [items, setItems] = useState<CanalOrderItem[]>(order.items);
  const [note, setNote] = useState(order.controlNote ?? '');
  const [error, setError] = useState('');
  const updateMutation = useUpdateCanalOrderByControl();
  const approveMutation = useApproveCanalOrderByControl();

  const setItem = (idx: number, patch: Partial<CanalOrderItem>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        next.estimatedKg = Number(
          (next.quantity * next.approxWeightKg).toFixed(3),
        );
        return next;
      }),
    );
    setError('');
  };

  const totalKg = useMemo(
    () => items.reduce((acc, it) => acc + Number(it.estimatedKg || 0), 0),
    [items],
  );
  const totalValue = useMemo(
    () =>
      items.reduce(
        (acc, it) =>
          acc +
          Number(it.estimatedKg || 0) * Number(it.price || 0) +
          Number(it.freight || 0),
        0,
      ),
    [items],
  );

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ id: order.id, items, controlNote: note });
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const handleApprove = async () => {
    try {
      // Guarda cambios pendientes antes de aprobar.
      await updateMutation.mutateAsync({ id: order.id, items, controlNote: note });
      await approveMutation.mutateAsync(order.id);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold">
              Pedido #{order.orderNumber} · {order.clientName}
            </p>
            <p className="text-xs text-muted-foreground">
              NIT {order.clientCode} · Despacho {formatDate(order.dispatchDate)} ·
              Vendedor {order.sellerName}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium">Ítem</th>
                <th className="px-2 py-1.5 text-right font-medium">Unidades</th>
                <th className="px-2 py-1.5 text-right font-medium">Kg est.</th>
                <th className="px-2 py-1.5 font-medium">Rango</th>
                <th className="px-2 py-1.5 text-right font-medium">Precio/kg</th>
                <th className="px-2 py-1.5 text-right font-medium">Flete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td className="px-2 py-1.5">
                    <span className="font-medium">{it.itemName}</span>
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({it.especie})
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      inputMode="numeric"
                      value={it.quantity}
                      onChange={(e) =>
                        setItem(idx, { quantity: Number(e.target.value) || 0 })
                      }
                      className="w-20 rounded-md border border-input bg-background px-2 py-1 text-right tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {Number(it.estimatedKg).toLocaleString('es-CO')}
                  </td>
                  <td className="px-2 py-1.5 text-xs">{it.specifications || '—'}</td>
                  <td className="px-2 py-1.5">
                    <input
                      inputMode="decimal"
                      value={it.price}
                      onChange={(e) =>
                        setItem(idx, { price: Number(e.target.value) || 0 })
                      }
                      className="w-24 rounded-md border border-input bg-background px-2 py-1 text-right tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      inputMode="decimal"
                      value={it.freight}
                      onChange={(e) =>
                        setItem(idx, { freight: Number(e.target.value) || 0 })
                      }
                      className="w-20 rounded-md border border-input bg-background px-2 py-1 text-right tabular-nums"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border text-sm font-semibold">
              <tr>
                <td className="px-2 py-1.5">Totales</td>
                <td />
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {totalKg.toLocaleString('es-CO')} kg
                </td>
                <td />
                <td className="px-2 py-1.5 text-right tabular-nums" colSpan={2}>
                  {formatCurrency(totalValue)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Observación del controlador (opcional)"
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            <Save className="h-4 w-4" />
            Guardar cambios
          </Button>
          <Button
            onClick={handleApprove}
            disabled={approveMutation.isPending || updateMutation.isPending}
          >
            <CheckCircle2 className="h-4 w-4" />
            Aprobar y enviar a cartera
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CanalControlPage() {
  const { data: orders = [], isLoading, isFetching, refetch } =
    useCanalControlOrders();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.clientName.toLowerCase().includes(q) ||
        o.clientCode.toLowerCase().includes(q) ||
        o.sellerName.toLowerCase().includes(q),
    );
  }, [orders, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            Control de canales
          </h2>
          <p className="text-muted-foreground">
            Revisa y ajusta los pedidos antes de enviarlos a cartera.
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

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente, NIT o vendedor..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No hay pedidos pendientes de control.
          </CardContent>
        </Card>
      ) : (
        filtered.map((order) => <ControlCard key={order.id} order={order} />)
      )}
    </div>
  );
}
