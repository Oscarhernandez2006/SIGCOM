import { useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  Plus,
  Pencil,
  Trash2,
  X,
  RefreshCw,
  AlertCircle,
  Search,
  Scale,
  Gift,
  Boxes,
  TrendingDown,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import {
  useBajas,
  useCreateBaja,
  useUpdateBaja,
  useDeleteBaja,
} from '@/hooks/useApi';
import { cn, formatCurrency } from '@/lib/utils';
import type { Baja } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Columnas tal cual la hoja "DATOS" del Excel de bajas. */
const COLUMNS = [
  'Mes', 'Fecha', 'Cód.', 'Producto', 'Tipo de documento', 'Número',
  'Kilos', 'Costo unitario', 'Costo', 'Pérdida', 'Causal',
];

/** Valores permitidos para "Tipo de documento" (coinciden con el Excel). */
const TIPOS_DOCUMENTO = ['PROCESO ENS', 'SALIDA MERCANCIA'];

interface Draft {
  mes: string;
  fecha: string;
  cod: string;
  producto: string;
  tipoDocumento: string;
  numero: string;
  kilos: string;
  costoUnitario: string;
  costo: string;
  perdida: string;
  causal: string;
}

const emptyDraft: Draft = {
  mes: '',
  fecha: '',
  cod: '',
  producto: '',
  tipoDocumento: '',
  numero: '',
  kilos: '',
  costoUnitario: '',
  costo: '',
  perdida: '',
  causal: '',
};

function draftFromBaja(b: Baja): Draft {
  return {
    mes: String(b.mes),
    fecha: b.fecha.slice(0, 10),
    cod: b.cod,
    producto: b.producto,
    tipoDocumento: b.tipoDocumento,
    numero: b.numero,
    kilos: String(b.kilos),
    costoUnitario: String(b.costoUnitario),
    costo: String(b.costo),
    perdida: b.perdida != null ? String(b.perdida) : '',
    causal: b.causal ?? '',
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const msg = error.response?.data?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return fallback;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Módulo "Informe de bajas" (Despachos): réplica de la hoja DATOS del Excel
 * de bajas/mermas, para digitar manualmente los registros desde la app.
 * Nota: el módulo solo implementa la lógica y el diseño; los datos se
 * digitan desde aquí, no se precargan desde el Excel.
 */
export function InformeBajasPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(0); // 0 = todos los meses
  const [search, setSearch] = useState('');

  const { data: bajas = [], isLoading, isFetching, refetch } = useBajas(
    year,
    month || undefined,
  );
  const createMutation = useCreateBaja();
  const updateMutation = useUpdateBaja();
  const deleteMutation = useDeleteBaja();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [costoTouched, setCostoTouched] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Baja | null>(null);

  const filteredBajas = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return bajas;
    return bajas.filter((b) =>
      [b.cod, b.producto, b.tipoDocumento, b.numero, b.causal ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [bajas, search]);

  const totals = useMemo(() => {
    return filteredBajas.reduce(
      (acc, b) => ({
        kilos: acc.kilos + Number(b.kilos),
        costo: acc.costo + Number(b.costo),
      }),
      { kilos: 0, costo: 0 },
    );
  }, [filteredBajas]);

  // Métricas del dashboard, recalculadas sobre los registros ya filtrados
  // (año/mes/búsqueda) para que reflejen siempre lo que se ve en la tabla.
  const dashboard = useMemo(() => {
    let donationKilos = 0;
    let donationCosto = 0;
    let donationCount = 0;
    let otherKilos = 0;
    let otherCosto = 0;
    const byTipoDoc = new Map<string, { kilos: number; costo: number; n: number }>();
    const byMonth = new Map<number, number>();
    const byProducto = new Map<string, number>();

    for (const b of filteredBajas) {
      const kilos = Number(b.kilos);
      const costo = Number(b.costo);
      const isDonacion = (b.causal ?? '').toUpperCase().includes('DONACION');
      if (isDonacion) {
        donationKilos += kilos;
        donationCosto += costo;
        donationCount += 1;
      } else {
        otherKilos += kilos;
        otherCosto += costo;
      }

      const doc = byTipoDoc.get(b.tipoDocumento) ?? { kilos: 0, costo: 0, n: 0 };
      doc.kilos += kilos;
      doc.costo += costo;
      doc.n += 1;
      byTipoDoc.set(b.tipoDocumento, doc);

      byMonth.set(b.mes, (byMonth.get(b.mes) ?? 0) + kilos);
      byProducto.set(b.producto, (byProducto.get(b.producto) ?? 0) + kilos);
    }

    const topProductos = [...byProducto.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const maxProductoKilos = topProductos[0]?.[1] ?? 0;

    const mesesConDatos = [...byMonth.entries()].sort((a, b) => a[0] - b[0]);
    const maxMesKilos = Math.max(1, ...mesesConDatos.map(([, k]) => k));

    return {
      donationKilos,
      donationCosto,
      donationCount,
      otherKilos,
      otherCosto,
      byTipoDoc: [...byTipoDoc.entries()],
      mesesConDatos,
      maxMesKilos,
      topProductos,
      maxProductoKilos,
    };
  }, [filteredBajas]);

  const openCreate = () => {
    setEditingId(null);
    setDraft({ ...emptyDraft, mes: String(month || now.getMonth() + 1) });
    setCostoTouched(false);
    setError('');
    setShowForm(true);
  };

  const openEdit = (b: Baja) => {
    setEditingId(b.id);
    setDraft(draftFromBaja(b));
    setCostoTouched(true);
    setError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setError('');
  };

  // Autocompleta el costo (kilos × costo unitario) mientras no se edite a mano.
  const updateDraft = (patch: Partial<Draft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      if (!costoTouched && ('kilos' in patch || 'costoUnitario' in patch)) {
        const k = Number(next.kilos);
        const cu = Number(next.costoUnitario);
        if (k > 0 && cu > 0) {
          next.costo = (k * cu).toFixed(2);
        }
      }
      return next;
    });
  };

  const canSubmit =
    draft.mes.trim() !== '' &&
    draft.fecha.trim() !== '' &&
    draft.cod.trim() !== '' &&
    draft.producto.trim() !== '' &&
    draft.tipoDocumento.trim() !== '' &&
    draft.numero.trim() !== '' &&
    draft.kilos.trim() !== '' &&
    draft.costoUnitario.trim() !== '' &&
    draft.costo.trim() !== '';

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError('Completa todos los campos obligatorios.');
      return;
    }
    setError('');
    const payload = {
      mes: Number(draft.mes),
      fecha: draft.fecha,
      cod: draft.cod.trim(),
      producto: draft.producto.trim(),
      tipoDocumento: draft.tipoDocumento.trim(),
      numero: draft.numero.trim(),
      kilos: Number(draft.kilos),
      costoUnitario: Number(draft.costoUnitario),
      costo: Number(draft.costo),
      perdida: draft.perdida.trim() === '' ? undefined : Number(draft.perdida),
      causal: draft.causal.trim() === '' ? undefined : draft.causal.trim(),
    };
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      setShowForm(false);
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo guardar el registro.'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo eliminar el registro.'));
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            Informe de bajas
          </h2>
          <p className="text-muted-foreground">
            Registro de bajas/mermas por producto (donaciones, pérdidas, etc.).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Año</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())}
              className="w-24"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Mes</Label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value={0}>Todos</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            Actualizar
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nuevo registro
          </Button>
        </div>
      </div>

      {error && !showForm && !deleteTarget && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!isLoading && filteredBajas.length > 0 && (
        <div className="space-y-4">
          {/* Tarjetas resumen */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Scale className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total bajas (kg)</p>
                  <p className="text-lg font-bold">{formatNumber(totals.kilos)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-emerald-500/10 p-2">
                  <Gift className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Donaciones (kg) ·{' '}
                    {totals.kilos > 0
                      ? Math.round((dashboard.donationKilos / totals.kilos) * 100)
                      : 0}
                    %
                  </p>
                  <p className="text-lg font-bold">{formatNumber(dashboard.donationKilos)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-destructive/10 p-2">
                  <TrendingDown className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Costo total</p>
                  <p className="text-lg font-bold">{formatCurrency(totals.costo)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-muted p-2">
                  <Boxes className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Registros</p>
                  <p className="text-lg font-bold">{filteredBajas.length}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {/* Donaciones vs. otras causales */}
            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="text-sm font-semibold">Donaciones vs. otras bajas (kg)</h3>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Donaciones ({dashboard.donationCount})</span>
                      <span>{formatNumber(dashboard.donationKilos)} kg</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{
                          width: `${totals.kilos > 0 ? (dashboard.donationKilos / totals.kilos) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Otras causales ({filteredBajas.length - dashboard.donationCount})</span>
                      <span>{formatNumber(dashboard.otherKilos)} kg</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{
                          width: `${totals.kilos > 0 ? (dashboard.otherKilos / totals.kilos) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                  {dashboard.byTipoDoc.map(([tipo, v]) => (
                    <span key={tipo}>
                      {tipo}: <span className="font-medium text-foreground">{formatNumber(v.kilos)} kg</span>
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Tendencia mensual */}
            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="text-sm font-semibold">Bajas por mes (kg)</h3>
                <div className="flex gap-1.5">
                  {dashboard.mesesConDatos.map(([m, kilos]) => (
                    <div key={m} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex h-20 w-full items-end">
                        <div
                          className="w-full rounded-t bg-primary/70"
                          style={{ height: `${Math.max(2, (kilos / dashboard.maxMesKilos) * 100)}%` }}
                          title={`${MONTHS[m - 1]}: ${formatNumber(kilos)} kg`}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {MONTHS[m - 1]?.slice(0, 3)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top productos */}
            <Card>
              <CardContent className="space-y-2 p-4">
                <h3 className="text-sm font-semibold">Top productos (kg)</h3>
                <div className="space-y-2">
                  {dashboard.topProductos.map(([producto, kilos]) => (
                    <div key={producto}>
                      <div className="flex justify-between text-xs">
                        <span className="truncate pr-2">{producto}</span>
                        <span className="shrink-0 text-muted-foreground">{formatNumber(kilos)} kg</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(kilos / dashboard.maxProductoKilos) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por código, producto, documento, número o causal…"
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : filteredBajas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {bajas.length === 0
                  ? 'Aún no hay registros de bajas para este periodo.'
                  : 'Ningún registro coincide con la búsqueda.'}
              </p>
            </div>
          ) : (
            <div className="max-h-[65vh] overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c} className="px-3 py-2 font-medium">{c}</th>
                    ))}
                    <th className="px-3 py-2 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredBajas.map((b) => (
                    <tr key={b.id}>
                      <td className="px-3 py-2">{MONTHS[b.mes - 1] ?? b.mes}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{b.fecha.slice(0, 10)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{b.cod}</td>
                      <td className="px-3 py-2">{b.producto}</td>
                      <td className="px-3 py-2">{b.tipoDocumento}</td>
                      <td className="px-3 py-2">{b.numero}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(Number(b.kilos))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(Number(b.costoUnitario))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(Number(b.costo))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {b.perdida != null ? formatNumber(Number(b.perdida)) : '—'}
                      </td>
                      <td className="px-3 py-2">{b.causal || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openEdit(b)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                            aria-label="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(b)}
                            className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                            aria-label="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="sticky bottom-0 border-t border-border bg-muted font-semibold">
                    <td className="px-3 py-2" colSpan={6}>Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(totals.kilos)}</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(totals.costo)}</td>
                    <td className="px-3 py-2" colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="font-bold">
                {editingId ? 'Editar registro' : 'Nuevo registro de baja'}
              </h3>
              <button
                onClick={closeForm}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5">
              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Mes</Label>
                  <select
                    value={draft.mes}
                    onChange={(e) => updateDraft({ mes: e.target.value })}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Selecciona…</option>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Fecha</Label>
                  <Input
                    type="date"
                    value={draft.fecha}
                    onChange={(e) => updateDraft({ fecha: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Código</Label>
                  <Input
                    value={draft.cod}
                    onChange={(e) => updateDraft({ cod: e.target.value })}
                    placeholder="Código del producto"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Producto</Label>
                  <Input
                    value={draft.producto}
                    onChange={(e) => updateDraft({ producto: e.target.value })}
                    placeholder="Nombre del producto"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Tipo de documento</Label>
                  <select
                    value={draft.tipoDocumento}
                    onChange={(e) => updateDraft({ tipoDocumento: e.target.value })}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Selecciona…</option>
                    {TIPOS_DOCUMENTO.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Número</Label>
                  <Input
                    value={draft.numero}
                    onChange={(e) => updateDraft({ numero: e.target.value })}
                    placeholder="Número del documento"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Kilos</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={draft.kilos}
                    onChange={(e) => updateDraft({ kilos: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Costo unitario</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={draft.costoUnitario}
                    onChange={(e) => updateDraft({ costoUnitario: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Costo</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={draft.costo}
                    onChange={(e) => {
                      setCostoTouched(true);
                      updateDraft({ costo: e.target.value });
                    }}
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Se calcula automáticamente (kilos × costo unitario); puedes editarlo.
                  </p>
                </div>
                <div>
                  <Label>Pérdida (opcional)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={draft.perdida}
                    onChange={(e) => updateDraft({ perdida: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Causal</Label>
                  <Input
                    value={draft.causal}
                    onChange={(e) => updateDraft({ causal: e.target.value })}
                    placeholder="Motivo de la baja"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="ghost" onClick={closeForm}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={!canSubmit || saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <h3 className="text-lg font-bold">Eliminar registro</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Se eliminará el registro de "{deleteTarget.producto}" del{' '}
              {deleteTarget.fecha.slice(0, 10)}. Esta acción no se puede deshacer.
            </p>
            {error && (
              <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </Button>
              <Button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? 'Eliminando…' : 'Eliminar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
