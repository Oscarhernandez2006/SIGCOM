import { Product } from './entities/product.entity';
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

/** Formatea un número con separador de miles colombiano. */
function num(value: number | string): string {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 2,
  }).format(n);
}

/** Formatea un valor como moneda colombiana (COP) sin decimales. */
function money(value: number | string): string {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);
}

/** Fecha legible en español (hora de Colombia). */
function prettyToday(): string {
  return new Date().toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Genera el PDF de "Productos disponibles hoy": el listado de lo que hay en
 * stock (existencias > 0) para compartir con clientes. Con `withPrices`
 * agrega la columna de precio (el nombre de la lista no se muestra).
 */
export function buildStockPdf(
  companyId: string,
  products: (Product & { price?: number | null })[],
  withPrices = false,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = createPdfDocument(companyId, { size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const companyName = COMPANY_NAMES[companyId] ?? 'Compañía';

    // Encabezado.
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#000').text(companyName);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#222')
      .text('Productos disponibles');
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#555')
      .text(`Disponibilidad para la venta · ${prettyToday()}`);

    doc.moveDown(0.8);
    doc.strokeColor('#ddd').moveTo(48, doc.y).lineTo(547, doc.y).stroke();
    doc.moveDown(0.8);

    // Tabla.
    const cols = withPrices
      ? { sku: 48, name: 112, nameW: 238, um: 352, stock: 392, stockW: 70, price: 467 }
      : { sku: 48, name: 130, nameW: 275, um: 410, stock: 470, stockW: 77, price: 0 };

    const header = (top: number) => {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
      doc.text('Ref.', cols.sku, top, { width: cols.name - cols.sku - 4 });
      doc.text('Producto', cols.name, top, { width: cols.nameW });
      doc.text('UM', cols.um, top, { width: 40 });
      doc.text('Disponible', cols.stock, top, {
        width: cols.stockW,
        align: 'right',
      });
      if (withPrices) {
        doc.text('Precio', cols.price, top, { width: 80, align: 'right' });
      }
      doc
        .strokeColor('#ddd')
        .moveTo(48, top + 14)
        .lineTo(547, top + 14)
        .stroke();
    };

    let y = doc.y;
    header(y);
    y += 20;
    doc.font('Helvetica').fontSize(9).fillColor('#222');

    for (const p of products) {
      if (y > contentBottom(doc) - 24) {
        doc.addPage();
        y = doc.page.margins.top;
        header(y);
        y += 20;
        doc.font('Helvetica').fontSize(9).fillColor('#222');
      }
      doc.fillColor('#222');
      doc.text(p.sku, cols.sku, y, { width: cols.name - cols.sku - 4 });
      doc.text(p.name, cols.name, y, { width: cols.nameW, height: 11, ellipsis: true });
      doc.text(p.unitOfMeasure ?? '', cols.um, y, { width: 40 });
      doc
        .font('Helvetica-Bold')
        .fillColor('#15803d')
        .text(num(p.stock), cols.stock, y, { width: cols.stockW, align: 'right' });
      if (withPrices) {
        doc
          .fillColor('#000')
          .text(p.price != null ? money(p.price) : '—', cols.price, y, {
            width: 80,
            align: 'right',
          });
      }
      doc.font('Helvetica').fillColor('#222');
      y += 16;
    }

    if (products.length === 0) {
      doc
        .font('Helvetica')
        .fillColor('#888')
        .text('No hay productos disponibles en este momento.', 48, y + 6);
    } else {
      doc
        .strokeColor('#ddd')
        .moveTo(48, y)
        .lineTo(547, y)
        .stroke();
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#000')
        .text(
          `Total de referencias disponibles: ${products.length}`,
          48,
          y + 8,
        );
    }

    doc.end();
  });
}
