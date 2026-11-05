import { useMemo, useState } from 'react';
import {
  Search,
  Users,
  Wallet,
  X,
  AlertCircle,
  FileDown,
  Loader2,
  AlertTriangle,
  Store,
  FileText,
  Clock,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import { useClients, useClientPortfolio, useClientPortfolios } from '@/hooks/useApi';
import { useAuth } from '@/auth/useAuth';
import { useCompany } from '@/company/useCompany';
import { formatMoney, formatMoneyShort, formatInt, formatDate } from '@/lib/format';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { exportClientPortfolioPdf, exportSellerPortfolioPdf } from '@/lib/cartera-pdf';
import {
  PageBackground,
  Hero,
  EmptyMessage,
  StatusPill,
  Modal,
  BrandButton,
  TitledCard,
  Segmented,
} from '@/components/brand/PageShell';
import { FadeIn } from '@/components/dashboard/primitives';
import type { Client, ClientPortfolio, PortfolioDocument } from '@/types';

const RED = '#DC2626';
const AMBER = '#B45309';

/** Extrae el mensaje de error que envía el backend, si lo hay. */
function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return 'No se pudo consultar la cartera.';
}

/** Días de mora de un documento (0 si no está vencido). */
function daysOverdue(doc: PortfolioDocument, now = Date.now()): number {
  if (!doc.dueDate) return 0;
  const due = new Date(doc.dueDate).getTime();
  if (Number.isNaN(due) || due >= now) return 0;
  return Math.floor((now - due) / 86_400_000);
}

interface Summary {
  total: number;
  overdue: number;
  current: number;
  maxDaysOverdue: number;
  documentsCount: number;
}

/** Resumen de cartera calculado a partir de los documentos (como PortfolioSummary en la app). */
function summarize(p: ClientPortfolio): Summary {
  let overdue = 0;
  let maxDays = 0;
  for (const d of p.documents) {
    const days = daysOverdue(d);
    if (days > 0 && d.balance > 0) {
      overdue += d.balance;
      maxDays = Math.max(maxDays, days);
    }
  }
  return {
    total: p.totalBalance,
    overdue,
    current: Math.max(0, p.totalBalance - overdue),
    maxDaysOverdue: maxDays,
    documentsCount: p.count,
  };
}

