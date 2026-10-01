import { useMemo, useState } from 'react';
import { MapPin, Phone, X, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSaveClientSellerInfo } from '@/hooks/useApi';
import {
  TIPOS_VIA,
  TIPOS_CONJUNTO,
  TIPOS_UNIDAD,
  formatDireccion,
  formatReferencia,
  isDireccionValida,
  isTelefonoValido,
  toTitleCase,
  type DireccionParts,
} from '@/lib/address';
import type { Client } from '@/types';

/** Clase común de los selects nativos, calcada del Input para verse igual. */
const selectClassName =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background';

interface ClientSellerInfoModalProps {
  client: Client;
  onClose: () => void;
  /** Se llama tras guardar exitosamente (en vez de `onClose`). */
  onSaved: () => void;
}

/**
 * Modal que se muestra la primera vez que un vendedor selecciona un cliente:
 * arriba se ve la información del cliente que trae el ERP (solo lectura) y
 * abajo se le pide al vendedor digitar su propia ubicación (dirección,
 * barrio, ciudad, departamento y teléfono) para comparar ambas fuentes. Se
 * guarda una sola vez por (cliente, vendedor).
 */
export function ClientSellerInfoModal({
  client,
  onClose,
  onSaved,
}: ClientSellerInfoModalProps) {
  const saveMutation = useSaveClientSellerInfo();
  const [error, setError] = useState('');

  // Dirección: por defecto en modo estructurado (estándar canónico); si el
  // vendedor no logra encajarla, puede pasar a texto libre.
  const [direccionLibre, setDireccionLibre] = useState(false);
  const [tipoVia, setTipoVia] = useState<string>(TIPOS_VIA[4]); // "Calle"
  const [via, setVia] = useState('');
  const [cruce, setCruce] = useState('');
  const [placa, setPlaca] = useState('');
  const [direccionTexto, setDireccionTexto] = useState('');

  // Referencia (información adicional): compositiva, todo opcional.
  const [tipoConjunto, setTipoConjunto] = useState('');
  const [nombreConjunto, setNombreConjunto] = useState('');
  const [tipoUnidad, setTipoUnidad] = useState('');
  const [numeroUnidad, setNumeroUnidad] = useState('');
  const [torre, setTorre] = useState('');

  const [barrio, setBarrio] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [telefono, setTelefono] = useState('');

  const direccionParts: DireccionParts = { tipoVia, via, cruce, placa };
  const direccionPreview = isDireccionValida(direccionParts)
    ? formatDireccion(direccionParts)
    : '';
  const referenciaPreview = formatReferencia({
    tipoConjunto,
    nombreConjunto,
    tipoUnidad,
    numeroUnidad,
    torre,
  });

  const finalDireccion = direccionLibre ? direccionTexto.trim() : direccionPreview;

  const canSubmit = useMemo(() => {
    if (!finalDireccion) return false;
    if (!barrio.trim() || !ciudad.trim()) return false;
    if (telefono.trim() && !isTelefonoValido(telefono)) return false;
    return true;
  }, [finalDireccion, barrio, ciudad, telefono]);

  const handleSubmit = async () => {
    setError('');
    if (!finalDireccion) {
      setError(
        direccionLibre
          ? 'Digita la dirección.'
          : 'Completa Vía, Cruce y Placa con el formato indicado (p. ej. 74, 88, 82).',
      );
      return;
    }
    if (!barrio.trim() || !ciudad.trim()) {
      setError('El barrio y la ciudad son obligatorios.');
      return;
    }
    if (telefono.trim() && !isTelefonoValido(telefono)) {
      setError('El teléfono debe tener entre 7 y 10 dígitos.');
      return;
    }
    try {
      await saveMutation.mutateAsync({
        customerId: client.id,
        direccion: finalDireccion,
        referencia: referenciaPreview || undefined,
        barrio: barrio.trim(),
        ciudad: ciudad.trim(),
        departamento: departamento.trim() || undefined,
        telefono: telefono.trim() || undefined,
      });
      onSaved();
    } catch {
      setError('No se pudo guardar la información. Intenta de nuevo.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h3 className="text-lg font-semibold">
              Confirma la ubicación de {client.name}
            </h3>
            <p className="text-sm text-muted-foreground">
              Es obligatorio guardar esta información para crear el pedido.
              Solo se pregunta una vez por cliente.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-auto p-5">
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            Si cancelas o cierras esta ventana sin guardar, <strong>el pedido no se creará</strong>.
          </p>
          {/* Grilla 1: información del cliente (ERP), solo lectura */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Datos del cliente (ERP)
            </p>
            <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2">
              <p className="flex items-center gap-2 sm:col-span-2">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                Dirección:{' '}
                <span className="font-medium">{client.address || '—'}</span>
              </p>
              <p className="flex items-center gap-2">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                Barrio: <span className="font-medium">{client.neighborhood || '—'}</span>
              </p>
              <p className="flex items-center gap-2">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                Ciudad: <span className="font-medium">{client.city || '—'}</span>
              </p>
              <p className="flex items-center gap-2">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                Depto: <span className="font-medium">{client.department || '—'}</span>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                Teléfono: <span className="font-medium">{client.phone || '—'}</span>
              </p>
            </div>
          </div>

          {/* Grilla 2: inputs para el vendedor */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Ubicación digitada por ti (vendedor)
              </p>
              <button
                type="button"
                onClick={() => setDireccionLibre((v) => !v)}
                className="text-xs font-medium text-primary hover:underline"
              >
                {direccionLibre ? 'Usar formato estándar' : 'Dirección no estándar'}
              </button>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-4">
              {direccionLibre ? (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Dirección
                  </label>
                  <Input
                    value={direccionTexto}
                    onChange={(e) => setDireccionTexto(toTitleCase(e.target.value))}
                    placeholder="Digita la dirección completa"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Tipo de vía
                      </label>
                      <select
                        className={selectClassName}
                        value={tipoVia}
                        onChange={(e) => setTipoVia(e.target.value)}
                      >
                        {TIPOS_VIA.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Vía
                      </label>
                      <Input
                        value={via}
                        onChange={(e) => setVia(e.target.value.toUpperCase())}
                        placeholder="74"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Cruce
                      </label>
                      <Input
                        value={cruce}
                        onChange={(e) => setCruce(e.target.value.toUpperCase())}
                        placeholder="88"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Placa
                      </label>
                      <Input
                        value={placa}
                        onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                        placeholder="82"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Vista previa:{' '}
                    <span className="font-medium text-foreground">
                      {direccionPreview || '—'}
                    </span>
                  </p>
                </div>
              )}

              {/* Referencia / información adicional (opcional) */}
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Información adicional (opcional)
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <select
                    className={selectClassName}
                    value={tipoConjunto}
                    onChange={(e) => setTipoConjunto(e.target.value)}
                  >
                    <option value="">Sin conjunto</option>
                    {TIPOS_CONJUNTO.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={nombreConjunto}
                    onChange={(e) => setNombreConjunto(toTitleCase(e.target.value))}
                    placeholder="Nombre (p. ej. Torino)"
                    disabled={!tipoConjunto}
                  />
                  <select
                    className={selectClassName}
                    value={tipoUnidad}
                    onChange={(e) => setTipoUnidad(e.target.value)}
                  >
                    <option value="">Sin unidad</option>
                    {TIPOS_UNIDAD.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={numeroUnidad}
                    onChange={(e) => setNumeroUnidad(e.target.value.toUpperCase())}
                    placeholder="Número"
                    disabled={!tipoUnidad}
                  />
                  <Input
                    value={torre}
                    onChange={(e) => setTorre(e.target.value.toUpperCase())}
                    placeholder="Torre"
                  />
                </div>
                {referenciaPreview && (
                  <p className="text-xs text-muted-foreground">
                    Vista previa:{' '}
                    <span className="font-medium text-foreground">
                      {referenciaPreview}
                    </span>
                  </p>
                )}
              </div>

              <div className="grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Barrio
                  </label>
                  <Input
                    value={barrio}
                    onChange={(e) => setBarrio(toTitleCase(e.target.value))}
                    placeholder="Barrio"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Ciudad
                  </label>
                  <Input
                    value={ciudad}
                    onChange={(e) => setCiudad(toTitleCase(e.target.value))}
                    placeholder="Ciudad"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Departamento
                  </label>
                  <Input
                    value={departamento}
                    onChange={(e) => setDepartamento(toTitleCase(e.target.value))}
                    placeholder="Departamento"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Teléfono
                  </label>
                  <Input
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="Teléfono"
                  />
                </div>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border p-4">
          <Button variant="ghost" onClick={onClose}>
            Cancelar (no se creará el pedido)
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Guardando...' : 'Guardar ubicación'}
          </Button>
        </div>
      </div>
    </div>
  );
}
