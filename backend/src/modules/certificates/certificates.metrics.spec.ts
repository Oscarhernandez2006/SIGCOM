import {
  computeBehavior,
  monthsBetween,
  normalizeBranches,
  normalizeHistory,
} from './certificates.metrics';
import type { PortfolioHistoryRaw } from './certificates.types';

const doc = (over: Partial<PortfolioHistoryRaw>): PortfolioHistoryRaw => ({
  SUCURSAL: '001',
  CONS_DOC_CRUCE: 1,
  FECHA: '2026-01-01T00:00:00',
  FECHA_VCTO: '2026-01-21T00:00:00',
  VALOR_FACTURA: 1000,
  VALOR_PAGADO: 1000,
  SALDO: 0,
  FECHA_CANCELACION: '2026-01-21T00:00:00',
  ...over,
});

describe('certificados · indicadores de pago', () => {
  it('mide días de pago y retraso descontando los días de gracia', () => {
    const [onTime, withinGrace, late, open] = normalizeHistory(
      [
        doc({ CONS_DOC_CRUCE: 1 }),
        doc({ CONS_DOC_CRUCE: 2, FECHA_CANCELACION: '2026-01-24T00:00:00' }),
        doc({ CONS_DOC_CRUCE: 3, FECHA_CANCELACION: '2026-02-05T00:00:00' }),
        doc({ CONS_DOC_CRUCE: 4, SALDO: 400, FECHA_CANCELACION: null }),
      ],
      new Map([['001', 3]]),
    );

    expect(onTime).toMatchObject({ paymentDays: 20, daysLate: 0 });
    expect(withinGrace).toMatchObject({ paymentDays: 23, daysLate: 0 });
    expect(late).toMatchObject({ paymentDays: 35, daysLate: 12 });
    expect(open.paidDate).toBeUndefined();

    expect(computeBehavior([onTime, withinGrace, late, open])).toMatchObject({
      invoices: 4,
      invoicedAmount: 4000,
      paidInvoices: 3,
      paidOnTime: 2,
      paidLate: 1,
      onTimePct: 66.67,
      avgPaymentDays: 26,
      maxDaysLate: 12,
      openInvoices: 1,
      openAmount: 400,
      lastPaymentDate: undefined,
    });
  });

  it('no considera pagado un documento con saldo aunque traiga fecha de cancelación', () => {
    const [d] = normalizeHistory(
      [doc({ SALDO: 10, FECHA_CANCELACION: '2026-01-10T00:00:00' })],
      new Map(),
    );
    expect(d.paidDate).toBeUndefined();
    expect(computeBehavior([d]).paidInvoices).toBe(0);
  });

  it('agrupa las sucursales del detalle y lee el bloqueo de cupo', () => {
    const branches = normalizeBranches([
      { SUCURSAL: '002 ', CUPO_CREDITO: 5, BLOQUEO_CUPO: 'SI' },
      { SUCURSAL: '001', CUPO_CREDITO: 7, BLOQUEO_CUPO: 'NO' },
      { SUCURSAL: '002', CUPO_CREDITO: 99 },
    ]);
    expect(branches.map((b) => [b.branch, b.creditLimit, b.blocked])).toEqual([
      ['001', 7, false],
      ['002', 5, true],
    ]);
  });

  it('calcula los meses completos de la relación comercial', () => {
    expect(monthsBetween('2025-08-13', '2026-11-11')).toBe(14);
    expect(monthsBetween('2025-08-13', '2026-11-13')).toBe(15);
    expect(monthsBetween('2026-11-01', '2026-11-11')).toBe(0);
  });
});
