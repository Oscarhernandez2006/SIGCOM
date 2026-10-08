import {
  contentBottom,
  createPdfDocument,
  setPdfCompany,
} from '../../common/pdf-letterhead';

/** Una fila del reporte de productos vendidos (un producto). */
export interface ProductSalesRow {
  sku: string;
  name: string;
  unitOfMeasure?: string;
  /** Unidades vendidas en el rango de fechas. */
  quantity: number;
  /** Ingresos del producto (precio x cantidad) en el rango. */
  revenue: number;
}

/** Sección del reporte correspondiente a una compañía. */
export interface ProductSalesCompany {
  companyId: string;
  companyName: string;
  rows: ProductSalesRow[];
  summary: {
    totalProducts: number;
    totalQuantity: number;
    totalRevenue: number;
  };
}

/** Datos consolidados del reporte de productos vendidos, divididos por compañía. */
export interface ProductSalesReportData {
  /** Fecha inicial del rango (YYYY-MM-DD, hora de Colombia). */
  from: string;
  /** Fecha final del rango (YYYY-MM-DD, hora de Colombia). */
  to: string;
  companies: ProductSalesCompany[];
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
  // Se interpreta como fecha local de Colombia (mediodía evita corrimientos).
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
 * Genera el PDF de productos vendidos dividido por compañía. Por cada compañía
 * (en su propia página) lista los productos vendidos en el rango de fechas con
 * la cantidad vendida y los ingresos (precio x cantidad), más un resumen.
 */
export function buildProductSalesReportPdf(
  data: ProductSalesReportData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = createPdfDocument(data.companies[0]?.companyId, {
      size: 'A4',
      margin: 48,
    });
    const chunks: Buffer[] = [];

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const cols = {
      ref: 48,
      name: 124,
      um: 278,
      qty: 318,
      revenue: 392,
    };

    const tableHeader = (top: number) => {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
      doc.text('Referencia', cols.ref, top, { width: 72 });
      doc.text('Producto', cols.name, top, { width: 150 });
      doc.text('UM', cols.um, top, { width: 36 });
      doc.text('Cantidad', cols.qty, top, { width: 70, align: 'right' });
      doc.text('Ingresos', cols.revenue, top, { width: 155, align: 'right' });
      doc
        .strokeColor('#ddd')
        .moveTo(48, top + 14)
        .lineTo(547, top + 14)
        .stroke();
    };

    data.companies.forEach((company, index) => {
      setPdfCompany(doc, company.companyId);
      if (index > 0) doc.addPage();

      // Encabezado de la compañía.
      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .fillColor('#000')
        .text(company.companyName, 48, doc.page.margins.top);
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor('#555')
        .text('Productos vendidos');
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
      const s = company.summary;
      const summaryItems: { label: string; value: string }[] = [
        { label: 'Productos', value: num(s.totalProducts) },
        { label: 'Cantidad vendida', value: num(s.totalQuantity) },
        { label: 'Ingresos', value: money(s.totalRevenue) },
      ];
      const cardW = 165;
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
          .text(item.label.toUpperCase(), cx + 8, cy + 8, {
            width: cardW - 16,
          });
        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .fillColor('#111')
          .text(item.value, cx + 8, cy + 22, { width: cardW - 16 });
        cx += cardW + cardGap;
      }
      doc.y = cy + 46;
      doc.moveDown(1.2);

      // Tabla de productos.
      let y = doc.y;
      tableHeader(y);
      y += 20;
      doc.font('Helvetica').fontSize(9);

      for (const row of company.rows) {
        if (y > contentBottom(doc) - 14) {
          doc.addPage();
          y = doc.page.margins.top;
          tableHeader(y);
          y += 20;
          doc.font('Helvetica').fontSize(9);
        }

        doc.fillColor('#222');
        doc.text(row.sku, cols.ref, y, { width: 72 });
        doc.text(row.name, cols.name, y, { width: 150 });
        doc.text(row.unitOfMeasure ?? '', cols.um, y, { width: 36 });
        doc.text(num(row.quantity), cols.qty, y, {
          width: 70,
          align: 'right',
        });
        doc.text(money(row.revenue), cols.revenue, y, {
          width: 155,
          align: 'right',
        });

        y += 16;
      }

      if (company.rows.length === 0) {
        doc
          .font('Helvetica')
          .fillColor('#888')
          .text(
            'No se vendieron productos en el rango seleccionado.',
            48,
            y + 6,
          );
        y += 22;
      } else {
        // Fila de total.
        doc
          .strokeColor('#ddd')
          .moveTo(48, y + 2)
          .lineTo(547, y + 2)
          .stroke();
        y += 8;
        doc.font('Helvetica-Bold').fillColor('#000');
        doc.text('Total', cols.ref, y, { width: 222 });
        doc.text(num(company.summary.totalQuantity), cols.qty, y, {
          width: 70,
          align: 'right',
        });
        doc.text(money(company.summary.totalRevenue), cols.revenue, y, {
          width: 155,
          align: 'right',
        });
      }
    });

    doc.end();
  });
}
