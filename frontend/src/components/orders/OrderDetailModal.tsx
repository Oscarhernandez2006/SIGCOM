import { Ban, Copy, Download, Package, Pencil, Store, Truck, X } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { formatDate, formatMoney, formatQuantity, formatTime } from '@/lib/format';
import { orderNos } from '@/lib/utils';
import type { Order, SiesaState } from '@/types';
import {
  AmountRow,
  BrandButton,
  Field,
  Modal,
  StatusPill,
  TitledCard,
} from '@/components/brand/PageShell';
import {
  SIESA_DISPATCHED,
  SIESA_INVOICED,
  orderTypePill,
  orderNote,
  siesaStyle,
  statusStyle,
} from './order-status';

/** Detalle del pedido (OrderDetailScreen en la app) con las acciones de la web. */
export function OrderDetailModal({
  order,
  siesa,
  onClose,
  onDownload,
  downloading,
  onEdit,
  onDuplicate,
  onCancel,
}: {
  order: Order;
  siesa?: SiesaState;
  onClose: () => void;
  onDownload: () => void;
  downloading: boolean;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onCancel?: () => void;
}) {
  const status = statusStyle(order.status);
  const siesaPill = siesaStyle(siesa ?? order.siesaEstado);
  const note = orderNote(order);
  const c = order.customer;

  return (
    <Modal onClose={onClose} className="max-w-2xl">
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: `1px solid ${BRAND.border}` }}
      >
        <h3 className="flex-1 text-lg font-extrabold">
          Pedido #{orderNos(order.orderNumber, order.secondNumber)}
        </h3>
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

      <div className="flex-1 space-y-3 overflow-auto p-4" style={{ backgroundColor: BRAND.background }}>
        <TitledCard>
          <div className="flex flex-wrap gap-1.5">
            <StatusPill label={status.label} color={status.color} />
            {siesaPill && <StatusPill label={siesaPill.label} color={siesaPill.color} outlined />}
            {siesa?.facturado && (
              <StatusPill label={SIESA_INVOICED.label} color={SIESA_INVOICED.color} outlined />
            )}
            {siesa?.despachado && (
              <StatusPill label={SIESA_DISPATCHED.label} color={SIESA_DISPATCHED.color} outlined />
            )}
            {orderTypePill(order.type) && (
              <StatusPill label={orderTypePill(order.type)!.label} color={orderTypePill(order.type)!.color} />
            )}
          </div>
          <p className="mt-3.5 text-2xl font-extrabold tracking-[-0.6px] sm:text-3xl">
            {formatMoney(Number(order.total))}
          </p>
          <p className="text-[12.5px]" style={{ color: BRAND.textSoft }}>
            Creado el {formatDate(order.createdAt)} a las {formatTime(order.createdAt)}
            {order.seller?.name ? ` · ${order.seller.name}` : ''}
          </p>
          {order.linkedOrderNumber && (
            <p className="mt-1 text-[12.5px] font-semibold" style={{ color: BRAND.primary }}>
              Asociado al pedido #{orderNos(order.linkedOrderNumber, order.linkedSecondNumber)}
            </p>
          )}
          {note && (
            <div
              className="mt-3 rounded-[10px] p-2.5 text-[12.5px] font-semibold"
              style={{ backgroundColor: `${status.color}14`, color: status.color }}
            >
              {note}
            </div>
          )}
        </TitledCard>

        <TitledCard title="Cliente" icon={Store}>
          <p className="text-[15px] font-extrabold">{c.name}</p>
          <div className="mt-2">
            <Field label="NIT / código" value={c.code} />
            <Field
              label="Sucursal"
              value={
                c.branchName && c.branch ? `${c.branchName} (${c.branch})` : c.branchName || c.branch
              }
            />
            <Field label="Lista de precios" value={c.priceListName || c.priceList} />
            <Field label="Condición de pago" value={c.paymentTerm} />
            <Field
              label="Vendedor"
              value={
                c.sellerName && c.sellerCode
                  ? `${c.sellerName} (${c.sellerCode})`
                  : c.sellerName || c.sellerCode
              }
            />
            <Field
              label="Dirección"
              value={[c.address, c.neighborhood, c.city, c.department].filter(Boolean).join(', ')}
            />
            <Field label="Teléfono" value={c.phone} />
            <Field label="Email" value={c.email} />
          </div>
        </TitledCard>

        <TitledCard title="Entrega" icon={Truck}>
          <Field
            label="Modalidad"
            value={order.deliveryType === 'recoge_en_planta' ? 'Recoge en planta' : 'Despacho'}
          />
          <Field label="Fecha de entrega" value={order.deliveryDate ? formatDate(order.deliveryDate) : null} />
          <Field label="Horario de recibido" value={order.deliverySchedule} />
          <Field label="Nota logística" value={order.logisticsNote} />
          <Field label="Notas del pedido" value={order.notes} />
          <Field
            label="Aprobado por cartera"
            value={order.approvedAt ? `${order.approvedBy ?? ''} · ${formatDate(order.approvedAt)} ${formatTime(order.approvedAt)}`.trim() : null}
          />
          <Field label="Documento Siesa" value={order.siesaDocumentId} />
        </TitledCard>

        <TitledCard title={`Productos (${order.items.length})`} icon={Package}>
          <div>
            {order.items.map((item, i) => (
              <div
                key={item.id ?? `${item.sku}-${i}`}
                className="flex items-start gap-3 py-2.5"
                style={i > 0 ? { borderTop: `1px solid ${BRAND.border}` } : undefined}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{item.productName}</p>
                  <p className="mt-0.5 text-xs" style={{ color: BRAND.textSoft }}>
                    Ref. {item.sku} · {formatQuantity(Number(item.quantity))} {item.unitOfMeasure ?? ''} ×{' '}
                    {formatMoney(Number(item.unitPrice))}
                    {Number(item.discountPct) > 0 ? ` · Dto. ${Number(item.discountPct)} %` : ''}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-extrabold">{formatMoney(Number(item.lineTotal))}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${BRAND.border}` }}>
            <AmountRow label="Subtotal" value={formatMoney(Number(order.subtotal))} />
            <AmountRow label="Impuestos" value={formatMoney(Number(order.taxes))} />
            <AmountRow label="Total" value={formatMoney(Number(order.total))} bold />
          </div>
        </TitledCard>
      </div>

      <div
        className="flex flex-wrap items-center justify-end gap-2 px-4 py-3"
        style={{ borderTop: `1px solid ${BRAND.border}` }}
      >
        {onCancel && (
          <BrandButton variant="danger-outlined" className="mr-auto h-10" onClick={onCancel}>
            <Ban className="h-4 w-4" />
            Anular pedido
          </BrandButton>
        )}
        {onEdit && (
          <BrandButton variant="outlined" className="h-10" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Editar
          </BrandButton>
        )}
        {onDuplicate && (
          <BrandButton variant="outlined" className="h-10" onClick={onDuplicate}>
            <Copy className="h-4 w-4" />
            Duplicar
          </BrandButton>
        )}
        <BrandButton className="h-10" onClick={onDownload} disabled={downloading}>
          <Download className="h-4 w-4" />
          {downloading ? 'Descargando…' : 'Documento'}
        </BrandButton>
      </div>
    </Modal>
  );
}