type Filter = 'all' | 'balance' | 'overdue';

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [portfolioClient, setPortfolioClient] = useState<Client | null>(null);
  const { data: customers = [], isLoading, isError, error, refetch } = useClients(search);
  const { user } = useAuth();
  const { company } = useCompany();

  // La cartera es por NIT (misma para todas las sucursales): un cliente por código.
  const uniqueCustomers = useMemo(() => {
    const seen = new Set<string>();
    const out: Client[] = [];
    for (const c of customers) {
      const key = c.code.trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }, [customers]);

  const nits = useMemo(() => uniqueCustomers.map((c) => c.code.trim()), [uniqueCustomers]);
  const { portfolios, isLoading: isLoadingBalances } = useClientPortfolios(nits);

  const summaries = useMemo(() => {
    const out: Record<string, Summary> = {};
    for (const [nit, p] of Object.entries(portfolios)) out[nit] = summarize(p);
    return out;
  }, [portfolios]);

  const stats = useMemo(() => {
    let total = 0;
    let overdue = 0;
    let withBalance = 0;
    for (const s of Object.values(summaries)) {
      total += s.total;
      overdue += s.overdue;
      if (s.total > 0) withBalance++;
    }
    return { total, overdue, withBalance, loaded: Object.keys(summaries).length };
  }, [summaries]);

  // Deuda mayor primero; dentro del filtro elegido.
  const visible = useMemo(() => {
    const list = uniqueCustomers.filter((c) => {
      const s = summaries[c.code.trim()];
      if (filter === 'balance') return (s?.total ?? 0) > 0;
      if (filter === 'overdue') return (s?.overdue ?? 0) > 0;
      return true;
    });
    return list.sort(
      (a, b) => (summaries[b.code.trim()]?.total ?? 0) - (summaries[a.code.trim()]?.total ?? 0),
    );
  }, [uniqueCustomers, summaries, filter]);

  const handleExportSeller = () => {
    void exportSellerPortfolioPdf({
      sellerName: user?.name ?? 'Vendedor',
      companyId: company?.id,
      companyName: company?.name ?? '',
      clients: uniqueCustomers,
      portfolios,
    });
  };

  const progress = nits.length > 0 ? stats.loaded / nits.length : 1;

  return (
    <PageBackground className="space-y-3.5">
      <Hero>
        <div className="flex items-start gap-2">
          <h2 className="flex-1 text-xl font-extrabold leading-tight tracking-[-0.4px] sm:text-[22px]">
            Cartera de clientes
          </h2>
          <button
            type="button"
            onClick={handleExportSeller}
            disabled={uniqueCustomers.length === 0 || isLoadingBalances}
            title={
              isLoadingBalances
                ? 'Consultando la cartera de tus clientes…'
                : 'Descargar el informe de cartera de todos tus clientes'
            }
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white/[0.16] px-3.5 text-[13px] font-bold transition-colors hover:bg-white/25 disabled:opacity-60 disabled:hover:bg-white/[0.16]"
          >
            {isLoadingBalances ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            <span className="hidden sm:inline">Informe PDF</span>
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <HeroStat label="Saldo total" value={formatMoneyShort(stats.total)} />
          <HeroStat label="Vencido" value={formatMoneyShort(stats.overdue)} />
          <HeroStat label="Con saldo" value={formatInt(stats.withBalance)} />
        </div>
        {isLoadingBalances && nits.length > 0 && (
          <div className="mt-3">
            <div className="h-[5px] overflow-hidden rounded bg-white/25">
              <div
                className="h-full rounded bg-white transition-[width] duration-300"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-white/75">
              Consultando saldos en Siesa · {stats.loaded} de {nits.length} clientes
            </p>
          </div>
        )}
        <div className="relative mt-3">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2"
            style={{ color: BRAND.textSoft }}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente o NIT"
            className="h-11 w-full rounded-[14px] bg-white pl-10 pr-3 text-sm font-medium outline-none"
            style={{ color: BRAND.text }}
          />
        </div>
      </Hero>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'Todos'],
            ['balance', 'Con saldo'],
            ['overdue', 'Con vencido'],
          ] as [Filter, string][]
        ).map(([f, label]) => {
          const on = filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className="h-9 rounded-full px-4 text-[13px] font-bold transition-colors"
              style={{
                backgroundColor: on ? BRAND.primary : '#fff',
                color: on ? '#fff' : BRAND.textMuted,
                border: `1px solid ${on ? BRAND.primary : BRAND.border}`,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {isError ? (
        <EmptyMessage
          icon={AlertCircle}
          text={error instanceof Error ? error.message : 'No se pudieron cargar los clientes.'}
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[76px] animate-pulse rounded-2xl bg-white"
              style={{ border: `1px solid ${BRAND.border}CC` }}
            />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <EmptyMessage icon={Users} text="No hay clientes. Sincroniza los terceros desde Siesa." />
      ) : visible.length === 0 ? (
        <EmptyMessage icon={Users} text="No hay clientes con este filtro." />
      ) : (
        <div className="grid gap-2 xl:grid-cols-2">
          {visible.map((c, i) => (
            <FadeIn key={c.id} index={Math.min(i, 12)}>
              <ClientCard
                client={c}
                summary={summaries[c.code.trim()]}
                loading={isLoadingBalances && !summaries[c.code.trim()]}
                onOpen={() => setPortfolioClient(c)}
              />
            </FadeIn>
          ))}
        </div>
      )}

      {portfolioClient && (
        <PortfolioModal
          client={portfolioClient}
          sellerName={user?.name ?? 'Vendedor'}
          companyId={company?.id}
          companyName={company?.name ?? ''}
          onClose={() => setPortfolioClient(null)}
        />
      )}
    </PageBackground>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-white/75">{label}</p>
      <p className="truncate text-lg font-extrabold">{value}</p>
    </div>
  );
}

function ClientCard({
  client,
  summary: s,
  loading,
  onOpen,
}: {
  client: Client;
  summary?: Summary;
  loading: boolean;
  onOpen: () => void;
}) {
  const sub = [`NIT ${client.code.trim()}`, client.city, client.priceListName || client.priceList]
    .filter(Boolean)
    .join(' · ');
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left transition-colors hover:bg-[#F4FAF6]"
      style={{
        border: `1px solid ${s && s.overdue > 0 ? `${RED}59` : BRAND.border}`,
        color: BRAND.text,
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-bold">{client.name}</p>
        <p className="truncate text-xs" style={{ color: BRAND.textSoft }}>
          {sub}
        </p>
        {s && s.overdue > 0 && (
          <div className="mt-1.5">
            <StatusPill
              label={`Vencido ${formatMoneyShort(s.overdue)} · ${s.maxDaysOverdue} días`}
              color={RED}
            />
          </div>
        )}
      </div>
      {loading ? (
        <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" style={{ color: BRAND.primary }} />
      ) : !s ? (
        <span title="No se pudo consultar el saldo">
          <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: AMBER }} />
        </span>
      ) : (
        <div className="shrink-0 text-right">
          <p className="font-extrabold" style={{ color: s.total > 0 ? BRAND.text : BRAND.primary }}>
            {formatMoney(s.total)}
          </p>
          <p className="text-xs" style={{ color: BRAND.textSoft }}>
            {s.total > 0 ? `${s.documentsCount} doc.` : 'Al día'}
          </p>
        </div>
      )}
    </button>
  );
}

const AGING_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: 'Por vencer', min: -Infinity, max: 0 },
  { label: '1–30 días', min: 1, max: 30 },
  { label: '31–60 días', min: 31, max: 60 },
  { label: '61–90 días', min: 61, max: 90 },
  { label: '> 90 días', min: 91, max: Infinity },
];

