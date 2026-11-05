import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileBarChart,
  Building2,
  Calendar,
  Download,
  FileSpreadsheet,
  Package,
  AlertCircle,
  ShoppingCart,
  Search,
  Loader2,
  X,
  ChevronRight,
  EyeOff,
  Users,
  Trophy,
  UserSearch,
  Crown,
  BarChart3,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import {
  downloadInventoryReport,
  downloadInventoryExcel,
  downloadProductSalesReport,
  downloadProductSalesExcel,
  downloadSalesSummaryReport,
  downloadSalesSummaryExcel,
  downloadSellerRankingReport,
  downloadSellerRankingExcel,
  downloadSellerProductReport,
  downloadSellerProductExcel,
  downloadProductSellerReport,
  downloadProductSellerExcel,
  downloadSellerSalesReport,
  downloadSellerSalesExcel,
  downloadVendorProductSalesReport,
  downloadVendorProductSalesExcel,
  useInventoryReport,
  useProductSalesReport,
  useSalesSummaryReport,
  useSellerRankingReport,
  useSellerProductReport,
  useProductSellerReport,
  useSellerSalesReport,
  useVendorProductSalesReport,
} from '@/hooks/useAdminApi';
import { COMPANIES } from '@/lib/companies';
import { cn, formatCurrency } from '@/lib/utils';
import { PageBackground, Hero, BrandButton, Modal } from '@/components/brand/PageShell';
import { FadeIn } from '@/components/dashboard/primitives';
import { BRAND } from '@/lib/brand';

/** Fecha de hoy en formato YYYY-MM-DD (hora local del navegador). */
function todayStr(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

const DATE_INPUT =
  'brand-input h-10 w-full rounded-xl pl-9 pr-2 text-sm font-semibold outline-none disabled:opacity-60';
const SELECT_INPUT = 'brand-input h-10 w-full rounded-xl px-3 text-sm font-semibold outline-none';
const FIELD_STYLE = { backgroundColor: BRAND.field, color: BRAND.text } as const;

/** Formatea una cantidad con separador de miles colombiano. */
function num(value: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(
    value,
  );
}

function errorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const msg = err.response?.data?.message;
    return (
      (Array.isArray(msg) ? msg.join(', ') : msg) ||
      'No se pudo generar el reporte.'
    );
  }
  return 'No se pudo generar el reporte.';
}

type ReportKey =
  | 'inventory'
  | 'product-sales'
  | 'sales-summary'
  | 'seller-ranking'
  | 'seller-product'
  | 'product-seller'
  | 'seller-sales'
  | 'vendor-product-sales';

const REPORTS: {
  key: ReportKey;
  title: string;
  description: string;
  icon: typeof FileBarChart;
}[] = [
  {
    key: 'inventory',
    title: 'Resumen de inventario por día',
    description:
      'Lo vendido en el día, el stock que queda y las referencias agotadas.',
    icon: FileBarChart,
  },
  {
    key: 'product-sales',
    title: 'Productos vendidos por compañía',
    description:
      'Cantidad vendida e ingresos por producto en un rango de fechas.',
    icon: ShoppingCart,
  },
  {
    key: 'sales-summary',
    title: 'Resumen de ventas por cliente y producto',
    description:
      'Cuánto se ha vendido a cada cliente o de cada producto en un rango de fechas.',
    icon: Users,
  },
  {
    key: 'seller-ranking',
    title: 'Ranking de vendedores',
    description:
      'Los vendedores que más venden y los que menos en un rango de fechas.',
    icon: Trophy,
  },
  {
    key: 'seller-product',
    title: 'Ventas por vendedor y producto',
    description:
      'Cuánto vendió un vendedor de un producto en un rango de fechas.',
    icon: UserSearch,
  },
  {
    key: 'product-seller',
    title: 'Mejor vendedor por producto',
    description:
      'Por cada producto, quién fue el vendedor que más lo vendió (ranking).',
    icon: Crown,
  },
  {
    key: 'seller-sales',
    title: 'Ventas por vendedor (mensual)',
    description:
      'Presupuesto vs. ventas y kilos por vendedor, con cumplimiento y valor promedio por kilo.',
    icon: BarChart3,
  },
  {
    key: 'vendor-product-sales',
    title: 'Ventas acumuladas por vendedor por producto',
    description:
      'Por cada vendedor, el desglose de productos vendidos en el mes (cantidad y venta neta) con totales.',
    icon: UserSearch,
  },
];

export function ReportsPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState<ReportKey | null>(null);

  return (
    <PageBackground className="space-y-3.5">
      <Hero>
        <h2 className="text-xl font-extrabold leading-tight tracking-[-0.4px] sm:text-[22px]">Reportes</h2>
        <p className="mt-1 text-sm font-semibold text-white/90">
          Selecciona un reporte para consultarlo y exportarlo a PDF o Excel.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-white/[0.16] px-3 py-1">{REPORTS.length} reportes</span>
          <span className="rounded-full bg-white/[0.16] px-3 py-1">PDF · Excel</span>
        </div>
      </Hero>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r, i) => (
          <FadeIn key={r.key} index={i}>
            <button
              type="button"
              onClick={() =>
                r.key === 'seller-sales'
                  ? navigate('/admin/reportes/ventas-por-vendedor')
                  : setOpen(r.key)
              }
              className="group flex h-full w-full items-start gap-3.5 rounded-2xl bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(30,155,80,0.12)]"
              style={{ border: `1px solid ${BRAND.border}CC`, color: BRAND.text }}
            >
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
                style={{ background: `linear-gradient(135deg, ${BRAND.primaryDark}, ${BRAND.primary})` }}
              >
                <r.icon className="h-[22px] w-[22px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-extrabold leading-snug">{r.title}</span>
                <span className="mt-1 block text-[12.5px] leading-snug" style={{ color: BRAND.textSoft }}>
                  {r.description}
                </span>
              </span>
              <ChevronRight
                className="mt-3 h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5"
                style={{ color: BRAND.textSoft }}
              />
            </button>
          </FadeIn>
        ))}
      </div>

      {open === 'inventory' && (
        <ReportModalShell
          title="Resumen de inventario por día"
          icon={FileBarChart}
          onClose={() => setOpen(null)}
        >
          <InventoryReportBody />
        </ReportModalShell>
      )}

      {open === 'product-sales' && (
        <ReportModalShell
          title="Productos vendidos por compañía"
          icon={ShoppingCart}
          onClose={() => setOpen(null)}
        >
          <ProductSalesReportBody />
        </ReportModalShell>
      )}

      {open === 'sales-summary' && (
        <ReportModalShell
          title="Resumen de ventas por cliente y producto"
          icon={Users}
          onClose={() => setOpen(null)}
        >
          <SalesSummaryReportBody />
        </ReportModalShell>
      )}

      {open === 'seller-ranking' && (
        <ReportModalShell
          title="Ranking de vendedores"
          icon={Trophy}
          onClose={() => setOpen(null)}
        >
          <SellerRankingReportBody />
        </ReportModalShell>
      )}

      {open === 'seller-product' && (
        <ReportModalShell
          title="Ventas por vendedor y producto"
          icon={UserSearch}
          onClose={() => setOpen(null)}
        >
          <SellerProductReportBody />
        </ReportModalShell>
      )}

      {open === 'product-seller' && (
        <ReportModalShell
          title="Mejor vendedor por producto"
          icon={Crown}
          onClose={() => setOpen(null)}
        >
          <ProductSellerReportBody />
        </ReportModalShell>
      )}

      {open === 'seller-sales' && (
        <ReportModalShell
          title="Ventas por vendedor (mensual)"
          icon={BarChart3}
          onClose={() => setOpen(null)}
        >
          <SellerSalesReportBody />
        </ReportModalShell>
      )}

      {open === 'vendor-product-sales' && (
        <ReportModalShell
          title="Ventas acumuladas por vendedor por producto"
          icon={UserSearch}
          onClose={() => setOpen(null)}
        >
          <VendorProductSalesReportBody />
        </ReportModalShell>
      )}
    </PageBackground>
  );
}

