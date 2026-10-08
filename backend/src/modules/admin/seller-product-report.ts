import {
  contentBottom,
  createPdfDocument,
} from '../../common/pdf-letterhead';

/** Una fila del reporte: lo que un vendedor vendió de un producto. */
export interface SellerProductRow {
  /** Id del vendedor (para filtrar en el front). */
  sellerId: string;
  /** Nombre del vendedor. */
  sellerName: string;
  /** Cédula / documento del vendedor. */
  documentId?: string;
  /** Código de vendedor en Siesa. */
  sellerCode?: string;
  /** Referencia del producto (SKU). */
  sku: string;
  /** Nombre del producto. */
  productName: string;
  /** Unidad de medida. */
  unitOfMeasure?: string;
  /** Unidades vendidas de ese producto por ese vendedor. */
  quantity: number;
  /** Ingresos generados (precio × cantidad). */
  revenue: number;
}

/** Opción de vendedor para los filtros del front. */
export interface SellerOption {
  id: string;
  name: string;
}

/** Opción de producto para los filtros del front. */
export interface ProductOption {
  sku: string;
  name: string;
}

/** Datos consolidados del reporte vendedor–producto. */
export interface SellerProductReportData {
  from: string;
  to: string;
  companyId: string;
  companyName: string;
  /** Filtros aplicados (para mostrarlos en el encabezado). */
  sellerName?: string;
  search?: string;
  /** Nombre del producto filtrado (para el encabezado). */
  productName?: string;
  /** Vendedores con ventas en el rango (para el selector del front). */
  sellers: SellerOption[];
  /** Productos con ventas en el rango (para el selector del front). */
  products: ProductOption[];
  rows: SellerProductRow[];
  summary: {
    totalRows: number;
    totalQuantity: number;
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
 * Genera el PDF del reporte vendedor–producto: por cada vendedor y producto,
 * las unidades vendidas y los ingresos en el rango.
 */
export function buildSellerProductReportPdf(
  data: SellerProductReportData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = createPdfDocument(data.companyId, { size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const cols = {
      seller: 48,
      sku: 190,
      name: 250,
      qty: 440,
      revenue: 500,
    };

    const tableHeader = (top: number) => {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
      doc.text('Vendedor', cols.seller, top, { width: 135 });
      doc.text('Ref.', cols.sku, top, { width: 56 });
      doc.text('Producto', cols.name, top, { width: 185 });
      doc.text('Cant.', cols.qty, top, { width: 52, align: 'right' });
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
      .text('Ventas por vendedor y producto');
    doc.moveDown(0.4);
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#000')
      .text(rangeText(data.from, data.to), { align: 'left' });

    const filters: string[] = [];
    if (data.sellerName) filters.push(`Vendedor: ${data.sellerName}`);
    if (data.productName) {
      filters.push(`Producto: ${data.productName}`);
    } else if (data.search) {
      filters.push(`Producto: "${data.search}"`);
    }
    if (filters.length) {
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#555')
        .text(filters.join('  ·  '));
    }
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
      { label: 'Líneas', value: num(s.totalRows) },
      { label: 'Unidades', value: num(s.totalQuantity) },
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

    let lastSeller = '';
    for (const row of data.rows) {
      if (y > contentBottom(doc) - 14) {
        doc.addPage();
        y = doc.page.margins.top;
        tableHeader(y);
        y += 20;
        doc.font('Helvetica').fontSize(9);
        lastSeller = '';
      }

      doc.fillColor('#222');
      // Solo repite el nombre del vendedor cuando cambia (lectura más limpia).
      if (row.sellerId !== lastSeller) {
        doc.font('Helvetica-Bold').text(row.sellerName, cols.seller, y, {
          width: 135,
        });
        doc.font('Helvetica');
        lastSeller = row.sellerId;
      }
      doc.text(row.sku, cols.sku, y, { width: 56 });
      doc.text(row.productName, cols.name, y, { width: 185 });
      doc.text(num(row.quantity), cols.qty, y, { width: 52, align: 'right' });
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
        .text('No hubo ventas con los filtros seleccionados.', 48, y + 6);
    } else {
      doc
        .strokeColor('#ddd')
        .moveTo(48, y + 2)
        .lineTo(547, y + 2)
        .stroke();
      y += 8;
      doc.font('Helvetica-Bold').fillColor('#000');
      doc.text('Total', cols.seller, y, { width: 384 });
      doc.text(num(s.totalQuantity), cols.qty, y, {
        width: 52,
        align: 'right',
      });
      doc.text(money(s.totalRevenue), cols.revenue, y, {
        width: 47,
        align: 'right',
      });
    }

    doc.end();
  });
}
