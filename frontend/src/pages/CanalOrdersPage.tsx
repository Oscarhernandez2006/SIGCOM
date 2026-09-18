import { useMemo, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Beef,
  Plus,
  FileDown,
  Search,
  RefreshCw,
  Layers,
  ListChecks,
} from 'lucide-react';
import { useCanalOrders } from '@/hooks/useApi';
import { useCompany } from '@/company/useCompany';
import { exportCanalOrdersPdf } from '@/lib/canal-pdf';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CanalStatusBadge } from '@/components/CanalStatusBadge';

/** Tarjeta de resumen para el consolidado. */
function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            accent,
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function CanalOrdersPage() {
  const { company } = useCompany();
  const navigate = useNavigate();
  const { data: orders = [], isLoading, isFetching, refetch } =
    useCanalOrders();
  const [search, setSearch] = useState('');

  // Pedidos filtrados por búsqueda (cliente, NIT o vendedor).
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

  // Filas aplanadas (una por ítem) para la tabla.
  const rows = useMemo(
    () =>
      filtered.flatMap((o) =>
        o.items.map((it, idx) => ({ order: o, item: it, key: `${o.id}-${idx}` })),
      ),
    [filtered],
  );

  const stats = useMemo(() => {
    let canales = 0;
    let cerdo = 0;
    let res = 0;
    for (const { item } of rows) {
      canales += item.quantity;
      if (item.especie === 'CERDO') cerdo += item.quantity;
      else res += item.quantity;
    }
    return { pedidos: filtered.length, lineas: rows.length, canales, cerdo, res };
  }, [rows, filtered]);

  const handleExport = () => {
    exportCanalOrdersPdf({
      companyName: company?.name ?? '',
      orders: filtered,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Beef className="h-6 w-6 text-primary" />
            Canales
          </h2>
          <p className="text-muted-foreground">
            Consolidado de pedidos de canales recibidos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            Actualizar
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={filtered.length === 0}
          >
            <FileDown className="h-4 w-4" />
            Descargar PDF
          </Button>
          <Button onClick={() => navigate('/pedidos/nuevo?tipo=canales')}>
            <Plus className="h-4 w-4" />
            Nuevo
          </Button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pedidos"
          value={String(stats.pedidos)}
          icon={ListChecks}
          accent="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300"
        />
        <StatCard
          label="Total canales"
          value={stats.canales.toLocaleString('es-CO')}
          icon={Layers}
          accent="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300"
        />
        <StatCard
          label="Canales de cerdo"
          value={stats.cerdo.toLocaleString('es-CO')}
          icon={Beef}
          accent="bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300"
        />
        <StatCard
          label="Canales de res"
          value={stats.res.toLocaleString('es-CO')}
          icon={Beef}
          accent="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300"
        />
      </div>

      {/* Buscador */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente, NIT o vendedor..."
          className="pl-9"
        />
      </div>

      {/* Tabla consolidada */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Fecha despacho</th>
                  <th className="px-3 py-2 font-medium">NIT</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Ciudad</th>
                  <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                  <th className="px-3 py-2 font-medium">Especie</th>
                  <th className="px-3 py-2 font-medium">
                    Especificaciones / Novedades
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Precio</th>
                  <th className="px-3 py-2 text-right font-medium">Flete</th>
                  <th className="px-3 py-2 font-medium">Vendedor</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-3 py-10 text-center text-muted-foreground"
                    >
                      Cargando…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-3 py-10 text-center text-muted-foreground"
                    >
                      {search
                        ? 'Ningún pedido coincide con la búsqueda.'
                        : 'Aún no hay pedidos de canales.'}
                    </td>
                  </tr>
                ) : (
                  rows.map(({ order, item, key }) => (
                    <tr key={key} className="hover:bg-muted/40">
                      <td className="whitespace-nowrap px-3 py-2">
                        {formatDate(order.dispatchDate)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {order.clientCode}
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {order.clientName}
                      </td>
                      <td className="px-3 py-2">{order.clientCity || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {item.quantity.toLocaleString('es-CO')}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                          {item.especie}
                        </span>
                      </td>
                      <td className="px-3 py-2">{item.specifications || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {item.price ? formatCurrency(item.price) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {item.freight ? formatCurrency(item.freight) : '—'}
                      </td>
                      <td className="px-3 py-2">{order.sellerName}</td>
                      <td className="px-3 py-2">
                        <CanalStatusBadge status={order.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
