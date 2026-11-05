import { useMemo, useState } from 'react';
import {
  Wallet,
  DollarSign,
  Gauge,
  ClipboardList,
  Receipt,
  PiggyBank,
  TrendingUp,
  Calendar,
  RefreshCw,
  Clock,
  User as UserIcon,
  LineChart,
  PieChart,
  Store,
  Search,
  X,
  ChevronRight,
  Layers,
  Beef,
} from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useCompany } from '@/company/useCompany';
import { useSellerDashboard, useSellers } from '@/hooks/useApi';
import { cn, formatDate } from '@/lib/utils';
import { BRAND } from '@/lib/brand';
import {
  formatDateTime,
  formatDayLabel,
  formatInt,
  formatMoney,
  formatMoneyShort,
  formatPercent,
  formatRangeLabel,
  formatShortDate,
  firstOfMonthISO,
  shiftDays,
  todayISO,
  qtyUnit,
} from '@/lib/format';
import { isDashboardExcludedSellerDoc } from '@/lib/companies';
import type { SellerCommercialDashboard } from '@/types';
import {
  CardShell,
  ErrorCard,
  FadeIn,
  GrowthChip,
  HeroChip,
  KpiCard,
  MiniStat,
  PendingChip,
  SectionHeader,
  SkeletonGrid,
  StatText,
} from '@/components/dashboard/primitives';
import { RingGauge } from '@/components/dashboard/RingGauge';
import { TrendChart } from '@/components/dashboard/TrendChart';

type Dashboard = SellerCommercialDashboard;
type Category = NonNullable<Dashboard['salesByCategory']>[number];
type CustomerRow = Dashboard['topCustomers'][number];

const CATEGORY_COLORS: Record<string, string> = {
  Cortes: BRAND.primary,
  Canales: '#B91C1C',
  Subproductos: '#F59E0B',
};
const categoryColor = (name: string) => CATEGORY_COLORS[name] ?? '#64748B';

const CUSTOMERS_PAGE = 20;

/** Fecha local de hoy en formato YYYY-MM-DD. */
/** Mismos umbrales de color que la app: ≥100 %, ≥70 %, ≥40 % y menor. */
function complianceColor(ratio: number): string {
  return ratio >= 1
    ? BRAND.primary
    : ratio >= 0.7
      ? '#059669'
      : ratio >= 0.4
        ? '#D97706'
        : '#DC2626';
}

