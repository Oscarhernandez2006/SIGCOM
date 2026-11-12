import { useDeferredValue, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  Building2,
  CalendarRange,
  Check,
  FileDown,
  History,
  Loader2,
  Search,
  ShieldCheck,
  Store,
  Wallet,
  X,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import { useAuth } from '@/auth/useAuth';
import { useCompany } from '@/company/useCompany';
import {
  certificateCode,
  downloadCertificatePdf,
  useCertificateClients,
  useCertificatePreview,
  useCertificates,
  useIssueCertificate,
  type CertificateQuery,
} from '@/hooks/useCertificates';
import { COMPANIES } from '@/lib/companies';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime, formatInt, formatMoney, todayISO } from '@/lib/format';
import {
  BrandButton,
  BrandInput,
  BrandTextarea,
  Field,
  Hero,
  InlineNote,
  PageBackground,
  StatusPill,
  TitledCard,
} from '@/components/brand/PageShell';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/brand/Panel';
import { ResponsiveTable } from '@/components/brand/ResponsiveTable';
import type { CertificateClientOption, CertificateData, CommercialCertificate } from '@/types';

const RED = '#DC2626';
const AMBER = '#B45309';
const MAX_RANGE_MONTHS = 24;

type Preset = 3 | 6 | 12 | 'custom';
const PRESETS: { value: Preset; label: string }[] = [
  { value: 3, label: 'Últimos 3 meses' },
  { value: 6, label: 'Últimos 6 meses' },
  { value: 12, label: 'Último año' },
  { value: 'custom', label: 'Personalizado' },
];

function getErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return fallback;
}

/** Resta meses a una fecha YYYY-MM-DD (ajusta al último día del mes si hace falta). */
function shiftMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

/** 14 → "1 año y 2 meses". */
function duration(months?: number): string {
  if (months === undefined) return '—';
  if (months < 1) return 'Menos de un mes';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years === 1 ? '1 año' : `${years} años`;
  const m = rest === 1 ? '1 mes' : `${rest} meses`;
  if (years === 0) return m;
  return rest === 0 ? y : `${y} y ${m}`;
}

function rangeError(from: string, to: string, today: string): string | null {
  if (!from || !to) return 'Indica el periodo (desde y hasta).';
  if (from > to) return 'La fecha inicial no puede ser posterior a la final.';
  if (to > today) return 'La fecha final no puede ser futura.';
  if (monthsBetween(from, to) >= MAX_RANGE_MONTHS) {
    return `El periodo no puede superar ${MAX_RANGE_MONTHS} meses.`;
  }
  return null;
}

const DATE_INPUT =
  'brand-input h-11 w-full rounded-[14px] px-3 text-sm font-medium outline-none';
const FIELD_STYLE = { backgroundColor: BRAND.field, color: BRAND.text } as const;

