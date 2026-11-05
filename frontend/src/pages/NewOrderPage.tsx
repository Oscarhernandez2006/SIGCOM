import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Download,
  Link2,
  Loader2,
  Lock,
  Package,
  Plus,
  Search,
  Star,
  StickyNote,
  Trash2,
  Truck,
  UserCircle,
  Warehouse,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import {
  useClients,
  useProductsForList,
  useCreateOrder,
  useFeaturedProducts,
  useCustomerHasOrderToday,
  useTodayOrdersForCustomer,
  useClientSellerInfo,
  downloadOrderPdf,
} from '@/hooks/useApi';
import { useOrderSchedule } from '@/hooks/useAdminApi';
import { CanalOrderForm } from '@/components/CanalOrderForm';
import { cn, orderNos } from '@/lib/utils';
import { formatInt, formatMoney } from '@/lib/format';
import { BRAND } from '@/lib/brand';
import { QtyControl } from '@/components/brand/QtyControl';
import { DeliverySchedulePicker } from '@/components/DeliverySchedulePicker';
import { ClientSellerInfoModal } from '@/components/ClientSellerInfoModal';
import { isScheduleComplete, formatDeliverySchedule } from '@/lib/delivery-schedule';
import { getMinOrderTotal } from '@/lib/companies';
import { useCompany } from '@/company/useCompany';
import { useAuth } from '@/auth/useAuth';
import {
  AmountRow,
  BrandButton,
  BrandInput,
  BrandTextarea,
  EmptyMessage,
  Field,
  Hero,
  Modal,
  PageBackground,
  Segmented,
  TitledCard,
} from '@/components/brand/PageShell';
import type {
  CartLine,
  Client,
  DeliverySchedule,
  DeliveryType,
  FeaturedProduct,
  Order,
  SellableProduct,
} from '@/types';

/** Iniciales para el avatar del cliente. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

type Step = 1 | 2 | 3;

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Cliente' },
  { n: 2, label: 'Productos' },
  { n: 3, label: 'Entrega' },
];

// Se exige la ubicación del cliente (digitada por el vendedor) justo antes
// de crear el pedido, después del aviso de productos estrella. Solo aplica
// a Agropecuaria (3) y Carnes Frias (8); Monteria (MTAT) no lo requiere.
const CLIENT_SELLER_INFO_COMPANIES = ['3', '8'];
// Vendedores (cédula) a los que no se les pide la ubicación del cliente.
// Preferir el permiso `/pedidos/omitir-verificacion-direccion` (asignable
// desde Usuarios); esta lista queda solo por compatibilidad con casos ya
// configurados antes de que existiera el permiso.
const CLIENT_SELLER_INFO_EXEMPT_DOCS = ['21849701'];
/** Permiso que exime a un vendedor del modal de verificación de dirección. */
const CLIENT_SELLER_INFO_EXEMPT_PERMISSION =
  '/pedidos/omitir-verificacion-direccion';

/** Configuración de la ventana horaria para crear pedidos. */
interface OrderScheduleCfg {
  enabled: boolean;
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
}

/** Minutos transcurridos del día (0-1439) en horario de Colombia. */
function bogotaNowMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const hour = get('hour') % 24;
  return hour * 60 + get('minute');
}

/** ¿Estamos dentro del horario para crear pedidos? (hora de Colombia). */
function isWithinOrderHours(cfg?: OrderScheduleCfg): boolean {
  // Sin config (aún cargando) o con la restricción desactivada: se permite.
  if (!cfg || !cfg.enabled) return true;
  const now = bogotaNowMinutes();
  const open = cfg.openHour * 60 + cfg.openMinute;
  const close = cfg.closeHour * 60 + cfg.closeMinute;
  return now >= open && now < close;
}

/** Formatea una hora/minuto (24h) como texto am/pm (p. ej. 4:30 p.m.). */
function formatScheduleTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'p.m.' : 'a.m.';
  let h = hour % 12;
  if (h === 0) h = 12;
  return `${h}:${String(minute).padStart(2, '0')} ${period}`;
}

const AMBER = { bg: '#FEF3C7', border: '#FDE68A', text: '#92400E', icon: '#B45309' };

