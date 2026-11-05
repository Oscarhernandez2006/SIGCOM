import { useMemo, useState } from 'react';
import {
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
import { BRAND } from '@/lib/brand';
import { PageBackground, Hero, BrandButton, StatusPill } from '@/components/brand/PageShell';
import { Panel, PanelBody } from '@/components/brand/Panel';

const FIELD_STYLE = { backgroundColor: BRAND.field, color: BRAND.text } as const;
const INPUT_CLASS = 'brand-input h-10 rounded-xl pl-9 pr-3 text-sm font-semibold outline-none';

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

  const title =
    orderType === 'subproducto'
      ? `Subproductos · ${category === 'RES' ? 'Res' : 'Cerdo'}`
      : 'Cortes';
  const pendingCount = list.filter((o) => !o.picked).length;
  const downloadedCount = list.filter((o) => o.downloadedAt).length;

  const chip = (on: boolean) =>
    ({
      backgroundColor: on ? BRAND.primary : '#fff',
      color: on ? '#fff' : BRAND.textMuted,
      border: `1px solid ${on ? BRAND.primary : BRAND.border}`,
    }) as const;

  return (
    <PageBackground className="space-y-3.5">
      <Hero>
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-xl font-extrabold leading-tight tracking-[-0.4px] sm:text-[22px]">
            Descargar pedidos · {title}
          </h2>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Actualizar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.16] transition-colors hover:bg-white/25"
          >
            <RefreshCw className={cn('h-[18px] w-[18px]', isFetching && 'animate-spin')} />
          </button>
        </div>
        <p className="mt-1 text-sm font-semibold text-white/90">
          Descarga masiva en PDF de los pedidos subidos a Siesa.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <HeroStat label="Pedidos" value={String(list.length)} />
          <HeroStat label="Por alistar" value={String(pendingCount)} />
          <HeroStat label="Descargados" value={String(downloadedCount)} />
        </div>
        {availableCompanies.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {availableCompanies.map((c) => {
              const on = companyId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => changeCompany(c.id)}
                  className="flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold transition-colors"
                  style={{
                    backgroundColor: on ? '#fff' : 'rgba(255,255,255,0.16)',
                    color: on ? BRAND.primaryDark : '#fff',
                  }}
                >
                  <Building2 className="h-4 w-4" />
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
      </Hero>

      <p className="flex items-start gap-2 rounded-2xl border border-[#1E9B50]/20 bg-[#1E9B50]/[0.06] p-3 text-sm text-[#166534]">
        <PackageCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Aparecen los pedidos <strong>subidos a Siesa</strong> que no están rebotados ni anulados.
          Selecciona los que quieras y se generará un <strong>único PDF</strong> con todos. Al
          descargar quedan marcados como <strong>descargados</strong> (puedes volver a descargarlos).
        </span>
      </p>

      <Panel>
        <PanelBody className="space-y-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: BRAND.textSoft }}
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pedido, cliente o vendedor"
                className={cn(INPUT_CLASS, 'w-full')}
                style={FIELD_STYLE}
              />
            </div>
            <div className="relative">
              <Calendar
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: BRAND.primary }}
              />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className={INPUT_CLASS}
                style={FIELD_STYLE}
              />
            </div>
            <button
              type="button"
              onClick={() => setDateFilter(bogotaDateStr())}
              className="h-9 rounded-full px-3.5 text-[13px] font-bold transition-colors"
              style={chip(dateFilter === bogotaDateStr())}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('')}
              className="h-9 rounded-full px-3.5 text-[13px] font-bold transition-colors"
              style={chip(!dateFilter)}
            >
              Todos los días
            </button>
            <span className="mx-1 hidden h-6 w-px sm:block" style={{ backgroundColor: BRAND.border }} />
            {(
              [
                { v: 'all', label: 'Todos' },
                { v: 'unpicked', label: 'Pendientes' },
                { v: 'picked', label: 'Alistados' },
              ] as { v: PickedFilter; label: string }[]
            ).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setPickedFilter(opt.v)}
                className="h-9 rounded-full px-3.5 text-[13px] font-bold transition-colors"
                style={chip(pickedFilter === opt.v)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <BrandButton
              className="h-10"
              onClick={handleDownload}
              disabled={selectedCount === 0 || download.isPending}
            >
              <Download className={cn('h-4 w-4', download.isPending && 'animate-pulse')} />
              {download.isPending ? 'Generando...' : `Descargar PDF (${selectedCount})`}
            </BrandButton>
            <BrandButton
              variant="outlined"
              className="h-10"
              onClick={toggleAll}
              disabled={list.length === 0}
            >
              {allSelected ? 'Quitar selección' : 'Seleccionar todos'}
            </BrandButton>
            <span className="text-xs font-semibold" style={{ color: BRAND.textSoft }}>
              {company.name} · {list.length} pedido(s)
            </span>
          </div>

          {error && (
            <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0]">
            <table className="w-full text-sm">
              <thead className="bg-[#F4FAF6] text-left text-[11px] font-extrabold uppercase tracking-wider text-[#15803D]">
                <tr>
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-[#1E9B50]"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Seleccionar todos"
                    />
                  </th>
                  <th className="px-3 py-2.5">Pedido</th>
                  <th className="px-3 py-2.5">Cliente</th>
                  <th className="px-3 py-2.5">Vendedor</th>
                  <th className="px-3 py-2.5">Estado Siesa</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                  <th className="px-3 py-2.5">Descarga</th>
                  <th className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-[#1E9B50]"
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
                    <td colSpan={8} className="px-3 py-10 text-center" style={{ color: BRAND.textSoft }}>
                      Cargando pedidos...
                    </td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center font-semibold text-red-600">
                      No se pudieron cargar los pedidos.
                    </td>
                  </tr>
                ) : list.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center" style={{ color: BRAND.textSoft }}>
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
                          'cursor-pointer border-t border-[#E2E8F0]/80 transition-colors hover:bg-[#F4FAF6]',
                          isChecked && 'bg-[#1E9B50]/[0.07]',
                        )}
                        onClick={() => toggle(o.id)}
                      >
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-[#1E9B50]"
                            checked={isChecked}
                            onChange={() => toggle(o.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Seleccionar pedido ${o.orderNumber}`}
                          />
                        </td>
                        <td className="px-3 py-2.5 font-extrabold">
                          #{orderNos(o.orderNumber, o.secondNumber)}
                          {o.linkedOrderNumber && (
                            <div
                              className="mt-0.5 flex items-center gap-1 text-xs font-semibold"
                              style={{ color: BRAND.primary }}
                            >
                              <Link2 className="h-3 w-3 shrink-0" />
                              Asociado a #{orderNos(o.linkedOrderNumber, o.linkedSecondNumber)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold">{o.customerName}</div>
                          <div className="text-xs" style={{ color: BRAND.textSoft }}>
                            {o.customerCode}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">{o.sellerName}</td>
                        <td className="px-3 py-2.5">
                          {o.siesaEstado ? (
                            <StatusPill label={o.siesaEstado} color={BRAND.textMuted} />
                          ) : (
                            <span className="text-xs" style={{ color: BRAND.textSoft }}>
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums">{money(o.total)}</td>
                        <td className="px-3 py-2.5">
                          {o.downloadedAt ? (
                            <span
                              className="flex items-center gap-1 text-xs font-bold"
                              style={{ color: BRAND.primary }}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Descargado
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: BRAND.textSoft }}>
                              Sin descargar
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            className="h-5 w-5 cursor-pointer accent-[#1E9B50]"
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
                            title={o.pickedBy ? `Alistado por ${o.pickedBy}` : 'Marcar como alistado'}
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
        </PanelBody>
      </Panel>
    </PageBackground>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-white/75">{label}</p>
      <p className="truncate text-lg font-extrabold">{value}</p>
    </div>
  );
}
