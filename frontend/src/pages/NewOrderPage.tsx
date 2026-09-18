import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Check,
  MapPin,
  Phone,
  Mail,
  Tag,
  CreditCard,
  Building,
  UserCircle,
  CheckCircle2,
  Download,
  Package,
  ClipboardCheck,
  ArrowRight,
  AlertCircle,
  PackageOpen,
  Boxes,
  StickyNote,
  Truck,
  Clock,
  CalendarDays,
  Star,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import {
  useClients,
  useProductsForList,
  useCreateOrder,
  useFeaturedProducts,
  useCustomerHasOrderToday,
  downloadOrderPdf,
} from '@/hooks/useApi';
import { useOrderSchedule } from '@/hooks/useAdminApi';
import { CanalOrderForm } from '@/components/CanalOrderForm';
import { formatCurrency, cn, orderNos } from '@/lib/utils';
import { DeliverySchedulePicker } from '@/components/DeliverySchedulePicker';
import { isScheduleComplete, formatDeliverySchedule } from '@/lib/delivery-schedule';
import { getMinOrderTotal } from '@/lib/companies';
import { useCompany } from '@/company/useCompany';
import { useAuth } from '@/auth/useAuth';
import type {
  CartLine,
  Client,
  DeliverySchedule,
  DeliveryType,
  FeaturedProduct,
  Order,
  SellableProduct,
} from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/** Iniciales para el avatar del cliente. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const STEPS = [
  { n: 1, label: 'Cliente', icon: UserCircle },
  { n: 2, label: 'Productos', icon: Package },
  { n: 3, label: 'Confirmar', icon: ClipboardCheck },
] as const;

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

export function NewOrderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tipo = (searchParams.get('tipo') ?? 'cortes') as
    | 'cortes'
    | 'canales'
    | 'subproductos';
  const isSubproducto = tipo === 'subproductos';
  const { user } = useAuth();
  const [customerSearch, setCustomerSearch] = useState('');
  const [customer, setCustomer] = useState<Client | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notes, setNotes] = useState('');
  const [logisticsNote, setLogisticsNote] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('despacho');
  const [deliverySchedule, setDeliverySchedule] =
    useState<DeliverySchedule | null>(null);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [submitError, setSubmitError] = useState('');
  // Productos estrella que faltan en el carrito (dispara el modal informativo).
  const [featuredWarning, setFeaturedWarning] = useState<
    FeaturedProduct[] | null
  >(null);
  // Solo subproductos: categoría (especie) activa en el catálogo de productos.
  const [subproductoCategory, setSubproductoCategory] = useState<'CERDO' | 'RES'>(
    'CERDO',
  );

  // Se revisa el horario cada minuto para bloquear/desbloquear el botón en vivo.
  // El rango es configurable desde el panel admin (horario de pedidos).
  const { data: orderSchedule } = useOrderSchedule();
  const [withinHours, setWithinHours] = useState(true);
  useEffect(() => {
    setWithinHours(isWithinOrderHours(orderSchedule));
    const id = setInterval(
      () => setWithinHours(isWithinOrderHours(orderSchedule)),
      60_000,
    );
    return () => clearInterval(id);
  }, [orderSchedule]);

  const scheduleRangeText =
    orderSchedule && orderSchedule.enabled
      ? `de ${formatScheduleTime(orderSchedule.openHour, orderSchedule.openMinute)} a ${formatScheduleTime(orderSchedule.closeHour, orderSchedule.closeMinute)}`
      : '';

  const { data: customers = [] } = useClients(customerSearch);
  const { data: products = [] } = useProductsForList(
    productSearch,
    customer?.priceList,
    isSubproducto ? 'subproducto' : undefined,
  );
  // Productos estrella/favoritos de la compañía (para priorizar y avisar).
  const { data: featured = [] } = useFeaturedProducts();
  const featuredSkus = useMemo(
    () => new Set(featured.map((f) => f.sku)),
    [featured],
  );
  // Catálogo ordenado con los productos estrella de primero (prioridad visual).
  const sortedProducts = useMemo(() => {
    if (featuredSkus.size === 0) return products;
    return [...products].sort(
      (a, b) =>
        (featuredSkus.has(a.sku) ? 0 : 1) - (featuredSkus.has(b.sku) ? 0 : 1),
    );
  }, [products, featuredSkus]);
  // Subproductos: se divide el catálogo por especie (CERDO / RES). Los que no
  // traen categoría se muestran en ambas pestañas para no perderlos.
  const visibleProducts = useMemo(() => {
    if (!isSubproducto) return sortedProducts;
    return sortedProducts.filter(
      (p) => !p.category || p.category === subproductoCategory,
    );
  }, [sortedProducts, isSubproducto, subproductoCategory]);
  // Cortes: dos grillas. Cerdo = categoría CERDO; Res = todo lo demás (incluye
  // Carnes Frías, Víveres y los que no traen categoría), para no perder ninguno.
  const cerdoProducts = useMemo(
    () =>
      isSubproducto
        ? []
        : sortedProducts.filter((p) => p.category === 'CERDO'),
    [sortedProducts, isSubproducto],
  );
  const resProducts = useMemo(
    () =>
      isSubproducto
        ? []
        : sortedProducts.filter((p) => p.category !== 'CERDO'),
    [sortedProducts, isSubproducto],
  );
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
    return {
      subtotal,
      taxes,
      total: subtotal + taxes,
    };
  }, [cart]);

  // Tope mínimo de pedido según la compañía activa. Los subproductos no tienen
  // monto mínimo.
  const { company } = useCompany();
  const minOrderTotal = isSubproducto ? 0 : getMinOrderTotal(company?.id);
  // El mínimo es por día por cliente: si el cliente ya pidió hoy, no se exige.
  const { data: customerOrderedToday = false } = useCustomerHasOrderToday(
    customer?.id,
  );
  const belowMinimum =
    minOrderTotal > 0 &&
    totals.subtotal < minOrderTotal &&
    !customerOrderedToday;
  // MONTERIA TAT AGROPECUARIA: se pueden montar pedidos a cualquier hora.
  const hoursOk = withinHours || company?.id === 'MTAT';

  const totalUnits = useMemo(
    () => cart.reduce((acc, l) => acc + l.quantity, 0),
    [cart],
  );

  // Paso actual del flujo guiado (para el stepper).
  const currentStep = !customer ? 1 : cart.length === 0 ? 2 : 3;

  const addProduct = (product: SellableProduct) => {
    // No se puede vender lo que no hay en inventario.
    if (Number(product.stock) <= 0) return;
    const unitPrice = Number(product.price);
    setCart((prev) => {
      const existing = prev.find((l) => l.product.sku === product.sku);
      if (existing) {
        // Se vende de uno en uno: cada toque suma una unidad.
        return prev.map((l) =>
          l.product.sku === product.sku
            ? { ...l, quantity: l.quantity + 1 }
            : l,
        );
      }
      return [...prev, { product, quantity: 1, discountPct: 0, unitPrice }];
    });
  };

  const updateQty = (sku: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) =>
          l.product.sku === sku
            ? { ...l, quantity: Math.max(0, l.quantity + delta) }
            : l,
        )
        .filter((l) => l.quantity > 0),
    );
  };

  // Permite escribir la cantidad directamente (sin tener que dar clic muchas
  // veces). Se admite vacio temporalmente para poder borrar y reescribir; el
  // valor 0 se filtra al salir del campo (onBlur).
  const setQty = (sku: string, value: number) => {
    setCart((prev) =>
      prev.map((l) =>
        l.product.sku === sku
          ? { ...l, quantity: Math.max(0, Math.floor(value) || 0) }
          : l,
      ),
    );
  };

  const updateDiscount = (sku: string, discountPct: number) => {
    setCart((prev) =>
      prev.map((l) =>
        l.product.sku === sku
          ? { ...l, discountPct: Math.min(100, Math.max(0, discountPct)) }
          : l,
      ),
    );
  };

  const removeLine = (sku: string) => {
    setCart((prev) => prev.filter((l) => l.product.sku !== sku));
  };

  // Fila de producto reutilizable (para la lista única de subproductos y para
  // las dos grillas Res/Cerdo de cortes).
  const renderProductRow = (p: SellableProduct) => {
    const inCart = cart.find((l) => l.product.sku === p.sku);
    const hasStock = Number(p.stock) > 0;
    return (
      <button
        key={p.sku}
        onClick={() => addProduct(p)}
        disabled={!hasStock}
        className={cn(
          'group flex w-full items-end justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-all',
          !hasStock
            ? 'cursor-not-allowed border-border opacity-60'
            : inCart
              ? 'border-primary bg-primary/[0.06]'
              : 'border-border hover:border-primary/40 hover:bg-accent',
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {featuredSkus.has(p.sku) && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-950">
              <Star className="h-3 w-3 fill-amber-950" />
              Estrella
            </span>
          )}
          <span className="shrink-0 text-sm font-medium text-muted-foreground">
            {p.sku}
          </span>
          <p className="text-sm font-medium">{p.name}</p>
          {p.unitOfMeasure && (
            <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-sm font-medium text-secondary-foreground">
              {p.unitOfMeasure}
            </span>
          )}
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-sm font-medium',
              hasStock
                ? 'bg-[var(--success)]/10 text-[var(--success)]'
                : 'bg-destructive/10 text-destructive',
            )}
          >
            <Boxes className="h-3 w-3" />
            {hasStock ? `Stock ${Number(p.stock)}` : 'Sin stock'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span
            className={cn(
              'font-semibold',
              hasStock ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {formatCurrency(Number(p.price))}
          </span>
          {hasStock && (
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
                inCart
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground',
              )}
            >
              {inCart ? (
                <span className="text-xs font-bold">{inCart.quantity}</span>
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </span>
          )}
        </div>
      </button>
    );
  };

  const handleSubmit = async (skipFeaturedCheck = false) => {
    if (!customer || cart.length === 0) return;
    if (!deliveryDate) {
      setSubmitError('Selecciona la fecha de entrega del pedido.');
      return;
    }
    // Aviso de productos estrella no incluidos (solo cortes). Si faltan, se
    // muestra el modal informativo antes de crear el pedido.
    if (!skipFeaturedCheck && !isSubproducto) {
      const missing = featured.filter(
        (f) => !cart.some((l) => l.product.sku === f.sku),
      );
      if (missing.length > 0) {
        setFeaturedWarning(missing);
        return;
      }
    }
    setFeaturedWarning(null);
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
    setCreatedOrder(order);
  };

  // Subproductos: valida el permiso (por si se entra por URL) y continúa al
  // flujo normal de toma de pedido. Otras vistas no-cortes siguen en
  // construcción.
  if (tipo === 'subproductos') {
    const allowed =
      user?.role === 'admin' ||
      (company?.permissions ?? []).includes('/pedidos/subproductos');
    if (!allowed) {
      return (
        <div className="mx-auto max-w-lg py-16">
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <h2 className="text-xl font-bold">Sin permiso</h2>
              <p className="text-sm text-muted-foreground">
                No tienes permiso para tomar pedidos de Subproductos.
              </p>
              <Button variant="outline" onClick={() => navigate('/pedidos')}>
                Volver a Pedidos
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
  } else if (tipo === 'canales') {
    const allowed =
      user?.role === 'admin' ||
      (company?.permissions ?? []).includes('/pedidos/canales');
    if (!allowed) {
      return (
        <div className="mx-auto max-w-lg py-16">
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <h2 className="text-xl font-bold">Sin permiso</h2>
              <p className="text-sm text-muted-foreground">
                No tienes permiso para tomar pedidos de Canales.
              </p>
              <Button variant="outline" onClick={() => navigate('/pedidos')}>
                Volver a Pedidos
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return <CanalOrderForm />;
  }

  return (
    <div className="space-y-6">
      {/* Encabezado + stepper guiado */}
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {isSubproducto ? 'Nuevo pedido de subproductos' : 'Nuevo pedido'}
          </h2>
          <p className="text-muted-foreground">
            Sigue los pasos: elige el cliente, agrega productos y confirma.
          </p>
        </div>

        <ol className="flex items-center gap-2">
          {STEPS.map((step, i) => {
            const done = currentStep > step.n;
            const active = currentStep === step.n;
            return (
              <li key={step.n} className="flex flex-1 items-center gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                      done &&
                        'border-primary bg-primary text-primary-foreground',
                      active &&
                        'border-primary bg-primary/10 text-primary ring-4 ring-primary/10',
                      !done &&
                        !active &&
                        'border-border bg-card text-muted-foreground',
                    )}
                  >
                    {done ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <step.icon className="h-4 w-4" />
                    )}
                  </span>
                  <div className="hidden sm:block">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Paso {step.n}
                    </p>
                    <p
                      className={cn(
                        'text-sm font-semibold leading-none',
                        active || done
                          ? 'text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {step.label}
                    </p>
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'h-0.5 flex-1 rounded-full transition-colors',
                      done ? 'bg-primary' : 'bg-border',
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Paso 1 · Cliente */}
          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-5 py-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                1
              </span>
              <div>
                <p className="text-sm font-semibold leading-none">Cliente</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Define la cartera y la lista de precios del pedido
                </p>
              </div>
            </div>
            <CardContent className="space-y-3 p-5">
              {customer ? (
                <div className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                      {initials(customer.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold leading-tight">
                            {customer.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            NIT {customer.code}
                            {customer.branch ? ` · Sucursal ${customer.branch}` : ''}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCustomer(null);
                            setCart([]);
                            setProductSearch('');
                            setDeliverySchedule(null);
                          }}
                        >
                          Cambiar
                        </Button>
                      </div>

                      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                        <p className="flex items-center gap-2">
                          <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
                          {customer.priceList ? (
                            <span>
                              Lista de precios:{' '}
                              <span className="font-medium text-[var(--success)]">
                                {customer.priceListName || customer.priceList}
                              </span>
                            </span>
                          ) : (
                            <span className="font-medium text-destructive">
                              Sin lista de precios
                            </span>
                          )}
                        </p>
                        <p className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
                          {customer.paymentTerm ? (
                            <span>
                              Cond. pago:{' '}
                              <span className="font-medium text-[var(--success)]">
                                {customer.paymentTerm}
                              </span>
                            </span>
                          ) : (
                            <span>Sin condición de pago</span>
                          )}
                        </p>
                        <p className="flex items-center gap-2">
                          <UserCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                          {customer.sellerCode ? (
                            <span>
                              Vendedor:{' '}
                              <span className="font-medium text-[var(--success)]">
                                {customer.sellerName || customer.sellerCode}
                              </span>
                              {customer.sellerName ? ` (${customer.sellerCode})` : ''}
                            </span>
                          ) : (
                            <span>Sin vendedor</span>
                          )}
                        </p>
                        <p className="flex items-center gap-2">
                          <Building className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span>
                            Sucursal:{' '}
                            <span className="font-medium text-[var(--success)]">
                              {customer.branchName || customer.branch || '—'}
                            </span>
                            {customer.branchName && customer.branch
                              ? ` (${customer.branch})`
                              : ''}
                          </span>
                        </p>
                        {customer.address && (
                          <p className="flex items-center gap-2 sm:col-span-2">
                            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span>
                              Dirección:{' '}
                              <span className="font-medium text-[var(--success)]">
                                {customer.address}
                              </span>
                            </span>
                          </p>
                        )}
                        {customer.neighborhood && (
                          <p className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span>
                              Barrio:{' '}
                              <span className="font-medium text-[var(--success)]">
                                {customer.neighborhood}
                              </span>
                            </span>
                          </p>
                        )}
                        {customer.city && (
                          <p className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span>
                              Ciudad:{' '}
                              <span className="font-medium text-[var(--success)]">
                                {customer.city}
                              </span>
                            </span>
                          </p>
                        )}
                        {customer.department && (
                          <p className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span>
                              Departamento:{' '}
                              <span className="font-medium text-[var(--success)]">
                                {customer.department}
                              </span>
                            </span>
                          </p>
                        )}
                        {customer.phone && (
                          <p className="flex items-center gap-2">
                            <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span>
                              Teléfono:{' '}
                              <span className="font-medium text-[var(--success)]">
                                {customer.phone}
                              </span>
                            </span>
                          </p>
                        )}
                        {customer.email && (
                          <p className="flex items-center gap-2 break-all">
                            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span>
                              Email:{' '}
                              <span className="font-medium text-[var(--success)]">
                                {customer.email}
                              </span>
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Buscar cliente por nombre o NIT..."
                      className="pl-9"
                    />
                  </div>
                  {customerSearch ? (
                    <div className="max-h-80 space-y-1 overflow-auto">
                      {customers.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">
                          No se encontraron clientes en tu cartera.
                        </p>
                      ) : (
                        customers.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              setCustomer(c);
                              setDeliverySchedule(c.deliverySchedule ?? null);
                              setCustomerSearch('');
                            }}
                            className="flex w-full items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left text-sm transition-colors hover:border-border hover:bg-accent"
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                              {initials(c.name)}
                            </div>
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <p className="truncate font-medium">{c.name}</p>
                              <p className="text-xs font-medium text-foreground">
                                Sucursal:{' '}
                                <span className="text-[var(--success)]">
                                  {c.branchName || c.branch || '—'}
                                </span>
                                {c.branchName && c.branch ? ` (${c.branch})` : ''}
                                <span className="text-muted-foreground">
                                  {' '}
                                  · NIT {c.code}
                                </span>
                              </p>
                              <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                <span>
                                  Lista:{' '}
                                  <span className="font-medium text-[var(--success)]">
                                    {c.priceListName || c.priceList || '—'}
                                  </span>
                                </span>
                                <span>
                                  · Cond. pago:{' '}
                                  <span className="font-medium text-[var(--success)]">
                                    {c.paymentTerm || '—'}
                                  </span>
                                </span>
                                <span>
                                  · Vendedor:{' '}
                                  <span className="font-medium text-[var(--success)]">
                                    {c.sellerName || c.sellerCode || '—'}
                                  </span>
                                  {c.sellerName && c.sellerCode
                                    ? ` (${c.sellerCode})`
                                    : ''}
                                </span>
                              </div>
                              {c.address && (
                                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  Dirección:{' '}
                                  <span className="font-medium text-[var(--success)]">
                                    {c.address}
                                  </span>
                                </p>
                              )}
                              {(c.neighborhood || c.city || c.department) && (
                                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  Ubicación:{' '}
                                  <span className="font-medium text-[var(--success)]">
                                    {[c.neighborhood, c.city, c.department]
                                      .filter(Boolean)
                                      .join(', ')}
                                  </span>
                                </p>
                              )}
                              {c.phone && (
                                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                  <Phone className="h-3 w-3 shrink-0" />
                                  Teléfono:{' '}
                                  <span className="font-medium text-[var(--success)]">
                                    {c.phone}
                                  </span>
                                </p>
                              )}
                              {c.email && (
                                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                                  <Mail className="h-3 w-3 shrink-0" />
                                  Email:{' '}
                                  <span className="font-medium text-[var(--success)]">
                                    {c.email}
                                  </span>
                                </p>
                              )}
                            </div>
                            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          </button>
                        ))
                      )}
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                      <Search className="h-3.5 w-3.5 shrink-0" />
                      Escribe el nombre o NIT del cliente para empezar.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Paso 2 · Productos */}
          <Card className={cn('overflow-hidden', !customer && 'opacity-60')}>
            <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-5 py-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                2
              </span>
              <div>
                <p className="text-sm font-semibold leading-none">Productos</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Precios según la lista del cliente · stock en tiempo real
                </p>
              </div>
            </div>
            <CardContent className="space-y-3 p-5">
              {!customer ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <PackageOpen className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    Selecciona primero un cliente para ver los precios de su
                    lista.
                  </p>
                </div>
              ) : !customer.priceList ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 py-8 text-center">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                  <p className="px-4 text-sm font-medium text-destructive">
                    El cliente no tiene una lista de precios asignada. No es
                    posible tomar el pedido.
                  </p>
                </div>
              ) : (
                <>
                  {isSubproducto && (
                    <div className="grid grid-cols-2 gap-2">
                      {(['CERDO', 'RES'] as const).map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSubproductoCategory(cat)}
                          className={cn(
                            'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
                            subproductoCategory === cat
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground hover:bg-accent',
                          )}
                        >
                          Subproductos {cat === 'CERDO' ? 'Cerdo' : 'Res'}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Buscar producto por nombre o SKU..."
                      className="pl-9"
                    />
                  </div>
                  {isSubproducto ? (
                    <div className="max-h-[26rem] space-y-1.5 overflow-auto pr-0.5">
                      {visibleProducts.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">
                          No hay productos en la lista del cliente.
                        </p>
                      ) : (
                        visibleProducts.map(renderProductRow)
                      )}
                    </div>
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {/* Grilla RES (incluye Carnes Frías, Víveres y demás) */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between px-1">
                          <h4 className="text-lg font-bold text-primary">Res</h4>
                          <span className="text-xs text-muted-foreground">
                            {resProducts.length}
                          </span>
                        </div>
                        <div className="max-h-[26rem] space-y-1.5 overflow-auto pr-0.5">
                          {resProducts.length === 0 ? (
                            <p className="px-3 py-2 text-sm text-muted-foreground">
                              Sin productos.
                            </p>
                          ) : (
                            resProducts.map(renderProductRow)
                          )}
                        </div>
                      </div>
                      {/* Grilla CERDO */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between px-1">
                          <h4 className="text-lg font-bold text-primary">
                            Cerdo
                          </h4>
                          <span className="text-xs text-muted-foreground">
                            {cerdoProducts.length}
                          </span>
                        </div>
                        <div className="max-h-[26rem] space-y-1.5 overflow-auto pr-0.5">
                          {cerdoProducts.length === 0 ? (
                            <p className="px-3 py-2 text-sm text-muted-foreground">
                              Sin productos.
                            </p>
                          ) : (
                            cerdoProducts.map(renderProductRow)
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Paso 3 · Carrito / resumen */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6 overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-primary/5 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShoppingCart className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold leading-none">
                    Resumen del pedido
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {cart.length === 0
                      ? 'Aún sin productos'
                      : `${cart.length} producto${cart.length === 1 ? '' : 's'} · ${totalUnits} und.`}
                  </p>
                </div>
              </div>
            </div>
            <CardContent className="space-y-4 p-5">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <ShoppingCart className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Toca un producto para agregarlo al pedido.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {cart.map((line) => {
                    const lineTotal =
                      line.unitPrice *
                      line.quantity *
                      (1 - line.discountPct / 100);
                    const lineIva =
                      (lineTotal * (line.product.taxRate ?? 0)) / 100;
                    return (
                      <div
                        key={line.product.sku}
                        className="space-y-2.5 rounded-lg border border-border p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-tight">
                              {line.product.name}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span>{formatCurrency(line.unitPrice)} c/u</span>
                              {line.product.unitOfMeasure && (
                                <span className="rounded bg-secondary px-1.5 py-0.5 font-semibold text-secondary-foreground">
                                  {line.product.unitOfMeasure}
                                </span>
                              )}
                            </p>
                          </div>
                          <button
                            onClick={() => removeLine(line.product.sku)}
                            className="text-muted-foreground transition-colors hover:text-destructive"
                            aria-label="Quitar producto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => updateQty(line.product.sku, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={line.quantity === 0 ? '' : String(line.quantity)}
                              onChange={(e) => {
                                const digits = e.target.value.replace(
                                  /\D/g,
                                  '',
                                );
                                setQty(
                                  line.product.sku,
                                  digits === '' ? 0 : Number(digits),
                                );
                              }}
                              onFocus={(e) => e.target.select()}
                              onBlur={() => {
                                if (line.quantity <= 0)
                                  removeLine(line.product.sku);
                              }}
                              className="h-8 w-20 text-center text-base font-semibold"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => updateQty(line.product.sku, 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={line.discountPct}
                              disabled
                              title="El descuento aún no está habilitado"
                              onChange={(e) =>
                                updateDiscount(
                                  line.product.sku,
                                  Number(e.target.value),
                                )
                              }
                              className="h-7 w-14 cursor-not-allowed text-right text-xs opacity-60"
                            />
                            <span className="text-xs text-muted-foreground">
                              % dto
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1 border-t border-border/60 pt-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span className="font-semibold">
                              {formatCurrency(lineTotal)}
                            </span>
                          </div>
                          {lineIva > 0 && (
                            <>
                              <div className="flex items-center justify-between text-muted-foreground">
                                <span>IVA ({line.product.taxRate}%)</span>
                                <span>{formatCurrency(lineIva)}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Total</span>
                                <span className="font-semibold">
                                  {formatCurrency(lineTotal + lineIva)}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-1.5 border-t border-border pt-4 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>IVA</span>
                  <span>{formatCurrency(totals.taxes)}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-semibold">Total</span>
                  <span className="text-xl font-bold text-primary">
                    {formatCurrency(totals.total)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <StickyNote className="h-4 w-4 text-muted-foreground" />
                  Nota producto
                </label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej: revisar fechas de vencimiento, fragilidad..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  Tipo de entrega
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeliveryType('despacho')}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors',
                      deliveryType === 'despacho'
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent',
                    )}
                  >
                    <Truck className="h-4 w-4" />
                    Despacho
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryType('recoge_en_planta')}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition-colors',
                      deliveryType === 'recoge_en_planta'
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent',
                    )}
                  >
                    <Building className="h-4 w-4" />
                    Recoge en planta
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  Nota logística
                </label>
                <Input
                  value={logisticsNote}
                  onChange={(e) => setLogisticsNote(e.target.value)}
                  placeholder="Ej: instrucciones de entrega, transporte..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  Fecha de entrega
                  <span className="text-destructive">*</span>
                </label>
                <Input
                  type="date"
                  value={deliveryDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Horario de recibido de pedidos
                </label>
                <p className="text-xs text-muted-foreground">
                  Días y horas en que el cliente puede recibir la mercancía.
                  Queda guardado para este cliente y se podrá modificar.
                </p>
                <DeliverySchedulePicker
                  value={deliverySchedule}
                  onChange={setDeliverySchedule}
                />
              </div>

              <Button
                className="w-full"
                size="lg"
                disabled={
                  !customer ||
                  cart.length === 0 ||
                  !deliveryDate ||
                  !hoursOk ||
                  createOrder.isPending
                }
                onClick={() => handleSubmit()}
              >
                {createOrder.isPending ? (
                  'Guardando...'
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Crear pedido
                  </>
                )}
              </Button>
              {submitError ? (
                <p className="flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{submitError}</span>
                </p>
              ) : !hoursOk ? (
                <p className="flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    La toma de pedidos está disponible {scheduleRangeText}.
                    Fuera de ese horario no se pueden crear pedidos.
                  </span>
                </p>
              ) : belowMinimum ? (
                <p className="flex items-start gap-1.5 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 px-3 py-2 text-center text-xs text-[var(--warning)]">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    El pedido mínimo para esta compañía es{' '}
                    {formatCurrency(minOrderTotal)}. Te faltan{' '}
                    {formatCurrency(minOrderTotal - totals.subtotal)}.
                  </span>
                </p>
              ) : (
                cart.length > 0 && (
                  <p className="text-center text-xs text-muted-foreground">
                    Al crear el pedido se generará el documento PDF, que podrás
                    descargar desde Pedidos.
                  </p>
                )
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Aviso: productos estrella no agregados al pedido */}
      {featuredWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                <Star className="h-7 w-7 fill-amber-400 text-amber-500" />
              </div>
              <h3 className="text-lg font-semibold">
                {featuredWarning.length === 1
                  ? 'Producto estrella no agregado'
                  : 'Productos estrella no agregados'}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
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
                  className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
                >
                  <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500" />
                  <span className="truncate font-medium text-amber-900">
                    {f.name}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-xs text-amber-700">
                    {f.sku}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setFeaturedWarning(null)}
              >
                <Plus className="h-4 w-4" />
                Agregar producto
              </Button>
              <Button className="flex-1" onClick={() => handleSubmit(true)}>
                <Check className="h-4 w-4" />
                Crear pedido así
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación del pedido creado */}
      {createdOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--success)]/10">
                <CheckCircle2 className="h-9 w-9 text-[var(--success)]" />
              </div>
              <h3 className="text-lg font-semibold">¡Pedido creado!</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Pedido #{orderNos(createdOrder.orderNumber, createdOrder.secondNumber)} registrado correctamente.
                Puedes descargar el documento aquí o desde Pedidos.
              </p>
              <p className="mt-3 text-3xl font-bold tracking-tight">
                {formatCurrency(Number(createdOrder.total))}
              </p>
            </div>

            {createdOrder.status === 'pending_approval' && (
              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                <p className="font-medium">Pendiente por aprobación en cartera</p>
                <p className="mt-1 text-xs">
                  El cliente registra cartera pendiente, por lo que el pedido
                  quedó retenido. Cartera tiene 2 horas para aprobarlo o será
                  desaprobado automáticamente.
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  downloadOrderPdf(
                    createdOrder.id,
                    createdOrder.orderNumber,
                  )
                }
              >
                <Download className="h-4 w-4" />
                Descargar documento
              </Button>
              <Button onClick={() => navigate('/pedidos')}>
                Ir a pedidos
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
