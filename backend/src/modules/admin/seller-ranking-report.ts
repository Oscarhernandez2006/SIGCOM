import {
  contentBottom,
  createPdfDocument,
} from '../../common/pdf-letterhead';

/** Una fila del ranking de vendedores. */
export interface SellerRankingRow {
  /** Posición en el ranking (1 = el que más vende). */
  position: number;
  /** Nombre del vendedor. */
  name: string;
  /** Cédula / documento del vendedor. */
  documentId?: string;
  /** Código de vendedor en Siesa. */
  sellerCode?: string;
  /** Número de pedidos del vendedor en el rango. */
  orders: number;
  /** Unidades vendidas (suma de cantidades de los ítems). */
  units: number;
  /** Ingresos generados por el vendedor en el rango. */
  revenue: number;
}

/** Datos consolidados del ranking de vendedores. */
export interface SellerRankingReportData {
  from: string;
  to: string;
  companyId: string;
  companyName: string;
  rows: SellerRankingRow[];
  summary: {
    totalSellers: number;
    totalOrders: number;
    totalUnits: number;
    totalRevenue: number;
  };
}

/** Formatea un número con separador de miles colombiano. */
function num(value: number | string): string {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 2,
  }).format(n);
}

/** Formatea un valor como pesos colombianos sin decimales. */
function money(value: number | string): string {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/** Formatea una fecha YYYY-MM-DD a un texto legible en español. */
function prettyDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Texto del rango de fechas del reporte (un solo día o un rango). */
function rangeText(from: string, to: string): string {
  if (from === to) return prettyDate(from);
  return `Del ${prettyDate(from)} al ${prettyDate(to)}`;
}

/**
 * Genera el PDF del ranking de vendedores: lista cada vendedor con sus pedidos,
 * unidades e ingresos en el rango, ordenado del que más vende al que menos.
 */
export function buildSellerRankingReportPdf(
  data: SellerRankingReportData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = createPdfDocument(data.companyId, { size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const cols = {
      pos: 48,
      name: 80,
      doc: 250,
      code: 340,
      orders: 390,
      units: 445,
      revenue: 500,
    };

    const tableHeader = (top: number) => {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
      doc.text('#', cols.pos, top, { width: 24 });
      doc.text('Vendedor', cols.name, top, { width: 165 });
      doc.text('Cédula', cols.doc, top, { width: 85 });
      doc.text('Cód.', cols.code, top, { width: 44 });
      doc.text('Pedidos', cols.orders, top, { width: 48, align: 'right' });
      doc.text('Unid.', cols.units, top, { width: 48, align: 'right' });
      doc.text('Ingresos', cols.revenue, top, { width: 47, align: 'right' });
      doc
        .strokeColor('#ddd')
        .moveTo(48, top + 14)
        .lineTo(547, top + 14)
        .stroke();
    };

    // Encabezado.
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#000')
      .text(data.companyName, 48, doc.page.margins.top);
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#555')
      .text('Ranking de vendedores');
    doc.moveDown(0.4);
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#000')
      .text(rangeText(data.from, data.to), { align: 'left' });
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#888')
      .text(`Generado: ${new Date().toLocaleString('es-CO')}`);

    doc.moveDown(0.8);
    doc.strokeColor('#ddd').moveTo(48, doc.y).lineTo(547, doc.y).stroke();
    doc.moveDown(0.8);

    // Tarjetas de resumen.
    const s = data.summary;
    const summaryItems = [
      { label: 'Vendedores', value: num(s.totalSellers) },
      { label: 'Pedidos', value: num(s.totalOrders) },
      { label: 'Ingresos', value: money(s.totalRevenue) },
    ];
    const cardW = 165;
    const cardGap = 5;
    let cx = 48;
    const cy = doc.y;
    for (const item of summaryItems) {
      doc.roundedRect(cx, cy, cardW, 46, 6).fillAndStroke('#f5f5f5', '#e2e2e2');
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#666')
        .text(item.label.toUpperCase(), cx + 8, cy + 8, { width: cardW - 16 });
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#111')
        .text(item.value, cx + 8, cy + 22, { width: cardW - 16 });
      cx += cardW + cardGap;
    }
    doc.y = cy + 46;
    doc.moveDown(1.2);

    // Tabla.
    let y = doc.y;
    tableHeader(y);
    y += 20;
    doc.font('Helvetica').fontSize(9);

    for (const row of data.rows) {
      if (y > contentBottom(doc) - 14) {
        doc.addPage();
        y = doc.page.margins.top;
        tableHeader(y);
        y += 20;
        doc.font('Helvetica').fontSize(9);
      }

      doc.fillColor('#222');
      doc.text(String(row.position), cols.pos, y, { width: 24 });
      doc.text(row.name, cols.name, y, { width: 165 });
      doc.text(row.documentId ?? '—', cols.doc, y, { width: 85 });
      doc.text(row.sellerCode ?? '—', cols.code, y, { width: 44 });
      doc.text(num(row.orders), cols.orders, y, { width: 48, align: 'right' });
      doc.text(num(row.units), cols.units, y, { width: 48, align: 'right' });
      doc.text(money(row.revenue), cols.revenue, y, {
        width: 47,
        align: 'right',
      });

      y += 16;
    }

    if (data.rows.length === 0) {
      doc
        .font('Helvetica')
        .fillColor('#888')
        .text('No hubo ventas en el rango seleccionado.', 48, y + 6);
    } else {
      doc
        .strokeColor('#ddd')
        .moveTo(48, y + 2)
        .lineTo(547, y + 2)
        .stroke();
      y += 8;
      doc.font('Helvetica-Bold').fillColor('#000');
      doc.text('Total', cols.pos, y, { width: 310 });
      doc.text(num(s.totalOrders), cols.orders, y, {
        width: 48,
        align: 'right',
      });
      doc.text(num(s.totalUnits), cols.units, y, { width: 48, align: 'right' });
      doc.text(money(s.totalRevenue), cols.revenue, y, {
        width: 47,
        align: 'right',
      });
    }

    doc.end();
  });
}