export function DashboardPage({ national = false }: { national?: boolean }) {
  const { user } = useAuth();
  // CARNES FRIAS (cía 8) se mide en UNIDADES; las demás en KILOS.
  const { company } = useCompany();
  const isUnitCompany = company?.id === '8';
  const unit = useMemo(() => qtyUnit(isUnitCompany), [isUnitCompany]);
  // CARNES FRIAS (8) y MONTERIA TAT (MTAT) no manejan ventas por canal.
  const hideChannels = company?.id === '8' || company?.id === 'MTAT';

  // Rango de fechas. Por defecto: del 1 del mes actual hasta hoy.
  const [fromStr, setFromStr] = useState(() => firstOfMonthISO());
  const [toStr, setToStr] = useState(() => todayISO());
  const [rangeOpen, setRangeOpen] = useState(false);

  // Solo los administradores pueden ver el tablero de otro vendedor o el
  // general. En "negocios nacionales" el tablero es fijo, sin selector.
  const isAdmin = user?.role === 'admin' && !national;
  const [sellerId, setSellerId] = useState('all');
  const [sellerSearch, setSellerSearch] = useState('');
  const [sellerOpen, setSellerOpen] = useState(false);
  const { data: sellers = [] } = useSellers();
  const sellerOptions = useMemo(
    () =>
      sellers.filter(
        (s) => s.role === 'seller' && !isDashboardExcludedSellerDoc(s.documentId),
      ),
    [sellers],
  );
  const filteredSellers = useMemo(() => {
    const q = sellerSearch.trim().toLowerCase();
    if (!q) return sellerOptions;
    return sellerOptions.filter((s) => s.name.toLowerCase().includes(q));
  }, [sellerOptions, sellerSearch]);
  const effectiveSellerId = isAdmin ? sellerId : undefined;

  const rangeFrom = fromStr <= toStr ? fromStr : toStr;
  const rangeTo = fromStr <= toStr ? toStr : fromStr;
  // El mes/año (presupuesto y comparativo) se anclan al INICIO del rango.
  const anchor = new Date(`${rangeFrom}T12:00:00`);
  const month = anchor.getMonth() + 1;
  const year = anchor.getFullYear();

  const { data, isLoading, isFetching, isError, error, refetch } = useSellerDashboard(
    month,
    year,
    0,
    effectiveSellerId,
    rangeFrom,
    rangeTo,
    national,
  );

  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [month, year]);
  const isSingleDay = rangeFrom === rangeTo;

  const totals = data?.totals;
  const budget = data?.budget ?? null;
  const projection = data?.projection ?? null;
  const profitability = data?.profitability ?? null;
  const clientBudgets = data?.clientBudgets ?? null;
  const workingDays = data?.workingDays ?? { elapsed: 0, total: 0 };

  // Presupuesto: mensual, o su parte proporcional cuando se filtra un día.
  const targetDivisor = isSingleDay ? daysInMonth : 1;
  const pptoRevenue = budget ? budget.expectedRevenue / targetDivisor : null;
  const pptoKilos = budget ? budget.targetKilos / targetDivisor : null;
  const compRevenue =
    pptoRevenue && pptoRevenue > 0 && totals ? totals.revenue / pptoRevenue : null;
  const compKilos =
    pptoKilos && pptoKilos > 0 && totals ? totals.kilosSold / pptoKilos : null;
  // Ritmo esperado del mes (días hábiles transcurridos / totales).
  const pace =
    !isSingleDay && workingDays.total > 0
      ? workingDays.elapsed / workingDays.total
      : null;
  const daysNote =
    !isSingleDay && workingDays.total > 0
      ? `Base: ${workingDays.elapsed} de ${workingDays.total} días hábiles`
      : null;
  // Meta diaria para la línea punteada de la tendencia.
  const dailyGoal =
    !isSingleDay && budget && budget.expectedRevenue > 0 && workingDays.total > 0
      ? budget.expectedRevenue / workingDays.total
      : null;

  const sellerLabel = national
    ? data?.seller.name
    : isAdmin
      ? sellerId !== 'all'
        ? (sellers.find((s) => s.id === sellerId)?.name ?? 'Vendedor')
        : null
      : (user?.name ?? '');

  const showProfitability = user?.role === 'admin' && !isUnitCompany;

  const applyRange = (from: string, to: string) => {
    setFromStr(from);
    setToStr(to);
    setRangeOpen(false);
  };
  const today = todayISO();
  const presets: { label: string; from: string; to: string }[] = [
    { label: 'Hoy', from: today, to: today },
    { label: 'Ayer', from: shiftDays(today, -1), to: shiftDays(today, -1) },
    { label: 'Este mes', from: firstOfMonthISO(), to: today },
    {
      label: 'Mes anterior',
      from: `${shiftDays(firstOfMonthISO(), -1).slice(0, 8)}01`,
      to: shiftDays(firstOfMonthISO(), -1),
    },
  ];

  return (
    <div
      className="-m-4 min-h-full p-4 md:-m-6 md:p-6"
      style={{
        background: `linear-gradient(135deg, #FFFFFF 0%, ${BRAND.background} 50%, #E8F5EC 100%)`,
      }}
    >
      <div className="mx-auto max-w-7xl space-y-3.5">
        {/* Encabezado con degradado (igual que _Hero en la app) */}
        <div
          className="relative rounded-[26px] text-white"
          style={{
            background: `linear-gradient(135deg, #0F6B35 0%, ${BRAND.primary} 55%, #34B868 100%)`,
            boxShadow: `0 12px 24px ${BRAND.primaryDark}47`,
          }}
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[26px]">
            <div className="absolute -right-10 -top-[50px] h-[170px] w-[170px] rounded-full bg-white/[0.08]" />
            <div className="absolute -bottom-[70px] right-[50px] h-[130px] w-[130px] rounded-full bg-white/[0.06]" />
          </div>
          <div className="relative px-4 pb-4 pt-4 sm:px-5 sm:pb-[18px] sm:pr-3 sm:pt-5">
            <div className="flex items-start gap-2">
              <h2 className="flex-1 text-xl font-extrabold leading-[1.15] tracking-[-0.4px] sm:text-[22px]">
                {national ? 'Negocios Nacionales' : 'Tablero de Gestión Comercial'}
              </h2>
              <button
                type="button"
                title="Actualizar"
                onClick={() => refetch()}
                disabled={isFetching}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.16] transition-colors hover:bg-white/25 disabled:hover:bg-white/[0.16]"
              >
                <RefreshCw className={cn('h-5 w-5', isFetching && 'animate-spin')} />
              </button>
            </div>
            <p className="mt-1.5 font-semibold text-white/[0.92]">
              {sellerLabel ? `Vendedor: ${sellerLabel}` : 'Vendedor: General · Todos los vendedores'}
            </p>
            {data && (
              <p className="mt-1 flex items-center gap-1 text-xs text-white/80">
                <Clock className="h-3.5 w-3.5" />
                Última actualización: {formatDateTime(data.generatedAt)}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {isAdmin && (
                <div className="relative">
                  <HeroChip
                    icon={UserIcon}
                    label={sellerLabel ?? 'Todos (general)'}
                    active={sellerOpen}
                    onClick={() => {
                      setSellerSearch('');
                      setRangeOpen(false);
                      setSellerOpen((o) => !o);
                    }}
                  />
                  {sellerOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setSellerOpen(false)} />
                      <div
                        className="absolute left-0 z-20 mt-2 w-[min(18rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl bg-white shadow-xl"
                        style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}
                      >
                        <div className="p-2">
                          <div className="relative">
                            <Search
                              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2"
                              style={{ color: BRAND.textSoft }}
                            />
                            <input
                              autoFocus
                              type="text"
                              value={sellerSearch}
                              onChange={(e) => setSellerSearch(e.target.value)}
                              placeholder="Buscar vendedor…"
                              className="h-9 w-full rounded-xl pl-8 pr-2 text-sm outline-none"
                              style={{ backgroundColor: BRAND.field }}
                            />
                          </div>
                        </div>
                        <div className="max-h-64 overflow-auto pb-1">
                          {[{ id: 'all', name: 'Todos (general)' }, ...filteredSellers].map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className={cn(
                                'flex w-full items-center px-3 py-2 text-left text-sm font-semibold hover:bg-[#F4FAF6]',
                                s.id === sellerId && 'bg-[#F4FAF6]',
                              )}
                              style={s.id === sellerId ? { color: BRAND.primary } : undefined}
                              onClick={() => {
                                setSellerId(s.id);
                                setSellerSearch('');
                                setSellerOpen(false);
                              }}
                            >
                              {s.name}
                            </button>
                          ))}
                          {filteredSellers.length === 0 && (
                            <p className="px-3 py-2 text-sm" style={{ color: BRAND.textSoft }}>
                              Sin vendedores.
                            </p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="relative">
                <HeroChip
                  icon={Calendar}
                  label={formatRangeLabel(rangeFrom, rangeTo)}
                  active={rangeOpen}
                  onClick={() => {
                    setSellerOpen(false);
                    setRangeOpen((o) => !o);
                  }}
                />
                {rangeOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setRangeOpen(false)} />
                    <div
                      className="absolute left-0 z-20 mt-2 w-[min(300px,calc(100vw-2.5rem))] rounded-2xl bg-white p-3 shadow-xl"
                      style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}
                    >
                      <p className="px-1 pb-2 text-base font-extrabold">Periodo</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {presets.map((p) => {
                          const active = p.from === rangeFrom && p.to === rangeTo;
                          return (
                            <button
                              key={p.label}
                              type="button"
                              onClick={() => applyRange(p.from, p.to)}
                              className="rounded-xl px-3 py-2 text-left text-[13px] font-bold transition-colors"
                              style={{
                                backgroundColor: active ? `${BRAND.primary}1A` : BRAND.field,
                                color: active ? BRAND.primary : BRAND.text,
                              }}
                            >
                              {p.label}
                            </button>
                          );
                        })}
                      </div>
                      <p
                        className="mt-3 px-1 text-[11px] font-bold uppercase tracking-wide"
                        style={{ color: BRAND.textSoft }}
                      >
                        Personalizado
                      </p>
                      <div className="mt-1.5 grid grid-cols-2 gap-2">
                        <label className="text-xs font-semibold" style={{ color: BRAND.textMuted }}>
                          Desde
                          <input
                            type="date"
                            value={fromStr}
                            max={toStr || today}
                            onChange={(e) => setFromStr(e.target.value || today)}
                            className="mt-1 h-9 w-full rounded-xl px-2 text-sm font-semibold outline-none"
                            style={{ backgroundColor: BRAND.field, color: BRAND.text }}
                          />
                        </label>
                        <label className="text-xs font-semibold" style={{ color: BRAND.textMuted }}>
                          Hasta
                          <input
                            type="date"
                            value={toStr}
                            min={fromStr || undefined}
                            max={today}
                            onChange={(e) => setToStr(e.target.value || today)}
                            className="mt-1 h-9 w-full rounded-xl px-2 text-sm font-semibold outline-none"
                            style={{ backgroundColor: BRAND.field, color: BRAND.text }}
                          />
                        </label>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {isError && (
          <ErrorCard
            message={
              error instanceof Error ? error.message : 'No se pudo cargar el tablero.'
            }
            onRetry={() => refetch()}
          />
        )}

        {!data ? (
          isLoading && <SkeletonGrid />
        ) : (
          <div
            className="space-y-3.5 transition-opacity duration-200"
            style={{ opacity: isFetching ? 0.55 : 1 }}
          >
            {/* Ventas acumuladas + Cumplimiento */}
            <div className="grid gap-3.5 lg:grid-cols-5">
              <FadeIn index={0} className="lg:col-span-3">
                <CardShell className="flex h-full flex-col">
                  <SectionHeader icon={DollarSign} color="#10B981" title="Ventas acumuladas" />
                  <p
                    className="mt-3.5 truncate text-[28px] font-extrabold tracking-[-0.8px] sm:text-[32px] lg:mt-auto lg:pt-3.5 lg:text-[40px]"
                    style={{ color: BRAND.text }}
                  >
                    {formatMoney(totals?.revenue ?? 0)}
                  </p>
                  <div className="mt-3.5 grid grid-cols-3 gap-3 lg:mt-auto lg:pt-3.5">
                    <MiniStat label={unit.soldLabel}>
                      <StatText>{unit.format(totals?.kilosSold ?? 0)}</StatText>
                    </MiniStat>
                    <MiniStat label="Crec. pesos">
                      <GrowthChip
                        ratio={data.growth.revenuePct == null ? null : data.growth.revenuePct / 100}
                      />
                    </MiniStat>
                    <MiniStat label={`Crec. ${unit.word}`}>
                      <GrowthChip
                        ratio={data.growth.kilosPct == null ? null : data.growth.kilosPct / 100}
                      />
                    </MiniStat>
                  </div>
                  {(data.growth.revenuePct != null || data.growth.kilosPct != null) && (
                    <p className="mt-2.5 text-[11.5px]" style={{ color: BRAND.textSoft }}>
                      Crecimiento vs. periodo anterior de igual duración
                    </p>
                  )}
                </CardShell>
              </FadeIn>

              <FadeIn index={1} className="lg:col-span-2">
                <CardShell className="h-full">
                  <SectionHeader
                    icon={Gauge}
                    color="#F59E0B"
                    title="Cumplimiento"
                    trailing={budget ? undefined : <PendingChip label="Sin presupuesto" />}
                  />
                  <div className="mt-[18px] grid grid-cols-2 gap-3">
                    <RingGauge
                      label="Pesos"
                      ratio={compRevenue}
                      pace={pace}
                      detail={totals ? formatMoneyShort(totals.revenue) : null}
                      target={formatMoneyShort(pptoRevenue ?? 0)}
                    />
                    <RingGauge
                      label={unit.label}
                      ratio={compKilos}
                      pace={pace}
                      detail={totals ? unit.format(Math.round(totals.kilosSold)) : null}
                      target={unit.format(pptoKilos ?? 0)}
                    />
                  </div>
                  {pace != null && (
                    <div
                      className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5"
                      style={{ backgroundColor: BRAND.field }}
                    >
                      <span className="h-3.5 w-[3px]" style={{ backgroundColor: BRAND.text }} />
                      <p className="text-xs font-semibold" style={{ color: BRAND.textMuted }}>
                        Meta a la fecha: {formatPercent(pace)} · día hábil {workingDays.elapsed} de{' '}
                        {workingDays.total}
                      </p>
                    </div>
                  )}
                </CardShell>
              </FadeIn>
            </div>

            {/* KPIs */}
            <FadeIn index={2}>
              <div
                className={cn(
                  'grid grid-cols-2 gap-3',
                  showProfitability ? 'lg:grid-cols-5' : 'lg:grid-cols-4',
                )}
              >
                <KpiCard
                  title={isSingleDay ? 'Ppto día' : 'Ppto mes'}
                  value={pptoRevenue == null ? null : formatMoney(pptoRevenue)}
                  emptyLabel="Sin presupuesto"
                  icon={Wallet}
                  color="#3B82F6"
                  metrics={[
                    { label: unit.label, value: pptoKilos == null ? null : unit.format(pptoKilos) },
                  ]}
                />
                <KpiCard
                  title="Proyección"
                  value={projection ? formatMoney(projection.revenue) : null}
                  emptyLabel={isSingleDay ? 'No aplica' : 'Sin días hábiles'}
                  icon={TrendingUp}
                  color="#8B5CF6"
                  metrics={[
                    { label: unit.label, value: projection ? unit.format(projection.kilos) : null },
                  ]}
                  footnote={daysNote}
                />
                <KpiCard
                  title="Pedidos"
                  value={formatInt(totals?.orders ?? 0)}
                  icon={ClipboardList}
                  color="#6366F1"
                  metrics={[
                    { label: 'Pesos', value: formatMoney(totals?.orderRevenue ?? 0) },
                    { label: unit.label, value: unit.format(totals?.orderKilos ?? 0) },
                  ]}
                />
                <KpiCard
                  title="Ticket promedio"
                  value={formatMoney(totals?.avgTicket ?? 0)}
                  icon={Receipt}
                  color="#0891B2"
                  metrics={[
                    { label: 'Clientes atendidos', value: formatInt(totals?.customersServed ?? 0) },
                    { label: 'Clientes activos', value: formatInt(totals?.activeCustomers ?? 0) },
                  ]}
                />
                {showProfitability && (
                  <KpiCard
                    title="Rentabilidad"
                    value={profitability ? formatMoney(profitability.margin) : null}
                    emptyLabel="Sin costos"
                    icon={PiggyBank}
                    color="#14B8A6"
                    className="col-span-2 lg:col-span-1"
                    metrics={[
                      {
                        label: 'Margen',
                        value:
                          profitability?.marginPct == null
                            ? null
                            : formatPercent(profitability.marginPct / 100),
                      },
                      { label: 'Costo', value: profitability ? formatMoney(profitability.cost) : null },
                    ]}
                  />
                )}
              </div>
            </FadeIn>

            {/* Tendencia + Categorías */}
            <div className="grid gap-3.5 xl:grid-cols-3">
              {data.salesTrend.length > 0 && (
                <FadeIn index={3} className="xl:col-span-2">
                  <TrendCard key={data.generatedAt} data={data} goal={dailyGoal} />
                </FadeIn>
              )}
              {data.salesByCategory ? (
                <FadeIn index={4}>
                  <CategoriesCard categories={data.salesByCategory} unit={unit} />
                </FadeIn>
              ) : (
                <FadeIn index={4}>
                  <CutsCard data={data} unit={unit} />
                </FadeIn>
              )}
            </div>

            {!data.salesByCategory && !hideChannels && (
              <FadeIn index={5}>
                <ChannelsCard data={data} unit={unit} />
              </FadeIn>
            )}

            {/* Presupuesto por tienda o clientes */}
            <FadeIn index={6}>
              {clientBudgets ? (
                <ClientBudgetsCard rows={clientBudgets} />
              ) : (
                <CustomersCard
                  key={`${rangeFrom}-${rangeTo}-${sellerId}`}
                  buying={data.topCustomers}
                  notBuying={data.customersNotBuying}
                />
              )}
            </FadeIn>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */

function TrendCard({ data, goal }: { data: Dashboard; goal: number | null }) {
  const points = data.salesTrend;
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const lastWithSales = (() => {
    for (let i = points.length - 1; i >= 0; i--) if (points[i].revenue !== 0) return i;
    return -1;
  })();
  const fallback = lastWithSales >= 0 ? lastWithSales : points.length - 1;
  const selected =
    selectedIdx != null && selectedIdx < points.length ? selectedIdx : fallback;
  const point = points[selected];
  const total = points.reduce((s, p) => s + p.revenue, 0);
  const activeDays = points.filter((p) => p.revenue !== 0).length;
  // En la vista intradía los puntos traen la hora como etiqueta.
  const pointLabel = (p: Dashboard['salesTrend'][number]) =>
    p.label ? `${formatDayLabel(p.date)} · ${p.label}` : formatDayLabel(p.date);
  const axisLabel = (p: Dashboard['salesTrend'][number]) => p.label ?? formatShortDate(p.date);

  return (
    <CardShell className="h-full">
      <SectionHeader icon={LineChart} color={BRAND.primary} title="Tendencia de ventas diarias" />
      <p className="mt-3.5 text-[12.5px] font-semibold first-letter:uppercase" style={{ color: BRAND.textSoft }}>
        {pointLabel(point)}
      </p>
      <div className="mt-0.5 flex flex-wrap items-end gap-x-2">
        <p className="text-2xl font-extrabold tracking-[-0.5px]" style={{ color: BRAND.text }}>
          {formatMoney(point.revenue)}
        </p>
        {goal != null && (
          <p
            className="pb-1 text-xs font-bold"
            style={{ color: point.revenue >= goal ? BRAND.primary : '#B45309' }}
          >
            {formatPercent(point.revenue / goal)} de la meta
          </p>
        )}
      </div>
      <div className="mt-3.5">
        <TrendChart
          values={points.map((p) => p.revenue)}
          selected={selected}
          goal={goal}
          onSelect={setSelectedIdx}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px]" style={{ color: BRAND.textSoft }}>
        <span>{axisLabel(points[0])}</span>
        <span>{axisLabel(points[points.length - 1])}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        <Legend color={BRAND.primary} label="Venta diaria" />
        {goal != null && (
          <Legend color="#F59E0B" label={`Meta diaria ${formatMoneyShort(goal)}`} dashed />
        )}
        <Legend
          color={BRAND.textSoft}
          label={`Promedio ${formatMoneyShort(activeDays > 0 ? total / activeDays : 0)}`}
        />
      </div>
    </CardShell>
  );
}

function Legend({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {dashed ? (
        <span className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-[3px] w-1" style={{ backgroundColor: color }} />
          ))}
        </span>
      ) : (
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      )}
      <span className="text-[11.5px] font-semibold" style={{ color: BRAND.textMuted }}>
        {label}
      </span>
    </span>
  );
}

