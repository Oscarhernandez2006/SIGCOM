import {
  contentBottom,
  createPdfDocument,
} from '../../common/pdf-letterhead';

/** Una fila del reporte: un vendedor dentro del ranking de un producto. */
export interface ProductSellerRow {
  /** Referencia del producto (SKU). */
  sku: string;
  /** Nombre del producto. */
  productName: string;
  /** Unidad de medida. */
  unitOfMeasure?: string;
  /** Posición del vendedor dentro del producto (1 = el que más vendió). */
  position: number;
  /** Indica si es el vendedor líder del producto. */
  isTop: boolean;
  /** Id del vendedor. */
  sellerId: string;
  /** Nombre del vendedor. */
  sellerName: string;
  /** Cédula / documento del vendedor. */
  documentId?: string;
  /** Código de vendedor en Siesa. */
  sellerCode?: string;
  /** Unidades vendidas de ese producto por ese vendedor. */
  quantity: number;
  /** Ingresos generados (precio × cantidad). */
  revenue: number;
}

/** Opción de producto para los filtros del front. */
export interface ProductOption {
  sku: string;
  name: string;
}

/** Datos consolidados del reporte mejor-vendedor-por-producto. */
export interface ProductSellerReportData {
  from: string;
  to: string;
  companyId: string;
  companyName: string;
  /** Filtro de producto aplicado (referencia exacta). */
  search?: string;
  /** Nombre del producto filtrado (para el encabezado). */
  productName?: string;
  /** Productos con ventas en el rango (para el selector del front). */
  products: ProductOption[];
  rows: ProductSellerRow[];
  summary: {
    totalProducts: number;
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
 * Genera el PDF del reporte "mejor vendedor por producto": por cada producto,
 * el ranking de vendedores (el #1 es quien más lo vendió) en el rango.
 */
export function buildProductSellerReportPdf(
  data: ProductSellerReportData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = createPdfDocument(data.companyId, { size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const cols = {
      product: 48,
      pos: 205,
      seller: 232,
      qty: 400,
      revenue: 470,
    };

    const tableHeader = (top: number) => {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
      doc.text('Producto', cols.product, top, { width: 150 });
      doc.text('#', cols.pos, top, { width: 22, align: 'right' });
      doc.text('Vendedor', cols.seller, top, { width: 160 });
      doc.text('Cant.', cols.qty, top, { width: 60, align: 'right' });
      doc.text('Ingresos', cols.revenue, top, { width: 77, align: 'right' });
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
      .text('Mejor vendedor por producto');
    doc.moveDown(0.4);
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#000')
      .text(rangeText(data.from, data.to), { align: 'left' });

    if (data.productName) {
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#555')
        .text(`Producto: ${data.productName}`);
    } else if (data.search) {
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#555')
        .text(`Producto: "${data.search}"`);
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
      { label: 'Productos', value: num(s.totalProducts) },
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

    let lastSku = '';
    for (const row of data.rows) {
      if (y > contentBottom(doc) - 14) {
        doc.addPage();
        y = doc.page.margins.top;
        tableHeader(y);
        y += 20;
        doc.font('Helvetica').fontSize(9);
        lastSku = '';
      }

      // Solo repite el nombre del producto cuando cambia (lectura más limpia).
      if (row.sku !== lastSku) {
        if (lastSku !== '') y += 4;
        doc.fillColor('#111').font('Helvetica-Bold');
        doc.text(`${row.productName} (${row.sku})`, cols.product, y, {
          width: 150,
        });
        doc.font('Helvetica');
        lastSku = row.sku;
      }

      // El líder se resalta en negrita.
      doc.fillColor(row.isTop ? '#000' : '#444');
      doc.font(row.isTop ? 'Helvetica-Bold' : 'Helvetica');
      doc.text(String(row.position), cols.pos, y, {
        width: 22,
        align: 'right',
      });
      doc.text(row.sellerName, cols.seller, y, { width: 160 });
      doc.text(num(row.quantity), cols.qty, y, { width: 60, align: 'right' });
      doc.text(money(row.revenue), cols.revenue, y, {
        width: 77,
        align: 'right',
      });
      doc.font('Helvetica');

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
      doc.text('Total', cols.product, y, { width: 352 });
      doc.text(num(s.totalQuantity), cols.qty, y, {
        width: 60,
        align: 'right',
      });
      doc.text(money(s.totalRevenue), cols.revenue, y, {
        width: 77,
        align: 'right',
      });
    }

    doc.end();
  });
}
