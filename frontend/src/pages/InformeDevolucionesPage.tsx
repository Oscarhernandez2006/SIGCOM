import { useEffect, useMemo, useState } from 'react';
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
  Wallet,
  Boxes,
  Users,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import {
  useDevoluciones,
  useCreateDevolucion,
  useUpdateDevolucion,
  useDeleteDevolucion,
  useSellers,
  useProducts,
  useClients,
} from '@/hooks/useApi';
import { cn, formatCurrency } from '@/lib/utils';
import type { Devolucion } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Columnas tal cual la hoja "DEVOLUCIONES" del Excel. */
const COLUMNS = [
  'Fecha', 'Vendedor', 'N° Factura', 'Cód.', 'Producto', 'Kilos',
  'N° Documento', 'NIT', 'Cliente', 'Causa', 'Conductor', 'Precio',
];

interface Draft {
  fecha: string;
  vendedor: string;
  facturaNumero: string;
  cod: string;
  producto: string;
  kilos: string;
  numeroDocumento: string;
  nit: string;
  cliente: string;
  causa: string;
  conductor: string;
  precio: string;
}

const emptyDraft: Draft = {
  fecha: '',
  vendedor: '',
  facturaNumero: '',
  cod: '',
  producto: '',
  kilos: '',
  numeroDocumento: '',
  nit: '',
  cliente: '',
  causa: '',
  conductor: '',
  precio: '',
};