/* ---------------------------------------------------------------------- */

function CategoriesCard({
  categories,
  unit,
}: {
  categories: Category[];
  unit: ReturnType<typeof qtyUnit>;
}) {
  const [open, setOpen] = useState<Category | null>(null);
  const total = categories.reduce((s, c) => s + c.revenue, 0);
  const totalKilos = categories.reduce((s, c) => s + c.kilos, 0);
  const withSales = categories.filter((c) => c.revenue > 0);

  return (
    <CardShell className="h-full">
      <SectionHeader icon={PieChart} color="#B91C1C" title="Ventas por categoría" />
      <div className="mt-4 flex h-3.5 overflow-hidden rounded-lg" style={{ backgroundColor: BRAND.field }}>
        {total > 0 &&
          withSales.map((c) => (
            <div
              key={c.category}
              style={{ flex: `${Math.max(1, Math.round((c.revenue / total) * 1000))} 1 0%`, backgroundColor: categoryColor(c.category) }}
              title={`${c.category}: ${formatPercent(c.revenue / total)}`}
            />
          ))}
      </div>
      <div className="mt-2">
        {categories.length === 0 && (
          <p className="py-6 text-center text-sm" style={{ color: BRAND.textSoft }}>
            Sin ventas en el período.
          </p>
        )}
        {categories.map((c) => (
          <button
            key={c.category}
            type="button"
            disabled={c.items.length === 0}
            onClick={() => setOpen(c)}
            className="flex w-full items-center gap-2.5 rounded-xl px-1 py-2.5 text-left transition-colors hover:bg-[#F4FAF6] disabled:cursor-default disabled:hover:bg-transparent"
          >
            <span className="h-3 w-3 shrink-0 rounded" style={{ backgroundColor: categoryColor(c.category) }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold" style={{ color: BRAND.text }}>
                {c.category}
              </span>
              <span className="block text-xs" style={{ color: BRAND.textSoft }}>
                {c.items.length} ítem{c.items.length === 1 ? '' : 's'} · {unit.format(c.kilos)}
              </span>
            </span>
            <span className="text-right">
              <span className="block font-extrabold" style={{ color: BRAND.text }}>
                {formatMoney(c.revenue)}
              </span>
              <span className="block text-xs font-semibold" style={{ color: BRAND.textSoft }}>
                {total > 0 ? formatPercent(c.revenue / total) : '—'}
              </span>
            </span>
            {c.items.length > 0 && (
              <ChevronRight className="h-4 w-4 shrink-0" style={{ color: BRAND.textSoft }} />
            )}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t pt-3" style={{ borderColor: BRAND.border }}>
        <span className="font-extrabold" style={{ color: BRAND.text }}>
          Total
        </span>
        <span className="text-right">
          <span className="block font-extrabold" style={{ color: BRAND.text }}>
            {formatMoney(total)}
          </span>
          <span className="block text-xs" style={{ color: BRAND.textSoft }}>
            {unit.format(totalKilos)}
          </span>
        </span>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setOpen(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[26px] bg-white shadow-xl sm:rounded-[26px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 px-5 pb-3 pt-5">
              <span
                className="mt-1 h-3 w-3 shrink-0 rounded"
                style={{ backgroundColor: categoryColor(open.category) }}
              />
              <div className="min-w-0 flex-1">
                <h3 className="text-xl font-extrabold" style={{ color: BRAND.text }}>
                  {open.category}
                </h3>
                <p className="text-sm" style={{ color: BRAND.textSoft }}>
                  {formatMoney(open.revenue)} · {unit.format(open.kilos)} · {open.items.length} ítem
                  {open.items.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="rounded-full p-2 hover:bg-[#F1F5F9]"
                style={{ color: BRAND.textSoft }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-3 pb-3">
              {open.items.map((it, i) => {
                const pct = open.revenue > 0 ? it.revenue / open.revenue : 0;
                return (
                  <div key={`${it.ref}-${i}`} className="px-2 py-2.5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold" style={{ color: BRAND.text }}>
                          {it.name}
                        </p>
                        <p className="text-[11px]" style={{ color: BRAND.textSoft }}>
                          {it.ref} · {unit.format(it.kilos)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold tabular-nums" style={{ color: BRAND.text }}>
                          {formatMoney(it.revenue)}
                        </p>
                        <p className="text-[11px] font-semibold" style={{ color: BRAND.textSoft }}>
                          {formatPercent(pct)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded" style={{ backgroundColor: BRAND.field }}>
                      <div
                        className="h-full rounded"
                        style={{ width: `${Math.min(100, pct * 100)}%`, backgroundColor: categoryColor(open.category) }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </CardShell>
  );
}

/* ---------------------------------------------------------------------- */

function CutsCard({ data, unit }: { data: Dashboard; unit: ReturnType<typeof qtyUnit> }) {
  const total = data.salesByCut.reduce((s, c) => s + c.revenue, 0);
  return (
    <CardShell className="h-full">
      <SectionHeader icon={Beef} color="#B91C1C" title="Ventas en cortes" />
      <div className="mt-2 max-h-[420px] overflow-y-auto">
        {data.salesByCut.length === 0 && (
          <p className="py-8 text-center text-sm" style={{ color: BRAND.textSoft }}>
            Sin ventas en el período.
          </p>
        )}
        {data.salesByCut.map((c, i) => {
          const pct = total > 0 ? c.revenue / total : 0;
          return (
            <div key={`${c.name}-${i}`} className="py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 truncate text-sm font-bold" style={{ color: BRAND.text }} title={c.name}>
                  {c.name}
                </p>
                <span className="shrink-0 text-sm font-extrabold tabular-nums" style={{ color: BRAND.text }}>
                  {formatMoney(c.revenue)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded" style={{ backgroundColor: BRAND.field }}>
                  <div className="h-full rounded" style={{ width: `${pct * 100}%`, backgroundColor: BRAND.primary }} />
                </div>
                <span className="w-14 shrink-0 text-right text-[11px] font-semibold" style={{ color: BRAND.textSoft }}>
                  {formatPercent(pct)}
                </span>
              </div>
              <p className="text-[11px]" style={{ color: BRAND.textSoft }}>
                {unit.format(c.quantity)}
              </p>
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}

function ChannelsCard({ data, unit }: { data: Dashboard; unit: ReturnType<typeof qtyUnit> }) {
  const total = data.salesByChannel.reduce((s, c) => s + c.revenue, 0);
  return (
    <CardShell>
      <SectionHeader icon={Layers} color="#6366F1" title="Ventas por canal" />
      <div className="mt-2 divide-y" style={{ borderColor: BRAND.border }}>
        {data.salesByChannel.length === 0 && (
          <p className="py-8 text-center text-sm" style={{ color: BRAND.textSoft }}>
            Sin ventas de canal en el período.
          </p>
        )}
        {data.salesByChannel.map((c, i) => {
          const pct = total > 0 ? c.revenue / total : 0;
          return (
            <div key={`${c.name}-${i}`} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold" style={{ color: BRAND.text }}>
                  {c.name}
                </p>
                <p className="text-xs" style={{ color: BRAND.textSoft }}>
                  {unit.format(c.kilos)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-extrabold tabular-nums" style={{ color: BRAND.text }}>
                  {formatMoney(c.revenue)}
                </p>
                <p className="text-xs font-semibold" style={{ color: BRAND.textSoft }}>
                  {formatPercent(pct)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}

/* ---------------------------------------------------------------------- */

function ClientBudgetsCard({ rows }: { rows: NonNullable<Dashboard['clientBudgets']> }) {
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  const target = rows.reduce((s, r) => s + r.targetRevenue, 0);
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <CardShell>
      <SectionHeader icon={Store} color="#3B82F6" title="Presupuesto por tienda / cliente" />
      {sorted.length === 0 && (
        <p className="py-5 text-center text-sm" style={{ color: BRAND.textSoft }}>
          Sin clientes asignados.
        </p>
      )}
      <div className="mt-3 grid gap-x-8 md:grid-cols-2">
        {sorted.map((r) => {
          const ratio = r.compliancePct == null ? null : r.compliancePct / 100;
          const branch = r.branchName ?? r.branch;
          return (
            <div key={`${r.clientCode}-${r.branch ?? ''}`} className="py-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-bold" style={{ color: BRAND.text }}>
                    {r.clientName}
                  </p>
                  <p className="truncate text-xs" style={{ color: BRAND.textSoft }}>
                    {[r.clientCode, branch && branch !== r.clientName ? branch : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <span
                  className="text-[15px] font-extrabold"
                  style={{ color: ratio == null ? BRAND.textSoft : complianceColor(ratio) }}
                >
                  {ratio == null ? '—' : formatPercent(ratio)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-bold" style={{ color: BRAND.text }}>
                  Venta {formatMoney(r.revenue)}
                </span>
                <span className="text-xs" style={{ color: BRAND.textSoft }}>
                  {r.targetRevenue > 0 ? `Meta ${formatMoney(r.targetRevenue)}` : 'Sin meta'}
                </span>
              </div>
              {ratio != null && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded" style={{ backgroundColor: BRAND.field }}>
                  <div
                    className="h-full rounded"
                    style={{ width: `${Math.min(100, ratio * 100)}%`, backgroundColor: complianceColor(ratio) }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: BRAND.border }}>
        <span className="font-extrabold" style={{ color: BRAND.text }}>
          Total (aparte del general)
        </span>
        <span className="text-right">
          <span className="block font-extrabold" style={{ color: BRAND.text }}>
            {formatMoney(revenue)}
          </span>
          <span className="block text-xs" style={{ color: BRAND.textSoft }}>
            Meta {formatMoney(target)}
          </span>
        </span>
      </div>
    </CardShell>
  );
}

/* ---------------------------------------------------------------------- */

function CustomersCard({ buying, notBuying }: { buying: CustomerRow[]; notBuying: CustomerRow[] }) {
  const [showBuying, setShowBuying] = useState(true);
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(CUSTOMERS_PAGE);

  const source = showBuying ? buying : notBuying;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? source.filter((c) =>
        [c.name, c.branchName, c.branch, c.city, c.code]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    : source;
  const shown = filtered.slice(0, visible);
  const accent = showBuying ? BRAND.primary : '#B45309';

  return (
    <CardShell>
      <SectionHeader icon={Store} color="#6366F1" title="Mis clientes / tiendas" />
      <div className="mt-3.5 flex flex-col gap-3 sm:flex-row">
        <div
          className="grid grid-cols-2 overflow-hidden rounded-full text-[13px] font-bold sm:w-80"
          style={{ border: `1px solid ${BRAND.border}` }}
        >
          {(
            [
              [true, `Compran (${buying.length})`],
              [false, `No compran (${notBuying.length})`],
            ] as const
          ).map(([val, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setShowBuying(val);
                setVisible(CUSTOMERS_PAGE);
              }}
              className="h-10 px-3 transition-colors"
              style={
                showBuying === val
                  ? { backgroundColor: accent, color: '#fff' }
                  : { color: BRAND.textMuted }
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: BRAND.textSoft }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisible(CUSTOMERS_PAGE);
            }}
            placeholder="Buscar cliente, tienda, NIT o ciudad"
            className="h-10 w-full rounded-full pl-9 pr-9 text-sm outline-none focus:ring-2"
            style={{ backgroundColor: BRAND.field, color: BRAND.text }}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setVisible(CUSTOMERS_PAGE);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-white"
              style={{ color: BRAND.textSoft }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: BRAND.textSoft }}>
          {q
            ? 'Sin coincidencias para la búsqueda.'
            : showBuying
              ? 'Sin ventas en el período.'
              : 'Todos tus clientes compraron.'}
        </p>
      ) : (
        <div className="mt-2 grid gap-x-6 md:grid-cols-2">
          {shown.map((c, i) => (
            <div
              key={`${c.code}-${i}`}
              className="flex items-center gap-3 border-b py-2.5"
              style={{ borderColor: `${BRAND.border}99` }}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold"
                style={{ backgroundColor: `${accent}1A`, color: accent }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold" style={{ color: BRAND.text }} title={c.name}>
                  {c.name}
                </p>
                <p className="truncate text-xs" style={{ color: BRAND.textSoft }}>
                  {c.branchName ?? c.branch ?? c.city ?? 'Sin tienda'}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {showBuying ? (
                  <p className="text-sm font-extrabold tabular-nums" style={{ color: BRAND.text }}>
                    {formatMoney(c.revenue)}
                  </p>
                ) : (
                  <>
                    <p className="text-[11px]" style={{ color: BRAND.textSoft }}>
                      Última compra
                    </p>
                    <p className="text-xs font-bold" style={{ color: BRAND.text }}>
                      {c.lastPurchase ? formatDate(c.lastPurchase) : 'Nunca'}
                    </p>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {filtered.length > shown.length && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setVisible((v) => v + CUSTOMERS_PAGE)}
            className="rounded-full px-4 py-2 text-[13px] font-bold hover:bg-[#F4FAF6]"
            style={{ color: BRAND.primary }}
          >
            Ver más ({filtered.length - shown.length} restantes)
          </button>
        </div>
      )}
    </CardShell>
  );
}