/* ------------------------------------------------------------------ */
/* Marco del modal                                                     */
/* ------------------------------------------------------------------ */

function ReportModalShell({
  title,
  icon: Icon,
  onClose,
  children,
}: {
  title: string;
  icon: typeof FileBarChart;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Cerrar con la tecla Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <Modal onClose={onClose} className="max-w-5xl">
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: `1px solid ${BRAND.border}` }}
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: `linear-gradient(135deg, ${BRAND.primaryDark}, ${BRAND.primary})` }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-extrabold tracking-[-0.3px]">{title}</h3>
          <p className="text-xs" style={{ color: BRAND.textSoft }}>
            Configura los filtros, consulta y exporta
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[#F4FAF6]"
          style={{ color: BRAND.textMuted }}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-auto p-4 sm:p-5" style={{ backgroundColor: BRAND.background }}>
        {children}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Resumen de inventario por día                                       */
/* ------------------------------------------------------------------ */

function InventoryReportBody() {
  const [companyId, setCompanyId] = useState(COMPANIES[0].id);
  const [date, setDate] = useState(todayStr());

  const [applied, setApplied] = useState<{
    companyId: string;
    date: string;
  } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [exporting, setExporting] = useState<null | 'pdf' | 'excel'>(null);
  const [error, setError] = useState('');

  const query = useInventoryReport(
    applied?.companyId ?? '',
    applied?.date,
    !!applied,
  );

  const company = COMPANIES.find((c) => c.id === companyId)!;

  function handleToggle() {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    setError('');
    setApplied({ companyId, date: date || todayStr() });
    setShowPreview(true);
  }

  async function handleExport(kind: 'pdf' | 'excel') {
    setExporting(kind);
    setError('');
    try {
      if (kind === 'pdf') {
        await downloadInventoryReport(companyId, date || undefined);
      } else {
        await downloadInventoryExcel(companyId, date || undefined);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(null);
    }
  }

  const data = query.data;

  return (
    <>
      <p className="flex items-start gap-2 rounded-2xl border border-[#1E9B50]/20 bg-[#1E9B50]/[0.06] p-3 text-sm text-[#166534]">
        <Package className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Por cada referencia muestra lo <strong>vendido</strong> en el día, el{' '}
          <strong>stock que queda</strong> y si tiene o no existencias.
        </span>
      </p>

      {/* Compañía */}
      <div className="space-y-2">
        <label className="text-[13px] font-bold">Compañía</label>
        <div className="flex flex-wrap gap-2">
          {COMPANIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCompanyId(c.id)}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-bold transition-colors',
                companyId === c.id
                  ? 'border-[#1E9B50] bg-[#1E9B50] text-white'
                  : 'border-[#E2E8F0] bg-white text-[#4B5563] hover:bg-[#F4FAF6]',
              )}
            >
              <Building2 className="h-4 w-4" />
              {c.name}
              <span className="text-xs opacity-70">#{c.id}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Fecha */}
      <div className="space-y-2">
        <label className="text-[13px] font-bold">Día del reporte</label>
        <div className="relative max-w-xs">
          <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E9B50]" />
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className={DATE_INPUT}
            style={FIELD_STYLE}
          />
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-3">
        <BrandButton className="h-10" onClick={handleToggle} disabled={query.isFetching}>
          {query.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : showPreview ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {showPreview ? 'Ocultar' : 'Consultar'}
        </BrandButton>
        <BrandButton
          className="h-10"
          variant="outline"
          onClick={() => handleExport('pdf')}
          disabled={exporting !== null}
        >
          <Download
            className={cn('h-4 w-4', exporting === 'pdf' && 'animate-pulse')}
          />
          Exportar PDF
        </BrandButton>
        <BrandButton
          className="h-10"
          variant="outline"
          onClick={() => handleExport('excel')}
          disabled={exporting !== null}
        >
          <FileSpreadsheet
            className={cn('h-4 w-4', exporting === 'excel' && 'animate-pulse')}
          />
          Exportar Excel
        </BrandButton>
        <span className="text-xs text-[#6B7280]">
          {company.name} · {date || 'hoy'}
        </span>
      </div>

      {/* Vista previa */}
      {showPreview && query.isError && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          {errorMessage(query.error)}
        </p>
      )}

      {showPreview && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <SummaryTile label="Referencias" value={num(data.summary.totalRefs)} />
            <SummaryTile
              label="Con stock"
              value={num(data.summary.refsWithStock)}
              tone="ok"
            />
            <SummaryTile
              label="Sin stock"
              value={num(data.summary.refsWithoutStock)}
              tone="warn"
            />
            <SummaryTile label="Vendido" value={num(data.summary.totalSold)} />
            <SummaryTile label="Stock total" value={num(data.summary.totalStock)} />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white">
            <table className="w-full text-sm">
              <thead className="bg-[#F4FAF6] text-left text-[11px] font-extrabold uppercase tracking-wider text-[#15803D]">
                <tr>
                  <th className="px-4 py-2 font-medium">Referencia</th>
                  <th className="px-4 py-2 font-medium">Producto</th>
                  <th className="px-4 py-2 font-medium">UM</th>
                  <th className="px-4 py-2 text-right font-medium">Vendido</th>
                  <th className="px-4 py-2 text-right font-medium">Stock</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-[#6B7280]"
                    >
                      Sin productos para esta compañía.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((r) => (
                    <tr
                      key={r.sku}
                      className="border-t border-[#E2E8F0]/80 hover:bg-[#F4FAF6]"
                    >
                      <td className="px-4 py-2 font-mono text-xs">{r.sku}</td>
                      <td className="px-4 py-2">{r.name}</td>
                      <td className="px-4 py-2 text-[#6B7280]">
                        {r.unitOfMeasure ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {num(r.sold)}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-2 text-right font-medium tabular-nums',
                          r.stock <= 0 && 'text-red-600',
                        )}
                      >
                        {num(r.stock)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Productos vendidos por compañía                                     */
/* ------------------------------------------------------------------ */

function ProductSalesReportBody() {
  const [companyId, setCompanyId] = useState(COMPANIES[0].id);
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());

  const [applied, setApplied] = useState<{
    from: string;
    to: string;
    companyId: string;
  } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [exporting, setExporting] = useState<null | 'pdf' | 'excel'>(null);
  const [error, setError] = useState('');

  const query = useProductSalesReport(
    applied?.from,
    applied?.to,
    applied?.companyId,
    !!applied,
  );

  function handleToggle() {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    if (from && to && from > to) {
      setError('La fecha inicial no puede ser mayor que la final.');
      return;
    }
    setError('');
    setApplied({ from: from || todayStr(), to: to || todayStr(), companyId });
    setShowPreview(true);
  }

  async function handleExport(kind: 'pdf' | 'excel') {
    if (from && to && from > to) {
      setError('La fecha inicial no puede ser mayor que la final.');
      return;
    }
    setExporting(kind);
    setError('');
    try {
      if (kind === 'pdf') {
        await downloadProductSalesReport(from || undefined, to || undefined, companyId);
      } else {
        await downloadProductSalesExcel(from || undefined, to || undefined, companyId);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(null);
    }
  }

  const data = query.data;

  return (
    <>
      <p className="flex items-start gap-2 rounded-2xl border border-[#1E9B50]/20 bg-[#1E9B50]/[0.06] p-3 text-sm text-[#166534]">
        <Package className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Por cada producto vendido en el rango muestra la{' '}
          <strong>referencia</strong>, la <strong>cantidad vendida</strong> y los{' '}
          <strong>ingresos</strong> (precio × cantidad).
        </span>
      </p>

      {/* Compañía */}
      <div className="space-y-2">
        <label className="text-[13px] font-bold">Compañía</label>
        <div className="flex flex-wrap gap-2">
          {COMPANIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCompanyId(c.id)}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-bold transition-colors',
                companyId === c.id
                  ? 'border-[#1E9B50] bg-[#1E9B50] text-white'
                  : 'border-[#E2E8F0] bg-white text-[#4B5563] hover:bg-[#F4FAF6]',
              )}
            >
              <Building2 className="h-4 w-4" />
              {c.name}
              <span className="text-xs opacity-70">#{c.id}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Rango de fechas */}
      <div className="grid max-w-md gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-[13px] font-bold">Desde</label>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E9B50]" />
            <input
              type="date"
              value={from}
              max={to || todayStr()}
              onChange={(e) => setFrom(e.target.value)}
              className={DATE_INPUT}
            style={FIELD_STYLE}
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[13px] font-bold">Hasta</label>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E9B50]" />
            <input
              type="date"
              value={to}
              max={todayStr()}
              onChange={(e) => setTo(e.target.value)}
              className={DATE_INPUT}
            style={FIELD_STYLE}
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-3">
        <BrandButton className="h-10" onClick={handleToggle} disabled={query.isFetching}>
          {query.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : showPreview ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {showPreview ? 'Ocultar' : 'Consultar'}
        </BrandButton>
        <BrandButton
          className="h-10"
          variant="outline"
          onClick={() => handleExport('pdf')}
          disabled={exporting !== null}
        >
          <Download
            className={cn('h-4 w-4', exporting === 'pdf' && 'animate-pulse')}
          />
          Exportar PDF
        </BrandButton>
        <BrandButton
          className="h-10"
          variant="outline"
          onClick={() => handleExport('excel')}
          disabled={exporting !== null}
        >
          <FileSpreadsheet
            className={cn('h-4 w-4', exporting === 'excel' && 'animate-pulse')}
          />
          Exportar Excel
        </BrandButton>
        <span className="text-xs text-[#6B7280]">
          {COMPANIES.find((c) => c.id === companyId)?.name} ·{' '}
          {from === to ? from || 'hoy' : `${from} a ${to}`}
        </span>
      </div>

      {/* Vista previa */}
      {showPreview && query.isError && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          {errorMessage(query.error)}
        </p>
      )}

      {showPreview &&
        data &&
        data.companies.map((company) => (
          <div key={company.companyId} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <SummaryTile
                label="Productos"
                value={num(company.summary.totalProducts)}
              />
              <SummaryTile
                label="Cantidad"
                value={num(company.summary.totalQuantity)}
              />
              <SummaryTile
                label="Ingresos"
                value={formatCurrency(company.summary.totalRevenue)}
                tone="ok"
              />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white">
              <table className="w-full text-sm">
                <thead className="bg-[#F4FAF6] text-left text-[11px] font-extrabold uppercase tracking-wider text-[#15803D]">
                  <tr>
                    <th className="px-4 py-2 font-medium">Referencia</th>
                    <th className="px-4 py-2 font-medium">Producto</th>
                    <th className="px-4 py-2 font-medium">UM</th>
                    <th className="px-4 py-2 text-right font-medium">Cantidad</th>
                    <th className="px-4 py-2 text-right font-medium">Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  {company.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-[#6B7280]"
                      >
                        Sin ventas en el rango seleccionado.
                      </td>
                    </tr>
                  ) : (
                    company.rows.map((r) => (
                      <tr
                        key={r.sku}
                        className="border-t border-[#E2E8F0]/80 hover:bg-[#F4FAF6]"
                      >
                        <td className="px-4 py-2 font-mono text-xs">{r.sku}</td>
                        <td className="px-4 py-2">{r.name}</td>
                        <td className="px-4 py-2 text-[#6B7280]">
                          {r.unitOfMeasure ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {num(r.quantity)}
                        </td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">
                          {formatCurrency(r.revenue)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Resumen de ventas por cliente y producto                            */
/* ------------------------------------------------------------------ */

function SalesSummaryReportBody() {
  const [companyId, setCompanyId] = useState(COMPANIES[0].id);
  const [groupBy, setGroupBy] = useState<'customer' | 'product'>('customer');
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [search, setSearch] = useState('');

  const [applied, setApplied] = useState<{
    companyId: string;
    groupBy: 'customer' | 'product';
    from: string;
    to: string;
  } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [exporting, setExporting] = useState<null | 'pdf' | 'excel'>(null);
  const [error, setError] = useState('');

  const query = useSalesSummaryReport(
    applied?.companyId,
    applied?.groupBy ?? 'customer',
    applied?.from,
    applied?.to,
    !!applied,
  );

  const byCustomer = groupBy === 'customer';

  function handleToggle() {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    if (from && to && from > to) {
      setError('La fecha inicial no puede ser mayor que la final.');
      return;
    }
    setError('');
    setApplied({
      companyId,
      groupBy,
      from: from || todayStr(),
      to: to || todayStr(),
    });
    setShowPreview(true);
  }

  async function handleExport(kind: 'pdf' | 'excel') {
    if (from && to && from > to) {
      setError('La fecha inicial no puede ser mayor que la final.');
      return;
    }
    setExporting(kind);
    setError('');
    try {
      if (kind === 'pdf') {
        await downloadSalesSummaryReport(
          companyId,
          groupBy,
          from || undefined,
          to || undefined,
        );
      } else {
        await downloadSalesSummaryExcel(
          companyId,
          groupBy,
          from || undefined,
          to || undefined,
        );
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(null);
    }
  }

  const data = query.data;
  const term = search.trim().toLowerCase();
  const rows = data
    ? term
      ? data.rows.filter(
          (r) =>
            r.name.toLowerCase().includes(term) ||
            r.reference.toLowerCase().includes(term),
        )
      : data.rows
    : [];

  return (
    <>
      <p className="flex items-start gap-2 rounded-2xl border border-[#1E9B50]/20 bg-[#1E9B50]/[0.06] p-3 text-sm text-[#166534]">
        <Users className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Filtra un rango de fechas y consulta{' '}
          <strong>cuánto se ha vendido a cada cliente</strong> o{' '}
          <strong>cuánto se ha vendido de cada producto</strong>, ordenado de
          mayor a menor por ingresos.
        </span>
      </p>

      {/* Agrupar por */}
      <div className="space-y-2">
        <label className="text-[13px] font-bold">Ver ventas por</label>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'customer', label: 'Cliente', icon: Users },
              { id: 'product', label: 'Producto', icon: Package },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setGroupBy(opt.id)}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-bold transition-colors',
                groupBy === opt.id
                  ? 'border-[#1E9B50] bg-[#1E9B50] text-white'
                  : 'border-[#E2E8F0] bg-white text-[#4B5563] hover:bg-[#F4FAF6]',
              )}
            >
              <opt.icon className="h-4 w-4" />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Compañía */}
      <div className="space-y-2">
        <label className="text-[13px] font-bold">Compañía</label>
        <div className="flex flex-wrap gap-2">
          {COMPANIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCompanyId(c.id)}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-bold transition-colors',
                companyId === c.id
                  ? 'border-[#1E9B50] bg-[#1E9B50] text-white'
                  : 'border-[#E2E8F0] bg-white text-[#4B5563] hover:bg-[#F4FAF6]',
              )}
            >
              <Building2 className="h-4 w-4" />
              {c.name}
              <span className="text-xs opacity-70">#{c.id}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Rango de fechas */}
      <div className="grid max-w-md gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-[13px] font-bold">Desde</label>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E9B50]" />
            <input
              type="date"
              value={from}
              max={to || todayStr()}
              onChange={(e) => setFrom(e.target.value)}
              className={DATE_INPUT}
            style={FIELD_STYLE}
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[13px] font-bold">Hasta</label>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E9B50]" />
            <input
              type="date"
              value={to}
              max={todayStr()}
              onChange={(e) => setTo(e.target.value)}
              className={DATE_INPUT}
            style={FIELD_STYLE}
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-3">
        <BrandButton className="h-10" onClick={handleToggle} disabled={query.isFetching}>
          {query.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : showPreview ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {showPreview ? 'Ocultar' : 'Consultar'}
        </BrandButton>
        <BrandButton
          className="h-10"
          variant="outline"
          onClick={() => handleExport('pdf')}
          disabled={exporting !== null}
        >
          <Download
            className={cn('h-4 w-4', exporting === 'pdf' && 'animate-pulse')}
          />
          Exportar PDF
        </BrandButton>
        <BrandButton
          className="h-10"
          variant="outline"
          onClick={() => handleExport('excel')}
          disabled={exporting !== null}
        >
          <FileSpreadsheet
            className={cn('h-4 w-4', exporting === 'excel' && 'animate-pulse')}
          />
          Exportar Excel
        </BrandButton>
        <span className="text-xs text-[#6B7280]">
          {COMPANIES.find((c) => c.id === companyId)?.name} ·{' '}
          {byCustomer ? 'por cliente' : 'por producto'} ·{' '}
          {from === to ? from || 'hoy' : `${from} a ${to}`}
        </span>
      </div>

      {/* Vista previa */}
      {showPreview && query.isError && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          {errorMessage(query.error)}
        </p>
      )}

      {showPreview && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile
              label={byCustomer ? 'Clientes' : 'Productos'}
              value={num(data.summary.totalRows)}
            />
            <SummaryTile label="Pedidos" value={num(data.summary.totalOrders)} />
            <SummaryTile
              label="Unidades"
              value={num(data.summary.totalUnits)}
            />
            <SummaryTile
              label="Ingresos"
              value={formatCurrency(data.summary.totalRevenue)}
              tone="ok"
            />
          </div>

          {/* Búsqueda local */}
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
            <input
              placeholder={
                byCustomer ? 'Buscar cliente…' : 'Buscar producto…'
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={DATE_INPUT}
            style={FIELD_STYLE}
            />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white">
            <table className="w-full text-sm">
              <thead className="bg-[#F4FAF6] text-left text-[11px] font-extrabold uppercase tracking-wider text-[#15803D]">
                <tr>
                  <th className="px-4 py-2 font-medium">
                    {byCustomer ? 'Código' : 'Referencia'}
                  </th>
                  <th className="px-4 py-2 font-medium">
                    {byCustomer ? 'Cliente' : 'Producto'}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    {byCustomer ? 'Pedidos' : 'UM'}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    {byCustomer ? 'Unidades' : 'Cantidad'}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-[#6B7280]"
                    >
                      {term
                        ? 'Sin resultados para la búsqueda.'
                        : 'Sin ventas en el rango seleccionado.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.reference}
                      className="border-t border-[#E2E8F0]/80 hover:bg-[#F4FAF6]"
                    >
                      <td className="px-4 py-2 font-mono text-xs">
                        {r.reference}
                      </td>
                      <td className="px-4 py-2">{r.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-[#6B7280]">
                        {byCustomer ? num(r.orders ?? 0) : r.unitOfMeasure ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {num(r.units)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">
                        {formatCurrency(r.revenue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Ranking de vendedores                                               */
/* ------------------------------------------------------------------ */

function SellerRankingReportBody() {
  const [companyId, setCompanyId] = useState(COMPANIES[0].id);
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());

  const [applied, setApplied] = useState<{
    companyId: string;
    from: string;
    to: string;
  } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [exporting, setExporting] = useState<null | 'pdf' | 'excel'>(null);
  const [error, setError] = useState('');

  const query = useSellerRankingReport(
    applied?.companyId,
    applied?.from,
    applied?.to,
    !!applied,
  );

  function handleToggle() {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    if (from && to && from > to) {
      setError('La fecha inicial no puede ser mayor que la final.');
      return;
    }
    setError('');
    setApplied({ companyId, from: from || todayStr(), to: to || todayStr() });
    setShowPreview(true);
  }

  async function handleExport(kind: 'pdf' | 'excel') {
    if (from && to && from > to) {
      setError('La fecha inicial no puede ser mayor que la final.');
      return;
    }
    setExporting(kind);
    setError('');
    try {
      if (kind === 'pdf') {
        await downloadSellerRankingReport(
          companyId,
          from || undefined,
          to || undefined,
        );
      } else {
        await downloadSellerRankingExcel(
          companyId,
          from || undefined,
          to || undefined,
        );
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(null);
    }
  }

  const data = query.data;

  return (
    <>
      <p className="flex items-start gap-2 rounded-2xl border border-[#1E9B50]/20 bg-[#1E9B50]/[0.06] p-3 text-sm text-[#166534]">
        <Trophy className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Lista los vendedores ordenados del{' '}
          <strong>que más vende al que menos</strong>, con sus pedidos, unidades
          e ingresos en el rango de fechas.
        </span>
      </p>

      {/* Compañía */}
      <div className="space-y-2">
        <label className="text-[13px] font-bold">Compañía</label>
        <div className="flex flex-wrap gap-2">
          {COMPANIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCompanyId(c.id)}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-bold transition-colors',
                companyId === c.id
                  ? 'border-[#1E9B50] bg-[#1E9B50] text-white'
                  : 'border-[#E2E8F0] bg-white text-[#4B5563] hover:bg-[#F4FAF6]',
              )}
            >
              <Building2 className="h-4 w-4" />
              {c.name}
              <span className="text-xs opacity-70">#{c.id}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Rango de fechas */}
      <div className="grid max-w-md gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-[13px] font-bold">Desde</label>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E9B50]" />
            <input
              type="date"
              value={from}
              max={to || todayStr()}
              onChange={(e) => setFrom(e.target.value)}
              className={DATE_INPUT}
            style={FIELD_STYLE}
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[13px] font-bold">Hasta</label>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E9B50]" />
            <input
              type="date"
              value={to}
              max={todayStr()}
              onChange={(e) => setTo(e.target.value)}
              className={DATE_INPUT}
            style={FIELD_STYLE}
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-3">
        <BrandButton className="h-10" onClick={handleToggle} disabled={query.isFetching}>
          {query.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : showPreview ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {showPreview ? 'Ocultar' : 'Consultar'}
        </BrandButton>
        <BrandButton
          className="h-10"
          variant="outline"
          onClick={() => handleExport('pdf')}
          disabled={exporting !== null}
        >
          <Download
            className={cn('h-4 w-4', exporting === 'pdf' && 'animate-pulse')}
          />
          Exportar PDF
        </BrandButton>
        <BrandButton
          className="h-10"
          variant="outline"
          onClick={() => handleExport('excel')}
          disabled={exporting !== null}
        >
          <FileSpreadsheet
            className={cn('h-4 w-4', exporting === 'excel' && 'animate-pulse')}
          />
          Exportar Excel
        </BrandButton>
        <span className="text-xs text-[#6B7280]">
          {COMPANIES.find((c) => c.id === companyId)?.name} ·{' '}
          {from === to ? from || 'hoy' : `${from} a ${to}`}
        </span>
      </div>

      {/* Vista previa */}
      {showPreview && query.isError && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          {errorMessage(query.error)}
        </p>
      )}

      {showPreview && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile
              label="Vendedores"
              value={num(data.summary.totalSellers)}
            />
            <SummaryTile label="Pedidos" value={num(data.summary.totalOrders)} />
            <SummaryTile
              label="Unidades"
              value={num(data.summary.totalUnits)}
            />
            <SummaryTile
              label="Ingresos"
              value={formatCurrency(data.summary.totalRevenue)}
              tone="ok"
            />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white">
            <table className="w-full text-sm">
              <thead className="bg-[#F4FAF6] text-left text-[11px] font-extrabold uppercase tracking-wider text-[#15803D]">
                <tr>
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">Vendedor</th>
                  <th className="px-4 py-2 font-medium">Cédula</th>
                  <th className="px-4 py-2 font-medium">Código</th>
                  <th className="px-4 py-2 text-right font-medium">Pedidos</th>
                  <th className="px-4 py-2 text-right font-medium">Unidades</th>
                  <th className="px-4 py-2 text-right font-medium">Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-[#6B7280]"
                    >
                      Sin ventas en el rango seleccionado.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((r) => (
                    <tr
                      key={`${r.position}-${r.name}`}
                      className="border-t border-[#E2E8F0]/80 hover:bg-[#F4FAF6]"
                    >
                      <td className="px-4 py-2 font-semibold tabular-nums">
                        {r.position <= 3 ? (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1',
                              r.position === 1 && 'text-amber-500',
                              r.position === 2 && 'text-slate-400',
                              r.position === 3 && 'text-orange-700 dark:text-orange-500',
                            )}
                          >
                            <Crown className="h-4 w-4 fill-current" />
                            {r.position}
                          </span>
                        ) : (
                          r.position
                        )}
                      </td>
                      <td className="px-4 py-2">{r.name}</td>
                      <td className="px-4 py-2 font-mono text-xs text-[#6B7280]">
                        {r.documentId ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-[#6B7280]">
                        {r.sellerCode ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {num(r.orders)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {num(r.units)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">
                        {formatCurrency(r.revenue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Ventas por vendedor y producto                                      */
/* ------------------------------------------------------------------ */

function SellerProductReportBody() {
  const [companyId, setCompanyId] = useState(COMPANIES[0].id);
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [sellerId, setSellerId] = useState('');
  const [sku, setSku] = useState('');

  const [applied, setApplied] = useState<{
    companyId: string;
    from: string;
    to: string;
    sellerId: string;
    sku: string;
  } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [exporting, setExporting] = useState<null | 'pdf' | 'excel'>(null);
  const [error, setError] = useState('');

  const query = useSellerProductReport(
    applied?.companyId,
    applied?.from,
    applied?.to,
    applied?.sellerId || undefined,
    applied?.sku || undefined,
    !!applied,
  );

  function handleToggle() {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    if (from && to && from > to) {
      setError('La fecha inicial no puede ser mayor que la final.');
      return;
    }
    setError('');
    setApplied({
      companyId,
      from: from || todayStr(),
      to: to || todayStr(),
      sellerId,
      sku,
    });
    setShowPreview(true);
  }

  async function handleExport(kind: 'pdf' | 'excel') {
    if (from && to && from > to) {
      setError('La fecha inicial no puede ser mayor que la final.');
      return;
    }
    setExporting(kind);
    setError('');
    try {
      const args = [
        companyId,
        from || undefined,
        to || undefined,
        sellerId || undefined,
        sku || undefined,
      ] as const;
      if (kind === 'pdf') {
        await downloadSellerProductReport(...args);
      } else {
        await downloadSellerProductExcel(...args);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(null);
    }
  }

  const data = query.data;
  // Vendedores y productos disponibles: los de la última consulta.
  const sellers = data?.sellers ?? [];
  const products = data?.products ?? [];

  return (
    <>
      <p className="flex items-start gap-2 rounded-2xl border border-[#1E9B50]/20 bg-[#1E9B50]/[0.06] p-3 text-sm text-[#166534]">
        <UserSearch className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Consulta <strong>cuánto vendió un vendedor de un producto</strong> en
          el rango. Elige <strong>todos</strong> o un vendedor/producto concreto
          de las listas.
        </span>
      </p>

      {/* Compañía */}
      <div className="space-y-2">
        <label className="text-[13px] font-bold">Compañía</label>
        <div className="flex flex-wrap gap-2">
          {COMPANIES.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setCompanyId(c.id);
                setSellerId('');
                setSku('');
              }}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-bold transition-colors',
                companyId === c.id
                  ? 'border-[#1E9B50] bg-[#1E9B50] text-white'
                  : 'border-[#E2E8F0] bg-white text-[#4B5563] hover:bg-[#F4FAF6]',
              )}
            >
              <Building2 className="h-4 w-4" />
              {c.name}
              <span className="text-xs opacity-70">#{c.id}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Rango de fechas */}
      <div className="grid max-w-md gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-[13px] font-bold">Desde</label>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E9B50]" />
            <input
              type="date"
              value={from}
              max={to || todayStr()}
              onChange={(e) => setFrom(e.target.value)}
              className={DATE_INPUT}
            style={FIELD_STYLE}
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[13px] font-bold">Hasta</label>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E9B50]" />
            <input
              type="date"
              value={to}
              max={todayStr()}
              onChange={(e) => setTo(e.target.value)}
              className={DATE_INPUT}
            style={FIELD_STYLE}
            />
          </div>
        </div>
      </div>

      {/* Filtros vendedor / producto */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-[13px] font-bold">Vendedor</label>
          <select
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
            className={SELECT_INPUT}
            style={FIELD_STYLE}
          >
            <option value="">Todos los vendedores</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {sellers.length === 0 && (
            <p className="text-xs text-[#6B7280]">
              Consulta una vez para cargar la lista de vendedores con ventas.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-[13px] font-bold">Producto</label>
          <select
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className={SELECT_INPUT}
            style={FIELD_STYLE}
          >
            <option value="">Todos los productos</option>
            {products.map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
          {products.length === 0 && (
            <p className="text-xs text-[#6B7280]">
              Consulta una vez para cargar la lista de productos con ventas.
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-3">
        <BrandButton className="h-10" onClick={handleToggle} disabled={query.isFetching}>
          {query.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : showPreview ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {showPreview ? 'Ocultar' : 'Consultar'}
        </BrandButton>
        <BrandButton
          className="h-10"
          variant="outline"
          onClick={() => handleExport('pdf')}
          disabled={exporting !== null}
        >
          <Download
            className={cn('h-4 w-4', exporting === 'pdf' && 'animate-pulse')}
          />
          Exportar PDF
        </BrandButton>
        <BrandButton
          className="h-10"
          variant="outline"
          onClick={() => handleExport('excel')}
          disabled={exporting !== null}
        >
          <FileSpreadsheet
            className={cn('h-4 w-4', exporting === 'excel' && 'animate-pulse')}
          />
          Exportar Excel
        </BrandButton>
        <span className="text-xs text-[#6B7280]">
          {COMPANIES.find((c) => c.id === companyId)?.name} ·{' '}
          {from === to ? from || 'hoy' : `${from} a ${to}`}
        </span>
      </div>

      {/* Vista previa */}
      {showPreview && query.isError && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          {errorMessage(query.error)}
        </p>
      )}

      {showPreview && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <SummaryTile label="Líneas" value={num(data.summary.totalRows)} />
            <SummaryTile
              label="Unidades"
              value={num(data.summary.totalQuantity)}
            />
            <SummaryTile
              label="Ingresos"
              value={formatCurrency(data.summary.totalRevenue)}
              tone="ok"
            />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white">
            <table className="w-full text-sm">
              <thead className="bg-[#F4FAF6] text-left text-[11px] font-extrabold uppercase tracking-wider text-[#15803D]">
                <tr>
                  <th className="px-4 py-2 font-medium">Vendedor</th>
                  <th className="px-4 py-2 font-medium">Referencia</th>
                  <th className="px-4 py-2 font-medium">Producto</th>
                  <th className="px-4 py-2 text-right font-medium">Cantidad</th>
                  <th className="px-4 py-2 text-right font-medium">Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-[#6B7280]"
                    >
                      Sin ventas con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((r) => (
                    <tr
                      key={`${r.sellerId}-${r.sku}`}
                      className="border-t border-[#E2E8F0]/80 hover:bg-[#F4FAF6]"
                    >
                      <td className="px-4 py-2">{r.sellerName}</td>
                      <td className="px-4 py-2 font-mono text-xs">{r.sku}</td>
                      <td className="px-4 py-2">{r.productName}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {num(r.quantity)}
                        {r.unitOfMeasure ? (
                          <span className="ml-1 text-xs text-[#6B7280]">
                            {r.unitOfMeasure}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">
                        {formatCurrency(r.revenue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Reporte: mejor vendedor por producto                                */
/* ------------------------------------------------------------------ */
function ProductSellerReportBody() {
  const [companyId, setCompanyId] = useState(COMPANIES[0].id);
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [sku, setSku] = useState('');

  const [applied, setApplied] = useState<{
    companyId: string;
    from: string;
    to: string;
    sku: string;
  } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [exporting, setExporting] = useState<null | 'pdf' | 'excel'>(null);
  const [error, setError] = useState('');

  const query = useProductSellerReport(
    applied?.companyId,
    applied?.from,
    applied?.to,
    applied?.sku || undefined,
    !!applied,
  );

  function handleToggle() {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    if (from && to && from > to) {
      setError('La fecha inicial no puede ser mayor que la final.');
      return;
    }
    setError('');
    setApplied({
      companyId,
      from: from || todayStr(),
      to: to || todayStr(),
      sku,
    });
    setShowPreview(true);
  }

  async function handleExport(kind: 'pdf' | 'excel') {
    if (from && to && from > to) {
      setError('La fecha inicial no puede ser mayor que la final.');
      return;
    }
    setExporting(kind);
    setError('');
    try {
      const args = [
        companyId,
        from || undefined,
        to || undefined,
        sku || undefined,
      ] as const;
      if (kind === 'pdf') {
        await downloadProductSellerReport(...args);
      } else {
        await downloadProductSellerExcel(...args);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(null);
    }
  }

  const data = query.data;
  // Productos disponibles: los de la última consulta (con ventas en el rango).
  const products = data?.products ?? [];

  return (
    <>
      <p className="flex items-start gap-2 rounded-2xl border border-[#1E9B50]/20 bg-[#1E9B50]/[0.06] p-3 text-sm text-[#166534]">
        <Crown className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Por cada producto verás el <strong>ranking de vendedores</strong>{' '}
          ordenado por unidades: el <strong>#1</strong> es quien más lo vendió.
          Consulta todos o filtra un producto concreto.
        </span>
      </p>

      {/* Compañía */}
      <div className="space-y-2">
        <label className="text-[13px] font-bold">Compañía</label>
        <div className="flex flex-wrap gap-2">
          {COMPANIES.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setCompanyId(c.id);
                setSku('');
              }}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-bold transition-colors',
                companyId === c.id
                  ? 'border-[#1E9B50] bg-[#1E9B50] text-white'
                  : 'border-[#E2E8F0] bg-white text-[#4B5563] hover:bg-[#F4FAF6]',
              )}
            >
              <Building2 className="h-4 w-4" />
              {c.name}
              <span className="text-xs opacity-70">#{c.id}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Rango de fechas */}
      <div className="grid max-w-md gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-[13px] font-bold">Desde</label>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E9B50]" />
            <input
              type="date"
              value={from}
              max={to || todayStr()}
              onChange={(e) => setFrom(e.target.value)}
              className={DATE_INPUT}
            style={FIELD_STYLE}
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[13px] font-bold">Hasta</label>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E9B50]" />
            <input
              type="date"
              value={to}
              max={todayStr()}
              onChange={(e) => setTo(e.target.value)}
              className={DATE_INPUT}
            style={FIELD_STYLE}
            />
          </div>
        </div>
      </div>

      {/* Filtro de producto */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-[13px] font-bold">Producto</label>
          <select
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className={SELECT_INPUT}
            style={FIELD_STYLE}
          >
            <option value="">Todos los productos</option>
            {products.map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
          {products.length === 0 && (
            <p className="text-xs text-[#6B7280]">
              Consulta una vez para cargar la lista de productos con ventas.
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-3">
        <BrandButton className="h-10" onClick={handleToggle} disabled={query.isFetching}>
          {query.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : showPreview ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {showPreview ? 'Ocultar' : 'Consultar'}
        </BrandButton>
        <BrandButton
          className="h-10"
          variant="outline"
          onClick={() => handleExport('pdf')}
          disabled={exporting !== null}
        >
          <Download
            className={cn('h-4 w-4', exporting === 'pdf' && 'animate-pulse')}
          />
          Exportar PDF
        </BrandButton>
        <BrandButton
          className="h-10"
          variant="outline"
          onClick={() => handleExport('excel')}
          disabled={exporting !== null}
        >
          <FileSpreadsheet
            className={cn('h-4 w-4', exporting === 'excel' && 'animate-pulse')}
          />
          Exportar Excel
        </BrandButton>
        <span className="text-xs text-[#6B7280]">
          {COMPANIES.find((c) => c.id === companyId)?.name} ·{' '}
          {from === to ? from || 'hoy' : `${from} a ${to}`}
        </span>
      </div>

      {/* Vista previa */}
      {showPreview && query.isError && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          {errorMessage(query.error)}
        </p>
      )}

      {showPreview && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <SummaryTile
              label="Productos"
              value={num(data.summary.totalProducts)}
            />
            <SummaryTile
              label="Unidades"
              value={num(data.summary.totalQuantity)}
            />
            <SummaryTile
              label="Ingresos"
              value={formatCurrency(data.summary.totalRevenue)}
              tone="ok"
            />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white">
            <table className="w-full text-sm">
              <thead className="bg-[#F4FAF6] text-left text-[11px] font-extrabold uppercase tracking-wider text-[#15803D]">
                <tr>
                  <th className="px-4 py-2 font-medium">Producto</th>
                  <th className="px-4 py-2 text-right font-medium">#</th>
                  <th className="px-4 py-2 font-medium">Vendedor</th>
                  <th className="px-4 py-2 text-right font-medium">Cantidad</th>
                  <th className="px-4 py-2 text-right font-medium">Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-[#6B7280]"
                    >
                      Sin ventas con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((r, idx) => {
                    const prev = data.rows[idx - 1];
                    const firstOfProduct = !prev || prev.sku !== r.sku;
                    return (
                      <tr
                        key={`${r.sku}-${r.sellerId}`}
                        className={cn(
                          'border-t border-[#E2E8F0]/80 hover:bg-[#F4FAF6]',
                          firstOfProduct && 'border-t-2 border-[#E2E8F0]',
                        )}
                      >
                        <td className="px-4 py-2">
                          {firstOfProduct ? (
                            <span>
                              <span className="font-medium">
                                {r.productName}
                              </span>{' '}
                              <span className="font-mono text-xs text-[#6B7280]">
                                {r.sku}
                              </span>
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {r.isTop ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                              <Crown className="h-3.5 w-3.5" />
                              {r.position}
                            </span>
                          ) : (
                            <span className="text-[#6B7280]">
                              {r.position}
                            </span>
                          )}
                        </td>
                        <td
                          className={cn(
                            'px-4 py-2',
                            r.isTop && 'font-medium',
                          )}
                        >
                          {r.sellerName}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {num(r.quantity)}
                          {r.unitOfMeasure ? (
                            <span className="ml-1 text-xs text-[#6B7280]">
                              {r.unitOfMeasure}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">
                          {formatCurrency(r.revenue)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/** Tarjeta pequeña de resumen (KPI) usada en las vistas previas. */
function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn';
}) {
  return (
    <div
      className="rounded-2xl bg-white p-3.5"
      style={{
        border: `1px solid ${tone === 'ok' ? '#86EFAC' : tone === 'warn' ? '#FCD34D' : BRAND.border}`,
      }}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: BRAND.textSoft }}>
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 truncate text-lg font-extrabold tracking-[-0.3px] tabular-nums',
          tone === 'ok' && 'text-emerald-600',
          tone === 'warn' && 'text-amber-600',
        )}
      >
        {value}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ventas por vendedor (mensual)                                       */
/* ------------------------------------------------------------------ */

/** Mes actual en formato YYYY-MM (hora local). */
function currentMonthStr(): string {
  return todayStr().slice(0, 7);
}

/** Formatea un porcentaje o "—" si es nulo. */
function pctText(value: number | null): string {
  if (value == null) return '—';
  return `${value.toFixed(2)}%`;
}

function SellerSalesReportBody() {
  const [companyId, setCompanyId] = useState(COMPANIES[0].id);
  const [monthStr, setMonthStr] = useState(currentMonthStr());

  const [applied, setApplied] = useState<{
    companyId: string;
    month: number;
    year: number;
  } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [exporting, setExporting] = useState<null | 'pdf' | 'excel'>(null);
  const [error, setError] = useState('');

  const query = useSellerSalesReport(
    applied?.companyId,
    applied?.month,
    applied?.year,
    !!applied,
  );

  function parseMonth(): { month: number; year: number } {
    const [y, m] = monthStr.split('-').map(Number);
    return { month: m || 1, year: y || new Date().getFullYear() };
  }

  function handleToggle() {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    setError('');
    const { month, year } = parseMonth();
    setApplied({ companyId, month, year });
    setShowPreview(true);
  }

  async function handleExport(kind: 'pdf' | 'excel') {
    setExporting(kind);
    setError('');
    try {
      const { month, year } = parseMonth();
      if (kind === 'pdf') {
        await downloadSellerSalesReport(companyId, month, year);
      } else {
        await downloadSellerSalesExcel(companyId, month, year);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(null);
    }
  }

  const data = query.data;

  return (
    <>
      <p className="flex items-start gap-2 rounded-2xl border border-[#1E9B50]/20 bg-[#1E9B50]/[0.06] p-3 text-sm text-[#166534]">
        <BarChart3 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Por cada vendedor: <strong>presupuesto vs. ventas y kilos</strong>,
          cumplimiento y valor promedio por kilo del mes anterior y del actual.
          La venta esperada es el presupuesto en pesos prorrateado a la fecha.
        </span>
      </p>

      {/* Compañía */}
      <div className="space-y-2">
        <label className="text-[13px] font-bold">Compañía</label>
        <div className="flex flex-wrap gap-2">
          {COMPANIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCompanyId(c.id)}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-bold transition-colors',
                companyId === c.id
                  ? 'border-[#1E9B50] bg-[#1E9B50] text-white'
                  : 'border-[#E2E8F0] bg-white text-[#4B5563] hover:bg-[#F4FAF6]',
              )}
            >
              <Building2 className="h-4 w-4" />
              {c.name}
              <span className="text-xs opacity-70">#{c.id}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mes */}
      <div className="max-w-xs space-y-2">
        <label className="text-[13px] font-bold">Mes</label>
        <div className="relative">
          <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E9B50]" />
          <input
            type="month"
            value={monthStr}
            max={currentMonthStr()}
            onChange={(e) => setMonthStr(e.target.value || currentMonthStr())}
            className={DATE_INPUT}
            style={FIELD_STYLE}
          />
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-3">
        <BrandButton className="h-10" onClick={handleToggle} disabled={query.isFetching}>
          {query.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : showPreview ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {showPreview ? 'Ocultar' : 'Consultar'}
        </BrandButton>
        <BrandButton
          className="h-10"
          variant="outline"
          onClick={() => handleExport('pdf')}
          disabled={exporting !== null}
        >
          <Download
            className={cn('h-4 w-4', exporting === 'pdf' && 'animate-pulse')}
          />
          Exportar PDF
        </BrandButton>
        <BrandButton
          className="h-10"
          variant="outline"
          onClick={() => handleExport('excel')}
          disabled={exporting !== null}
        >
          <FileSpreadsheet
            className={cn('h-4 w-4', exporting === 'excel' && 'animate-pulse')}
          />
          Exportar Excel
        </BrandButton>
      </div>

      {showPreview && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile
              label="Kilos vendidos"
              value={num(data.totals.kilosSold)}
            />
            <SummaryTile
              label="Venta acumulada"
              value={formatCurrency(data.totals.revenue)}
              tone="ok"
            />
            <SummaryTile
              label="% Cump. pesos"
              value={pctText(data.totals.revenuePct)}
            />
            <SummaryTile
              label="% Ideal a la fecha"
              value={`${data.idealPct.toFixed(2)}%`}
            />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0] bg-white">
            <table className="w-full text-sm">
              <thead className="bg-[#F4FAF6] text-left text-[11px] font-extrabold uppercase tracking-wider text-[#15803D]">
                <tr>
                  <th className="px-3 py-2 font-medium">Vendedor</th>
                  <th className="px-3 py-2 text-right font-medium">
                    V. Kilo {data.prevMonthLabel}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Ppto Kilo</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Kilos vend.
                  </th>
                  <th className="px-3 py-2 text-right font-medium">% Cump.</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Venta acum.
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Venta esp.
                  </th>
                  <th className="px-3 py-2 text-right font-medium">% Cump.</th>
                  <th className="px-3 py-2 text-right font-medium">
                    V. Kilo mes
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-8 text-center text-[#6B7280]"
                    >
                      No hay vendedores con datos para este mes.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((r) => (
                    <tr key={r.sellerCode + r.name} className="border-t border-[#E2E8F0]">
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(r.avgKiloPrev)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {num(r.budgetKilos)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {num(r.kilosSold)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {pctText(r.kilosPct)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(r.revenue)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(r.expectedRevenue)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {pctText(r.revenuePct)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(r.avgKiloCur)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {data.rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-[#E2E8F0] bg-[#F4FAF6] font-semibold">
                    <td className="px-3 py-2">TOTAL</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(data.totals.avgKiloPrev)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {num(data.totals.budgetKilos)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {num(data.totals.kilosSold)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {pctText(data.totals.kilosPct)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(data.totals.revenue)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(data.totals.expectedRevenue)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {pctText(data.totals.revenuePct)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(data.totals.avgKiloCur)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Ventas acumuladas por vendedor por producto (ERP, mensual)          */
/* ------------------------------------------------------------------ */

function VendorProductSalesReportBody() {
  const [monthStr, setMonthStr] = useState(currentMonthStr());
  // Día opcional (YYYY-MM-DD). Si está vacío se muestra el mes completo.
  const [dayStr, setDayStr] = useState('');
  const [applied, setApplied] = useState<{
    periodo: string;
    fecha?: string;
  } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [exporting, setExporting] = useState<null | 'pdf' | 'excel'>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Si hay día, el período se deriva de ese día; si no, del selector de mes.
  const periodo = dayStr
    ? dayStr.slice(0, 4) + dayStr.slice(5, 7)
    : monthStr.replace('-', '');
  const fecha = dayStr || undefined;
  const query = useVendorProductSalesReport(
    applied?.periodo,
    applied?.fecha,
    !!applied,
  );

  function handleToggle() {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    setError('');
    setApplied({ periodo, fecha });
    setShowPreview(true);
  }

  async function handleExport(kind: 'pdf' | 'excel') {
    setExporting(kind);
    setError('');
    try {
      if (kind === 'pdf') {
        await downloadVendorProductSalesReport(periodo, fecha);
      } else {
        await downloadVendorProductSalesExcel(periodo, fecha);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(null);
    }
  }

  function toggleSeller(nit: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nit)) next.delete(nit);
      else next.add(nit);
      return next;
    });
  }

  const data = query.data;

  return (
    <>
      <p className="flex items-start gap-2 rounded-2xl border border-[#1E9B50]/20 bg-[#1E9B50]/[0.06] p-3 text-sm text-[#166534]">
        <UserSearch className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Ventas del mes tomadas del ERP (cortes, subproductos y canales).
          Por cada vendedor se muestra el <strong>desglose de productos</strong>{' '}
          con cantidad y <strong>venta neta</strong>, más los totales.
        </span>
      </p>

      {/* Mes y día */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <label className="text-[13px] font-bold">Mes (período)</label>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E9B50]" />
            <input
              type="month"
              value={monthStr}
              max={currentMonthStr()}
              disabled={!!dayStr}
              onChange={(e) => setMonthStr(e.target.value || currentMonthStr())}
              className={DATE_INPUT}
            style={FIELD_STYLE}
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[13px] font-bold">Día (opcional)</label>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E9B50]" />
            <input
              type="date"
              value={dayStr}
              max={todayStr()}
              onChange={(e) => setDayStr(e.target.value)}
              className={DATE_INPUT}
            style={FIELD_STYLE}
            />
          </div>
        </div>
        {dayStr && (
          <BrandButton variant="outlined" className="h-10" onClick={() => setDayStr('')}>
            <X className="h-4 w-4" />
            Ver mes completo
          </BrandButton>
        )}
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-3">
        <BrandButton className="h-10" onClick={handleToggle} disabled={query.isFetching}>
          {query.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : showPreview ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {showPreview ? 'Ocultar' : 'Consultar'}
        </BrandButton>
        <BrandButton
          className="h-10"
          variant="outline"
          onClick={() => handleExport('pdf')}
          disabled={exporting !== null}
        >
          <Download
            className={cn('h-4 w-4', exporting === 'pdf' && 'animate-pulse')}
          />
          Exportar PDF
        </BrandButton>
        <BrandButton
          className="h-10"
          variant="outline"
          onClick={() => handleExport('excel')}
          disabled={exporting !== null}
        >
          <FileSpreadsheet
            className={cn('h-4 w-4', exporting === 'excel' && 'animate-pulse')}
          />
          Exportar Excel
        </BrandButton>
      </div>

      {showPreview && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SummaryTile label="Vendedores" value={num(data.sellers.length)} />
            <SummaryTile
              label="Cantidad total"
              value={num(data.grandTotalQuantity)}
            />
            <SummaryTile
              label="Venta acumulada"
              value={formatCurrency(data.grandTotalNet)}
              tone="ok"
            />
          </div>

          {data.sellers.length === 0 ? (
            <p className="rounded-lg border border-[#E2E8F0] px-3 py-8 text-center text-[#6B7280]">
              No hay ventas registradas para este período.
            </p>
          ) : (
            <div className="space-y-2">
              {data.sellers.map((seller) => {
                const isOpen = expanded.has(seller.nit);
                return (
                  <div
                    key={seller.nit}
                    className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white"
                  >
                    <button
                      onClick={() => toggleSeller(seller.nit)}
                      className="flex w-full items-center gap-3 bg-[#F4FAF6] px-3 py-2 text-left transition-colors hover:bg-[#EEF2F7]/60"
                    >
                      <ChevronRight
                        className={cn(
                          'h-4 w-4 shrink-0 text-[#6B7280] transition-transform',
                          isOpen && 'rotate-90',
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {seller.name}
                        </span>
                        <span className="block text-xs text-[#6B7280]">
                          NIT {seller.nit} · {seller.products.length} productos ·{' '}
                          {num(seller.totalQuantity)} und
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {formatCurrency(seller.totalNet)}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[#EEF2F7]/20 text-left text-xs uppercase tracking-wide text-[#6B7280]">
                            <tr>
                              <th className="px-3 py-2 font-medium">Ref.</th>
                              <th className="px-3 py-2 font-medium">Producto</th>
                              <th className="px-3 py-2 text-right font-medium">
                                Cantidad
                              </th>
                              <th className="px-3 py-2 text-right font-medium">
                                Venta neta
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {seller.products.map((p) => (
                              <tr
                                key={p.referencia}
                                className="border-t border-[#E2E8F0]"
                              >
                                <td className="px-3 py-2 text-[#6B7280]">
                                  {p.referencia}
                                </td>
                                <td className="px-3 py-2">{p.descripcion}</td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {num(p.quantity)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {formatCurrency(p.net)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
