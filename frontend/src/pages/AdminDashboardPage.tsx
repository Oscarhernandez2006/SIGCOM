import { useMemo, useState } from 'react';
import {
  TrendingUp,
  ShoppingCart,
  Receipt,
  Boxes,
  Users,
  RefreshCw,
  Building2,
  Trophy,
  CalendarDays,
  BarChart3,
  Loader2,
} from 'lucide-react';
import {
  useManagerialDashboard,
  useVendorProductSalesReport,
  useOrdersBySellerReport,
} from '@/hooks/useAdminApi';
import { formatCurrency, cn } from '@/lib/utils';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/brand/Panel';
import { PageBackground, Hero, BrandButton } from '@/components/brand/PageShell';
import { RangeChip } from '@/components/brand/RangeChip';
import { BRAND } from '@/lib/brand';
import { SalesTrendChart } from '@/components/SalesTrendChart';
import { useCompany } from '@/company/useCompany';
import type { ManagerialCompanyStats } from '@/types';

const COMPANY_ACCENT: Record<
  string,
  { ring: string; dot: string; text: string; bar: string; soft: string }
> = {
  '3': {
    ring: 'border-emerald-500/30',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    bar: 'bg-emerald-500',
    soft: 'bg-emerald-500/10',
  },
  '8': {
    ring: 'border-amber-500/30',
    dot: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    bar: 'bg-amber-500',
    soft: 'bg-amber-500/10',
  },
  '4': {
    ring: 'border-rose-500/30',
    dot: 'bg-rose-500',
    text: 'text-rose-600 dark:text-rose-400',
    bar: 'bg-rose-500',
    soft: 'bg-rose-500/10',
  },
};

const DATE_INPUT =
  'brand-input h-10 w-full rounded-xl pl-9 pr-2 text-sm font-semibold outline-none disabled:opacity-60';

const accentFor = (id: string) => COMPANY_ACCENT[id] ?? COMPANY_ACCENT['3'];

