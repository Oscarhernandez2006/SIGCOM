import { useMemo, useState } from 'react';
import {
  FileDown,
  Building2,
  Download,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  PackageCheck,
  Calendar,
  Search,
  Link2,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import {
  useDownloadableOrders,
  useDownloadOrders,
  useSetOrderPicked,
  useSetOrderPickedBulk,
} from '@/hooks/useAdminApi';
import { COMPANIES } from '@/lib/companies';
import { cn, orderNos } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/** Formatea un valor numérico como moneda colombiana. */
function money(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

/** Fecha (YYYY-MM-DD) en horario de Colombia de una fecha dada (hoy por defecto). */
function bogotaDateStr(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Filtro por estado de alistado. */
type PickedFilter = 'all' | 'picked' | 'unpicked';

export function DownloadOrdersPage({
  orderType = 'corte',
  category,
}: {
  orderType?: 'corte' | 'subproducto';
  category?: 'CERDO' | 'RES';
}) {
  // Los subproductos solo existen en AGROPECUARIA (#3), así que en esa vista
  // solo se muestra esa compañía.
  const availableCompanies =
    orderType === 'subproducto'
      ? COMPANIES.filter((c) => c.id === '3')
      : COMPANIES;
  const [companyId, setCompanyId] = useState(availableCompanies[0].id);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  // Filtros: por día (predeterminado hoy), por estado de alistado y búsqueda.
  const [dateFilter, setDateFilter] = useState<string>(bogotaDateStr());
  const [pickedFilter, setPickedFilter] = useState<PickedFilter>('all');
  const [search, setSearch] = useState('');

  const company = availableCompanies.find((c) => c.id === companyId)!;
  const { data: orders, isLoading, isError, refetch, isFetching } =
    useDownloadableOrders(companyId, orderType, category);
  const download = useDownloadOrders();
  const setPicked = useSetOrderPicked();
  const setPickedBulk = useSetOrderPickedBulk();

  const all = orders ?? [];

  // Lista visible tras aplicar los filtros de día, alistado y búsqueda,
  // ordenada por consecutivo ascendente (1, 2, 3...).
  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all
      .filter((o) => {
        const matchesDate =
          !dateFilter || bogotaDateStr(new Date(o.createdAt)) === dateFilter;
        const matchesPicked =
          pickedFilter === 'all' ||
          (pickedFilter === 'picked' ? o.picked : !o.picked);
        const matchesSearch =
          !term ||
          o.orderNumber.toLowerCase().includes(term) ||
          o.customerName.toLowerCase().includes(term) ||
          o.customerCode.toLowerCase().includes(term) ||
          o.sellerName.toLowerCase().includes(term);
        return matchesDate && matchesPicked && matchesSearch;
      })
      .sort((a, b) => Number(a.orderNumber) - Number(b.orderNumber));
  }, [all, dateFilter, pickedFilter, search]);

  const allSelected = list.length > 0 && list.every((o) => selected.has(o.id));

  const selectedCount = useMemo(
    () => list.filter((o) => selected.has(o.id)).length,
    [list, selected],
  );

  // Estado de la casilla masiva de "alistado" (sobre los pedidos filtrados).
  const allPicked = list.length > 0 && list.every((o) => o.picked);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const everySelected = list.every((o) => prev.has(o.id));
      const next = new Set(prev);
      if (everySelected) {
        list.forEach((o) => next.delete(o.id));
      } else {
        list.forEach((o) => next.add(o.id));
      }
      return next;
    });
  }

  /** Marca/desmarca como alistados TODOS los pedidos filtrados (acción masiva). */
  function toggleAllPicked(picked: boolean) {
    if (list.length === 0) return;
    setPickedBulk.mutate({
      companyId,
      orderIds: list.map((o) => o.id),
      picked,
      type: orderType,
      category,
    });
  }

  function changeCompany(id: string) {
    setCompanyId(id);
    setSelected(new Set());
    setError('');
  }

  async function handleDownload() {
    const orderIds = list.filter((o) => selected.has(o.id)).map((o) => o.id);
    if (orderIds.length === 0) return;
    setError('');
    try {
      await download.mutateAsync({ companyId, orderIds, type: orderType, category });
      setSelected(new Set());
    } catch (err) {
      if (isAxiosError(err)) {
        const msg = err.response?.data?.message;
        setError(
          (Array.isArray(msg) ? msg.join(', ') : msg) ||
            'No se pudo generar el PDF.',
        );
      } else {
        setError('No se pudo generar el PDF.');
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Descargar pedidos{' '}
          {orderType === 'subproducto'
            ? `· Subproductos · ${category === 'RES' ? 'Res' : 'Cerdo'}`
            : '· Cortes'}
        </h2>
        <p className="text-muted-foreground">
          Descarga masiva en PDF de los pedidos subidos a Siesa.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileDown className="h-5 w-5" />
            </span>
            Pedidos disponibles para descargar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <PackageCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Aparecen los pedidos <strong>subidos a Siesa</strong> que no están
              rebotados ni anulados. Selecciona los que quieras y se generará un
              <strong> único PDF</strong> con todos. Al descargar quedan marcados
              como <strong>descargados</strong> (puedes volver a descargarlos).
            </span>
          </p>

          {/* Compañía */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Compañía</label>
            <div className="flex flex-wrap gap-2">
              {availableCompanies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => changeCompany(c.id)}
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

          {/* Filtros: día y estado de alistado */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Buscar</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pedido, cliente o vendedor"
                  className="h-9 w-64 rounded-lg border border-border bg-background py-1 pl-8 pr-2 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Día</label>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="h-9 rounded-lg border border-border bg-background py-1 pl-8 pr-2 text-sm"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDateFilter(bogotaDateStr())}
                >
                  Hoy
                </Button>
                {dateFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDateFilter('')}
                  >
                    Todos
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Alistado</label>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { v: 'all', label: 'Todos' },
                    { v: 'unpicked', label: 'Pendientes' },
                    { v: 'picked', label: 'Alistados' },
                  ] as { v: PickedFilter; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setPickedFilter(opt.v)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                      pickedFilter === opt.v
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleDownload}
              disabled={selectedCount === 0 || download.isPending}
            >
              <Download
                className={cn('h-4 w-4', download.isPending && 'animate-pulse')}
              />
              {download.isPending
                ? 'Generando...'
                : `Descargar PDF (${selectedCount})`}
            </Button>
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              Actualizar
            </Button>
            <span className="text-xs text-muted-foreground">
              {company.name} · {list.length} pedido(s)
            </span>
          </div>

          {error && (
            <p className="flex items-center gap-1 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}

          {/* Tabla */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-[var(--primary)]"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Seleccionar todos"
                    />
                  </th>
                  <th className="px-3 py-2">Pedido</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Vendedor</th>
                  <th className="px-3 py-2">Estado Siesa</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">Descarga</th>
                  <th className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-[var(--success)]"
                        checked={allPicked}
                        disabled={list.length === 0 || setPickedBulk.isPending}
                        onChange={(e) => toggleAllPicked(e.target.checked)}
                        title="Marcar/desmarcar como alistados todos los filtrados"
                        aria-label="Marcar todos los filtrados como alistados"
                      />
                      <span>Alistado</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      Cargando pedidos...
                    </td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-8 text-center text-destructive"
                    >
                      No se pudieron cargar los pedidos.
                    </td>
                  </tr>
                ) : list.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      No hay pedidos disponibles para descargar.
                    </td>
                  </tr>
                ) : (
                  list.map((o) => {
                    const isChecked = selected.has(o.id);
                    return (
                      <tr
                        key={o.id}
                        className={cn(
                          'border-t border-border transition-colors hover:bg-accent/40',
                          isChecked && 'bg-primary/5',
                        )}
                        onClick={() => toggle(o.id)}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-[var(--primary)]"
                            checked={isChecked}
                            onChange={() => toggle(o.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Seleccionar pedido ${o.orderNumber}`}
                          />
                        </td>
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
                          <div className="font-medium">{o.customerName}</div>
                          <div className="text-xs text-muted-foreground">
                            {o.customerCode}
                          </div>
                        </td>
                        <td className="px-3 py-2">{o.sellerName}</td>
                        <td className="px-3 py-2">
                          {o.siesaEstado ? (
                            <Badge variant="secondary">{o.siesaEstado}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {money(o.total)}
                        </td>
                        <td className="px-3 py-2">
                          {o.downloadedAt ? (
                            <span className="flex items-center gap-1 text-xs text-[var(--success)]">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Descargado
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Sin descargar
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            className="h-5 w-5 cursor-pointer accent-[var(--success)]"
                            checked={o.picked}
                            disabled={setPicked.isPending}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              setPicked.mutate({
                                companyId,
                                orderId: o.id,
                                picked: e.target.checked,
                                type: orderType,
                                category,
                              });
                            }}
                            title={
                              o.pickedBy
                                ? `Alistado por ${o.pickedBy}`
                                : 'Marcar como alistado'
                            }
                            aria-label={`Marcar pedido ${o.orderNumber} como alistado`}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
