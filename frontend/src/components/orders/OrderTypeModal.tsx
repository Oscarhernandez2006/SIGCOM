import { Beef, ChevronRight, Layers, PackageOpen, PawPrint, X } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { Modal } from '@/components/brand/PageShell';
import { NAMNAM_COMPANIES } from '@/lib/companies';

export type OrderKind = 'cortes' | 'canales' | 'subproductos' | 'namnam';

/** Tipos de pedido disponibles en el modal selector. */
const ORDER_TYPES: {
  tipo: OrderKind;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  permission?: string;
  /** Solo se ofrece en estas compañías. */
  companies?: string[];
}[] = [
  {
    tipo: 'cortes',
    label: 'Cortes',
    description: 'Toma de pedido de productos de cortes.',
    icon: Beef,
    color: BRAND.primary,
  },
  {
    tipo: 'canales',
    label: 'Canales',
    description: 'Toma de pedido de canales.',
    icon: Layers,
    color: '#B91C1C',
    permission: '/pedidos/canales',
  },
  {
    tipo: 'subproductos',
    label: 'Subproductos',
    description: 'Toma de pedido de subproductos.',
    icon: PackageOpen,
    color: '#F59E0B',
    permission: '/pedidos/subproductos',
  },
  {
    tipo: 'namnam',
    label: 'Ñam Ñam',
    description: 'Toma de pedido de comida para mascotas.',
    icon: PawPrint,
    color: '#DB2777',
    permission: '/pedidos/namnam',
    companies: NAMNAM_COMPANIES,
  },
];

/** Modal que permite elegir el tipo de pedido antes de la toma. */
export function OrderTypeModal({
  isAdmin,
  permissions,
  companyId,
  onClose,
  onSelect,
}: {
  isAdmin: boolean;
  permissions: string[];
  companyId?: string;
  onClose: () => void;
  onSelect: (tipo: OrderKind) => void;
}) {
  const options = ORDER_TYPES.filter(
    (o) =>
      (!o.companies || (!!companyId && o.companies.includes(companyId))) &&
      (!o.permission || isAdmin || permissions.includes(o.permission)),
  );

  return (
    <Modal onClose={onClose}>
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h3 className="text-xl font-extrabold">Nuevo pedido</h3>
            <p className="mt-1 text-sm" style={{ color: BRAND.textMuted }}>
              Selecciona el tipo de pedido que vas a tomar.
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
        <div className="mt-4 space-y-2">
          {options.map((o) => (
            <button
              key={o.tipo}
              type="button"
              onClick={() => onSelect(o.tipo)}
              className="group flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left transition-colors hover:bg-[#F4FAF6]"
              style={{ border: `1px solid ${BRAND.border}` }}
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
                style={{ backgroundColor: `${o.color}1F` }}
              >
                <o.icon className="h-6 w-6" style={{ color: o.color }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-extrabold">{o.label}</span>
                <span className="block text-xs" style={{ color: BRAND.textSoft }}>
                  {o.description}
                </span>
              </span>
              <ChevronRight
                className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5"
                style={{ color: BRAND.textSoft }}
              />
            </button>
          ))}
          {options.length === 1 && (
            <p className="px-1 pt-1 text-xs" style={{ color: BRAND.textSoft }}>
              Los demás tipos de pedido requieren permiso del administrador.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
