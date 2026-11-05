import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Loader2,
  FileText,
  CloudOff,
  Download,
  X,
  Store,
  Package,
  StickyNote,
  FilePlus2,
} from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useQuotes, downloadQuotePdf } from '@/hooks/useApi';
import { formatMoney, formatQuantity, formatDate } from '@/lib/format';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';
import {
  PageBackground,
  Hero,
  EmptyMessage,
  StatusPill,
  Modal,
  BrandButton,
  TitledCard,
  AmountRow,
} from '@/components/brand/PageShell';
import { FadeIn } from '@/components/dashboard/primitives';
import type { Quote } from '@/types';

/** Indica si una cotización sigue vigente según su fecha de vencimiento. */
function isExpired(quote: Quote): boolean {
  if (!quote.validUntil) return false;
  return new Date(quote.validUntil).getTime() < Date.now();
}

function ValidityPill({ quote }: { quote: Quote }) {
  if (isExpired(quote)) return <StatusPill label="Vencida" color="#DC2626" />;
  return (
    <StatusPill
      label={quote.validUntil ? `Vigente hasta ${formatDate(quote.validUntil)}` : 'Vigente'}
      color={BRAND.primary}
    />
  );
}

export function QuotesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const showSeller = user?.role !== 'seller';
  const { data: quotes = [], isLoading, isFetching, isError, error, refetch } = useQuotes();
  const [search, setSearch] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [detailTarget, setDetailTarget] = useState<Quote | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return quotes;
    return quotes.filter(
      (x) =>
        x.quoteNumber.toLowerCase().includes(q) ||
        x.customer.name.toLowerCase().includes(q) ||
        x.customer.code.toLowerCase().includes(q),
    );
  }, [quotes, search]);

  const handleDownload = async (quote: Quote) => {
    setDownloadingId(quote.id);
    try {
      await downloadQuotePdf(quote.id, quote.quoteNumber);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <PageBackground className="space-y-3.5 pb-24">
      <Hero>
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-xl font-extrabold leading-tight tracking-[-0.4px] sm:text-[22px]">
            Cotizaciones
          </h2>
          {isFetching && <Loader2 className="h-[18px] w-[18px] animate-spin" />}
        </div>
        <p className="mt-1 text-[13px] font-semibold text-white/85">
          Genera cotizaciones con la lista de precios del cliente.
        </p>
        <div className="relative mt-3">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2"
            style={{ color: BRAND.textSoft }}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, NIT o número"
            className="h-11 w-full rounded-[14px] bg-white pl-10 pr-3 text-sm font-medium outline-none"
            style={{ color: BRAND.text }}
          />
        </div>
      </Hero>

      {isError && (
        <EmptyMessage
          icon={CloudOff}
          text={error instanceof Error ? error.message : 'No se pudieron cargar las cotizaciones.'}
          onRetry={() => refetch()}
        />
      )}

      {isLoading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[120px] animate-pulse rounded-[18px] bg-white"
              style={{ border: `1px solid ${BRAND.border}CC` }}
            />
          ))}
        </div>
      ) : !isError && visible.length === 0 ? (
        <EmptyMessage
          icon={FileText}
          text={search ? 'No hay cotizaciones con esa búsqueda.' : 'Aún no hay cotizaciones.'}
        />
      ) : (
        <div className="grid gap-2.5 xl:grid-cols-2">
          {visible.map((quote, i) => (
            <FadeIn key={quote.id} index={Math.min(i, 12)}>
              <QuoteCard
                quote={quote}
                showSeller={showSeller}
                dimmed={isFetching}
                downloading={downloadingId === quote.id}
                onOpen={() => setDetailTarget(quote)}
                onDownload={() => handleDownload(quote)}
              />
            </FadeIn>
          ))}
        </div>
      )}

      {/* Botón flotante (FloatingActionButton en la app) */}
      <button
        type="button"
        onClick={() => navigate('/cotizaciones/nueva')}
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-30 flex h-14 items-center gap-2 rounded-2xl px-5 text-[15px] font-extrabold text-white transition-transform hover:scale-[1.03] active:scale-95 sm:bottom-6 sm:right-6"
        style={{ backgroundColor: BRAND.primary, boxShadow: `0 10px 24px ${BRAND.primaryDark}66` }}
      >
        <FilePlus2 className="h-5 w-5" />
        Nueva cotización
      </button>

      {detailTarget && (
        <QuoteDetailModal
          quote={detailTarget}
          downloading={downloadingId === detailTarget.id}
          onDownload={() => handleDownload(detailTarget)}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </PageBackground>
  );
}

