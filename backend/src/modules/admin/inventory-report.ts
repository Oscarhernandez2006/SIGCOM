import {
  contentBottom,
  createPdfDocument,
} from '../../common/pdf-letterhead';

const COMPANY_NAMES: Record<string, string> = {
  '3': 'AGROPECUARIA SANTACRUZ',
  '8': 'CARNES FRIAS SANTACRUZ',
  '4': 'CARNES SANTACRUZ',
  MTAT: 'MONTERIA TAT AGROPECUARIA',
};

/** Una fila del reporte de inventario (un producto). */
export interface InventoryReportRow {
  sku: string;
  name: string;
  unitOfMeasure?: string;
  /** Unidades vendidas en el día del reporte. */
  sold: number;
  /** Stock que queda actualmente. */
  stock: number;
}

/** Datos consolidados del reporte de inventario por día. */
export interface InventoryReportData {
  companyId: string;
  /** Fecha del reporte (YYYY-MM-DD, hora de Colombia). */
  date: string;
  rows: InventoryReportRow[];
  summary: {
    totalRefs: number;
    refsWithStock: number;
    refsWithoutStock: number;
    totalSold: number;
    totalStock: number;
  };
}

/** Formatea un número entero/decimal con separador de miles colombiano. */
function num(value: number | string): string {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 2,
  }).format(n);
}

/** Formatea una fecha YYYY-MM-DD a un texto legible en español. */
function prettyDate(date: string): string {
  // Se interpreta como fecha local de Colombia (mediodía evita corrimientos).
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Genera el PDF del resumen de inventario de un día: por cada producto muestra
 * lo vendido en el día y el stock que queda, indicando si hay o no existencias.
 * Incluye un resumen general (referencias con/sin stock, unidades vendidas, etc.).
 */
export function buildInventoryReportPdf(
  data: InventoryReportData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = createPdfDocument(data.companyId, { size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const companyName = COMPANY_NAMES[data.companyId] ?? 'Compañía';

    // Encabezado.
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#000').text(companyName);
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#555')
      .text('Resumen de inventario por día');
    doc.moveDown(0.4);
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#000')
      .text(prettyDate(data.date), { align: 'left' });
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
    const summaryItems: { label: string; value: string }[] = [
      { label: 'Referencias', value: num(s.totalRefs) },
      { label: 'Con stock', value: num(s.refsWithStock) },
      { label: 'Agotadas', value: num(s.refsWithoutStock) },
      { label: 'Vendido (und)', value: num(s.totalSold) },
      { label: 'En stock (und)', value: num(s.totalStock) },
    ];
    const cardW = 99;
    const cardGap = 5;
    let cx = 48;
    const cy = doc.y;
    for (const item of summaryItems) {
      doc
        .roundedRect(cx, cy, cardW, 46, 6)
        .fillAndStroke('#f5f5f5', '#e2e2e2');
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#666')
        .text(item.label.toUpperCase(), cx + 8, cy + 8, { width: cardW - 16 });
      doc
        .fontSize(15)
        .font('Helvetica-Bold')
        .fillColor('#111')
        .text(item.value, cx + 8, cy + 22, { width: cardW - 16 });
      cx += cardW + cardGap;
    }
    doc.y = cy + 46;
    doc.moveDown(1.2);

    // Tabla de productos.
    const cols = {
      sku: 48,
      name: 120,
      um: 320,
      sold: 360,
      stock: 425,
      state: 490,
    };

    const header = (top: number) => {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
      doc.text('Ref.', cols.sku, top, { width: 68 });
      doc.text('Producto', cols.name, top, { width: 195 });
      doc.text('UM', cols.um, top, { width: 38 });
      doc.text('Vendido', cols.sold, top, { width: 60, align: 'right' });
      doc.text('Stock', cols.stock, top, { width: 58, align: 'right' });
      doc.text('Estado', cols.state, top, { width: 57, align: 'right' });
      doc
        .strokeColor('#ddd')
        .moveTo(48, top + 14)
        .lineTo(547, top + 14)
        .stroke();
    };

    let y = doc.y;
    header(y);
    y += 20;
    doc.font('Helvetica').fontSize(9);

    for (const row of data.rows) {
      if (y > contentBottom(doc) - 34) {
        doc.addPage();
        y = doc.page.margins.top;
        header(y);
        y += 20;
        doc.font('Helvetica').fontSize(9);
      }

      const hasStock = Number(row.stock) > 0;
      doc.fillColor('#222');
      doc.text(row.sku, cols.sku, y, { width: 68 });
      doc.text(row.name, cols.name, y, { width: 195 });
      doc.text(row.unitOfMeasure ?? '', cols.um, y, { width: 38 });
      doc.text(num(row.sold), cols.sold, y, { width: 60, align: 'right' });
      doc.text(num(row.stock), cols.stock, y, { width: 58, align: 'right' });
      doc
        .fillColor(hasStock ? '#15803d' : '#b91c1c')
        .text(hasStock ? 'Con stock' : 'Agotado', cols.state, y, {
          width: 57,
          align: 'right',
        });

      y += 16;
    }

    if (data.rows.length === 0) {
      doc
        .font('Helvetica')
        .fillColor('#888')
        .text('No hay productos en el inventario de la compañía.', 48, y + 6);
    }

    doc.end();
  });
}
