import { useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  Truck,
  RefreshCw,
  Search,
  Upload,
  Send,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import {
  useCanalDispatchOrders,
  useDispatchCanalOrder,
  useSendCanalOrderToSiesa,
} from '@/hooks/useApi';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { CanalStatusBadge } from '@/components/CanalStatusBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { CanalOrder } from '@/types';

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return 'No se pudo completar la acción.';
}

function DispatchCard({ order }: { order: CanalOrder }) {
  const [remisionNumber, setRemisionNumber] = useState(
    order.remisionNumber ?? '',
  );
  const [frigoAppId, setFrigoAppId] = useState(order.frigoAppId ?? '');
  const [frigoKg, setFrigoKg] = useState(
    order.frigoKg != null ? String(order.frigoKg) : '',
  );
  const [frigoGanchos, setFrigoGanchos] = useState(
    order.frigoGanchos != null ? String(order.frigoGanchos) : '',
  );
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const dispatchMutation = useDispatchCanalOrder();
  const siesaMutation = useSendCanalOrderToSiesa();

  const isSynced = order.status === 'synced';
  const hasManualFrigoData =
    frigoAppId.trim() && Number(frigoKg) > 0 && Number(frigoGanchos) > 0;
  const hasSavedFrigoData =
    !!order.frigoAppId && Number(order.frigoKg ?? 0) > 0 && Number(order.frigoGanchos ?? 0) > 0;
  const canSubmit =
    remisionNumber.trim() && (hasManualFrigoData || hasSavedFrigoData || !!file);

  const handleSave = async (sendToSiesa: boolean) => {
    if (!canSubmit) {
      setError('Diligencia remisión y adjunta PDF Frigo App (o ingresa ID, kg y ganchos).');
      return;
    }
    try {
      await dispatchMutation.mutateAsync({
        id: order.id,
        remisionNumber: remisionNumber.trim(),
        frigoAppId: frigoAppId.trim() || undefined,
        frigoKg: frigoKg ? Number(frigoKg) : undefined,
        frigoGanchos: frigoGanchos ? Number(frigoGanchos) : undefined,
        file,
        sendToSiesa,
      });
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const handleSiesa = async () => {
    try {
      await siesaMutation.mutateAsync(order.id);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  return (
    <Card>
      <CardContent className="grid gap-4 p-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">
              Pedido #{order.orderNumber} · {order.clientName}
            </p>
            <CanalStatusBadge status={order.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            NIT {order.clientCode} · Despacho {formatDate(order.dispatchDate)} ·
            Vendedor {order.sellerName}
          </p>
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {Number(order.totalKg).toLocaleString('es-CO')} kg ·{' '}
              {formatCurrency(Number(order.totalValue))}
            </p>
            {order.items.map((it, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span>
                  {it.itemName} · {it.quantity} u ·{' '}
                  {Number(it.estimatedKg).toLocaleString('es-CO')} kg
                </span>
                <span className="tabular-nums">{formatCurrency(it.price)}/kg</span>
              </div>
            ))}
          </div>
          {order.syncError && (
            <p className="rounded-md bg-rose-100 px-3 py-2 text-xs text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
              Error Siesa: {order.syncError}
            </p>
          )}
          {order.siesaDocumentId && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Consecutivo Siesa: {order.siesaDocumentId}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Remisión
              <Input
                value={remisionNumber}
                onChange={(e) => setRemisionNumber(e.target.value)}
                placeholder="N° remisión"
                disabled={isSynced}
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              ID Frigo App (opcional)
              <Input
                value={frigoAppId}
                onChange={(e) => setFrigoAppId(e.target.value)}
                placeholder="Se autoextrae del PDF"
                disabled={isSynced}
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Kg Frío total (opcional)
              <Input
                inputMode="decimal"
                value={frigoKg}
                onChange={(e) =>
                  setFrigoKg(e.target.value.replace(/[^\d.]/g, ''))
                }
                placeholder="Se autoextrae del PDF"
                disabled={isSynced}
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Ganchos/Piezas (opcional)
              <Input
                inputMode="numeric"
                value={frigoGanchos}
                onChange={(e) =>
                  setFrigoGanchos(e.target.value.replace(/[^\d]/g, ''))
                }
                placeholder="Se autoextrae del PDF"
                disabled={isSynced}
              />
            </label>
          </div>

          <p className="text-xs text-muted-foreground">
            El sistema toma del PDF: No. de reporte (ID Frigo App), total FRÍO(kg)
            y PIEZAS (ganchos). Si lo necesitas, puedes sobreescribirlos manualmente.
          </p>

          <label
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-input px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40',
              isSynced && 'pointer-events-none opacity-60',
            )}
          >
            <Upload className="h-4 w-4" />
            {file ? file.name : order.frigoPdfName ?? 'Adjuntar PDF de Frigo App'}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={isSynced}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {order.frigoPdfName && (
            <a
              href={`/api/admin/canal-orders/dispatch/${order.id}/frigo-pdf`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <FileText className="h-3.5 w-3.5" />
              Ver PDF relacionado
            </a>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-wrap justify-end gap-2">
            {!isSynced && (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleSave(false)}
                  disabled={dispatchMutation.isPending}
                >
                  Guardar remisión
                </Button>
                {order.status === 'dispatched' || order.status === 'failed' ? (
                  <Button onClick={handleSiesa} disabled={siesaMutation.isPending}>
                    <Send className="h-4 w-4" />
                    Enviar a Siesa
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleSave(true)}
                    disabled={dispatchMutation.isPending}
                  >
                    <Send className="h-4 w-4" />
                    Despachar y enviar a Siesa
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function CanalDispatchPage() {
  const { data: orders = [], isLoading, isFetching, refetch } =
    useCanalDispatchOrders();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.clientName.toLowerCase().includes(q) ||
        o.clientCode.toLowerCase().includes(q),
    );
  }, [orders, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Truck className="h-6 w-6 text-primary" />
            Despacho · Canales
          </h2>
          <p className="text-muted-foreground">
            Genera la remisión, relaciona Frigo App y envía el pedido a Siesa.
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
          placeholder="Buscar por cliente o NIT..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No hay pedidos pendientes de despacho.
          </CardContent>
        </Card>
      ) : (
        filtered.map((order) => <DispatchCard key={order.id} order={order} />)
      )}
    </div>
  );
}