function QuoteCard({
  quote,
  showSeller,
  dimmed,
  downloading,
  onOpen,
  onDownload,
}: {
  quote: Quote;
  showSeller: boolean;
  dimmed: boolean;
  downloading: boolean;
  onOpen: () => void;
  onDownload: () => void;
}) {
  const sub = [
    quote.customer.branchName || quote.customer.branch || `NIT ${quote.customer.code}`,
    showSeller && quote.seller?.name,
  ]
    .filter(Boolean)
    .join(' · ');
  const count = quote.items.length;
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[18px] bg-white transition-opacity duration-200',
        dimmed && 'opacity-55',
      )}
      style={{ border: `1px solid ${BRAND.border}CC` }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full px-3.5 pb-3 pt-3.5 text-left transition-colors hover:bg-[#F4FAF6]/70"
        style={{ color: BRAND.text }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-extrabold">N.º {quote.quoteNumber}</span>
          <ValidityPill quote={quote} />
          <span className="ml-auto text-xs" style={{ color: BRAND.textSoft }}>
            {formatDate(quote.createdAt)}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-[14.5px] font-bold leading-tight">{quote.customer.name}</p>
        <p className="truncate text-[12.5px]" style={{ color: BRAND.textSoft }}>
          {sub}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[12.5px]" style={{ color: BRAND.textSoft }}>
            {count} producto{count === 1 ? '' : 's'}
          </span>
          <span className="text-base font-extrabold">{formatMoney(Number(quote.total))}</span>
        </div>
      </button>
      <div className="flex items-center gap-1.5 px-3 py-2" style={{ borderTop: `1px solid ${BRAND.border}99` }}>
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-bold transition-colors hover:bg-[#F4FAF6] disabled:opacity-50"
          style={{ color: BRAND.textMuted }}
        >
          <Download className="h-4 w-4" />
          {downloading ? 'Generando…' : 'PDF'}
        </button>
      </div>
    </div>
  );
}

function QuoteDetailModal({
  quote,
  downloading,
  onDownload,
  onClose,
}: {
  quote: Quote;
  downloading: boolean;
  onDownload: () => void;
  onClose: () => void;
}) {
  const email = quote.customer.email?.trim();
  return (
    <Modal onClose={onClose} className="max-w-2xl">
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${BRAND.border}` }}>
        <h3 className="flex-1 text-lg font-extrabold">Cotización N.º {quote.quoteNumber}</h3>
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
        <TitledCard title="Resumen" icon={FileText}>
          <ValidityPill quote={quote} />
          <p className="mt-2.5 text-2xl font-extrabold tracking-[-0.5px] sm:text-[28px]">
            {formatMoney(Number(quote.total))}
          </p>
          <p className="text-[12.5px]" style={{ color: BRAND.textSoft }}>
            Creada el {formatDate(quote.createdAt)}
            {quote.validUntil ? ` · válida hasta el ${formatDate(quote.validUntil)}` : ''}
            {quote.seller?.name ? ` · ${quote.seller.name}` : ''}
          </p>
        </TitledCard>

        <TitledCard title="Cliente" icon={Store}>
          <p className="font-extrabold">{quote.customer.name}</p>
          <p className="mt-1 text-sm">
            NIT {quote.customer.code}
            {quote.customer.branchName || quote.customer.branch
              ? ` · ${quote.customer.branchName || quote.customer.branch}`
              : ''}
          </p>
          <p className="text-sm" style={{ color: email ? BRAND.text : '#B45309' }}>
            {email || 'Sin correo registrado'}
          </p>
          {quote.customer.phone && <p className="text-sm">Tel. {quote.customer.phone}</p>}
        </TitledCard>

        <TitledCard title={`Productos (${quote.items.length})`} icon={Package}>
          {quote.items.map((item, i) => (
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
          <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${BRAND.border}` }}>
            <AmountRow label="Subtotal" value={formatMoney(Number(quote.subtotal))} />
            <AmountRow label="Impuestos" value={formatMoney(Number(quote.taxes))} />
            <AmountRow label="Total" value={formatMoney(Number(quote.total))} bold />
          </div>
        </TitledCard>

        {quote.notes?.trim() && (
          <TitledCard title="Notas" icon={StickyNote}>
            <p className="whitespace-pre-wrap text-sm">{quote.notes}</p>
          </TitledCard>
        )}
      </div>

      <div className="flex justify-end px-4 py-3" style={{ borderTop: `1px solid ${BRAND.border}` }}>
        <BrandButton className="h-10" onClick={onDownload} disabled={downloading}>
          <Download className="h-4 w-4" />
          {downloading ? 'Generando…' : 'Descargar PDF'}
        </BrandButton>
      </div>
    </Modal>
  );
}
