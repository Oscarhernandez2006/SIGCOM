import { useEffect, useMemo, useState } from 'react';
import {
  Save,
  RefreshCw,
  Check,
  Search,
  TrendingUp,
  CalendarDays,
  Store,
  X,
} from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useCompany } from '@/company/useCompany';
import {
  useBudgets,
  useSaveBudgets,
  useProjection,
  useSaveProjection,
  useClientBudgets,
  useSaveClientBudgets,
} from '@/hooks/useAdminApi';
import { COMPANIES } from '@/lib/companies';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';
import { PageBackground, Hero, BrandButton } from '@/components/brand/PageShell';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/brand/Panel';

const FIELD_STYLE = { backgroundColor: BRAND.field, color: BRAND.text } as const;

/**
 * Formatea un valor con el mismo formato que SIGCOM: miles con coma y dos
 * decimales con punto (p. ej. "$ 342,761,789.26"). Así el valor de venta
 * coincide con lo que se ve en el ERP y no genera confusión.
 */
function formatSigcom(value: number): string {
  return (
    '$ ' +
    value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

interface Draft {
  targetKilos: string;
  expectedRevenue: string;
}

/** Formatea un número de día a dos dígitos (p. ej. 3 → "03"). */
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Encabezados del calendario, semana iniciando en lunes. */
const WEEKDAY_LABELS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

/**
 * Sección de proyección de ventas de la compañía. Permite elegir entre asignar
 * la proyección del mes completo o por día hábil (excluyentes), con un
 * calendario para marcar los días hábiles del mes. El total del mes se muestra
 * en el dashboard.
 */
function ProjectionSection({
  companyId,
  month,
  year,
}: {
  companyId: string;
  month: number;
  year: number;
}) {
  const { data } = useProjection(companyId, month, year);
  const saveMutation = useSaveProjection();

  const [days, setDays] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setDays(new Set(data.workingDays ?? []));
    setSaved(false);
  }, [data]);

  const daysInMonth = useMemo(
    () => new Date(year, month, 0).getDate(),
    [month, year],
  );
  // Índice (0=lunes … 6=domingo) del primer día del mes.
  const firstOffset = useMemo(
    () => (new Date(year, month - 1, 1).getDay() + 6) % 7,
    [month, year],
  );

  const workingCount = days.size;

  const toggleDay = (d: number) => {
    const iso = `${year}-${pad2(month)}-${pad2(d)}`;
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
    setSaved(false);
  };

  const selectWeekdays = (includeSaturday: boolean) => {
    const next = new Set<string>();
    for (let d = 1; d <= daysInMonth; d++) {
      const wd = new Date(year, month - 1, d).getDay(); // 0=domingo … 6=sábado
      if (wd >= 1 && wd <= (includeSaturday ? 6 : 5)) {
        next.add(`${year}-${pad2(month)}-${pad2(d)}`);
      }
    }
    setDays(next);
    setSaved(false);
  };

  // Total del mes proyectado: en modo "día" se multiplica por días hábiles.
  const handleSave = async () => {
    await saveMutation.mutateAsync({
      companyId,
      month,
      year,
      // La proyección ya no se ingresa a mano: solo se guardan los días
      // hábiles. El cálculo lo hace el tablero según las ventas de cada
      // vendedor. Se mantienen los campos por compatibilidad de la API.
      mode: 'day',
      revenue: 0,
      kilos: 0,
      workingDays: Array.from(days).sort(),
    });
    setSaved(true);
  };

  return (
    <Panel>
      <PanelHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PanelTitle className="flex items-center gap-2 ">
          <TrendingUp className="h-5 w-5 text-[#1E9B50]" />
          Proyección de ventas · {MONTHS[month - 1]} {year}
        </PanelTitle>
        <BrandButton className="h-9 px-3" onClick={handleSave} disabled={saveMutation.isPending}>
          {saved ? (
            <Check className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saveMutation.isPending
            ? 'Guardando…'
            : saved
              ? 'Guardado'
              : 'Guardar proyección'}
        </BrandButton>
      </PanelHeader>
      <PanelBody className="space-y-4">
        <p className="flex items-start gap-2 rounded-2xl border border-[#1E9B50]/20 bg-[#1E9B50]/[0.06] p-3 text-sm text-[#166534]">
          <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Marca los <strong>días hábiles</strong> del mes. La proyección se
            calcula <strong>automáticamente</strong> en el tablero de cada
            vendedor: toma sus ventas acumuladas, saca el promedio por día hábil
            transcurrido y lo proyecta al total de días hábiles del mes.
          </span>
        </p>

        {/* Calendario de días hábiles */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <CalendarDays className="h-4 w-4 text-[#6B7280]" />
              Días hábiles ({workingCount})
            </span>
            <div className="flex flex-wrap gap-1.5">
              <BrandButton variant="outlined" className="h-9 px-3" type="button" onClick={() => selectWeekdays(false)}
              >
                Lun–Vie
              </BrandButton>
              <BrandButton variant="outlined" className="h-9 px-3" type="button" onClick={() => selectWeekdays(true)}
              >
                Lun–Sáb
              </BrandButton>
              <BrandButton variant="outlined" className="h-9 px-3" type="button" onClick={() => {
                  setDays(new Set());
                  setSaved(false);
                }}
              >
                Limpiar
              </BrandButton>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAY_LABELS.map((w) => (
              <span
                key={w}
                className="py-1 text-[11px] font-semibold text-[#6B7280]"
              >
                {w}
              </span>
            ))}
            {Array.from({ length: firstOffset }).map((_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1;
              const iso = `${year}-${pad2(month)}-${pad2(d)}`;
              const active = days.has(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={cn(
                    'aspect-square rounded-md text-sm font-medium transition-colors',
                    active
                      ? 'bg-[#1E9B50] text-white'
                      : 'bg-[#F4FAF6] text-[#111827] hover:bg-[#E2E8F0]',
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
}

export function BudgetsPage() {
  const { user } = useAuth();
  const { companies: myCompanies } = useCompany();
  const isAdmin = user?.role === 'admin';

  // Compañías donde el usuario puede gestionar presupuestos.
  const availableCompanies = useMemo(() => {
    if (isAdmin) return COMPANIES;
    return COMPANIES.filter((c) =>
      myCompanies.some(
        (mc) =>
          mc.id === c.id &&
          (mc.permissions ?? []).includes('/admin/presupuestos'),
      ),
    );
  }, [isAdmin, myCompanies]);

  const now = new Date();
  const [companyId, setCompanyId] = useState(
    () => availableCompanies[0]?.id ?? '',
  );
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  useEffect(() => {
    if (!companyId && availableCompanies[0]) {
      setCompanyId(availableCompanies[0].id);
    }
  }, [availableCompanies, companyId]);

  const { data, isLoading, isFetching, refetch } = useBudgets(
    companyId,
    month,
    year,
  );
  const saveMutation = useSaveBudgets();

  // Borrador editable indexado por vendedor.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saved, setSaved] = useState(false);
  // Vendedor cuyo presupuesto se edita POR CLIENTE (modo "por cliente").
  const [clientSeller, setClientSeller] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!data) return;
    const next: Record<string, Draft> = {};
    for (const row of data) {
      next[row.sellerId] = {
        targetKilos: row.targetKilos ? String(row.targetKilos) : '',
        expectedRevenue: row.expectedRevenue ? String(row.expectedRevenue) : '',
      };
    }
    setDrafts(next);
    setSaved(false);
  }, [data]);

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y + 1, y, y - 1, y - 2];
  }, []);

  const setField = (sellerId: string, field: keyof Draft, value: string) => {
    // Permite dígitos y un único punto decimal (mismo formato que SIGCOM,
    // p. ej. 342761789.26). Se descartan otros caracteres.
    let clean = value.replace(/[^\d.]/g, '');
    const firstDot = clean.indexOf('.');
    if (firstDot !== -1) {
      clean =
        clean.slice(0, firstDot + 1) +
        clean.slice(firstDot + 1).replace(/\./g, '');
    }
    setDrafts((prev) => ({
      ...prev,
      [sellerId]: { ...prev[sellerId], [field]: clean },
    }));
    setSaved(false);
  };

  const totals = useMemo(() => {
    let kilos = 0;
    let revenue = 0;
    for (const d of Object.values(drafts)) {
      kilos += Number(d.targetKilos || 0);
      revenue += Number(d.expectedRevenue || 0);
    }
    return { kilos, revenue };
  }, [drafts]);

  const handleSave = async () => {
    if (!data) return;
    // Los vendedores "por cliente" se editan en su modal, no en esta tabla.
    const items = data
      .filter((row) => !row.clientBudget)
      .map((row) => ({
        sellerId: row.sellerId,
        targetKilos: Number(drafts[row.sellerId]?.targetKilos || 0),
        expectedRevenue: Number(drafts[row.sellerId]?.expectedRevenue || 0),
      }));
    await saveMutation.mutateAsync({ companyId, month, year, items });
    setSaved(true);
  };

  const companyName =
    availableCompanies.find((c) => c.id === companyId)?.name ?? '';

  // Vendedores visibles según el buscador (por nombre o código).
  const visibleRows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (r) =>
        r.sellerName.toLowerCase().includes(q) ||
        (r.siesaSellerCode ?? '').toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <PageBackground className="space-y-3.5">
      <Hero>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold leading-tight tracking-[-0.4px] sm:text-[22px]">Presupuestos</h2>
            <p className="mt-1 text-sm font-semibold text-white/90">Meta de kilos y valor de venta por vendedor · {companyName} ·{' '}
            {MONTHS[month - 1]} {year}</p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Actualizar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.16] text-white transition hover:bg-white/25 disabled:opacity-60"
          >
            <RefreshCw className={cn('h-5 w-5', isFetching && 'animate-spin')} />
          </button>
        </div>
      </Hero>

      {/* Filtros */}
      <Panel>
        <PanelBody className="flex flex-wrap items-end gap-3 p-4 sm:p-[18px]">
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#6B7280]">
              Compañía
            </label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="brand-input h-10 rounded-xl px-3 text-sm font-semibold outline-none"
              style={FIELD_STYLE}
            >
              {availableCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#6B7280]">
              Mes
            </label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="brand-input h-10 rounded-xl px-3 text-sm font-semibold outline-none"
              style={FIELD_STYLE}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#6B7280]">
              Año
            </label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="brand-input h-10 rounded-xl px-3 text-sm font-semibold outline-none"
              style={FIELD_STYLE}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </PanelBody>
      </Panel>

      {/* Proyección de ventas de la compañía */}
      {companyId && (
        <ProjectionSection companyId={companyId} month={month} year={year} />
      )}

      {/* Tabla editable */}
      <Panel>
        <PanelHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PanelTitle className="">
            Vendedores ({visibleRows.length}
            {search ? ` de ${data?.length ?? 0}` : ''})
          </PanelTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar vendedor…"
                className="h-9 w-52 rounded-md border border-[#E2E8F0] bg-white pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <BrandButton className="h-9 px-3" onClick={handleSave} disabled={!companyId || saveMutation.isPending || !data?.length}>
              {saved ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saveMutation.isPending
                ? 'Guardando…'
                : saved
                  ? 'Guardado'
                  : 'Guardar'}
            </BrandButton>
          </div>
        </PanelHeader>
        <PanelBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F4FAF6] text-left text-[11px] font-extrabold uppercase tracking-wider text-[#15803D]">
                <tr>
                  <th className="px-4 py-2 font-medium">Vendedor</th>
                  <th className="px-4 py-2 font-medium">Código</th>
                  <th className="px-4 py-2 text-right font-medium">
                    {companyId === '8' ? 'Ppto Unidades' : 'Ppto Kilos'}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    Venta Esperada
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-10 text-center text-[#6B7280]"
                    >
                      Cargando…
                    </td>
                  </tr>
                ) : visibleRows.length > 0 ? (
                  visibleRows.map((row) => (
                    <tr key={row.sellerId} className="hover:bg-[#F4FAF6]">
                      <td className="px-4 py-2 font-medium">{row.sellerName}</td>
                      <td className="px-4 py-2 text-[#6B7280]">
                        {row.siesaSellerCode ?? '—'}
                      </td>
                      {row.clientBudget ? (
                        <td className="px-4 py-2 text-right" colSpan={2}>
                          <div className="flex items-center justify-end gap-2">
                            <span className="inline-flex items-center gap-1 rounded-md bg-[#1E9B50]/10 px-2 py-0.5 text-xs font-medium text-[#1E9B50]">
                              <Store className="h-3 w-3" />
                              Meta por cliente/tienda
                            </span>
                            <BrandButton variant="outlined" className="h-9 px-3" onClick={() =>
                                setClientSeller({
                                  id: row.sellerId,
                                  name: row.sellerName,
                                })
                              }
                            >
                              Editar por cliente
                            </BrandButton>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-2 text-right">
                            <input
                              inputMode="numeric"
                              value={drafts[row.sellerId]?.targetKilos ?? ''}
                              onChange={(e) =>
                                setField(
                                  row.sellerId,
                                  'targetKilos',
                                  e.target.value,
                                )
                              }
                              placeholder="0"
                              className="w-28 rounded-md border border-[#E2E8F0] bg-white px-2 py-1 text-right tabular-nums outline-none focus:ring-2 focus:ring-primary/40"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input
                              inputMode="numeric"
                              value={drafts[row.sellerId]?.expectedRevenue ?? ''}
                              onChange={(e) =>
                                setField(
                                  row.sellerId,
                                  'expectedRevenue',
                                  e.target.value,
                                )
                              }
                              placeholder="0"
                              className="w-36 rounded-md border border-[#E2E8F0] bg-white px-2 py-1 text-right tabular-nums outline-none focus:ring-2 focus:ring-primary/40"
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-10 text-center text-[#6B7280]"
                    >
                      {search
                        ? 'Ningún vendedor coincide con la búsqueda.'
                        : 'No hay vendedores asignados a esta compañía.'}
                    </td>
                  </tr>
                )}
              </tbody>
              {data && data.length > 0 && (
                <tfoot className="border-t border-[#E2E8F0] bg-[#F4FAF6] font-semibold">
                  <tr>
                    <td className="px-4 py-2" colSpan={2}>
                      TOTAL
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {totals.kilos.toLocaleString('en-US', {
                        maximumFractionDigits: 2,
                      })}{' '}
                      {companyId === '8' ? 'und' : 'kg'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatSigcom(totals.revenue)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </PanelBody>
      </Panel>

      {clientSeller && companyId && (
        <ClientBudgetModal
          companyId={companyId}
          sellerId={clientSeller.id}
          sellerName={clientSeller.name}
          month={month}
          year={year}
          onClose={() => setClientSeller(null)}
        />
      )}
    </PageBackground>
  );
}

/**
 * Editor del presupuesto POR CLIENTE/tienda de un vendedor "por cliente"
 * (p. ej. Juan Sierra). Lista sus clientes asignados (CODIGO_VENDEDOR) y permite
 * una meta de kilos y venta por cada uno. El total va aparte del general.
 */
function ClientBudgetModal({
  companyId,
  sellerId,
  sellerName,
  month,
  year,
  onClose,
}: {
  companyId: string;
  sellerId: string;
  sellerName: string;
  month: number;
  year: number;
  onClose: () => void;
}) {
  const { data, isLoading } = useClientBudgets(companyId, sellerId, month, year);
  const saveMutation = useSaveClientBudgets();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!data) return;
    const next: Record<string, Draft> = {};
    for (const row of data) {
      next[row.clientCode] = {
        targetKilos: row.targetKilos ? String(row.targetKilos) : '',
        expectedRevenue: row.expectedRevenue ? String(row.expectedRevenue) : '',
      };
    }
    setDrafts(next);
    setSaved(false);
  }, [data]);

  const setField = (code: string, field: keyof Draft, value: string) => {
    let clean = value.replace(/[^\d.]/g, '');
    const firstDot = clean.indexOf('.');
    if (firstDot !== -1) {
      clean =
        clean.slice(0, firstDot + 1) +
        clean.slice(firstDot + 1).replace(/\./g, '');
    }
    setDrafts((prev) => ({
      ...prev,
      [code]: { ...prev[code], [field]: clean },
    }));
    setSaved(false);
  };

  const totals = useMemo(() => {
    let kilos = 0;
    let revenue = 0;
    for (const d of Object.values(drafts)) {
      kilos += Number(d.targetKilos || 0);
      revenue += Number(d.expectedRevenue || 0);
    }
    return { kilos, revenue };
  }, [drafts]);

  const visibleRows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (r) =>
        r.clientName.toLowerCase().includes(q) ||
        r.clientCode.toLowerCase().includes(q) ||
        (r.branchName ?? '').toLowerCase().includes(q),
    );
  }, [data, search]);

  const handleSave = async () => {
    if (!data) return;
    const items = data.map((row) => ({
      clientCode: row.clientCode,
      targetKilos: Number(drafts[row.clientCode]?.targetKilos || 0),
      expectedRevenue: Number(drafts[row.clientCode]?.expectedRevenue || 0),
    }));
    await saveMutation.mutateAsync({ companyId, sellerId, month, year, items });
    setSaved(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] p-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <Store className="h-5 w-5 text-[#1E9B50]" />
              Presupuesto por cliente/tienda
            </h3>
            <p className="text-sm text-[#6B7280]">
              {sellerName} · {MONTHS[month - 1]} {year}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[#6B7280] hover:bg-[#EEF2F7]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-[#E2E8F0] p-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente o tienda…"
              className="h-9 w-full rounded-md border border-[#E2E8F0] bg-white pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <BrandButton className="h-9 px-3" onClick={handleSave} disabled={saveMutation.isPending || !data?.length}>
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saveMutation.isPending
              ? 'Guardando…'
              : saved
                ? 'Guardado'
                : 'Guardar'}
          </BrandButton>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F4FAF6] text-left text-[11px] font-extrabold uppercase tracking-wider text-[#15803D]">
              <tr>
                <th className="px-4 py-2 font-medium">Cliente / Razón social</th>
                <th className="px-4 py-2 font-medium">Tienda</th>
                <th className="px-4 py-2 text-right font-medium">
                  {companyId === '8' ? 'Ppto Unidades' : 'Ppto Kilos'}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  Venta Esperada
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-[#6B7280]"
                  >
                    Cargando clientes…
                  </td>
                </tr>
              ) : visibleRows.length > 0 ? (
                visibleRows.map((row) => (
                  <tr key={row.clientCode} className="hover:bg-[#F4FAF6]">
                    <td className="px-4 py-2">
                      <div className="font-medium">{row.clientName}</div>
                      <div className="text-xs text-[#6B7280]">
                        {row.clientCode}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-[#6B7280]">
                      {row.branchName ?? row.branch ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        inputMode="numeric"
                        value={drafts[row.clientCode]?.targetKilos ?? ''}
                        onChange={(e) =>
                          setField(row.clientCode, 'targetKilos', e.target.value)
                        }
                        placeholder="0"
                        className="w-28 rounded-md border border-[#E2E8F0] bg-white px-2 py-1 text-right tabular-nums outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        inputMode="numeric"
                        value={drafts[row.clientCode]?.expectedRevenue ?? ''}
                        onChange={(e) =>
                          setField(
                            row.clientCode,
                            'expectedRevenue',
                            e.target.value,
                          )
                        }
                        placeholder="0"
                        className="w-36 rounded-md border border-[#E2E8F0] bg-white px-2 py-1 text-right tabular-nums outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-[#6B7280]"
                  >
                    {search
                      ? 'Ningún cliente coincide con la búsqueda.'
                      : 'Este vendedor no tiene clientes asignados (revisa su código de vendedor).'}
                  </td>
                </tr>
              )}
            </tbody>
            {data && data.length > 0 && (
              <tfoot className="sticky bottom-0 border-t border-[#E2E8F0] bg-[#F4FAF6] font-semibold">
                <tr>
                  <td className="px-4 py-2" colSpan={2}>
                    TOTAL (aparte del general)
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {totals.kilos.toLocaleString('en-US', {
                      maximumFractionDigits: 2,
                    })}{' '}
                    {companyId === '8' ? 'und' : 'kg'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatSigcom(totals.revenue)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
