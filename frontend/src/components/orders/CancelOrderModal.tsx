import { useState } from 'react';
import { Ban, CheckCircle2, Circle } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { orderNos } from '@/lib/utils';
import type { Order } from '@/types';
import { BrandButton, BrandTextarea, Modal } from '@/components/brand/PageShell';

/** Motivos de anulación más frecuentes para seleccionar sin digitar. */
const CANCEL_REASONS = [
  'El cliente canceló el pedido',
  'Error al digitar el pedido',
  'Producto sin disponibilidad',
  'El cliente no recibe en este momento',
  'Pedido duplicado',
  'Cambio en la lista de precios',
] as const;

const OTHER_REASON = 'Otro';

/** Hoja de motivo de anulación (_CancelSheet en la app). */
export function CancelOrderModal({
  order,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  order: Order;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [option, setOption] = useState('');
  const [other, setOther] = useState('');
  const reason = option === OTHER_REASON ? other.trim() : option;

  return (
    <Modal onClose={pending ? undefined : onClose}>
      <div className="p-5">
        <h3 className="text-xl font-extrabold">Motivo de la anulación</h3>
        <p className="mt-1 text-sm" style={{ color: BRAND.textMuted }}>
          Pedido #{orderNos(order.orderNumber, order.secondNumber)}. Esta acción devuelve el stock de
          los productos al inventario.
        </p>
        <div className="mt-4 space-y-1">
          {[...CANCEL_REASONS, OTHER_REASON].map((r) => {
            const active = option === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setOption(r)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors"
                style={{
                  backgroundColor: active ? `${BRAND.primary}14` : 'transparent',
                  color: active ? BRAND.primary : BRAND.text,
                }}
              >
                {active ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0" style={{ color: BRAND.textSoft }} />
                )}
                {r}
              </button>
            );
          })}
        </div>
        {option === OTHER_REASON && (
          <BrandTextarea
            autoFocus
            rows={3}
            maxLength={500}
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="Describe el motivo"
            className="mt-2"
          />
        )}
        {error && (
          <p className="mt-2 text-xs font-semibold" style={{ color: '#DC2626' }}>
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <BrandButton variant="text" className="flex-1" onClick={onClose} disabled={pending}>
            Cancelar
          </BrandButton>
          <BrandButton
            variant="danger"
            className="flex-1"
            disabled={!reason || pending}
            onClick={() => onConfirm(reason)}
          >
            <Ban className="h-4 w-4" />
            {pending ? 'Anulando…' : 'Anular pedido'}
          </BrandButton>
        </div>
      </div>
    </Modal>
  );
}