export function CommercialCertificatesPage() {
  const { user } = useAuth();
  const { company } = useCompany();
  const companies =
    user?.role === 'admin' ? COMPANIES : COMPANIES.filter((c) => c.id === company?.id);
  const [companyId, setCompanyId] = useState(
    () => (companies.some((c) => c.id === company?.id) ? company!.id : companies[0]?.id) ?? '',
  );
  const today = todayISO();

  const [clientSearch, setClientSearch] = useState('');
  const deferredSearch = useDeferredValue(clientSearch);
  const [selected, setSelected] = useState<CertificateClientOption | null>(null);

  const [preset, setPreset] = useState<Preset>(12);
  const [from, setFrom] = useState(() => shiftMonths(today, -12));
  const [to, setTo] = useState(today);
  const [addressedTo, setAddressedTo] = useState('');
  const [notes, setNotes] = useState('');

  const [query, setQuery] = useState<CertificateQuery | null>(null);
  const [issued, setIssued] = useState<CommercialCertificate | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const clients = useCertificateClients(companyId, deferredSearch);
  const preview = useCertificatePreview(query);
  const issue = useIssueCertificate();

  const rangeMsg = rangeError(from, to, today);
  const dirty =
    !query ||
    query.companyId !== companyId ||
    query.nit !== selected?.code ||
    query.from !== from ||
    query.to !== to;

  function resetResult() {
    setIssued(null);
    issue.reset();
  }

  function handleCompany(id: string) {
    setCompanyId(id);
    setSelected(null);
    setClientSearch('');
    setQuery(null);
    resetResult();
  }

  function handlePreset(p: Preset) {
    setPreset(p);
    if (p !== 'custom') {
      setTo(today);
      setFrom(shiftMonths(today, -p));
    }
    resetResult();
  }

  function handleConsult() {
    if (!selected || rangeMsg) return;
    resetResult();
    setQuery({ companyId, nit: selected.code, from, to });
  }

  function handleIssue() {
    if (!query || dirty || !preview.data) return;
    setDownloadError(null);
    issue.mutate(
      { ...query, addressedTo: addressedTo.trim() || undefined, notes: notes.trim() || undefined },
      {
        onSuccess: (cert) => {
          setIssued(cert);
          downloadCertificatePdf(cert).catch(() =>
            setDownloadError('El certificado se emitió, pero no se pudo descargar el PDF. Descárgalo desde el historial.'),
          );
        },
      },
    );
  }

  return (
    <PageBackground className="space-y-3.5">
      <Hero>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20">
            <Award className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold leading-tight tracking-[-0.4px] sm:text-[22px]">
              Certificados de Referencia Comercial
            </h2>
            <p className="mt-1 text-sm font-semibold text-white/90">
              Información comercial y de cartera verificada en Siesa, con formato estándar y soporte de cada
              certificado expedido.
            </p>
          </div>
        </div>
      </Hero>

      {companies.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {companies.map((c) => (
            <button
              key={c.id}
              type="button"
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
            </button>
          ))}
        </div>
      )}

      <Panel>
        <PanelHeader>
          <PanelTitle>Nuevo certificado</PanelTitle>
          <p className="text-xs" style={{ color: BRAND.textSoft }}>
            Elige el cliente y el periodo que se va a analizar; luego consulta Siesa, revisa la información y
            emite el certificado.
          </p>
        </PanelHeader>
        <PanelBody className="space-y-4">
          {/* 1. Cliente */}
          <div>
            <p className="mb-1.5 text-xs font-extrabold uppercase tracking-[0.5px]" style={{ color: BRAND.textMuted }}>
              1. Cliente
            </p>
            {selected ? (
              <div
                className="flex items-center gap-3 rounded-[14px] px-3 py-2.5"
                style={{ backgroundColor: `${BRAND.primary}12`, border: `1px solid ${BRAND.primary}40` }}
              >
                <Store className="h-5 w-5 shrink-0" style={{ color: BRAND.primary }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold">{selected.name}</p>
                  <p className="text-xs" style={{ color: BRAND.textSoft }}>
                    NIT {selected.code}
                    {selected.branches > 1 ? ` · ${selected.branches} sucursales` : ''}
                  </p>
                </div>
                <BrandButton
                  variant="text"
                  className="h-9 px-3"
                  onClick={() => {
                    setSelected(null);
                    setQuery(null);
                    resetResult();
                  }}
                >
                  <X className="h-4 w-4" />
                  Cambiar
                </BrandButton>
              </div>
            ) : (
              <div className="space-y-2">
                <BrandInput
                  icon={Search}
                  placeholder="Buscar por nombre o NIT (mínimo 2 caracteres)"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
                {clientSearch.trim().length >= 2 && (
                  <div
                    className="max-h-64 overflow-y-auto rounded-[14px] bg-white"
                    style={{ border: `1px solid ${BRAND.border}` }}
                  >
                    {clients.isLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin" style={{ color: BRAND.primary }} />
                      </div>
                    ) : clients.isError ? (
                      <p className="px-3 py-3 text-sm font-semibold text-red-700">
                        {getErrorMessage(clients.error, 'No se pudieron buscar los clientes.')}
                      </p>
                    ) : (clients.data ?? []).length === 0 ? (
                      <p className="px-3 py-3 text-sm" style={{ color: BRAND.textSoft }}>
                        Sin resultados.
                      </p>
                    ) : (
                      (clients.data ?? []).map((c, i) => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => {
                            setSelected(c);
                            setQuery(null);
                            resetResult();
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#F4FAF6]"
                          style={i > 0 ? { borderTop: `1px solid ${BRAND.border}` } : undefined}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold">{c.name}</p>
                            <p className="text-xs" style={{ color: BRAND.textSoft }}>
                              NIT {c.code}
                              {c.city ? ` · ${c.city}` : ''}
                              {c.branches > 1 ? ` · ${c.branches} sucursales` : ''}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Periodo */}
          <div>
            <p className="mb-1.5 text-xs font-extrabold uppercase tracking-[0.5px]" style={{ color: BRAND.textMuted }}>
              2. Periodo a analizar
            </p>
            <div className="mb-2 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => handlePreset(p.value)}
                  className={cn(
                    'h-8 rounded-full border px-3.5 text-[13px] font-bold transition-colors',
                    preset === p.value
                      ? 'border-[#1E9B50] bg-[#1E9B50] text-white'
                      : 'border-[#E2E8F0] bg-white text-[#4B5563] hover:bg-[#F4FAF6]',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold" style={{ color: BRAND.textSoft }}>
                Desde
                <input
                  type="date"
                  className={cn(DATE_INPUT, 'mt-1')}
                  style={FIELD_STYLE}
                  value={from}
                  max={to || today}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPreset('custom');
                    resetResult();
                  }}
                />
              </label>
              <label className="text-xs font-semibold" style={{ color: BRAND.textSoft }}>
                Hasta
                <input
                  type="date"
                  className={cn(DATE_INPUT, 'mt-1')}
                  style={FIELD_STYLE}
                  value={to}
                  min={from}
                  max={today}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPreset('custom');
                    resetResult();
                  }}
                />
              </label>
            </div>
            {rangeMsg && (
              <p className="mt-1.5 text-xs font-semibold" style={{ color: RED }}>
                {rangeMsg}
              </p>
            )}
          </div>

          {/* 3. Destinatario */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <label className="text-xs font-semibold" style={{ color: BRAND.textSoft }}>
              Dirigido a
              <BrandInput
                className="mt-1"
                placeholder="A QUIEN INTERESE"
                maxLength={200}
                value={addressedTo}
                onChange={(e) => setAddressedTo(e.target.value)}
              />
            </label>
            <label className="text-xs font-semibold" style={{ color: BRAND.textSoft }}>
              Observaciones (opcional)
              <BrandTextarea
                className="mt-1"
                rows={1}
                maxLength={1000}
                placeholder="Se imprimen en el certificado"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <BrandButton
              variant="outlined"
              disabled={!selected || !!rangeMsg || (preview.isFetching && !dirty)}
              onClick={handleConsult}
            >
              {preview.isFetching && !dirty ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Consultar en Siesa
            </BrandButton>
            <BrandButton disabled={dirty || !preview.data || issue.isPending} onClick={handleIssue}>
              {issue.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Emitir certificado
            </BrandButton>
          </div>

          {issued && (
            <InlineNote icon={Check} color={BRAND.primary}>
              Certificado <b>{certificateCode(issued)}</b> emitido para {issued.clientName}. El PDF se descargó y
              quedó guardado como soporte en el historial.
            </InlineNote>
          )}
          {downloadError && (
            <InlineNote icon={AlertTriangle} color={AMBER}>
              {downloadError}
            </InlineNote>
          )}
          {issue.isError && (
            <InlineNote icon={AlertCircle} color={RED}>
              {getErrorMessage(issue.error, 'No se pudo emitir el certificado.')}
            </InlineNote>
          )}
        </PanelBody>
      </Panel>

      {query && !dirty && (
        <>
          {preview.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm" style={{ color: BRAND.textSoft }}>
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: BRAND.primary }} />
              Consultando Siesa…
            </div>
          ) : preview.isError ? (
            <InlineNote icon={AlertCircle} color={RED}>
              {getErrorMessage(preview.error, 'No se pudo consultar la información en Siesa.')}
            </InlineNote>
          ) : preview.data ? (
            <CertificatePreview data={preview.data} />
          ) : null}
        </>
      )}

      <CertificatesHistory companyId={companyId} />
    </PageBackground>
  );
}

/** Vista previa de los datos verificados que irán en el certificado. */
function CertificatePreview({ data }: { data: CertificateData }) {
  const { client: c, behavior: b, current: cur } = data;
  const blocked = c.branches.filter((br) => br.blocked);
  const terms = [...new Set(c.branches.map((br) => br.paymentTerm ?? br.paymentTermCode ?? '—'))];

  return (
    <div className="space-y-3">
      {(cur.overdueBalance > 0 || blocked.length > 0 || c.status !== 'ACTIVO') && (
        <div className="space-y-2">
          {c.status !== 'ACTIVO' && (
            <InlineNote icon={AlertTriangle} color={RED}>
              El cliente figura en estado {c.status ?? 'desconocido'} en Siesa.
            </InlineNote>
          )}
          {cur.overdueBalance > 0 && (
            <InlineNote icon={AlertTriangle} color={RED}>
              El cliente tiene {formatMoney(cur.overdueBalance)} vencidos (mora de hasta {cur.maxDaysOverdue} días).
              Quedará reflejado en el certificado.
            </InlineNote>
          )}
          {blocked.length > 0 && (
            <InlineNote icon={AlertTriangle} color={AMBER}>
              Bloqueo por cupo activo en {blocked.length === c.branches.length ? 'todas las sucursales' : `la(s) sucursal(es) ${blocked.map((br) => br.branch).join(', ')}`}.
            </InlineNote>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <TitledCard title="Información comercial" icon={Store}>
          <Field label="Cliente" value={c.name} />
          <Field label="NIT" value={c.code} />
          <Field
            label="Cliente desde"
            value={
              c.since
                ? `${formatDate(c.since)}${c.sinceSource === 'primera_factura' ? ' (primera factura)' : ''}`
                : 'Sin dato en Siesa'
            }
          />
          <Field label="Antigüedad" value={duration(c.relationshipMonths)} />
          <Field label="Estado" value={c.status} />
          <Field label="Plazo de pago" value={terms.join(' / ')} />
          <Field label="Cupo vigente" value={c.totalCreditLimit ? formatMoney(c.totalCreditLimit) : 'Sin cupo'} />
          {c.branches.length > 1 && <Field label="Sucursales" value={formatInt(c.branches.length)} />}
        </TitledCard>

        <TitledCard title="Comportamiento de pagos" icon={CalendarRange}>
          <p className="mb-1 text-xs" style={{ color: BRAND.textSoft }}>
            {formatDate(data.period.from)} – {formatDate(data.period.to)}
          </p>
          <Field label="Facturas emitidas" value={formatInt(b.invoices)} />
          <Field label="Valor facturado" value={formatMoney(b.invoicedAmount)} />
          <Field label="Facturas canceladas" value={formatInt(b.paidInvoices)} />
          <Field
            label="Dentro del plazo"
            value={
              b.paidInvoices ? (
                <span style={{ color: b.onTimePct >= 80 ? BRAND.primary : b.onTimePct >= 50 ? AMBER : RED }}>
                  {formatInt(b.paidOnTime)} ({b.onTimePct.toLocaleString('es-CO')} %)
                </span>
              ) : (
                '—'
              )
            }
          />
          <Field label="Días promedio de pago" value={b.paidInvoices ? `${b.avgPaymentDays.toLocaleString('es-CO')} días` : '—'} />
          <Field label="Mora máxima" value={b.maxDaysLate ? `${b.maxDaysLate} días` : 'Sin mora'} />
          <Field label="Último pago" value={b.lastPaymentDate ? formatDate(b.lastPaymentDate) : '—'} />
        </TitledCard>

        <TitledCard title="Estado actual de la cartera" icon={Wallet}>
          <Field label="Saldo total" value={formatMoney(cur.totalBalance)} />
          <Field
            label="Saldo vencido"
            value={<span style={{ color: cur.overdueBalance > 0 ? RED : undefined }}>{formatMoney(cur.overdueBalance)}</span>}
          />
          <Field label="Documentos pendientes" value={formatInt(cur.openDocuments)} />
          <Field label="Mora actual máxima" value={cur.maxDaysOverdue ? `${cur.maxDaysOverdue} días` : 'Al día'} />
          {c.totalCreditLimit > 0 && (
            <Field
              label="Cupo disponible"
              value={<span style={{ color: cur.creditAvailable < 0 ? RED : BRAND.primary }}>{formatMoney(cur.creditAvailable)}</span>}
            />
          )}
          <p className="mt-2 text-[11px]" style={{ color: BRAND.textSoft }}>
            Verificado en Siesa: {formatDateTime(data.verifiedAt)}
          </p>
        </TitledCard>
      </div>

      {data.documents.length > 0 && (
        <TitledCard title={`Documentos del periodo (${data.documents.length})`} icon={History}>
          <ResponsiveTable className="max-h-80 overflow-y-auto rounded-2xl border border-[#E2E8F0]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#F4FAF6] text-left text-[11px] font-extrabold uppercase tracking-wider text-[#15803D]">
                <tr>
                  <th className="px-3 py-2.5">Factura</th>
                  <th className="px-3 py-2.5">Fecha</th>
                  <th className="px-3 py-2.5">Vence</th>
                  <th className="px-3 py-2.5 text-right">Valor</th>
                  <th className="px-3 py-2.5">Pagada</th>
                  <th className="px-3 py-2.5 text-right">Días pago</th>
                  <th className="px-3 py-2.5 text-right">Retraso</th>
                </tr>
              </thead>
              <tbody>
                {data.documents.map((d) => (
                  <tr key={`${d.branch}-${d.docType}-${d.number}`} className="border-t border-[#E2E8F0]">
                    <td className="px-3 py-2 font-semibold">
                      {d.docType} {d.number}
                    </td>
                    <td className="px-3 py-2">{d.invoiceDate ? formatDate(d.invoiceDate) : '—'}</td>
                    <td className="px-3 py-2">{d.dueDate ? formatDate(d.dueDate) : '—'}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(d.amount)}</td>
                    <td className="px-3 py-2">
                      {d.paidDate ? formatDate(d.paidDate) : <StatusPill label={`Saldo ${formatMoney(d.balance)}`} color={AMBER} />}
                    </td>
                    <td className="px-3 py-2 text-right">{d.paymentDays ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-bold" style={{ color: (d.daysLate ?? 0) > 0 ? RED : BRAND.primary }}>
                      {d.paidDate ? ((d.daysLate ?? 0) > 0 ? `${d.daysLate} días` : 'A tiempo') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        </TitledCard>
      )}
    </div>
  );
}

/** Historial de certificados emitidos (soporte). */
function CertificatesHistory({ companyId }: { companyId: string }) {
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  const { data = [], isLoading, isError, error } = useCertificates(companyId, deferred);
  const [downloading, setDownloading] = useState<string | null>(null);

  async function handleDownload(cert: CommercialCertificate) {
    setDownloading(cert.id);
    try {
      await downloadCertificatePdf(cert);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Certificados emitidos</PanelTitle>
      </PanelHeader>
      <PanelBody className="space-y-3">
        <BrandInput
          icon={Search}
          placeholder="Buscar por cliente o NIT"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: BRAND.primary }} />
          </div>
        ) : isError ? (
          <InlineNote icon={AlertCircle} color={RED}>
            {getErrorMessage(error, 'No se pudieron cargar los certificados.')}
          </InlineNote>
        ) : data.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: BRAND.textSoft }}>
            Aún no se han emitido certificados{search.trim() ? ' con ese criterio' : ''}.
          </p>
        ) : (
          <ResponsiveTable className="rounded-2xl border border-[#E2E8F0]">
            <table className="w-full text-sm">
              <thead className="bg-[#F4FAF6] text-left text-[11px] font-extrabold uppercase tracking-wider text-[#15803D]">
                <tr>
                  <th className="px-3 py-2.5">Certificado</th>
                  <th className="px-3 py-2.5">Expedido</th>
                  <th className="px-3 py-2.5">Cliente</th>
                  <th className="px-3 py-2.5">Periodo</th>
                  <th className="px-3 py-2.5">Dirigido a</th>
                  <th className="px-3 py-2.5">Emitido por</th>
                  <th className="px-3 py-2.5 text-right">PDF</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id} className="border-t border-[#E2E8F0]">
                    <td className="px-3 py-2 font-extrabold">{certificateCode(c)}</td>
                    <td className="px-3 py-2">{formatDateTime(c.createdAt)}</td>
                    <td className="px-3 py-2">
                      <p className="font-semibold">{c.clientName}</p>
                      <p className="text-xs" style={{ color: BRAND.textSoft }}>
                        NIT {c.clientCode}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      {formatDate(c.dateFrom)} – {formatDate(c.dateTo)}
                    </td>
                    <td className="px-3 py-2">{c.addressedTo}</td>
                    <td className="px-3 py-2">{c.issuedByName}</td>
                    <td className="px-3 py-2 text-right">
                      <BrandButton
                        variant="outlined"
                        className="h-9 px-3"
                        disabled={downloading === c.id}
                        onClick={() => void handleDownload(c)}
                      >
                        {downloading === c.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileDown className="h-4 w-4" />
                        )}
                        PDF
                      </BrandButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        )}
      </PanelBody>
    </Panel>
  );
}
