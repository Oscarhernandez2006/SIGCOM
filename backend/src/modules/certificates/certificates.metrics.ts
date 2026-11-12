import type {
  CertificateBranch,
  CertificateDocument,
  ClientDetailRaw,
  PaymentBehavior,
  PortfolioHistoryRaw,
} from './certificates.types';

const DAY_MS = 86_400_000;

/** "2026-01-05T00:00:00" → "2026-01-05" (undefined si no hay fecha). */
export function dateOnly(value?: string | null): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed.slice(0, 10) : undefined;
}

/** Días calendario de `from` a `to` (fechas YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

/** Meses completos de `from` a `to` (fechas YYYY-MM-DD). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return Math.max(0, months);
}

/** Fecha de hoy (YYYY-MM-DD) en horario de Colombia. */
export function bogotaToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function clean(value?: string | null): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? undefined : trimmed;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

/** Sucursales del cliente (una por SUCURSAL) a partir del detalle de Siesa. */
export function normalizeBranches(
  rows: ClientDetailRaw[],
): CertificateBranch[] {
  const map = new Map<string, CertificateBranch>();
  for (const r of rows) {
    const branch = clean(r.SUCURSAL) ?? '001';
    if (map.has(branch)) continue;
    map.set(branch, {
      branch,
      name: clean(r.NOMBRE_SUCURSAL),
      status: clean(r.ESTADO_CLIENTE),
      since: dateOnly(r.FECHA_INGRESO_CLIENTE),
      paymentTermCode: clean(r.COND_PAGO),
      paymentTerm: clean(r.DESC_COND_PAGO),
      paymentTermDays:
        r.DIAS_COND_PAGO === null || r.DIAS_COND_PAGO === undefined
          ? undefined
          : Number(r.DIAS_COND_PAGO) || 0,
      creditLimit: Number(r.CUPO_CREDITO) || 0,
      blocked: (r.BLOQUEO_CUPO ?? '').trim().toUpperCase() === 'SI',
      tolerancePct: Number(r.PORC_TOLERANCIA) || 0,
      graceDays: Number(r.DIAS_GRACIA) || 0,
      creditDate: dateOnly(r.FECHA_CUPO),
    });
  }
  return [...map.values()].sort((a, b) => a.branch.localeCompare(b.branch));
}

/** Fecha más antigua no vacía de una lista (YYYY-MM-DD). */
export function earliest(dates: (string | undefined)[]): string | undefined {
  return dates.filter((d): d is string => !!d).sort()[0];
}

/**
 * Normaliza el histórico y calcula, para cada documento pagado, los días de
 * pago y el retraso respecto al vencimiento más los días de gracia de su
 * sucursal.
 */
export function normalizeHistory(
  rows: PortfolioHistoryRaw[],
  graceByBranch: Map<string, number>,
): CertificateDocument[] {
  return rows
    .map((r) => {
      const branch = clean(r.SUCURSAL) ?? '001';
      const invoiceDate = dateOnly(r.FECHA);
      const dueDate = dateOnly(r.FECHA_VCTO);
      const balance = Number(r.SALDO) || 0;
      const paidDate = balance > 0 ? undefined : dateOnly(r.FECHA_CANCELACION);
      const doc: CertificateDocument = {
        branch,
        docType: clean(r.TIPO_DOC_CRUCE),
        number: Number(r.CONS_DOC_CRUCE) || 0,
        invoiceDate,
        dueDate,
        amount: Number(r.VALOR_FACTURA) || 0,
        paid: Number(r.VALOR_PAGADO) || 0,
        balance,
        paidDate,
        lastPaymentDate: dateOnly(r.FECHA_ULTIMO_PAGO),
        paymentDoc: clean(r.DOC_PAGO),
      };
      if (paidDate && invoiceDate) {
        doc.paymentDays = Math.max(0, daysBetween(invoiceDate, paidDate));
      }
      if (paidDate && dueDate) {
        const grace = graceByBranch.get(branch) ?? 0;
        doc.daysLate = Math.max(0, daysBetween(dueDate, paidDate) - grace);
      }
      return doc;
    })
    .sort(
      (a, b) =>
        (a.invoiceDate ?? '').localeCompare(b.invoiceDate ?? '') ||
        a.number - b.number,
    );
}

/** Indicadores de cumplimiento de pago de los documentos del periodo. */
export function computeBehavior(docs: CertificateDocument[]): PaymentBehavior {
  const paid = docs.filter((d) => d.paidDate);
  const open = docs.filter((d) => !d.paidDate);
  const late = paid.filter((d) => (d.daysLate ?? 0) > 0);
  const withDays = paid.filter((d) => d.paymentDays !== undefined);
  const avg = (values: number[]) =>
    values.length === 0
      ? 0
      : round2(values.reduce((s, v) => s + v, 0) / values.length);

  return {
    invoices: docs.length,
    invoicedAmount: round2(docs.reduce((s, d) => s + d.amount, 0)),
    paidInvoices: paid.length,
    paidOnTime: paid.length - late.length,
    paidLate: late.length,
    onTimePct:
      paid.length === 0
        ? 0
        : round2(((paid.length - late.length) / paid.length) * 100),
    avgPaymentDays: avg(withDays.map((d) => d.paymentDays ?? 0)),
    avgDaysLate: avg(late.map((d) => d.daysLate ?? 0)),
    maxDaysLate: late.reduce((m, d) => Math.max(m, d.daysLate ?? 0), 0),
    openInvoices: open.length,
    openAmount: round2(open.reduce((s, d) => s + d.balance, 0)),
    lastPaymentDate: latest(docs.map((d) => d.lastPaymentDate)),
  };
}

/** Fecha más reciente no vacía de una lista (YYYY-MM-DD). */
export function latest(dates: (string | undefined)[]): string | undefined {
  const sorted = dates.filter((d): d is string => !!d).sort();
  return sorted[sorted.length - 1];
}