export function NewOrderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tipo = (searchParams.get('tipo') ?? 'cortes') as 'cortes' | 'canales' | 'subproductos';
  const isSubproducto = tipo === 'subproductos';
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customer, setCustomer] = useState<Client | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notes, setNotes] = useState('');
  const [logisticsNote, setLogisticsNote] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('despacho');
  const [deliverySchedule, setDeliverySchedule] = useState<DeliverySchedule | null>(null);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [submitError, setSubmitError] = useState('');
  // Productos estrella que faltan en el carrito (dispara el modal informativo).
  const [featuredWarning, setFeaturedWarning] = useState<FeaturedProduct[] | null>(null);
  // Especie activa en el catálogo (cortes: Res/Cerdo; subproductos: Cerdo/Res).
  const [species, setSpecies] = useState<'CERDO' | 'RES'>(isSubproducto ? 'CERDO' : 'RES');

  // Se revisa el horario cada minuto para bloquear/desbloquear el botón en vivo.
  // El rango es configurable desde el panel admin (horario de pedidos).
  const { data: orderSchedule } = useOrderSchedule();
  const [withinHours, setWithinHours] = useState(true);
  useEffect(() => {
    setWithinHours(isWithinOrderHours(orderSchedule));
    const id = setInterval(() => setWithinHours(isWithinOrderHours(orderSchedule)), 60_000);
    return () => clearInterval(id);
  }, [orderSchedule]);

  const scheduleRangeText =
    orderSchedule && orderSchedule.enabled
      ? `de ${formatScheduleTime(orderSchedule.openHour, orderSchedule.openMinute)} a ${formatScheduleTime(orderSchedule.closeHour, orderSchedule.closeMinute)}`
      : '';

  const { data: customers = [], isFetching: customersLoading } = useClients(customerSearch);
  // Tope mínimo de pedido según la compañía activa; también decide si se
  // exige la ubicación del cliente (solo Agropecuaria y Carnes Frias).
  const { company } = useCompany();
  const isExemptFromSellerInfo =
    CLIENT_SELLER_INFO_EXEMPT_DOCS.includes(user?.documentId?.trim() ?? '') ||
    (user?.permissions ?? []).includes(CLIENT_SELLER_INFO_EXEMPT_PERMISSION) ||
    (company?.permissions ?? []).includes(CLIENT_SELLER_INFO_EXEMPT_PERMISSION);
  // [DESACTIVADO] El modal de verificación de dirección se deshabilitó para
  // todos los vendedores (ya no se exige a nadie antes de crear el pedido).
  // Se deja `isExemptFromSellerInfo` calculado por si se reactiva más adelante.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const requireClientSellerInfo = false;
  void isExemptFromSellerInfo;
  void CLIENT_SELLER_INFO_COMPANIES;
  // Se pregunta la ubicación una sola vez por (cliente, vendedor); solo se
  // muestra el modal al intentar crear el pedido (no al seleccionar el
  // cliente), y es obligatorio: sin guardarla no se puede crear el pedido.
  const {
    data: sellerInfo,
    isLoading: sellerInfoLoading,
    isError: sellerInfoError,
  } = useClientSellerInfo(requireClientSellerInfo ? customer?.id : undefined);
  const [showSellerInfoModal, setShowSellerInfoModal] = useState(false);
  // Tras guardar la ubicación en el modal, se reintenta crear el pedido solo
  // cuando la consulta ya refleje el registro recién guardado.
  const [retrySubmitAfterSave, setRetrySubmitAfterSave] = useState(false);
  // Clave de idempotencia del pedido en curso para este cliente: se guarda en
  // sessionStorage para que sobreviva si la conexión es lenta y el vendedor
  // reintenta (vuelve atrás y crea el pedido de nuevo); así el backend
  // reconoce el reintento y no duplica el pedido.
  const [idempotencyKey, setIdempotencyKey] = useState('');
  useEffect(() => {
    if (!customer?.id) {
      setIdempotencyKey('');
      return;
    }
    const storageKey = `order-idem:${customer.id}`;
    const existing = sessionStorage.getItem(storageKey);
    if (existing) {
      setIdempotencyKey(existing);
      return;
    }
    const key = crypto.randomUUID();
    sessionStorage.setItem(storageKey, key);
    setIdempotencyKey(key);
  }, [customer?.id]);
  // Asociar pedido: cuando el cliente ya tiene un pedido hoy (p. ej. faltó un
  // producto por inventario rotativo), se ofrece asociar el nuevo pedido al
  // anterior para que quede marcado en alistamiento/despacho. Solo aplica a
  // cortes (los subproductos no usan este flujo).
  const [associationDecided, setAssociationDecided] = useState(false);
  const [linkedOrderId, setLinkedOrderId] = useState<string | undefined>(undefined);
  const [linkedOrderSummary, setLinkedOrderSummary] = useState<Order | null>(null);
  const [associationStep, setAssociationStep] = useState<'ask' | 'list' | 'detail' | null>(null);
  const [associationDetailOrder, setAssociationDetailOrder] = useState<Order | null>(null);
  useEffect(() => {
    setAssociationDecided(false);
    setLinkedOrderId(undefined);
    setLinkedOrderSummary(null);
    setAssociationStep(null);
    setAssociationDetailOrder(null);
  }, [customer?.id]);
  const { data: todayOrders = [] } = useTodayOrdersForCustomer(
    customer?.id,
    associationStep === 'list',
  );
  const { data: products = [], isFetching: productsLoading } = useProductsForList(
    productSearch,
    customer?.priceList,
    isSubproducto ? 'subproducto' : undefined,
  );
  // Productos estrella/favoritos de la compañía (para priorizar y avisar).
  const { data: featured = [] } = useFeaturedProducts();
  const featuredSkus = useMemo(() => new Set(featured.map((f) => f.sku)), [featured]);
  // Catálogo ordenado con los productos estrella de primero (prioridad visual).
  const sortedProducts = useMemo(() => {
    if (featuredSkus.size === 0) return products;
    return [...products].sort(
      (a, b) => (featuredSkus.has(a.sku) ? 0 : 1) - (featuredSkus.has(b.sku) ? 0 : 1),
    );
  }, [products, featuredSkus]);
  // Subproductos: se divide el catálogo por especie (CERDO / RES). Los que no
  // traen categoría se muestran en ambas pestañas para no perderlos.
  // Cortes: Cerdo = categoría CERDO; Res = todo lo demás (incluye Carnes
  // Frías, Víveres y los que no traen categoría), para no perder ninguno.
  const cerdoProducts = useMemo(
    () =>
      sortedProducts.filter((p) =>
        isSubproducto ? !p.category || p.category === 'CERDO' : p.category === 'CERDO',
      ),
    [sortedProducts, isSubproducto],
  );
  const resProducts = useMemo(
    () =>
      sortedProducts.filter((p) =>
        isSubproducto ? !p.category || p.category === 'RES' : p.category !== 'CERDO',
      ),
    [sortedProducts, isSubproducto],
  );
  const visibleProducts = species === 'CERDO' ? cerdoProducts : resProducts;
  const createOrder = useCreateOrder();

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxes = 0;
    for (const line of cart) {
      const gross = line.unitPrice * line.quantity;
      const net = gross - (gross * line.discountPct) / 100;
      subtotal += net;
      // El IVA se agrega solo para mostrarlo (el precio base va sin IVA).
      taxes += (net * (line.product.taxRate ?? 0)) / 100;
    }
    return { subtotal, taxes, total: subtotal + taxes };
  }, [cart]);

  // Tope mínimo de pedido según la compañía activa. Los subproductos no tienen
  // monto mínimo.
  const minOrderTotal = isSubproducto ? 0 : getMinOrderTotal(company?.id);
  // El mínimo es por día por cliente: si el cliente ya pidió hoy, no se exige.
  const { data: customerOrderedToday = false } = useCustomerHasOrderToday(customer?.id);
  const belowMinimum = minOrderTotal > 0 && totals.subtotal < minOrderTotal && !customerOrderedToday;
  // MONTERIA TAT AGROPECUARIA: se pueden montar pedidos a cualquier hora.
  const hoursOk = withinHours || company?.id === 'MTAT';

  const totalUnits = useMemo(() => cart.reduce((acc, l) => acc + l.quantity, 0), [cart]);

  const selectCustomer = (c: Client) => {
    if (c.id !== customer?.id) {
      setCart([]);
      setProductSearch('');
    }
    setCustomer(c);
    setDeliverySchedule(c.deliverySchedule ?? null);
    setSubmitError('');
    setStep(2);
  };

  const addProduct = (product: SellableProduct) => {
    // No se puede vender lo que no hay en inventario.
    if (Number(product.stock) <= 0) return;
    const unitPrice = Number(product.price);
    setCart((prev) => {
      const existing = prev.find((l) => l.product.sku === product.sku);
      if (existing) {
        // Se vende de uno en uno: cada toque suma una unidad.
        return prev.map((l) =>
          l.product.sku === product.sku ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { product, quantity: 1, discountPct: 0, unitPrice }];
    });
  };

  const updateQty = (sku: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) =>
          l.product.sku === sku ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l,
        )
        .filter((l) => l.quantity > 0),
    );
  };

  // Permite escribir la cantidad directamente. Se admite 0 temporalmente para
  // poder borrar y reescribir; el valor 0 se filtra al salir del campo (onBlur).
  const setQty = (sku: string, value: number) => {
    setCart((prev) =>
      prev.map((l) =>
        l.product.sku === sku ? { ...l, quantity: Math.max(0, Math.floor(value) || 0) } : l,
      ),
    );
  };

  const removeLine = (sku: string) => {
    setCart((prev) => prev.filter((l) => l.product.sku !== sku));
  };

  const handleSubmit = async (skipFeaturedCheck = false) => {
    if (!customer || cart.length === 0) return;
    if (!deliveryDate) {
      setSubmitError('Selecciona la fecha de entrega del pedido.');
      return;
    }
    // Segundo pedido del mismo cliente el mismo día (solo cortes): se
    // pregunta si se debe asociar al pedido ya creado (p. ej. para completar
    // un producto que faltó por inventario rotativo).
    if (!isSubproducto && customerOrderedToday && !associationDecided) {
      setAssociationStep('ask');
      return;
    }
    // Aviso de productos estrella no incluidos (solo cortes). Si faltan, se
    // muestra el modal informativo antes de crear el pedido.
    if (!skipFeaturedCheck && !isSubproducto) {
      const missing = featured.filter((f) => !cart.some((l) => l.product.sku === f.sku));
      if (missing.length > 0) {
        setFeaturedWarning(missing);
        return;
      }
    }
    setFeaturedWarning(null);
    // No se puede montar el pedido sin cruzar antes la ubicación del cliente
    // que digita el vendedor (se pide una sola vez por cliente). Se revisa
    // acá, ya superado el aviso de productos estrella.
    if (requireClientSellerInfo) {
      if (sellerInfoLoading) {
        setSubmitError('Cargando la información del cliente, intenta de nuevo en un momento.');
        return;
      }
      if (sellerInfoError) {
        setSubmitError('No se pudo verificar la ubicación del cliente. Intenta de nuevo.');
        return;
      }
      // Fail-closed: si no hay registro confirmado (null o aún sin datos), se
      // exige diligenciarlo antes de permitir el pedido.
      if (!sellerInfo) {
        setSubmitError('Antes de crear el pedido debes registrar la ubicación del cliente.');
        setShowSellerInfoModal(true);
        return;
      }
    }
    setSubmitError('');
    let order: Order;
    try {
      order = await createOrder.mutateAsync({
        customerId: customer.id,
        notes: notes || undefined,
        logisticsNote: logisticsNote || undefined,
        deliveryType,
        deliverySchedule: isScheduleComplete(deliverySchedule)
          ? formatDeliverySchedule(deliverySchedule)
          : undefined,
        deliveryScheduleData: deliverySchedule ?? undefined,
        deliveryDate,
        items: cart.map((l) => ({
          sku: l.product.sku,
          quantity: l.quantity,
          discountPct: l.discountPct,
        })),
        ...(isSubproducto ? { orderType: 'subproducto' } : {}),
        idempotencyKey,
        linkedOrderId,
      });
    } catch (err) {
      if (isAxiosError(err)) {
        const msg = err.response?.data?.message;
        setSubmitError(
          (Array.isArray(msg) ? msg.join(', ') : msg) ||
            'No se pudo crear el pedido. Intenta de nuevo.',
        );
      } else {
        setSubmitError('No se pudo crear el pedido. Intenta de nuevo.');
      }
      return;
    }
    // El documento PDF queda disponible para descargarlo manualmente desde
    // el módulo de Pedidos (no se descarga automáticamente).
    if (customer) sessionStorage.removeItem(`order-idem:${customer.id}`);
    setAssociationDecided(false);
    setLinkedOrderId(undefined);
    setLinkedOrderSummary(null);
    setCreatedOrder(order);
  };

  // Tras guardar la ubicación del cliente en el modal, se reintenta crear el
  // pedido automáticamente en cuanto la consulta confirme el nuevo registro.
  // Se omite el aviso de productos estrella porque ya se superó antes de
  // llegar al modal de ubicación.
  useEffect(() => {
    if (requireClientSellerInfo && retrySubmitAfterSave && sellerInfo) {
      setRetrySubmitAfterSave(false);
      handleSubmit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retrySubmitAfterSave, sellerInfo]);

  // Subproductos / canales: valida el permiso (por si se entra por URL).
  if (tipo === 'subproductos' || tipo === 'canales') {
    const allowed =
      user?.role === 'admin' || (company?.permissions ?? []).includes(`/pedidos/${tipo}`);
    if (!allowed) {
      return (
        <PageBackground className="flex min-h-[60vh] items-center justify-center">
          <div
            className="flex w-full max-w-md flex-col items-center gap-3 rounded-[24px] bg-white p-8 text-center"
            style={{ border: `1px solid ${BRAND.border}` }}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
              <Lock className="h-7 w-7 text-red-600" />
            </span>
            <h2 className="text-xl font-extrabold">Sin permiso</h2>
            <p className="text-sm" style={{ color: BRAND.textMuted }}>
              No tienes permiso para tomar pedidos de{' '}
              {tipo === 'canales' ? 'Canales' : 'Subproductos'}.
            </p>
            <BrandButton variant="outlined" onClick={() => navigate('/pedidos')}>
              Volver a Pedidos
            </BrandButton>
          </div>
        </PageBackground>
      );
    }
    if (tipo === 'canales') return <CanalOrderForm />;
  }

  const canContinue = step === 1 ? !!customer : step === 2 ? cart.length > 0 : true;
  const submitDisabled =
    !customer || cart.length === 0 || !deliveryDate || !hoursOk || createOrder.isPending;

  const goBack = () => {
    if (step === 1) navigate('/pedidos');
    else setStep((s) => (s - 1) as Step);
  };

  return (
    <PageBackground className="space-y-3.5 pb-32">
      {/* Encabezado con barra de pasos (_StepBar en la app) */}
      <Hero>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goBack}
            aria-label="Volver"
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="flex-1 truncate text-xl font-extrabold leading-tight tracking-[-0.4px] sm:text-[22px]">
            {isSubproducto ? 'Nuevo pedido · Subproductos' : 'Nuevo pedido'}
          </h2>
        </div>
        <ol className="mt-4 flex items-center gap-1.5 sm:gap-2">
          {STEPS.map((s, i) => {
            const done = step > s.n;
            const active = step === s.n;
            return (
              <li
                key={s.n}
                className={cn('flex items-center gap-1.5 sm:flex-1 sm:gap-2', active && 'flex-1')}
              >
                <button
                  type="button"
                  disabled={!done}
                  onClick={() => setStep(s.n)}
                  className="flex min-w-0 items-center gap-2 disabled:cursor-default"
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold',
                      done || active ? 'bg-white' : 'bg-white/25 text-white',
                    )}
                    style={done || active ? { color: BRAND.primaryDark } : undefined}
                  >
                    {done ? <Check className="h-4 w-4" /> : s.n}
                  </span>
                  {/* En móvil solo se muestra la etiqueta del paso activo */}
                  <span
                    className={cn(
                      'truncate text-[13px]',
                      active ? 'font-extrabold text-white' : 'hidden font-semibold text-white/75 sm:inline',
                    )}
                  >
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <span
                    className={cn(
                      'h-0.5 min-w-3 flex-1 rounded-full',
                      done ? 'bg-white' : 'bg-white/25',
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </Hero>

      {!hoursOk && (
        <div
          className="flex items-start gap-2.5 rounded-2xl px-4 py-3 text-[13px]"
          style={{ backgroundColor: AMBER.bg, border: `1px solid ${AMBER.border}`, color: AMBER.text }}
        >
          <AlertTriangle className="mt-0.5 h-[18px] w-[18px] shrink-0" style={{ color: AMBER.icon }} />
          <span>
            <strong>Fuera de horario.</strong> La toma de pedidos está disponible {scheduleRangeText}.
            Puedes armar el pedido, pero no podrás enviarlo hasta que abra el horario.
          </span>
        </div>
      )}

      {/* Paso 1 · Cliente */}
      {step === 1 && (
        <section className="space-y-3">
          <BrandInput
            icon={Search}
            autoFocus
            placeholder="Buscar cliente por nombre o NIT"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
          />
          {customers.length === 0 ? (
            customersLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: BRAND.primary }} />
              </div>
            ) : (
              <EmptyMessage
                icon={UserCircle}
                text={
                  customerSearch
                    ? 'No se encontraron clientes con esa búsqueda.'
                    : 'Escribe el nombre o NIT del cliente para comenzar.'
                }
              />
            )
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {customers.map((c) => {
                const selected = customer?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCustomer(c)}
                    className="flex items-center gap-3 rounded-[18px] bg-white p-3.5 text-left transition-colors hover:bg-[#F4FAF6]"
                    style={{
                      border: `1.5px solid ${selected ? BRAND.primary : `${BRAND.border}CC`}`,
                    }}
                  >
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-extrabold"
                      style={{ backgroundColor: '#E8F5EC', color: BRAND.primaryDark }}
                    >
                      {initials(c.name) || '?'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-extrabold">{c.name}</span>
                      <span className="block truncate text-xs" style={{ color: BRAND.textSoft }}>
                        NIT {c.code}
                        {c.branchName || c.branch ? ` · ${c.branchName || c.branch}` : ''}
                        {c.city ? ` · ${c.city}` : ''}
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0" style={{ color: BRAND.textSoft }} />
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Paso 2 · Productos */}
      {step === 2 && customer && (
        <section className="space-y-3">
          <TitledCard className="!p-3">
            <div className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-extrabold"
                style={{ backgroundColor: '#E8F5EC', color: BRAND.primaryDark }}
              >
                {initials(customer.name) || '?'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-extrabold">{customer.name}</p>
                <p className="truncate text-xs" style={{ color: BRAND.textSoft }}>
                  NIT {customer.code}
                  {customer.priceListName || customer.priceList
                    ? ` · Lista ${customer.priceListName || customer.priceList}`
                    : ''}
                  {customer.paymentTerm ? ` · ${customer.paymentTerm}` : ''}
                </p>
              </div>
              <BrandButton variant="text" className="h-9 px-3 text-[13px]" onClick={() => setStep(1)}>
                Cambiar
              </BrandButton>
            </div>
          </TitledCard>

          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Segmented
              className="sm:w-72"
              value={species}
              onChange={setSpecies}
              options={[
                ...(isSubproducto
                  ? [
                      { value: 'CERDO' as const, label: `Cerdo (${cerdoProducts.length})` },
                      { value: 'RES' as const, label: `Res (${resProducts.length})` },
                    ]
                  : [
                      { value: 'RES' as const, label: `Res (${resProducts.length})` },
                      { value: 'CERDO' as const, label: `Cerdo (${cerdoProducts.length})` },
                    ]),
              ]}
            />
            <BrandInput
              icon={Search}
              placeholder="Buscar producto o código"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="flex-1"
            />
          </div>

          {visibleProducts.length === 0 ? (
            productsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: BRAND.primary }} />
              </div>
            ) : (
              <EmptyMessage icon={Package} text="No hay productos para mostrar." />
            )
          ) : (
            <div
              className="overflow-hidden rounded-[20px] bg-white"
              style={{ border: `1px solid ${BRAND.border}CC` }}
            >
              {visibleProducts.map((p, i) => {
                const line = cart.find((l) => l.product.sku === p.sku);
                const hasStock = Number(p.stock) > 0;
                const isStar = featuredSkus.has(p.sku);
                return (
                  <div
                    key={p.sku}
                    className={cn(
                      'flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3 sm:flex-nowrap sm:px-4',
                      i > 0 && 'border-t',
                      !hasStock && 'opacity-60',
                    )}
                    style={{ borderColor: `${BRAND.border}99` }}
                  >
                    <div className="min-w-[180px] flex-1 sm:min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isStar && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-amber-950">
                            <Star className="h-3 w-3 fill-amber-950" />
                            Estrella
                          </span>
                        )}
                        <p className="text-sm font-bold leading-tight">{p.name}</p>
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs" style={{ color: BRAND.textSoft }}>
                        <span>{p.sku}</span>
                        {p.unitOfMeasure && <span>· {p.unitOfMeasure}</span>}
                        <span className={cn('inline-flex items-center gap-1 font-semibold', hasStock ? 'text-emerald-600' : 'text-red-600')}>
                          <Boxes className="h-3 w-3" />
                          {hasStock ? `Stock ${formatInt(Number(p.stock))}` : 'Sin stock'}
                        </span>
                      </p>
                      <p className="mt-1 text-sm font-extrabold">{formatMoney(Number(p.price))}</p>
                    </div>
                    <QtyControl
                      quantity={line?.quantity ?? 0}
                      disabled={!hasStock}
                      onAdd={() => addProduct(p)}
                      onInc={() => updateQty(p.sku, 1)}
                      onDec={() => updateQty(p.sku, -1)}
                      onSet={(v) => setQty(p.sku, v)}
                      onBlur={() => line && line.quantity <= 0 && removeLine(p.sku)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Paso 3 · Entrega */}
      {step === 3 && customer && (
        <section className="grid gap-3.5 lg:grid-cols-2">
          <div className="space-y-3.5">
            <TitledCard
              title={`Resumen (${cart.length})`}
              icon={ClipboardList}
              trailing={
                <BrandButton variant="text" className="h-8 px-2.5 text-xs" onClick={() => setStep(2)}>
                  <Plus className="h-3.5 w-3.5" />
                  Agregar
                </BrandButton>
              }
            >
              <div className="divide-y" style={{ borderColor: `${BRAND.border}99` }}>
                {cart.map((l) => (
                  <div key={l.product.sku} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{l.product.name}</p>
                      <p className="text-xs" style={{ color: BRAND.textSoft }}>
                        {formatMoney(l.unitPrice)}
                        {l.product.unitOfMeasure ? ` / ${l.product.unitOfMeasure}` : ''}
                        {' · '}
                        <span className="font-semibold" style={{ color: BRAND.text }}>
                          {formatMoney(l.unitPrice * l.quantity)}
                        </span>
                      </p>
                    </div>
                    <QtyControl
                      quantity={l.quantity}
                      onAdd={() => updateQty(l.product.sku, 1)}
                      onInc={() => updateQty(l.product.sku, 1)}
                      onDec={() => updateQty(l.product.sku, -1)}
                      onSet={(v) => setQty(l.product.sku, v)}
                      onBlur={() => l.quantity <= 0 && removeLine(l.product.sku)}
                    />
                    <button
                      type="button"
                      aria-label="Quitar"
                      onClick={() => removeLine(l.product.sku)}
                      className="rounded-full p-1.5 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t pt-3" style={{ borderColor: BRAND.border }}>
                <AmountRow label="Subtotal" value={formatMoney(totals.subtotal)} />
                <AmountRow label="IVA" value={formatMoney(totals.taxes)} />
                <AmountRow label="Total" value={formatMoney(totals.total)} bold />
              </div>
              {belowMinimum && (
                <div
                  className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                  style={{ backgroundColor: AMBER.bg, color: AMBER.text }}
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: AMBER.icon }} />
                  <span>
                    El pedido mínimo para esta compañía es {formatMoney(minOrderTotal)}. Te faltan{' '}
                    <strong>{formatMoney(minOrderTotal - totals.subtotal)}</strong>.
                  </span>
                </div>
              )}
            </TitledCard>

            <TitledCard title="Cliente" icon={UserCircle}>
              <Field label="Nombre" value={customer.name} />
              <Field label="NIT" value={customer.code} />
              <Field label="Sucursal" value={customer.branchName || customer.branch} />
              <Field label="Lista de precios" value={customer.priceListName || customer.priceList} />
              <Field label="Condición de pago" value={customer.paymentTerm} />
              <Field label="Vendedor" value={customer.sellerName} />
              <Field
                label="Dirección"
                value={[customer.address, customer.neighborhood, customer.city].filter(Boolean).join(', ')}
              />
              <Field label="Teléfono" value={customer.phone} />
            </TitledCard>
          </div>

          <div className="space-y-3.5">
            <TitledCard title="Entrega" icon={Truck}>
              <Segmented
                value={deliveryType}
                onChange={setDeliveryType}
                options={[
                  { value: 'despacho' as DeliveryType, label: 'Despacho', icon: Truck },
                  { value: 'recoge_en_planta' as DeliveryType, label: 'Recoge en planta', icon: Warehouse },
                ]}
              />
              <label className="mt-3 block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold" style={{ color: BRAND.textMuted }}>
                  <CalendarDays className="h-3.5 w-3.5" />
                  Fecha de entrega <span className="text-red-600">*</span>
                </span>
                <BrandInput
                  type="date"
                  value={deliveryDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => {
                    setDeliveryDate(e.target.value);
                    if (e.target.value) setSubmitError('');
                  }}
                />
              </label>
              <div className="mt-3">
                <span className="mb-1.5 block text-xs font-bold" style={{ color: BRAND.textMuted }}>
                  Horario de recibido
                </span>
                <DeliverySchedulePicker value={deliverySchedule} onChange={setDeliverySchedule} />
              </div>
            </TitledCard>

            <TitledCard title="Notas" icon={StickyNote}>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold" style={{ color: BRAND.textMuted }}>
                  Observaciones del pedido
                </span>
                <BrandTextarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Instrucciones para el pedido (opcional)"
                />
              </label>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-xs font-bold" style={{ color: BRAND.textMuted }}>
                  Nota para logística
                </span>
                <BrandTextarea
                  rows={2}
                  value={logisticsNote}
                  onChange={(e) => setLogisticsNote(e.target.value)}
                  placeholder="Indicaciones para la entrega (opcional)"
                />
              </label>
            </TitledCard>

            {linkedOrderSummary && (
              <div
                className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
                style={{ backgroundColor: '#E8F5EC', color: BRAND.primaryDark }}
              >
                <span className="flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5 shrink-0" />
                  Se asociará al pedido #
                  {orderNos(linkedOrderSummary.orderNumber, linkedOrderSummary.secondNumber)}
                </span>
                <button
                  type="button"
                  className="shrink-0 underline"
                  onClick={() => {
                    setLinkedOrderId(undefined);
                    setLinkedOrderSummary(null);
                  }}
                >
                  Quitar
                </button>
              </div>
            )}
            {submitError && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Barra inferior fija (bottomNavigationBar en la app) */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 border-t bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:left-[272px]"
        style={{ borderColor: BRAND.border }}
      >
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold" style={{ color: BRAND.textSoft }}>
              {cart.length === 0
                ? 'Sin productos'
                : `${cart.length} producto${cart.length === 1 ? '' : 's'} · ${formatInt(totalUnits)} und.`}
            </p>
            <p className="truncate text-lg font-extrabold leading-tight">{formatMoney(totals.total)}</p>
          </div>
          {step < 3 ? (
            <BrandButton
              className="min-w-[130px] sm:min-w-[150px]"
              disabled={!canContinue}
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              Continuar
              <ArrowRight className="h-4 w-4" />
            </BrandButton>
          ) : (
            <BrandButton className="min-w-[150px] sm:min-w-[170px]" disabled={submitDisabled} onClick={() => handleSubmit()}>
              {createOrder.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Enviar pedido
                </>
              )}
            </BrandButton>
          )}
        </div>
      </div>

      {/* Aviso: productos estrella no agregados al pedido */}
      {featuredWarning && (
        <Modal onClose={() => setFeaturedWarning(null)}>
          <div className="p-6">
            <div className="flex flex-col items-center text-center">
              <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                <Star className="h-7 w-7 fill-amber-400 text-amber-500" />
              </span>
              <h3 className="text-lg font-extrabold">
                {featuredWarning.length === 1
                  ? 'Producto estrella no agregado'
                  : 'Productos estrella no agregados'}
              </h3>
              <p className="mt-1 text-sm" style={{ color: BRAND.textMuted }}>
                ¡Hey vendedor!{' '}
                {featuredWarning.length === 1
                  ? 'Este es el producto estrella/favorito del día y no lo agregaste al pedido.'
                  : 'Estos son los productos estrella/favoritos del día y no los agregaste al pedido.'}{' '}
                ¿Deseas agregarlo o crear el pedido así?
              </p>
            </div>
            <ul className="mt-4 max-h-40 space-y-1.5 overflow-auto">
              {featuredWarning.map((f) => (
                <li
                  key={f.sku}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
                  style={{ backgroundColor: AMBER.bg, color: AMBER.text }}
                >
                  <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500" />
                  <span className="truncate font-semibold">{f.name}</span>
                  <span className="ml-auto shrink-0 text-xs">{f.sku}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <BrandButton
                variant="outlined"
                className="flex-1"
                onClick={() => {
                  setFeaturedWarning(null);
                  setStep(2);
                }}
              >
                <Plus className="h-4 w-4" />
                Agregar producto
              </BrandButton>
              <BrandButton className="flex-1" onClick={() => handleSubmit(true)}>
                <Check className="h-4 w-4" />
                Crear pedido así
              </BrandButton>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal de confirmación del pedido creado (_ResultDialog en la app) */}
      {createdOrder && (
        <Modal>
          <div className="p-6">
            <div className="flex flex-col items-center text-center">
              <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: '#E8F5EC' }}>
                <CheckCircle2 className="h-9 w-9" style={{ color: BRAND.primary }} />
              </span>
              <h3 className="text-lg font-extrabold">¡Pedido creado!</h3>
              <p className="mt-1 text-sm" style={{ color: BRAND.textMuted }}>
                Pedido #{orderNos(createdOrder.orderNumber, createdOrder.secondNumber)} registrado
                correctamente. Puedes descargar el documento aquí o desde Pedidos.
              </p>
              <p className="mt-3 text-3xl font-extrabold tracking-tight">
                {formatMoney(Number(createdOrder.total))}
              </p>
            </div>

            {createdOrder.status === 'pending_approval' && (
              <div
                className="mt-4 rounded-xl px-4 py-3 text-sm"
                style={{ backgroundColor: AMBER.bg, border: `1px solid ${AMBER.border}`, color: AMBER.text }}
              >
                <p className="font-bold">Pendiente por aprobación en cartera</p>
                <p className="mt-1 text-xs">
                  El cliente registra cartera pendiente, por lo que el pedido quedó retenido. Cartera
                  tiene 2 horas para aprobarlo o será desaprobado automáticamente.
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2">
              <BrandButton
                variant="outlined"
                onClick={() => downloadOrderPdf(createdOrder.id, createdOrder.orderNumber)}
              >
                <Download className="h-4 w-4" />
                Descargar documento
              </BrandButton>
              <BrandButton onClick={() => navigate('/pedidos')}>
                Ir a pedidos
                <ArrowRight className="h-4 w-4" />
              </BrandButton>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: ubicación del cliente digitada por el vendedor (una vez por cliente) */}
      {showSellerInfoModal && customer && (
        <ClientSellerInfoModal
          client={customer}
          onClose={() => setShowSellerInfoModal(false)}
          onSaved={() => {
            setShowSellerInfoModal(false);
            setRetrySubmitAfterSave(true);
          }}
        />
      )}

      {/* Asociar pedido: paso 1, preguntar si se desea asociar */}
      {associationStep === 'ask' && (
        <Modal>
          <div className="p-6">
            <div className="flex flex-col items-center text-center">
              <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: '#E8F5EC' }}>
                <Link2 className="h-7 w-7" style={{ color: BRAND.primary }} />
              </span>
              <h3 className="text-lg font-extrabold">¿Asociar este pedido?</h3>
              <p className="mt-1 text-sm" style={{ color: BRAND.textMuted }}>
                Este cliente ya tiene un pedido creado hoy. Si este nuevo pedido completa un producto
                que faltó por inventario, puedes asociarlo al pedido anterior para identificarlo en
                alistamiento y despacho.
              </p>
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <BrandButton
                variant="outlined"
                className="flex-1"
                onClick={() => {
                  setAssociationDecided(true);
                  setAssociationStep(null);
                  handleSubmit();
                }}
              >
                No, es un pedido nuevo
              </BrandButton>
              <BrandButton className="flex-1" onClick={() => setAssociationStep('list')}>
                <Link2 className="h-4 w-4" />
                Sí, asociarlo
              </BrandButton>
            </div>
          </div>
        </Modal>
      )}

      {/* Asociar pedido: paso 2, elegir entre los pedidos de hoy del cliente */}
      {associationStep === 'list' && (
        <Modal>
          <div className="p-6">
            <h3 className="text-lg font-extrabold">Pedidos de hoy de {customer?.name}</h3>
            <p className="mt-1 text-sm" style={{ color: BRAND.textMuted }}>
              Elige el pedido al que se asociará este nuevo pedido.
            </p>
            <ul className="mt-4 max-h-72 space-y-2 overflow-auto">
              {todayOrders.length === 0 ? (
                <p className="px-1 py-4 text-center text-sm" style={{ color: BRAND.textSoft }}>
                  No se encontraron pedidos de hoy para este cliente.
                </p>
              ) : (
                todayOrders.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setAssociationDetailOrder(o);
                        setAssociationStep('detail');
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[#F4FAF6]"
                      style={{ border: `1px solid ${BRAND.border}` }}
                    >
                      <span className="font-extrabold">#{orderNos(o.orderNumber, o.secondNumber)}</span>
                      <span style={{ color: BRAND.textMuted }}>{formatMoney(Number(o.total))}</span>
                      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: BRAND.textSoft }} />
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div className="mt-5">
              <BrandButton variant="outlined" className="w-full" onClick={() => setAssociationStep('ask')}>
                Volver
              </BrandButton>
            </div>
          </div>
        </Modal>
      )}

      {/* Asociar pedido: paso 3, ver el detalle y confirmar la asociación */}
      {associationStep === 'detail' && associationDetailOrder && (
        <Modal className="max-w-lg">
          <div className="p-6">
            <h3 className="text-lg font-extrabold">
              Pedido #{orderNos(associationDetailOrder.orderNumber, associationDetailOrder.secondNumber)}
            </h3>
            <p className="mt-1 text-sm" style={{ color: BRAND.textMuted }}>
              {associationDetailOrder.items.length} producto
              {associationDetailOrder.items.length === 1 ? '' : 's'} · Total{' '}
              {formatMoney(Number(associationDetailOrder.total))}
            </p>
            <ul className="mt-4 max-h-64 space-y-1 overflow-auto text-sm">
              {associationDetailOrder.items.map((it) => (
                <li
                  key={it.sku}
                  className="flex items-center justify-between gap-2 border-b py-1.5"
                  style={{ borderColor: `${BRAND.border}99` }}
                >
                  <span className="truncate">{it.productName}</span>
                  <span className="shrink-0 text-xs font-semibold" style={{ color: BRAND.textSoft }}>
                    {it.quantity} und.
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <BrandButton variant="outlined" className="flex-1" onClick={() => setAssociationStep('list')}>
                Volver
              </BrandButton>
              <BrandButton
                className="flex-1"
                onClick={() => {
                  setLinkedOrderId(associationDetailOrder.id);
                  setLinkedOrderSummary(associationDetailOrder);
                  setAssociationDecided(true);
                  setAssociationStep(null);
                  setAssociationDetailOrder(null);
                  handleSubmit();
                }}
              >
                <Link2 className="h-4 w-4" />
                Asociar
              </BrandButton>
            </div>
          </div>
        </Modal>
      )}
    </PageBackground>
  );
}
