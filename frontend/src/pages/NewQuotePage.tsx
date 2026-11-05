import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Package,
  Plus,
  Search,
  Trash2,
  UserCircle,
  CalendarCheck,
  AlertCircle,
  Percent,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import { useClients, useProductsForList, useCreateQuote, downloadQuotePdf } from '@/hooks/useApi';
import { formatMoney, formatDate, formatInt } from '@/lib/format';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';
import {
  PageBackground,
  Hero,
  EmptyMessage,
  BrandButton,
  BrandInput,
  BrandTextarea,
  Modal,
  TitledCard,
  AmountRow,
} from '@/components/brand/PageShell';
import { QtyControl } from '@/components/brand/QtyControl';
import type { CartLine, Client, Quote, SellableProduct } from '@/types';

type Step = 1 | 2 | 3;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Cliente' },
  { n: 2, label: 'Productos' },
  { n: 3, label: 'Resumen' },
];
const VALIDITY_OPTIONS = [8, 15, 30];

/** Iniciales para el avatar del cliente. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const lineNet = (l: CartLine) => l.unitPrice * l.quantity * (1 - l.discountPct / 100);

export function NewQuotePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customer, setCustomer] = useState<Client | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notes, setNotes] = useState('');
  const [validityDays, setValidityDays] = useState(15);
  const [createdQuote, setCreatedQuote] = useState<Quote | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [discountTarget, setDiscountTarget] = useState<CartLine | null>(null);

  const { data: customers = [], isFetching: customersLoading } = useClients(customerSearch);
  const { data: products = [], isFetching: productsLoading } = useProductsForList(
    productSearch,
    customer?.priceList,
  );
  const createQuote = useCreateQuote();

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, l) => s + lineNet(l), 0);
    return { subtotal, total: subtotal };
  }, [cart]);
  const totalUnits = cart.reduce((s, l) => s + l.quantity, 0);

  const addProduct = (product: SellableProduct) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.sku === product.sku);
      if (existing) {
        return prev.map((l) => (l.product.sku === product.sku ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { product, quantity: 1, discountPct: 0, unitPrice: product.price }];
    });
  };
  const updateQty = (sku: string, delta: number) =>
    setCart((prev) =>
      prev
        .map((l) => (l.product.sku === sku ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0),
    );
  const setQty = (sku: string, value: number) =>
    setCart((prev) =>
      prev.map((l) => (l.product.sku === sku ? { ...l, quantity: Math.max(0, Math.floor(value) || 0) } : l)),
    );
  const removeLine = (sku: string) => setCart((prev) => prev.filter((l) => l.product.sku !== sku));
  const updateDiscount = (sku: string, discountPct: number) =>
    setCart((prev) =>
      prev.map((l) =>
        l.product.sku === sku ? { ...l, discountPct: Math.min(100, Math.max(0, discountPct)) } : l,
      ),
    );

  const selectCustomer = (c: Client) => {
    if (customer && customer.id !== c.id) setCart([]);
    setCustomer(c);
    setStep(2);
  };

  const goBack = () => {
    if (step > 1) setStep((s) => (s - 1) as Step);
    else navigate('/cotizaciones');
  };

  const handleSubmit = async () => {
    if (!customer || cart.length === 0) return;
    setSubmitError('');
    let quote: Quote;
    try {
      quote = await createQuote.mutateAsync({
        customerId: customer.id,
        notes: notes || undefined,
        validityDays,
        items: cart.map((l) => ({ sku: l.product.sku, quantity: l.quantity, discountPct: l.discountPct })),
      });
    } catch (err) {
      if (isAxiosError(err)) {
        const msg = err.response?.data?.message;
        setSubmitError(
          (Array.isArray(msg) ? msg.join(', ') : msg) || 'No se pudo crear la cotización. Intenta de nuevo.',
        );
      } else {
        setSubmitError('No se pudo crear la cotización. Intenta de nuevo.');
      }
      return;
    }
    try {
      await downloadQuotePdf(quote.id, quote.quoteNumber);
    } catch {
      // Si falla la descarga automática, se puede descargar desde Cotizaciones.
    }
    setCreatedQuote(quote);
  };

  const validUntil = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + validityDays);
    return d.toISOString();
  }, [validityDays]);

  const canContinue = step === 1 ? Boolean(customer) : cart.length > 0;

  return (
    <PageBackground className="space-y-3.5 pb-32">
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
            Nueva cotización
          </h2>
        </div>
        <ol className="mt-4 flex items-center gap-1.5 sm:gap-2">
          {STEPS.map((s, i) => {
            const done = step > s.n;
            const active = step === s.n;
            return (
              <li key={s.n} className={cn('flex items-center gap-1.5 sm:flex-1 sm:gap-2', active && 'flex-1')}>
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
                  <span className={cn('h-0.5 min-w-3 flex-1 rounded-full', done ? 'bg-white' : 'bg-white/25')} />
                )}
              </li>
            );
          })}
        </ol>
      </Hero>

      {/* Paso 1 · Cliente */}
      {step === 1 && (
        <section className="space-y-3">
          <BrandInput
            icon={Search}
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
                    style={{ border: `1.5px solid ${selected ? BRAND.primary : `${BRAND.border}CC`}` }}
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
                </p>
              </div>
              <BrandButton variant="text" className="h-9 px-3 text-[13px]" onClick={() => setStep(1)}>
                Cambiar
              </BrandButton>
            </div>
          </TitledCard>

          <BrandInput
            icon={Search}
            placeholder="Buscar producto o código"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />

          {products.length === 0 ? (
            productsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: BRAND.primary }} />
              </div>
            ) : (
              <EmptyMessage icon={Package} text="No hay productos para mostrar." />
            )
          ) : (
            <div className="overflow-hidden rounded-[20px] bg-white" style={{ border: `1px solid ${BRAND.border}CC` }}>
              {products.map((p, i) => {
                const line = cart.find((l) => l.product.sku === p.sku);
                return (
                  <div
                    key={p.sku}
                    className={cn(
                      'flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3 sm:flex-nowrap sm:px-4',
                      i > 0 && 'border-t',
                    )}
                    style={{ borderColor: `${BRAND.border}99` }}
                  >
                    <div className="min-w-[180px] flex-1 sm:min-w-0">
                      <p className="text-sm font-bold leading-tight">{p.name}</p>
                      <p className="mt-0.5 text-xs" style={{ color: BRAND.textSoft }}>
                        {p.sku}
                        {p.unitOfMeasure ? ` · ${p.unitOfMeasure}` : ''}
                      </p>
                      <p className="mt-1 text-sm font-extrabold">{formatMoney(Number(p.price))}</p>
                    </div>
                    <QtyControl
                      quantity={line?.quantity ?? 0}
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

      {/* Paso 3 · Resumen */}
      {step === 3 && customer && (
        <section className="grid gap-3.5 lg:grid-cols-2">
          <TitledCard
            title={customer.name}
            icon={FileText}
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
                        {formatMoney(lineNet(l))}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => setDiscountTarget(l)}
                      className="mt-0.5 text-xs font-bold hover:underline"
                      style={{ color: BRAND.primary }}
                    >
                      {l.discountPct > 0 ? `Dto. ${l.discountPct} % · cambiar` : '+ Agregar descuento'}
                    </button>
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
              <AmountRow label="Total" value={formatMoney(totals.total)} bold />
            </div>
          </TitledCard>

          <div className="space-y-3.5">
            <TitledCard title="Vigencia y notas" icon={CalendarCheck}>
              <div className="flex flex-wrap gap-2">
                {VALIDITY_OPTIONS.map((days) => {
                  const on = validityDays === days;
                  return (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setValidityDays(days)}
                      className="h-9 rounded-full px-4 text-[13px] font-bold transition-colors"
                      style={{
                        backgroundColor: on ? BRAND.primary : BRAND.field,
                        color: on ? '#fff' : BRAND.textMuted,
                      }}
                    >
                      {days} días
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs" style={{ color: BRAND.textSoft }}>
                Válida hasta el {formatDate(validUntil)}
              </p>
              <BrandTextarea
                className="mt-3"
                rows={3}
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas para el cliente (opcional)"
              />
            </TitledCard>
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
      {step > 1 && (
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
              <BrandButton className="min-w-[130px] sm:min-w-[150px]" disabled={!canContinue} onClick={() => setStep(3)}>
                Continuar
                <ArrowRight className="h-4 w-4" />
              </BrandButton>
            ) : (
              <BrandButton
                className="min-w-[150px] sm:min-w-[170px]"
                disabled={cart.length === 0 || createQuote.isPending}
                onClick={() => handleSubmit()}
              >
                {createQuote.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creando…
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Crear cotización
                  </>
                )}
              </BrandButton>
            )}
          </div>
        </div>
      )}

      {discountTarget && (
        <DiscountModal
          line={discountTarget}
          onClose={() => setDiscountTarget(null)}
          onSave={(pct) => {
            updateDiscount(discountTarget.product.sku, pct);
            setDiscountTarget(null);
          }}
        />
      )}

      {createdQuote && (
        <Modal>
          <div className="flex flex-col items-center p-6 text-center">
            <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: '#E8F5EC' }}>
              <CheckCircle2 className="h-9 w-9" style={{ color: BRAND.primary }} />
            </span>
            <h3 className="text-xl font-extrabold">Cotización generada</h3>
            <p className="mt-1 text-sm" style={{ color: BRAND.textMuted }}>
              La cotización <strong>N.º {createdQuote.quoteNumber}</strong> de {createdQuote.customer.name} se creó
              correctamente.
            </p>
            <p className="mt-3 text-3xl font-extrabold tracking-tight">{formatMoney(Number(createdQuote.total))}</p>
            {createdQuote.validUntil && (
              <p className="text-xs" style={{ color: BRAND.textSoft }}>
                Válida hasta el {formatDate(createdQuote.validUntil)}
              </p>
            )}
            <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row">
              <BrandButton
                variant="outlined"
                className="flex-1"
                onClick={() => downloadQuotePdf(createdQuote.id, createdQuote.quoteNumber)}
              >
                <Download className="h-4 w-4" />
                Descargar PDF
              </BrandButton>
              <BrandButton className="flex-1" onClick={() => navigate('/cotizaciones')}>
                Ir a cotizaciones
                <ArrowRight className="h-4 w-4" />
              </BrandButton>
            </div>
          </div>
        </Modal>
      )}
    </PageBackground>
  );
}

/** Diálogo de descuento por línea (_editDiscount en la app). */
function DiscountModal({
  line,
  onClose,
  onSave,
}: {
  line: CartLine;
  onClose: () => void;
  onSave: (pct: number) => void;
}) {
  const [value, setValue] = useState(String(line.discountPct || ''));
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <Modal onClose={onClose}>
      <div className="p-5">
        <h3 className="text-lg font-extrabold">Descuento</h3>
        <p className="mt-0.5 truncate text-sm" style={{ color: BRAND.textSoft }}>
          {line.product.name}
        </p>
        <BrandInput
          className="mt-4"
          icon={Percent}
          type="number"
          min={0}
          max={100}
          step={0.5}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0"
        />
        <p className="mt-2 text-xs" style={{ color: BRAND.textSoft }}>
          Línea con descuento: <strong>{formatMoney(line.unitPrice * line.quantity * (1 - pct / 100))}</strong>
        </p>
        <div className="mt-5 flex gap-2">
          {line.discountPct > 0 && (
            <BrandButton variant="danger-outlined" onClick={() => onSave(0)}>
              Quitar
            </BrandButton>
          )}
          <BrandButton variant="outlined" className="ml-auto" onClick={onClose}>
            Cancelar
          </BrandButton>
          <BrandButton onClick={() => onSave(pct)}>Guardar</BrandButton>
        </div>
      </div>
    </Modal>
  );
}
