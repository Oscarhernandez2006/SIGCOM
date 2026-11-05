import { useEffect, useState } from 'react';
import { Clock, AlertCircle, CheckCircle2, Save } from 'lucide-react';
import { isAxiosError } from 'axios';
import { BRAND } from '@/lib/brand';
import { PageBackground, Hero, BrandButton } from '@/components/brand/PageShell';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/brand/Panel';

const FIELD_STYLE = { backgroundColor: BRAND.field, color: BRAND.text } as const;
import {
  useOrderSchedule,
  useUpdateOrderSchedule,
} from '@/hooks/useAdminApi';

/** "HH:MM" (24h) a partir de hora y minuto. */
function toTimeValue(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Convierte "HH:MM" a { hour, minute }. */
function fromTimeValue(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(':');
  return { hour: Number(h) || 0, minute: Number(m) || 0 };
}

export function OrderSchedulePage() {
  const { data, isLoading } = useOrderSchedule();
  const update = useUpdateOrderSchedule();

  const [enabled, setEnabled] = useState(true);
  const [open, setOpen] = useState('07:00');
  const [close, setClose] = useState('16:30');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // Carga los valores actuales cuando llegan del backend.
  useEffect(() => {
    if (!data) return;
    setEnabled(data.enabled);
    setOpen(toTimeValue(data.openHour, data.openMinute));
    setClose(toTimeValue(data.closeHour, data.closeMinute));
  }, [data]);

  async function handleSave() {
    setError('');
    setSaved(false);

    const o = fromTimeValue(open);
    const c = fromTimeValue(close);
    const openMin = o.hour * 60 + o.minute;
    const closeMin = c.hour * 60 + c.minute;

    if (enabled && closeMin <= openMin) {
      setError('La hora de cierre debe ser mayor que la de apertura.');
      return;
    }

    try {
      await update.mutateAsync({
        enabled,
        openHour: o.hour,
        openMinute: o.minute,
        closeHour: c.hour,
        closeMinute: c.minute,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      if (isAxiosError(err)) {
        const msg = err.response?.data?.message;
        setError(
          (Array.isArray(msg) ? msg.join(', ') : msg) ||
            'No se pudo guardar la configuración.',
        );
      } else {
        setError('No se pudo guardar la configuración.');
      }
    }
  }

  return (
    <PageBackground className="space-y-3.5">
      <Hero>
        <h2 className="text-xl font-extrabold leading-tight tracking-[-0.4px] sm:text-[22px]">Horario de pedidos</h2>
        <p className="mt-1 text-sm font-semibold text-white/90">
          Define el rango de horas (Colombia) en el que los vendedores pueden crear pedidos.
        </p>
      </Hero>

      <Panel className="max-w-xl">
        <PanelHeader>
          <PanelTitle className="flex items-center gap-2 ">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1E9B50]/10 text-[#1E9B50]">
              <Clock className="h-5 w-5" />
            </span>
            Ventana para crear pedidos
          </PanelTitle>
        </PanelHeader>
        <PanelBody className="space-y-5">
          {/* Activar / desactivar la restricción */}
          <label className="flex items-start gap-3 rounded-lg border border-[#E2E8F0] bg-[#F4FAF6] p-3">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span className="text-sm">
              <span className="font-medium">Restringir el horario</span>
              <span className="block text-[#6B7280]">
                Si lo desactivas, los pedidos se pueden crear a cualquier hora.
              </span>
            </span>
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-[13px] font-bold">Desde</label>
              <input className="brand-input h-10 rounded-xl px-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
                type="time"
                value={open}
                disabled={!enabled}
                onChange={(e) => setOpen(e.target.value)}
            />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-bold">Hasta</label>
              <input className="brand-input h-10 rounded-xl px-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
                type="time"
                value={close}
                disabled={!enabled}
                onChange={(e) => setClose(e.target.value)}
            />
            </div>
          </div>

          {error && (
            <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          {saved && (
            <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Configuración guardada.
            </p>
          )}

          <BrandButton className="h-10 gap-2" onClick={handleSave} disabled={isLoading || update.isPending}>
            <Save className="h-4 w-4" />
            {update.isPending ? 'Guardando…' : 'Guardar'}
          </BrandButton>
        </PanelBody>
      </Panel>
    </PageBackground>
  );
}