function draftFromDevolucion(d: Devolucion): Draft {
  return {
    fecha: d.fecha.slice(0, 10),
    vendedor: d.vendedor ?? '',
    facturaNumero: d.facturaNumero ?? '',
    cod: d.cod,
    producto: d.producto,
    kilos: String(d.kilos),
    numeroDocumento: d.numeroDocumento,
    nit: d.nit,
    cliente: d.cliente,
    causa: d.causa,
    conductor: d.conductor ?? '',
    precio: String(d.precio),
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

/** Retrasa la propagación de un valor para no disparar una consulta por cada tecla. */
function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface DevolucionFormModalProps {
  editing: Devolucion | null;
  onCancel: () => void;
  onSubmit: (payload: Omit<Devolucion, 'id'>) => Promise<void>;
  saving: boolean;
}

/**
 * Formulario de alta/edición en un componente aparte: así el tipeo (que
 * dispara autocompletados de vendedor/producto/cliente) solo re-renderiza
 * este modal y no la tabla completa de devoluciones (hasta miles de filas).
 */
function DevolucionFormModal({ editing, onCancel, onSubmit, saving }: DevolucionFormModalProps) {
  const [draft, setDraft] = useState<Draft>(() => (editing ? draftFromDevolucion(editing) : emptyDraft));
  const [error, setError] = useState('');

  const { data: sellers = [] } = useSellers();
  const [vendedorFocused, setVendedorFocused] = useState(false);
  const filteredSellers = useMemo(() => {
    const term = draft.vendedor.trim().toLowerCase();
    const list = term ? sellers.filter((s) => s.name.toLowerCase().includes(term)) : sellers;
    return list.slice(0, 8);
  }, [sellers, draft.vendedor]);

  const [productField, setProductField] = useState<'cod' | 'producto' | null>(null);
  const productSearchRaw = productField === 'cod' ? draft.cod : productField === 'producto' ? draft.producto : '';
  const productSearch = useDebouncedValue(productSearchRaw, 300);
  const { data: productResults = [] } = useProducts(productField ? productSearch : '');

  const [clientField, setClientField] = useState<'nit' | 'cliente' | null>(null);
  const clientSearchRaw = clientField === 'nit' ? draft.nit : clientField === 'cliente' ? draft.cliente : '';
  const clientSearch = useDebouncedValue(clientSearchRaw, 300);
  const { data: clientResults = [] } = useClients(clientField ? clientSearch : '');

  const updateDraft = (patch: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const canSubmit =
    draft.fecha.trim() !== '' &&
    draft.cod.trim() !== '' &&
    draft.producto.trim() !== '' &&
    draft.kilos.trim() !== '' &&
    draft.numeroDocumento.trim() !== '' &&
    draft.nit.trim() !== '' &&
    draft.cliente.trim() !== '' &&
    draft.causa.trim() !== '' &&
    draft.precio.trim() !== '';

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError('Completa todos los campos obligatorios.');
      return;
    }
    setError('');
    const payload = {
      fecha: draft.fecha,
      vendedor: draft.vendedor.trim() === '' ? undefined : draft.vendedor.trim(),
      facturaNumero: draft.facturaNumero.trim() === '' ? undefined : draft.facturaNumero.trim(),
      cod: draft.cod.trim(),
      producto: draft.producto.trim(),
      kilos: Number(draft.kilos),
      numeroDocumento: draft.numeroDocumento.trim(),
      nit: draft.nit.trim(),
      cliente: draft.cliente.trim(),
      causa: draft.causa.trim(),
      conductor: draft.conductor.trim() === '' ? undefined : draft.conductor.trim(),
      precio: Number(draft.precio),
    };
    try {
      await onSubmit(payload);
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo guardar el registro.'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="font-bold">
            {editing ? 'Editar registro' : 'Nuevo registro de devolución'}
          </h3>
          <button
            onClick={onCancel}
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
              <Label>Fecha</Label>
              <Input
                type="date"
                value={draft.fecha}
                onChange={(e) => updateDraft({ fecha: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="relative">
              <Label>Vendedor (opcional)</Label>
              <Input
                value={draft.vendedor}
                onChange={(e) => updateDraft({ vendedor: e.target.value })}
                onFocus={() => setVendedorFocused(true)}
                onBlur={() => setTimeout(() => setVendedorFocused(false), 150)}
                placeholder="Escribe para buscar…"
                className="mt-1"
              />
              {vendedorFocused && filteredSellers.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
                  {filteredSellers.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onMouseDown={() => updateDraft({ vendedor: s.name })}
                      className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>N° Factura (opcional)</Label>
              <Input
                value={draft.facturaNumero}
                onChange={(e) => updateDraft({ facturaNumero: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="relative">
              <Label>Código</Label>
              <Input
                value={draft.cod}
                onChange={(e) => updateDraft({ cod: e.target.value })}
                onFocus={() => setProductField('cod')}
                onBlur={() => setTimeout(() => setProductField(null), 150)}
                placeholder="Código del producto"
                className="mt-1"
              />
              {productField === 'cod' && draft.cod.trim() !== '' && productResults.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
                  {productResults.slice(0, 8).map((p) => (
                    <button
                      key={p.sku}
                      type="button"
                      onMouseDown={() => updateDraft({ cod: p.sku, producto: p.name })}
                      className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>{' '}
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <Label>Producto</Label>
              <Input
                value={draft.producto}
                onChange={(e) => updateDraft({ producto: e.target.value })}
                onFocus={() => setProductField('producto')}
                onBlur={() => setTimeout(() => setProductField(null), 150)}
                placeholder="Nombre del producto"
                className="mt-1"
              />
              {productField === 'producto' && draft.producto.trim() !== '' && productResults.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
                  {productResults.slice(0, 8).map((p) => (
                    <button
                      key={p.sku}
                      type="button"
                      onMouseDown={() => updateDraft({ cod: p.sku, producto: p.name })}
                      className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>{' '}
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
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
              <Label>N° Documento</Label>
              <Input
                value={draft.numeroDocumento}
                onChange={(e) => updateDraft({ numeroDocumento: e.target.value })}
                className="mt-1"
              />
            </div>
            <div className="relative">
              <Label>NIT</Label>
              <Input
                value={draft.nit}
                onChange={(e) => updateDraft({ nit: e.target.value })}
                onFocus={() => setClientField('nit')}
                onBlur={() => setTimeout(() => setClientField(null), 150)}
                className="mt-1"
              />
              {clientField === 'nit' && draft.nit.trim() !== '' && clientResults.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
                  {clientResults.slice(0, 8).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => updateDraft({ nit: c.code, cliente: c.name })}
                      className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span className="font-mono text-xs text-muted-foreground">{c.code}</span>{' '}
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative col-span-2">
              <Label>Cliente</Label>
              <Input
                value={draft.cliente}
                onChange={(e) => updateDraft({ cliente: e.target.value })}
                onFocus={() => setClientField('cliente')}
                onBlur={() => setTimeout(() => setClientField(null), 150)}
                className="mt-1"
              />
              {clientField === 'cliente' && draft.cliente.trim() !== '' && clientResults.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
                  {clientResults.slice(0, 8).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => updateDraft({ nit: c.code, cliente: c.name })}
                      className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span className="font-mono text-xs text-muted-foreground">{c.code}</span>{' '}
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="col-span-2">
              <Label>Causa de la devolución</Label>
              <Input
                value={draft.causa}
                onChange={(e) => updateDraft({ causa: e.target.value })}
                placeholder="Motivo de la devolución"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Conductor (opcional)</Label>
              <Input
                value={draft.conductor}
                onChange={(e) => updateDraft({ conductor: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Precio</Label>
              <Input
                type="number"
                step="0.01"
                value={draft.precio}
                onChange={(e) => updateDraft({ precio: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Módulo "Informe de devoluciones" (Despachos): réplica de la hoja
 * DEVOLUCIONES del Excel de devoluciones diarias, para digitar manualmente
 * los registros desde la app.
 */
export function InformeDevolucionesPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(0); // 0 = todos los meses
  const [search, setSearch] = useState('');

  const { data: devoluciones = [], isLoading, isFetching, refetch } = useDevoluciones(
    year,
    month || undefined,
  );
  const createMutation = useCreateDevolucion();
  const updateMutation = useUpdateDevolucion();
  const deleteMutation = useDeleteDevolucion();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<Devolucion | null>(null);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Devolucion | null>(null);

  const filteredDevoluciones = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return devoluciones;
    return devoluciones.filter((d) =>
      [d.cod, d.producto, d.numeroDocumento, d.nit, d.cliente, d.causa, d.vendedor ?? '', d.conductor ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [devoluciones, search]);

  const totals = useMemo(() => {
    return filteredDevoluciones.reduce(
      (acc, d) => ({
        kilos: acc.kilos + Number(d.kilos),
        precio: acc.precio + Number(d.precio),
      }),
      { kilos: 0, precio: 0 },
    );
  }, [filteredDevoluciones]);

  // Métricas del dashboard, recalculadas sobre los registros ya filtrados
  // (año/mes/búsqueda) para que reflejen siempre lo que se ve en la tabla.
  const dashboard = useMemo(() => {
    const byCausa = new Map<string, number>();
    const byMonth = new Map<number, number>();
    const byProducto = new Map<string, number>();
    const byCliente = new Map<string, number>();

    for (const d of filteredDevoluciones) {
      const kilos = Number(d.kilos);
      const mes = Number(d.fecha.slice(5, 7));
      byCausa.set(d.causa, (byCausa.get(d.causa) ?? 0) + kilos);
      byMonth.set(mes, (byMonth.get(mes) ?? 0) + kilos);
      byProducto.set(d.producto, (byProducto.get(d.producto) ?? 0) + kilos);
      byCliente.set(d.cliente, (byCliente.get(d.cliente) ?? 0) + kilos);
    }

    const topCausas = [...byCausa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxCausaKilos = topCausas[0]?.[1] ?? 0;

    const topProductos = [...byProducto.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxProductoKilos = topProductos[0]?.[1] ?? 0;

    const topClientes = [...byCliente.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxClienteKilos = topClientes[0]?.[1] ?? 0;

    const mesesConDatos = [...byMonth.entries()].sort((a, b) => a[0] - b[0]);
    const maxMesKilos = Math.max(1, ...mesesConDatos.map(([, k]) => k));

    return {
      topCausas,
      maxCausaKilos,
      mesesConDatos,
      maxMesKilos,
      topProductos,
      maxProductoKilos,
      topClientes,
      maxClienteKilos,
    };
  }, [filteredDevoluciones]);

  const openCreate = () => {
    setEditingId(null);
    setEditingRecord(null);
    setError('');
    setShowForm(true);
  };

  const openEdit = (d: Devolucion) => {
    setEditingId(d.id);
    setEditingRecord(d);
    setError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setError('');
  };

  const handleSave = async (payload: Omit<Devolucion, 'id'>) => {
    if (editingId) {
      await updateMutation.mutateAsync({ id: editingId, ...payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    setShowForm(false);
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
            Informe de devoluciones
          </h2>
          <p className="text-muted-foreground">
            Registro de devoluciones diarias por producto y cliente.
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

      {!isLoading && filteredDevoluciones.length > 0 && (
        <div className="space-y-4">
          {/* Tarjetas resumen */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Scale className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total devuelto (kg)</p>
                  <p className="text-lg font-bold">{formatNumber(totals.kilos)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-destructive/10 p-2">
                  <Wallet className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor total</p>
                  <p className="text-lg font-bold">{formatCurrency(totals.precio)}</p>
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
                  <p className="text-lg font-bold">{filteredDevoluciones.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-amber-500/10 p-2">
                  <Users className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Promedio kg/devolución</p>
                  <p className="text-lg font-bold">
                    {formatNumber(
                      filteredDevoluciones.length > 0 ? totals.kilos / filteredDevoluciones.length : 0,
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* Tendencia mensual */}
            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="text-sm font-semibold">Devoluciones por mes (kg)</h3>
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

            {/* Top causas */}
            <Card>
              <CardContent className="space-y-2 p-4">
                <h3 className="text-sm font-semibold">Top causas de devolución (kg)</h3>
                <div className="space-y-2">
                  {dashboard.topCausas.map(([causa, kilos]) => (
                    <div key={causa}>
                      <div className="flex justify-between text-xs">
                        <span className="truncate pr-2">{causa}</span>
                        <span className="shrink-0 text-muted-foreground">{formatNumber(kilos)} kg</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-destructive"
                          style={{ width: `${(kilos / dashboard.maxCausaKilos) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top productos */}
            <Card>
              <CardContent className="space-y-2 p-4">
                <h3 className="text-sm font-semibold">Top productos devueltos (kg)</h3>
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

            {/* Top clientes */}
            <Card>
              <CardContent className="space-y-2 p-4">
                <h3 className="text-sm font-semibold">Top clientes con devoluciones (kg)</h3>
                <div className="space-y-2">
                  {dashboard.topClientes.map(([cliente, kilos]) => (
                    <div key={cliente}>
                      <div className="flex justify-between text-xs">
                        <span className="truncate pr-2">{cliente}</span>
                        <span className="shrink-0 text-muted-foreground">{formatNumber(kilos)} kg</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{ width: `${(kilos / dashboard.maxClienteKilos) * 100}%` }}
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
          placeholder="Buscar por código, producto, NIT, cliente o causa…"
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
          ) : filteredDevoluciones.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {devoluciones.length === 0
                  ? 'Aún no hay registros de devoluciones para este periodo.'
                  : 'Ningún registro coincide con la búsqueda.'}
              </p>
            </div>
          ) : (
            <div className="max-h-[65vh] overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c} className="px-3 py-2 font-medium">{c}</th>
                    ))}
                    <th className="px-3 py-2 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredDevoluciones.map((d) => (
                    <tr key={d.id}>
                      <td className="px-3 py-2 whitespace-nowrap">{d.fecha.slice(0, 10)}</td>
                      <td className="px-3 py-2">{d.vendedor || '—'}</td>
                      <td className="px-3 py-2">{d.facturaNumero || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">{d.cod}</td>
                      <td className="px-3 py-2">{d.producto}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(Number(d.kilos))}</td>
                      <td className="px-3 py-2">{d.numeroDocumento}</td>
                      <td className="px-3 py-2">{d.nit}</td>
                      <td className="px-3 py-2">{d.cliente}</td>
                      <td className="px-3 py-2">{d.causa}</td>
                      <td className="px-3 py-2">{d.conductor || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(Number(d.precio))}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openEdit(d)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                            aria-label="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(d)}
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
                    <td className="px-3 py-2" colSpan={5}>Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(totals.kilos)}</td>
                    <td className="px-3 py-2" colSpan={4} />
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(totals.precio)}</td>
                    <td className="px-3 py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <DevolucionFormModal
          editing={editingRecord}
          onCancel={closeForm}
          onSubmit={handleSave}
          saving={saving}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <h3 className="text-lg font-bold">Eliminar registro</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Se eliminará la devolución de "{deleteTarget.producto}" del{' '}
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
