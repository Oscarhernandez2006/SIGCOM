import { useEffect, useMemo, useState } from 'react';
import {
  Users,
  RefreshCw,
  Check,
  AlertCircle,
  Search,
  Building2,
  ChevronRight,
  ChevronLeft,
  Mail,
  Phone,
  Wallet,
  X,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import { useClients, useSyncClients, useClientPortfolio } from '@/hooks/useAdminApi';
import { COMPANIES } from '@/lib/companies';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { Client } from '@/types';
import { BRAND } from '@/lib/brand';
import { PageBackground, Hero, BrandButton, StatusPill, Modal } from '@/components/brand/PageShell';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/brand/Panel';
import { ResponsiveTable } from '@/components/brand/ResponsiveTable';

const FIELD_STYLE = { backgroundColor: BRAND.field, color: BRAND.text } as const;

/** Extrae el mensaje de error que envía el backend, si lo hay. */
function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return 'No se pudo completar la operación.';
}

const CLIENTS_PER_PAGE = 10;

export function ClientsPage() {
  const [companyId, setCompanyId] = useState(COMPANIES[0].id);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [portfolioClient, setPortfolioClient] = useState<Client | null>(null);

  const { data: clients = [], isLoading } = useClients(companyId, search);
  const syncClients = useSyncClients();

  const company = COMPANIES.find((c) => c.id === companyId)!;

  const totalPages = Math.max(1, Math.ceil(clients.length / CLIENTS_PER_PAGE));
  const pagedClients = useMemo(
    () =>
      clients.slice((page - 1) * CLIENTS_PER_PAGE, page * CLIENTS_PER_PAGE),
    [clients, page],
  );

  // Volver a la primera página cuando cambian los filtros o los datos.
  useEffect(() => {
    setPage(1);
  }, [search, companyId]);

  function handleCompany(id: string) {
    setCompanyId(id);
    setSearch('');
  }

  function handleSync() {
    syncClients.mutate(companyId);
  }

  return (
    <PageBackground className="space-y-3.5">
      <div>
        <Hero>
        <h2 className="text-xl font-extrabold leading-tight tracking-[-0.4px] sm:text-[22px]">Clientes</h2>
        <p className="mt-1 text-sm font-semibold text-white/90">Clientes sincronizados desde Siesa. Incluye lista de precios,
          condición de pago y vendedor asignado.</p>
      </Hero>
      </div>

      {/* Selector de compañía */}
      <div className="flex flex-wrap gap-2">
        {COMPANIES.map((c) => (
          <button
            key={c.id}
            onClick={() => handleCompany(c.id)}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-bold transition-colors',
              companyId === c.id
                ? 'border-[#1E9B50] bg-[#1E9B50] text-white'
                : 'border-[#E2E8F0] bg-white text-[#4B5563] hover:bg-[#F4FAF6]',
            )}
          >
            <Building2 className="h-4 w-4" />
            {c.name}
            <span className="text-xs opacity-70">#{c.id}</span>
          </button>
        ))}
      </div>

      {/* Acción de sincronización */}
      <Panel>
        <PanelBody className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1E9B50]/10 text-[#1E9B50]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">Clientes · {company.name}</p>
              <p className="text-xs text-[#6B7280]">
                La sincronización trae los cambios desde Siesa y actualiza la
                base de datos.
              </p>
            </div>
          </div>
          <BrandButton className="h-9 px-3" disabled={syncClients.isPending} onClick={handleSync}>
            <RefreshCw
              className={cn('h-4 w-4', syncClients.isPending && 'animate-spin')}
            />
            {syncClients.isPending ? 'Sincronizando…' : 'Sincronizar'}
          </BrandButton>
        </PanelBody>
      </Panel>

      {/* Resultado de la sincronización */}
      {syncClients.isSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-[#1E9B50]/30 bg-[#1E9B50]/10 px-4 py-3 text-sm text-[#1E9B50]">
          <Check className="h-4 w-4" />
          <span>
            {syncClients.data.total} clientes · {syncClients.data.created} nuevos
            · {syncClients.data.updated} actualizados ·{' '}
            {syncClients.data.removed} eliminados.
          </span>
        </div>
      )}
      {syncClients.isError && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          <span>{getErrorMessage(syncClients.error)}</span>
        </div>
      )}

      {/* Listado de clientes */}
      <Panel>
        <PanelHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <PanelTitle className="">
            Clientes ({clients.length}
            {clients.length === 500 && '+'})
          </PanelTitle>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
            <input className="brand-input h-10 w-full rounded-xl pl-10 pr-3 text-sm font-semibold outline-none" style={FIELD_STYLE}
              placeholder="Buscar por nombre, código o vendedor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </PanelHeader>
        <PanelBody>
          {isLoading ? (
            <p className="py-10 text-center text-sm text-[#6B7280]">
              Cargando clientes…
            </p>
          ) : clients.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#6B7280]">
              {search
                ? 'Sin resultados.'
                : 'No hay clientes. Sincroniza desde Siesa.'}
            </p>
          ) : (
            <div>
              <ResponsiveTable>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[#6B7280]">
                    <th className="px-2 py-2 font-medium">Código</th>
                    <th className="px-2 py-2 font-medium">Cliente</th>
                    <th className="px-2 py-2 font-medium">Sucursal</th>
                    <th className="px-2 py-2 font-medium">Lista</th>
                    <th className="px-2 py-2 font-medium">Cond. pago</th>
                    <th className="px-2 py-2 font-medium">Vendedor</th>
                    <th className="px-2 py-2 font-medium">Contacto</th>
                    <th className="px-2 py-2 font-medium">Cartera</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedClients.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 align-top">
                      <td className="px-2 py-2 font-mono text-xs">{c.code}</td>
                      <td className="px-2 py-2">
                        <p className="font-medium">{c.name}</p>
                        {c.address && (
                          <p className="text-xs text-[#6B7280]">
                            {c.address}
                          </p>
                        )}
                        {(c.neighborhood || c.city || c.department) && (
                          <p className="text-xs text-[#6B7280]">
                            {[c.neighborhood, c.city, c.department]
                              .filter(Boolean)
                              .join(', ')}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {c.branchName || c.branch ? (
                          <span>
                            <span className="font-medium text-[#1E9B50]">
                              {c.branchName || c.branch}
                            </span>
                            {c.branchName && c.branch ? (
                              <span className="font-mono text-[#6B7280]">
                                {' '}
                                ({c.branch})
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {c.priceList ? (
                          <StatusPill label={c.priceListName || c.priceList} color={BRAND.textMuted} />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-2 py-2 font-medium text-[#1E9B50]">
                        {c.paymentTerm ?? '—'}
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {c.sellerName || c.sellerCode ? (
                          <span>
                            <span className="font-medium text-[#1E9B50]">
                              {c.sellerName || c.sellerCode}
                            </span>
                            {c.sellerName && c.sellerCode ? (
                              <span className="font-mono text-[#6B7280]">
                                {' '}
                                ({c.sellerCode})
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="space-y-0.5 text-xs">
                          {c.phone && (
                            <p className="flex items-center gap-1">
                              <Phone className="h-3 w-3 text-[#6B7280]" />
                              {c.phone}
                            </p>
                          )}
                          {c.email && (
                            <p className="flex items-center gap-1 break-all">
                              <Mail className="h-3 w-3 shrink-0 text-[#6B7280]" />
                              {c.email}
                            </p>
                          )}
                          {!c.phone && !c.email && '—'}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <BrandButton variant="outlined" className="h-9 px-3" onClick={() => setPortfolioClient(c)}
                        >
                          <Wallet className="h-4 w-4" />
                          Ver
                        </BrandButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </ResponsiveTable>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
                <span className="text-xs text-[#6B7280]">
                  {clients.length} cliente{clients.length === 1 ? '' : 's'}
                  {clients.length === 500 && ' (máx., refina la búsqueda)'}
                </span>
                {clients.length > CLIENTS_PER_PAGE && (
                  <div className="flex items-center gap-2">
                    <BrandButton variant="outlined" className="h-9 px-3" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </BrandButton>
                    <span className="text-xs text-[#6B7280]">
                      {page} / {totalPages}
                    </span>
                    <BrandButton variant="outlined" className="h-9 px-3" disabled={page>= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4" />
                    </BrandButton>
                  </div>
                )}
              </div>
            </div>
          )}
        </PanelBody>
      </Panel>

      {portfolioClient && (
        <PortfolioModal
          companyId={companyId}
          client={portfolioClient}
          onClose={() => setPortfolioClient(null)}
        />
      )}
    </PageBackground>
  );
}

/** Modal con la cartera (documentos por cobrar) de un cliente. */
function PortfolioModal({
  companyId,
  client,
  onClose,
}: {
  companyId: string;
  client: Client;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = useClientPortfolio(
    companyId,
    client.code.trim(),
  );

  const [now] = useState(() => Date.now());

  return (
    <Modal onClose={onClose} className="max-w-3xl">
      <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1E9B50]/10 text-[#1E9B50]">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold tracking-[-0.3px] text-[#111827]">
              {client.name}
            </p>
            <p className="text-xs font-semibold text-[#6B7280]">
              Cartera · NIT/Código {client.code.trim()}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] text-[#4B5563] transition hover:bg-[#E2E8F0]"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
      {isLoading ? (
        <p className="py-10 text-center text-sm font-semibold text-[#6B7280]">
          Consultando cartera…
        </p>
      ) : isError ? (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          <AlertCircle className="h-4 w-4" />
          <span>{getErrorMessage(error)}</span>
        </div>
      ) : !data || data.documents.length === 0 ? (
        <p className="py-10 text-center text-sm font-semibold text-[#6B7280]">
          El cliente no tiene documentos pendientes en cartera.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-gradient-to-br from-[#1E9B50] to-[#15803D] px-5 py-4 text-white shadow-sm">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-white/80">
              Saldo total pendiente
            </p>
            <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
              <span className="text-2xl font-extrabold tracking-[-0.5px]">
                {formatCurrency(data.totalBalance)}
              </span>
              <span className="rounded-full bg-white/[0.16] px-3 py-1 text-xs font-bold">
                {data.count} documento{data.count === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white">
            <ResponsiveTable>
              <table className="w-full text-sm">
                <thead className="bg-[#F4FAF6] text-left text-[11px] font-extrabold uppercase tracking-wider text-[#15803D]">
                  <tr>
                    <th className="px-4 py-3">Documento</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Factura</th>
                    <th className="px-4 py-3">Vence</th>
                    <th className="px-4 py-3">Sucursal</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {data.documents.map((d, i) => {
                    const overdue =
                      !!d.dueDate && new Date(`${d.dueDate.slice(0, 10)}T00:00:00`).getTime() < now;
                    return (
                      <tr key={i} className="hover:bg-[#F4FAF6]/60">
                        <td className="px-4 py-3 font-mono text-xs font-bold text-[#111827]">
                          {d.documentNumber}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-[#4B5563]">
                          {d.description || d.docType || '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-[#4B5563]">
                          {formatDate(d.invoiceDate)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2 py-0.5 font-bold',
                              overdue
                                ? 'bg-red-50 text-red-700'
                                : 'bg-[#1E9B50]/10 text-[#15803D]',
                            )}
                          >
                            {formatDate(d.dueDate)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-[#4B5563]">
                          {d.branch}
                        </td>
                        <td className="px-4 py-3 text-right font-extrabold text-[#111827]">
                          {formatCurrency(d.balance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ResponsiveTable>
          </div>
        </div>
      )}
      </div>
    </Modal>
  );
}
