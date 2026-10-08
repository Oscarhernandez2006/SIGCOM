import {
  contentBottom,
  createPdfDocument,
} from '../../common/pdf-letterhead';

/** Una fila (un vendedor) del reporte de ventas por vendedor. */
export interface SellerSalesRow {
  /** Nombre del vendedor. */
  name: string;
  /** Código de vendedor en Siesa. */
  sellerCode: string;
  /** Valor promedio por kilo del mes ANTERIOR (venta / kilos). */
  avgKiloPrev: number;
  /** Presupuesto de kilos del mes. */
  budgetKilos: number;
  /** Kilos vendidos del mes (a la fecha). */
  kilosSold: number;
  /** % de cumplimiento de kilos (kilos vendidos / ppto kilos). */
  kilosPct: number | null;
  /** Venta acumulada del mes (pesos, a la fecha). */
  revenue: number;
  /** Venta esperada del mes (ppto en pesos prorrateado a la fecha). */
  expectedRevenue: number;
  /** % de cumplimiento en pesos (venta acumulada / venta esperada). */
  revenuePct: number | null;
  /** Valor promedio por kilo del mes ACTUAL (venta / kilos). */
  avgKiloCur: number;
}

/** Totales de una fila del reporte. */
export interface SellerSalesTotals {
  budgetKilos: number;
  kilosSold: number;
  kilosPct: number | null;
  revenue: number;
  expectedRevenue: number;
  revenuePct: number | null;
  avgKiloPrev: number;
  avgKiloCur: number;
}

/** Datos consolidados del reporte de ventas por vendedor. */
export interface SellerSalesReportData {
  month: number;
  year: number;
  monthLabel: string;
  prevMonthLabel: string;
  companyId: string;
  companyName: string;
  /** Fecha de corte (YYYY-MM-DD). */
  asOfDate: string;
  /** % ideal a la fecha (días transcurridos / días del mes). */
  idealPct: number;
  rows: SellerSalesRow[];
  totals: SellerSalesTotals;
}

function num(value: number | string): string {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
}

function money(value: number | string): string {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(value: number | null): string {
  if (value == null) return '—';
  return `${(Number(value) || 0).toFixed(2)}%`;
}

/**
 * Genera el PDF del reporte de ventas por vendedor (horizontal): por cada
 * vendedor muestra el valor promedio por kilo del mes anterior y del actual, el
 * presupuesto y los kilos vendidos con su cumplimiento, y la venta acumulada
 * frente a la esperada con su cumplimiento. Cierra con una fila de totales.
 */
export function buildSellerSalesReportPdf(
  data: SellerSalesReportData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = createPdfDocument(data.companyId, {
      size: 'A4',
      layout: 'landscape',
      margin: 36,
    });
    const top = doc.page.margins.top;
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Columnas (x, ancho). Página horizontal A4 ≈ 770pt útiles.
    const cols = [
      { key: 'name', label: 'Vendedor', x: 36, w: 130, align: 'left' as const },
      { key: 'avgPrev', label: 'V. Kilo ant.', x: 166, w: 62, align: 'right' as const },
      { key: 'ppto', label: 'Ppto Kilo', x: 228, w: 60, align: 'right' as const },
      { key: 'kilos', label: 'Kilos Vend.', x: 288, w: 62, align: 'right' as const },
      { key: 'kpct', label: '% Cump.', x: 350, w: 52, align: 'right' as const },
      { key: 'acum', label: 'Venta Acum.', x: 402, w: 92, align: 'right' as const },
      { key: 'esp', label: 'Venta Esp.', x: 494, w: 92, align: 'right' as const },
      { key: 'rpct', label: '% Cump.', x: 586, w: 52, align: 'right' as const },
      { key: 'avgCur', label: 'V. Kilo mes', x: 638, w: 68, align: 'right' as const },
    ];
    const right = 806;

    const header = (top: number) => {
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000');
      for (const c of cols) {
        doc.text(c.label, c.x, top, { width: c.w, align: c.align });
      }
      doc
        .strokeColor('#bbb')
        .moveTo(36, top + 12)
        .lineTo(right, top + 12)
        .stroke();
    };

    // Título.
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor('#000')
      .text('Ventas por vendedor', 36, top);
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#444')
      .text(
        `${data.companyName}  ·  ${data.monthLabel}  ·  Corte: ${data.asOfDate}  ·  % ideal: ${data.idealPct.toFixed(2)}%`,
        36,
        top + 22,
      );

    let y = top + 48;
    header(y);
    y += 18;

    const rowText = (
      values: Record<string, string>,
      bold = false,
    ) => {
      doc
        .fontSize(8)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor('#000');
      for (const c of cols) {
        doc.text(values[c.key] ?? '', c.x, y, { width: c.w, align: c.align });
      }
      y += 15;
    };

    for (const r of data.rows) {
      if (y > contentBottom(doc) - 19) {
        doc.addPage();
        y = doc.page.margins.top + 4;
        header(y);
        y += 18;
      }
      rowText({
        name: r.name,
        avgPrev: money(r.avgKiloPrev),
        ppto: num(r.budgetKilos),
        kilos: num(r.kilosSold),
        kpct: pct(r.kilosPct),
        acum: money(r.revenue),
        esp: money(r.expectedRevenue),
        rpct: pct(r.revenuePct),
        avgCur: money(r.avgKiloCur),
      });
    }

    // Total.
    doc
      .strokeColor('#000')
      .moveTo(36, y)
      .lineTo(right, y)
      .stroke();
    y += 4;
    rowText(
      {
        name: 'TOTAL',
        avgPrev: money(data.totals.avgKiloPrev),
        ppto: num(data.totals.budgetKilos),
        kilos: num(data.totals.kilosSold),
        kpct: pct(data.totals.kilosPct),
        acum: money(data.totals.revenue),
        esp: money(data.totals.expectedRevenue),
        rpct: pct(data.totals.revenuePct),
        avgCur: money(data.totals.avgKiloCur),
      },
      true,
    );

    doc.end();
  });
}