/** Fecha local de hoy en formato YYYY-MM-DD. */
function todayStr(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/** Primer día del mes actual (YYYY-MM-DD). */
function startOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

/**
 * Venta a mostrar de una compañía: para AGROPECUARIA (con margen) es la
 * facturación real del ERP; para las demás, el total de pedidos de la app.
 */
function companyRevenue(c: ManagerialCompanyStats): number {
  return c.margin ? c.margin.revenue : c.totals.revenue;
}

export function AdminDashboardPage() {
  // Por defecto el mes en curso, para ver a todos los vendedores y su
  // facturación acumulada (el ERP puede no tener cargado el día en curso aún).
  const [from, setFrom] = useState(() => startOfMonth());
  const [to, setTo] = useState(() => todayStr());
  // 'comparativo' = vista general que compara todas las compañías (predeterminada).
  const [selectedCompanyId, setSelectedCompanyId] = useState('comparativo');

  const { data, isLoading, isFetching, refetch } = useManagerialDashboard(
    from,
    to,
  );

  // Se excluye MONTERIA TAT (MTAT) de este panel.
  const companies = (data?.companies ?? []).filter(
    (c) => c.companyId !== 'MTAT',
  );
  const isComparativo = selectedCompanyId === 'comparativo';
  const selectedCompany = useMemo(
    () => companies.find((c) => c.companyId === selectedCompanyId),
    [companies, selectedCompanyId],
  );
  const maxRevenue = useMemo(
    () => Math.max(1, ...companies.map((c) => companyRevenue(c))),
    [companies],
  );
  const grandTotal = useMemo(
    () => companies.reduce((acc, c) => acc + companyRevenue(c), 0),
    [companies],
  );

  return (
    <PageBackground className="space-y-3.5">
      <Hero>
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-xl font-extrabold leading-tight tracking-[-0.4px] sm:text-[22px]">
            Panel de control
          </h2>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Actualizar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.16] transition-colors hover:bg-white/25 disabled:hover:bg-white/[0.16]"
          >
            <RefreshCw className={cn('h-[18px] w-[18px]', isFetching && 'animate-spin')} />
          </button>
        </div>
        <p className="text-sm font-semibold text-white/90">
          {isComparativo ? 'Comparativa por compañía' : (selectedCompany?.name ?? 'Panel')}
        </p>
        <RangeChip
          className="mt-3"
          from={from}
          to={to}
          onChange={(f, t) => {
            setFrom(f);
            setTo(t);
          }}
        />
      </Hero>

      {/* Siempre visible; skeleton al cambiar fechas, datos reales cuando carga */}
      {(companies.length > 0 || isFetching) && (
        <Panel>
          <PanelHeader>
            <PanelTitle>Ingresos por compañía</PanelTitle>
          </PanelHeader>
          <PanelBody className="space-y-4">
            {isFetching ? (
              [0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-44 rounded bg-[#EEF2F7]" />
                    <div className="h-4 w-28 rounded bg-[#EEF2F7]" />
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-[#EEF2F7]" />
                </div>
              ))
            ) : (
              <>
                {companies.map((c) => {
                  const accent = accentFor(c.companyId);
                  const revenue = companyRevenue(c);
                  const share = Math.round((revenue / maxRevenue) * 100);
                  const pctTotal =
                    grandTotal > 0
                      ? Math.round((revenue / grandTotal) * 100)
                      : 0;
                  return (
                    <div key={c.companyId} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 font-medium">
                          <span
                            className={cn('h-2.5 w-2.5 rounded-full', accent.dot)}
                          />
                          {c.name}
                          <span className="text-xs text-[#6B7280]">
                            #{c.companyId}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className={cn('font-bold', accent.text)}>
                            {formatCurrency(revenue)}
                          </span>
                          <span className="text-xs text-[#6B7280]">
                            {pctTotal}%
                          </span>
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#EEF2F7]">
                        <div
                          className={cn('h-full rounded-full', accent.bar)}
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-3 text-sm">
                  <span className="font-medium text-[#6B7280]">
                    Total general
                  </span>
                  <span className="text-base font-bold">
                    {formatCurrency(grandTotal)}
                  </span>
                </div>
              </>
            )}
          </PanelBody>
        </Panel>
      )}

      {/* Venta acumulada del mes por vendedor (ERP) */}
      <VentaAcumuladaSection />

      {/* Selector de compañía */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'comparativo', label: 'Comparativo', icon: BarChart3 },
          ...companies.map((c) => ({ id: c.companyId, label: c.name, icon: Building2 })),
        ].map((opt) => {
          const on = selectedCompanyId === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSelectedCompanyId(opt.id)}
              className="flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold transition-colors"
              style={{
                backgroundColor: on ? BRAND.primary : '#fff',
                color: on ? '#fff' : BRAND.textMuted,
                border: `1px solid ${on ? BRAND.primary : BRAND.border}`,
              }}
            >
              <opt.icon className="h-4 w-4" />
              {opt.label}
            </button>
          );
        })}
      </div>

            {/* Vista */}
      {isLoading && companies.length === 0 ? (
        <Panel className="h-96 animate-pulse" />
      ) : companies.length === 0 ? (
        <Panel>
          <PanelBody className="py-10 text-center text-sm text-[#6B7280]">
            Sin datos en el rango seleccionado.
          </PanelBody>
        </Panel>
      ) : isComparativo ? (
        <ComparativoGrid companies={companies} />
      ) : selectedCompany ? (
        <CompanyColumn company={selectedCompany} />
      ) : (
        <Panel>
          <PanelBody className="py-10 text-center text-sm text-[#6B7280]">
            Sin datos en el rango seleccionado.
          </PanelBody>
        </Panel>
      )}
    </PageBackground>
  );
}

/** Columna completa de una compañía: KPIs, tendencia, top productos y clientes. */
function CompanyColumn({ company }: { company: ManagerialCompanyStats }) {
  const accent = accentFor(company.companyId);
  const t = company.totals;
  const m = company.margin;
  // AGROPECUARIA (con margen): la venta es la facturación real del ERP y el
  // margen se muestra como un KPI; las demás compañías usan el total de la app.
  const ventas = m ? m.revenue : t.revenue;
  const kpis = m
    ? [
        {
          label: `Margen ${m.marginPct.toFixed(1)}%`,
          value: formatCurrency(m.profit),
          icon: TrendingUp,
        },
        { label: 'Pedidos', value: t.orders.toLocaleString('es-CO'), icon: ShoppingCart },
        {
          label: 'Kilos',
          value: `${m.kilos.toLocaleString('es-CO', { maximumFractionDigits: 0 })} kg`,
          icon: Boxes,
        },
        { label: 'Clientes', value: t.customers.toLocaleString('es-CO'), icon: Users },
      ]
    : [
        { label: 'Pedidos', value: t.orders.toLocaleString('es-CO'), icon: ShoppingCart },
        { label: 'Ticket promedio', value: formatCurrency(t.avgTicket), icon: Receipt },
        { label: 'Unidades', value: t.units.toLocaleString('es-CO'), icon: Boxes },
        { label: 'Clientes', value: t.customers.toLocaleString('es-CO'), icon: Users },
      ];

  return (
    <div className="space-y-4">
      {/* Encabezado de compañía + ventas */}
      <Panel className={cn('border', accent.ring)}>
        <PanelBody className="p-4 sm:p-[18px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                  accent.soft,
                )}
              >
                <Building2 className={cn('h-5 w-5', accent.text)} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[#6B7280]">
                  Compañía {company.companyId}
                </p>
                <p className="truncate font-semibold">{company.name}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#6B7280]">Ventas</p>
              <p className={cn('text-xl font-bold tabular-nums', accent.text)}>
                {formatCurrency(ventas)}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {kpis.map((k) => (
              <div
                key={k.label}
                className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3"
              >
                <k.icon className="h-4 w-4 text-[#6B7280]" />
                <p className="mt-2 text-sm font-bold tracking-tight">
                  {k.value}
                </p>
                <p className="text-[11px] text-[#6B7280]">{k.label}</p>
              </div>
            ))}
          </div>
        </PanelBody>
      </Panel>

      {/* Ventas por vendedor y productos, lado a lado */}
      <div className="grid gap-4 xl:grid-cols-2">
        <SellersCard company={company} sideBySide={!!company.margin} />
        <ProductsCard company={company} />
      </div>

      {/* Tendencia de ventas */}
      <Panel>
        <PanelHeader className="flex-row items-center justify-between gap-3">
          <PanelTitle className="flex items-center gap-2">
            <TrendingUp className={cn('h-4 w-4', accent.text)} />
            Tendencia de ventas
          </PanelTitle>
          <span className="inline-flex items-center gap-1.5 text-xs text-[#6B7280]">
            <span className={cn('h-2.5 w-2.5 rounded-full', accent.dot)} />
            Ingresos
          </span>
        </PanelHeader>
        <PanelBody>
          <SalesTrendChart data={company.salesTrend} />
        </PanelBody>
      </Panel>

      {/* Clientes que más pidieron */}
      <Panel>
        <PanelHeader>
          <PanelTitle className="flex items-center gap-2">
            <Users className={cn('h-4 w-4', accent.text)} />
            Clientes que más pidieron
          </PanelTitle>
        </PanelHeader>
        <PanelBody>
          {company.topCustomers.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#6B7280]">
              Sin ventas en el rango.
            </p>
          ) : (
            <ol className="space-y-2.5">
              {company.topCustomers.map((cu, i) => (
                <li
                  key={`${cu.code}-${i}`}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#EEF2F7] text-[11px] font-extrabold text-[#6B7280]">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{cu.name}</p>
                      <p className="text-[11px] text-[#6B7280]">
                        {cu.code}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold">
                      {formatCurrency(cu.revenue)}
                    </p>
                    <p className="text-[11px] text-[#6B7280]">
                      {cu.orders} pedido(s)
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}

/**
 * Vista comparativa: una columna por compañía con las filas alineadas. Cada
 * sección (encabezado, vendedores, productos, tendencia, clientes) se renderiza
 * en fila para las N compañías, así todas quedan al mismo nivel al bajar.
 */
function ComparativoGrid({
  companies,
}: {
  companies: ManagerialCompanyStats[];
}) {
  const colsClass =
    companies.length >= 3
      ? 'lg:grid-cols-3'
      : companies.length === 2
        ? 'lg:grid-cols-2'
        : 'lg:grid-cols-1';
  return (
    <div className={cn('grid grid-cols-1 items-start gap-4', colsClass)}>
      {companies.map((c) => (
        <HeaderKpisCard key={`h-${c.companyId}`} company={c} />
      ))}
      {companies.map((c) => (
        <SellersCard
          key={`s-${c.companyId}`}
          company={c}
          sideBySide={!!c.margin}
        />
      ))}
      {companies.map((c) => (
        <ProductsCard key={`p-${c.companyId}`} company={c} />
      ))}
      {companies.map((c) => (
        <TrendCard key={`t-${c.companyId}`} company={c} />
      ))}
      {companies.map((c) => (
        <CustomersCard key={`cu-${c.companyId}`} company={c} />
      ))}
    </div>
  );
}

function HeaderKpisCard({ company }: { company: ManagerialCompanyStats }) {
  const accent = accentFor(company.companyId);
  const t = company.totals;
  const m = company.margin;
  // Para AGROPECUARIA (con margen) la venta mostrada es la facturación real del
  // ERP; para las demás compañías se usa el total de pedidos de la app.
  const ventas = m ? m.revenue : t.revenue;
  // El margen (solo Agropecuaria) se muestra como un KPI más, para que todas
  // las tarjetas de encabezado mantengan la misma estructura y altura.
  const kpis = m
    ? [
        {
          label: `Margen ${m.marginPct.toFixed(1)}%`,
          value: formatCurrency(m.profit),
          icon: TrendingUp,
        },
        { label: 'Pedidos', value: t.orders.toLocaleString('es-CO'), icon: ShoppingCart },
        {
          label: 'Kilos',
          value: `${m.kilos.toLocaleString('es-CO', { maximumFractionDigits: 0 })} kg`,
          icon: Boxes,
        },
        { label: 'Clientes', value: t.customers.toLocaleString('es-CO'), icon: Users },
      ]
    : [
        { label: 'Pedidos', value: t.orders.toLocaleString('es-CO'), icon: ShoppingCart },
        { label: 'Ticket promedio', value: formatCurrency(t.avgTicket), icon: Receipt },
        { label: 'Unidades', value: t.units.toLocaleString('es-CO'), icon: Boxes },
        { label: 'Clientes', value: t.customers.toLocaleString('es-CO'), icon: Users },
      ];
  return (
    <Panel className={cn('border', accent.ring)}>
      <PanelBody className="p-4 sm:p-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                accent.soft,
              )}
            >
              <Building2 className={cn('h-5 w-5', accent.text)} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-[#6B7280]">
                Compañía {company.companyId}
              </p>
              <p className="truncate font-semibold">{company.name}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#6B7280]">Ventas</p>
            <p className={cn('text-xl font-bold tabular-nums', accent.text)}>
              {formatCurrency(ventas)}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3"
            >
              <k.icon className="h-4 w-4 text-[#6B7280]" />
              <p className="mt-2 text-sm font-bold tracking-tight">{k.value}</p>
              <p className="text-[11px] text-[#6B7280]">{k.label}</p>
            </div>
          ))}
        </div>
      </PanelBody>
    </Panel>
  );
}

function SellersCard({
  company,
  sideBySide = false,
}: {
  company: ManagerialCompanyStats;
  sideBySide?: boolean;
}) {
  const accent = accentFor(company.companyId);
  const m = company.margin;
  // Con margen (AGROPECUARIA): comparativo Facturado (ERP) vs. Pedido (app).
  if (m) {
    const maxFact = Math.max(1, ...m.bySeller.map((s) => s.revenue));
    const maxPed = Math.max(1, ...company.topSellers.map((s) => s.revenue));
    return (
      <Panel>
        <PanelHeader>
          <PanelTitle className="flex items-center gap-2">
            <Users className={cn('h-4 w-4', accent.text)} />
            Facturado vs. Pedido por vendedor
          </PanelTitle>
        </PanelHeader>
        <PanelBody
          className={cn(sideBySide ? 'grid gap-6 md:grid-cols-2' : 'space-y-5')}
        >
          {/* Facturado (ERP) */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
              Facturado (ERP)
            </p>
            {m.bySeller.length === 0 ? (
              <p className="py-4 text-center text-sm text-[#6B7280]">
                Sin ventas en el rango.
              </p>
            ) : (
              <ol className="space-y-2.5">
                {m.bySeller.map((s, i) => (
                  <li key={`f-${s.nit}-${i}`} className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#EEF2F7] text-[11px] font-extrabold text-[#6B7280]">
                          {i + 1}
                        </span>
                        <span className="truncate text-sm font-medium">
                          {s.name}
                        </span>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn('text-sm font-semibold', accent.text)}>
                          {formatCurrency(s.revenue)}
                        </p>
                        <p className="text-[11px] font-medium text-emerald-600">
                          Margen {formatCurrency(s.profit)} ·{' '}
                          {s.marginPct.toFixed(1)}%
                        </p>
                        <p className="text-[11px] text-[#6B7280]">
                          {s.kilos.toLocaleString('es-CO', {
                            maximumFractionDigits: 1,
                          })}{' '}
                          kg
                        </p>
                      </div>
                    </div>
                    <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-[#EEF2F7]">
                      <div
                        className={cn('h-full rounded-full', accent.bar)}
                        style={{
                          width: `${Math.round((s.revenue / maxFact) * 100)}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Pedido (app) */}
          <div className={cn(!sideBySide && 'border-t border-[#E2E8F0] pt-4')}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
              Pedido (app)
            </p>
            {company.topSellers.length === 0 ? (
              <p className="py-4 text-center text-sm text-[#6B7280]">
                Sin pedidos en el rango.
              </p>
            ) : (
              <ol className="space-y-2.5">
                {company.topSellers.map((s, i) => (
                  <li key={`p-${s.documentId}-${i}`} className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#EEF2F7] text-[11px] font-extrabold text-[#6B7280]">
                          {i + 1}
                        </span>
                        <span className="truncate text-sm font-medium">
                          {s.name}
                        </span>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                          {formatCurrency(s.revenue)}
                        </p>
                        <p className="text-[11px] text-[#6B7280]">
                          {s.orders.toLocaleString('es-CO')} pedido(s)
                        </p>
                      </div>
                    </div>
                    <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-[#EEF2F7]">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{
                          width: `${Math.round((s.revenue / maxPed) * 100)}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </PanelBody>
      </Panel>
    );
  }
  const maxSellerRevenue = Math.max(
    1,
    ...company.topSellers.map((s) => s.revenue),
  );
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle className="flex items-center gap-2">
          <Users className={cn('h-4 w-4', accent.text)} />
          Ventas por vendedor
        </PanelTitle>
      </PanelHeader>
      <PanelBody>
        {company.topSellers.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#6B7280]">
            Sin ventas en el rango.
          </p>
        ) : (
          <ol className="space-y-2.5">
            {company.topSellers.map((s, i) => (
              <li key={`${s.documentId}-${i}`} className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#EEF2F7] text-[11px] font-extrabold text-[#6B7280]">
                      {i + 1}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {s.name}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn('text-sm font-semibold', accent.text)}>
                      {formatCurrency(s.revenue)}
                    </p>
                    <p className="text-[11px] text-[#6B7280]">
                      {s.orders.toLocaleString('es-CO')} pedido(s)
                    </p>
                  </div>
                </div>
                <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-[#EEF2F7]">
                  <div
                    className={cn('h-full rounded-full', accent.bar)}
                    style={{
                      width: `${Math.round((s.revenue / maxSellerRevenue) * 100)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </PanelBody>
    </Panel>
  );
}

function ProductsCard({ company }: { company: ManagerialCompanyStats }) {
  const accent = accentFor(company.companyId);
  const m = company.margin;
  // Con margen (AGROPECUARIA): venta y margen por producto del ERP.
  if (m) {
    const maxRevenue = Math.max(1, ...m.byProduct.map((p) => p.revenue));
    return (
      <Panel>
        <PanelHeader>
          <PanelTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            Ventas y margen por producto
          </PanelTitle>
        </PanelHeader>
        <PanelBody>
          {m.byProduct.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#6B7280]">
              Sin ventas en el rango.
            </p>
          ) : (
            <ol className="space-y-2.5">
              {m.byProduct.map((p, i) => (
                <li key={`${p.ref}-${i}`} className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#EEF2F7] text-[11px] font-extrabold text-[#6B7280]">
                        {i + 1}
                      </span>
                      <span className="truncate text-sm font-medium">
                        {p.name}
                      </span>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatCurrency(p.revenue)}
                      </p>
                      <p className="text-[11px] font-medium text-emerald-600">
                        Margen {formatCurrency(p.profit)} · {p.marginPct.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-[#EEF2F7]">
                    <div
                      className={cn('h-full rounded-full', accent.bar)}
                      style={{
                        width: `${Math.round((p.revenue / maxRevenue) * 100)}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </PanelBody>
      </Panel>
    );
  }
  const maxProductQty = Math.max(
    1,
    ...company.topProducts.map((p) => p.quantity),
  );
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          Productos más vendidos
        </PanelTitle>
      </PanelHeader>
      <PanelBody>
        {company.topProducts.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#6B7280]">
            Sin ventas en el rango.
          </p>
        ) : (
          <ol className="space-y-2.5">
            {company.topProducts.map((p, i) => (
              <li key={p.sku} className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#EEF2F7] text-[11px] font-extrabold text-[#6B7280]">
                      {i + 1}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {p.name}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {p.quantity.toLocaleString('es-CO')}
                    </p>
                    <p className="text-[11px] text-[#6B7280]">
                      {formatCurrency(p.revenue)}
                    </p>
                  </div>
                </div>
                <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-[#EEF2F7]">
                  <div
                    className={cn('h-full rounded-full', accent.bar)}
                    style={{
                      width: `${Math.round((p.quantity / maxProductQty) * 100)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </PanelBody>
    </Panel>
  );
}

/** Mes actual en formato YYYY-MM (para el input type="month"). */
function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Columna de ranking (una grilla): total arriba y lista de vendedores con
 * barra proporcional. Se usa para Venta (ERP) y Pedido (BD).
 */
function RankingColumn({
  title,
  subtitle,
  total,
  items,
  isLoading,
  emptyText,
  color,
}: {
  title: string;
  subtitle: string;
  total: number;
  items: { key: string; name: string; value: number }[];
  isLoading: boolean;
  emptyText: string;
  color: 'green' | 'blue';
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const valueClass =
    color === 'blue' ? 'text-blue-600 dark:text-blue-400' : 'text-[#1E9B50]';
  const barClass = color === 'blue' ? 'bg-blue-500' : 'bg-[#1E9B50]';
  const boxClass =
    color === 'blue'
      ? 'border-blue-500/30 bg-blue-500/5'
      : 'border-[#1E9B50]/30 bg-[#1E9B50]/5';
  return (
    <div className="space-y-4">
      <div className={cn('rounded-2xl border p-4', boxClass)}>
        <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">
          {title}
        </p>
        <p className={cn('mt-1 text-2xl font-bold tabular-nums', valueClass)}>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            formatCurrency(total)
          )}
        </p>
        <p className="mt-1 text-xs text-[#6B7280]">{subtitle}</p>
      </div>

      {isLoading ? (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-[#6B7280]">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-[#6B7280]">
          {emptyText}
        </p>
      ) : (
        <ol className="space-y-2.5">
          {items.map((it, i) => (
            <li key={it.key} className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#EEF2F7] text-[11px] font-extrabold text-[#6B7280]">
                    {i + 1}
                  </span>
                  <span className="truncate text-sm font-medium">{it.name}</span>
                </div>
                <p
                  className={cn(
                    'shrink-0 text-sm font-semibold tabular-nums',
                    valueClass,
                  )}
                >
                  {formatCurrency(it.value)}
                </p>
              </div>
              <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-[#EEF2F7]">
                <div
                  className={cn('h-full rounded-full', barClass)}
                  style={{ width: `${Math.round((it.value / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Venta acumulada del mes por vendedor, tomada del ERP (cortes, subproductos y
 * canales). La suma de todos los vendedores es la venta acumulada del período.
 */
function VentaAcumuladaSection() {
  const { company } = useCompany();
  const companyId = company?.id;
  const [monthStr, setMonthStr] = useState(currentMonthStr());
  // Día opcional (YYYY-MM-DD). Si está vacío se muestra el mes completo.
  const [dayStr, setDayStr] = useState('');
  const periodo = dayStr
    ? dayStr.slice(0, 4) + dayStr.slice(5, 7)
    : monthStr.replace('-', '');
  const { data, isFetching } = useVendorProductSalesReport(
    periodo,
    dayStr || undefined,
    true,
    companyId,
  );
  // Pedidos por vendedor (de la BD), para comparar contra la venta del ERP.
  const ordersQuery = useOrdersBySellerReport(periodo, dayStr || undefined, true, companyId);

  const sellers = data?.sellers ?? [];
  const orderSellers = ordersQuery.data?.sellers ?? [];
  const periodLabel = data?.periodLabel ?? monthStr;

  return (
    <Panel>
      <PanelHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <PanelTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#1E9B50]" />
            {dayStr
              ? 'Venta vs. Pedido del día por vendedor'
              : 'Venta vs. Pedido del mes por vendedor'}
          </PanelTitle>
          <p className="mt-1 text-sm capitalize text-[#6B7280]">
            {periodLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-end justify-end gap-2">
          <div className="relative w-40 shrink-0">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E9B50]" />
            <input
              type="month"
              value={monthStr}
              max={currentMonthStr()}
              disabled={!!dayStr}
              onChange={(e) => setMonthStr(e.target.value || currentMonthStr())}
              className={DATE_INPUT}
              style={{ backgroundColor: BRAND.field, color: BRAND.text }}
            />
          </div>
          <div className="relative w-44 shrink-0">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E9B50]" />
            <input
              type="date"
              value={dayStr}
              max={todayStr()}
              onChange={(e) => setDayStr(e.target.value)}
              className={DATE_INPUT}
              style={{ backgroundColor: BRAND.field, color: BRAND.text }}
            />
          </div>
          {dayStr && (
            <BrandButton variant="outlined" className="h-10" onClick={() => setDayStr('')}>
              <RefreshCw className="h-4 w-4" />
              Mes completo
            </BrandButton>
          )}
        </div>
      </PanelHeader>
      <PanelBody>
        <div className="grid gap-6 lg:grid-cols-2">
          <RankingColumn
            title={dayStr ? 'Venta del día (facturado)' : 'Venta del mes (facturado)'}
            subtitle={`${sellers.length} vendedor(es) · ERP`}
            total={data?.grandTotalNet ?? 0}
            isLoading={isFetching && !data}
            emptyText="Sin ventas registradas para este período."
            color="green"
            items={sellers.map((s) => ({
              key: s.nit,
              name: s.name,
              value: s.totalNet,
            }))}
          />
          <RankingColumn
            title={dayStr ? 'Pedido del día (app)' : 'Pedido del mes (app)'}
            subtitle={`${orderSellers.length} vendedor(es) · pedidos`}
            total={ordersQuery.data?.grandTotal ?? 0}
            isLoading={ordersQuery.isFetching && !ordersQuery.data}
            emptyText="Sin pedidos registrados para este período."
            color="blue"
            items={orderSellers.map((s) => ({
              key: s.sellerId,
              name: s.name,
              value: s.total,
            }))}
          />
        </div>
      </PanelBody>
    </Panel>
  );
}

function TrendCard({ company }: { company: ManagerialCompanyStats }) {
  const accent = accentFor(company.companyId);
  return (
    <Panel>
      <PanelHeader className="flex-row items-center justify-between gap-3">
        <PanelTitle className="flex items-center gap-2">
          <TrendingUp className={cn('h-4 w-4', accent.text)} />
          Tendencia de ventas
        </PanelTitle>
        <span className="inline-flex items-center gap-1.5 text-xs text-[#6B7280]">
          <span className={cn('h-2.5 w-2.5 rounded-full', accent.dot)} />
          Ingresos
        </span>
      </PanelHeader>
      <PanelBody>
        <SalesTrendChart data={company.salesTrend} />
      </PanelBody>
    </Panel>
  );
}

function CustomersCard({ company }: { company: ManagerialCompanyStats }) {
  const accent = accentFor(company.companyId);
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle className="flex items-center gap-2">
          <Users className={cn('h-4 w-4', accent.text)} />
          Clientes que más pidieron
        </PanelTitle>
      </PanelHeader>
      <PanelBody>
        {company.topCustomers.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#6B7280]">
            Sin ventas en el rango.
          </p>
        ) : (
          <ol className="space-y-2.5">
            {company.topCustomers.map((cu, i) => (
              <li
                key={`${cu.code}-${i}`}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#EEF2F7] text-[11px] font-extrabold text-[#6B7280]">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{cu.name}</p>
                    <p className="text-[11px] text-[#6B7280]">
                      {cu.code}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">
                    {formatCurrency(cu.revenue)}
                  </p>
                  <p className="text-[11px] text-[#6B7280]">
                    {cu.orders} pedido(s)
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </PanelBody>
    </Panel>
  );
}
