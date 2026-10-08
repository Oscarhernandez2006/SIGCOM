import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  Calendar,
  Download,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import {
  downloadSellerSalesReport,
  downloadSellerSalesExcel,
  useSellerSalesReport,
} from '@/hooks/useAdminApi';
import { COMPANIES } from '@/lib/companies';
import { cn, formatCurrency } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function todayStr(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function currentMonthStr(): string {
  return todayStr().slice(0, 7);
}

function num(value: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(value);
}

function pctText(value: number | null): string {
  if (value == null) return '—';
  return `${value.toFixed(2)}%`;
}

function errorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const msg = err.response?.data?.message;
    return (Array.isArray(msg) ? msg.join(', ') : msg) || 'No se pudo generar el reporte.';
  }
  return 'No se pudo generar el reporte.';
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <p
        className={cn(
          'text-base font-bold tracking-tight',
          tone === 'ok' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'warn' && 'text-amber-600 dark:text-amber-400',
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

export function VentasPorVendedorPage() {
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState(COMPANIES[0].id);
  const [monthStr, setMonthStr] = useState(currentMonthStr());
  const [exporting, setExporting] = useState<null | 'pdf' | 'excel'>(null);
  const [exportError, setExportError] = useState('');

  function parseMonth(): { month: number; year: number } {
    const [y, m] = monthStr.split('-').map(Number);
    return { month: m || 1, year: y || new Date().getFullYear() };
  }

  const { month, year } = parseMonth();

  // Auto-fetch: siempre enabled; se refresca al cambiar compañía o mes
  const query = useSellerSalesReport(companyId, month, year, true);
  const data = query.data;

  async function handleExport(kind: 'pdf' | 'excel') {
    setExporting(kind);
    setExportError('');
    try {
      if (kind === 'pdf') {
        await downloadSellerSalesReport(companyId, month, year);
      } else {
        await downloadSellerSalesExcel(companyId, month, year);
      }
    } catch (err) {
      setExportError(errorMessage(err));
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/reportes')}>
          <ArrowLeft className="h-4 w-4" />
          Reportes
        </Button>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Ventas por vendedor (mensual)</h2>
            <p className="text-sm text-muted-foreground">
              Presupuesto vs. ventas y kilos por vendedor, con cumplimiento y valor promedio por kilo.
            </p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="space-y-5 p-5">
          {/* Compañía */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Compañía</label>
            <div className="flex flex-wrap gap-2">
              {COMPANIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCompanyId(c.id)}
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

          {/* Mes */}
          <div className="max-w-xs space-y-2">
            <label className="text-sm font-medium">Mes</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="month"
                value={monthStr}
                max={currentMonthStr()}
                onChange={(e) => setMonthStr(e.target.value || currentMonthStr())}
                className="pl-9"
              />
            </div>
          </div>

          {/* Exportar */}
          <div className="flex flex-wrap items-center gap-3">
            {query.isFetching && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando...
              </span>
            )}
            <Button
              variant="outline"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} />
              Actualizar
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport('pdf')}
              disabled={exporting !== null || query.isFetching}
            >
              <Download className={cn('h-4 w-4', exporting === 'pdf' && 'animate-pulse')} />
              Exportar PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport('excel')}
              disabled={exporting !== null || query.isFetching}
            >
              <FileSpreadsheet className={cn('h-4 w-4', exporting === 'excel' && 'animate-pulse')} />
              Exportar Excel
            </Button>
          </div>

          {exportError && (
            <p className="flex items-center gap-1 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {exportError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Resultados */}
      {query.isError && (
        <p className="flex items-center gap-1 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {errorMessage(query.error)}
        </p>
      )}

      {query.isLoading && (
        <Card>
          <CardContent className="animate-pulse space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-muted" />
              ))}
            </div>
            <div className="h-48 rounded-lg bg-muted" />
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile label="Kilos vendidos" value={num(data.totals.kilosSold)} />
            <SummaryTile label="Venta acumulada" value={formatCurrency(data.totals.revenue)} tone="ok" />
            <SummaryTile label="% Cump. pesos" value={pctText(data.totals.revenuePct)} />
            <SummaryTile label="% Ideal a la fecha" value={`${data.idealPct.toFixed(2)}%`} />
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Vendedor</th>
                  <th className="px-3 py-2 text-right font-medium">V. Kilo {data.prevMonthLabel}</th>
                  <th className="px-3 py-2 text-right font-medium">Ppto Kilo</th>
                  <th className="px-3 py-2 text-right font-medium">Kilos vend.</th>
                  <th className="px-3 py-2 text-right font-medium">% Cump.</th>
                  <th className="px-3 py-2 text-right font-medium">Venta acum.</th>
                  <th className="px-3 py-2 text-right font-medium">Venta esp.</th>
                  <th className="px-3 py-2 text-right font-medium">% Cump.</th>
                  <th className="px-3 py-2 text-right font-medium">V. Kilo mes</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                      No hay vendedores con datos para este mes.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((r) => (
                    <tr key={r.sellerCode + r.name} className="border-t border-border">
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.avgKiloPrev)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(r.budgetKilos)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(r.kilosSold)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pctText(r.kilosPct)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.revenue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.expectedRevenue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pctText(r.revenuePct)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.avgKiloCur)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {data.rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                    <td className="px-3 py-2">TOTAL</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(data.totals.avgKiloPrev)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(data.totals.budgetKilos)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(data.totals.kilosSold)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pctText(data.totals.kilosPct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(data.totals.revenue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(data.totals.expectedRevenue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pctText(data.totals.revenuePct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(data.totals.avgKiloCur)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
