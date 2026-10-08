import {
  contentBottom,
  createPdfDocument,
} from '../../common/pdf-letterhead';

/** Una fila del resumen de ventas (un cliente o un producto). */
export interface SalesSummaryRow {
  /** Código (NIT del cliente) o referencia (SKU del producto). */
  reference: string;
  /** Nombre del cliente o del producto. */
  name: string;
  /** Unidad de medida (solo aplica al agrupar por producto). */
  unitOfMeasure?: string;
  /** Número de pedidos (solo aplica al agrupar por cliente). */
  orders?: number;
  /** Unidades vendidas (suma de cantidades de los ítems). */
  units: number;
  /** Ingresos del cliente/producto en el rango. */
  revenue: number;
}

/** Datos consolidados del resumen de ventas por cliente o por producto. */
export interface SalesSummaryReportData {
  from: string;
  to: string;
  companyId: string;
  companyName: string;
  /** Criterio de agrupación. */
  groupBy: 'customer' | 'product';
  rows: SalesSummaryRow[];
  summary: {
    totalRows: number;
    totalOrders: number;
    totalUnits: number;
    totalRevenue: number;
  };
}

/** Formatea un número entero/decimal con separador de miles colombiano. */
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
 * Genera el PDF del resumen de ventas por cliente o por producto: lista cada
 * cliente/producto con sus unidades e ingresos en el rango, más un resumen.
 */
export function buildSalesSummaryReportPdf(
  data: SalesSummaryReportData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = createPdfDocument(data.companyId, { size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const byCustomer = data.groupBy === 'customer';
    const refLabel = byCustomer ? 'Código' : 'Referencia';
    const nameLabel = byCustomer ? 'Cliente' : 'Producto';
    const midLabel = byCustomer ? 'Pedidos' : 'Cantidad';

    const cols = {
      ref: 48,
      name: 140,
      mid: 360,
      revenue: 440,
    };

    const tableHeader = (top: number) => {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
      doc.text(refLabel, cols.ref, top, { width: 88 });
      doc.text(nameLabel, cols.name, top, { width: 215 });
      doc.text(midLabel, cols.mid, top, { width: 72, align: 'right' });
      doc.text('Ingresos', cols.revenue, top, { width: 107, align: 'right' });
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
      .text(
        byCustomer
          ? 'Resumen de ventas por cliente'
          : 'Resumen de ventas por producto',
      );
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
    const summaryItems: { label: string; value: string }[] = byCustomer
      ? [
          { label: 'Clientes', value: num(s.totalRows) },
          { label: 'Pedidos', value: num(s.totalOrders) },
          { label: 'Ingresos', value: money(s.totalRevenue) },
        ]
      : [
          { label: 'Productos', value: num(s.totalRows) },
          { label: 'Cantidad vendida', value: num(s.totalUnits) },
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
      doc.text(row.reference, cols.ref, y, { width: 88 });
      doc.text(row.name, cols.name, y, { width: 215 });
      doc.text(
        byCustomer ? num(row.orders ?? 0) : num(row.units),
        cols.mid,
        y,
        { width: 72, align: 'right' },
      );
      doc.text(money(row.revenue), cols.revenue, y, {
        width: 107,
        align: 'right',
      });

      y += 16;
    }

    if (data.rows.length === 0) {
      doc
        .font('Helvetica')
        .fillColor('#888')
        .text('No hubo ventas en el rango seleccionado.', 48, y + 6);
      y += 22;
    } else {
      doc
        .strokeColor('#ddd')
        .moveTo(48, y + 2)
        .lineTo(547, y + 2)
        .stroke();
      y += 8;
      doc.font('Helvetica-Bold').fillColor('#000');
      doc.text('Total', cols.ref, y, { width: 264 });
      doc.text(
        byCustomer ? num(s.totalOrders) : num(s.totalUnits),
        cols.mid,
        y,
        { width: 72, align: 'right' },
      );
      doc.text(money(s.totalRevenue), cols.revenue, y, {
        width: 107,
        align: 'right',
      });
    }

    doc.end();
  });
}