/** Modal con la cartera (documentos por cobrar) de un cliente (PortfolioDetailScreen en la app). */
function PortfolioModal({
  client,
  sellerName,
  companyId,
  companyName,
  onClose,
}: {
  client: Client;
  sellerName: string;
  companyId?: string;
  companyName: string;
  onClose: () => void;
}) {
  const nit = client.code.trim();
  const { data, isLoading, isError, error } = useClientPortfolio(nit);
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const s = data ? summarize(data) : null;
  const docs = data?.documents ?? [];
  const overdueDocs = docs.filter((d) => daysOverdue(d) > 0);
  const shown = onlyOverdue ? overdueDocs : docs;
  const aging = AGING_BUCKETS.map((b) => ({
    ...b,
    value: docs.reduce((acc, d) => {
      const days = daysOverdue(d);
      return days >= b.min && days <= b.max ? acc + d.balance : acc;
    }, 0),
  })).filter((b) => b.value > 0);

  return (
    <Modal onClose={onClose} className="max-w-2xl">
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${BRAND.border}` }}>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-extrabold">{client.name}</h3>
          <p className="text-xs" style={{ color: BRAND.textSoft }}>
            NIT {nit}
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

      <div className="flex-1 space-y-3 overflow-auto p-4" style={{ backgroundColor: BRAND.background }}>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: BRAND.primary }} />
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{getErrorMessage(error)}</span>
          </div>
        ) : !data || !s ? null : (
          <>
            <TitledCard title={`Saldo al ${formatDate(new Date())}`} icon={Wallet}>
              <p
                className="text-2xl font-extrabold tracking-[-0.5px] sm:text-[28px]"
                style={{ color: s.total > 0 ? BRAND.text : BRAND.primary }}
              >
                {formatMoney(s.total)}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Vencido" value={formatMoney(s.overdue)} color={s.overdue > 0 ? RED : undefined} />
                <Stat label="Por vencer" value={formatMoney(s.current)} />
                <Stat
                  label="Mora máxima"
                  value={s.maxDaysOverdue > 0 ? `${s.maxDaysOverdue} días` : '—'}
                  color={s.maxDaysOverdue > 0 ? RED : undefined}
                />
                <Stat label="Documentos" value={formatInt(s.documentsCount)} />
              </div>
            </TitledCard>

            {aging.length > 0 && (
              <TitledCard title="Antigüedad de saldos" icon={Clock}>
                <div className="space-y-2">
                  {aging.map((b) => (
                    <div key={b.label} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-[13px] font-semibold">{b.label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded" style={{ backgroundColor: BRAND.field }}>
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${Math.max(2, (b.value / Math.max(1, s.total)) * 100)}%`,
                            backgroundColor: b.max <= 0 ? BRAND.primary : RED,
                          }}
                        />
                      </div>
                      <span className="w-24 shrink-0 text-right text-[13px] font-bold">
                        {formatMoneyShort(b.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </TitledCard>
            )}

            <TitledCard title="Cliente" icon={Store}>
              <p className="font-extrabold">
                {client.name} · NIT {nit}
              </p>
              {client.paymentTerm && <p className="text-sm">Condición de pago: {client.paymentTerm}</p>}
              {(client.address || client.city) && (
                <p className="text-sm">{[client.address, client.city].filter(Boolean).join(', ')}</p>
              )}
              {client.phone && <p className="text-sm">Tel. {client.phone}</p>}
            </TitledCard>

            <TitledCard title={`Documentos (${shown.length})`} icon={FileText}>
              <Segmented
                className="mb-3"
                value={onlyOverdue}
                onChange={setOnlyOverdue}
                options={[
                  { value: false, label: `Todos (${docs.length})` },
                  { value: true, label: `Vencidos (${overdueDocs.length})` },
                ]}
              />
              {shown.length === 0 ? (
                <p className="py-4 text-center text-sm" style={{ color: BRAND.textSoft }}>
                  {docs.length === 0 ? 'El cliente no tiene documentos pendientes en cartera.' : 'Sin documentos.'}
                </p>
              ) : (
                shown.map((d, i) => {
                  const days = daysOverdue(d);
                  return (
                    <div
                      key={`${d.documentNumber}-${i}`}
                      className="flex items-start gap-3 py-2.5"
                      style={i > 0 ? { borderTop: `1px solid ${BRAND.border}` } : undefined}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">
                          {d.description || d.docType || 'Documento'} {d.documentNumber}
                        </p>
                        <p className="text-xs" style={{ color: BRAND.textSoft }}>
                          {d.invoiceDate ? `Factura ${formatDate(d.invoiceDate)}` : ''}
                          {d.dueDate ? ` · Vence ${formatDate(d.dueDate)}` : ''}
                          {d.branch ? ` · ${d.branch}` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-extrabold">{formatMoney(d.balance)}</p>
                        <p className={cn('text-xs font-semibold')} style={{ color: days > 0 ? RED : BRAND.primary }}>
                          {days > 0 ? `${days} días de mora` : 'Al día'}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </TitledCard>
          </>
        )}
      </div>

      <div className="flex justify-end px-4 py-3" style={{ borderTop: `1px solid ${BRAND.border}` }}>
        <BrandButton
          className="h-10"
          disabled={!data}
          onClick={() =>
            data && void exportClientPortfolioPdf({ client, portfolio: data, companyId, companyName, sellerName })
          }
        >
          <FileDown className="h-4 w-4" />
          Estado de cartera (PDF)
        </BrandButton>
      </div>
    </Modal>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs" style={{ color: BRAND.textSoft }}>
        {label}
      </p>
      <p className="truncate text-[15px] font-extrabold" style={{ color: color ?? BRAND.text }}>
        {value}
      </p>
    </div>
  );
}
