import { PriceListItem } from './entities/price-list-item.entity';
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
 * Genera el PDF de una lista de precios para compartir con clientes.
 *
 * Por requerimiento, el documento NO muestra el nombre/código de la lista:
 * el encabezado dice únicamente "Lista de precios".
 */
export function buildPriceListPdf(
  companyId: string,
  items: PriceListItem[],
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
      .text('Lista de precios');
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#555')
      .text(prettyToday());

    doc.moveDown(0.8);
    doc.strokeColor('#ddd').moveTo(48, doc.y).lineTo(547, doc.y).stroke();
    doc.moveDown(0.8);

    // Tabla.
    const cols = { ref: 48, name: 130, um: 380, price: 450 };

    const header = (top: number) => {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
      doc.text('Ref.', cols.ref, top, { width: 78 });
      doc.text('Producto', cols.name, top, { width: 245 });
      doc.text('UM', cols.um, top, { width: 60 });
      doc.text('Precio', cols.price, top, { width: 97, align: 'right' });
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

    for (const it of items) {
      if (y > contentBottom(doc) - 24) {
        doc.addPage();
        y = doc.page.margins.top;
        header(y);
        y += 20;
        doc.font('Helvetica').fontSize(9).fillColor('#222');
      }
      doc.fillColor('#222');
      doc.text(it.reference, cols.ref, y, { width: 78 });
      doc.text(it.productName, cols.name, y, { width: 245 });
      doc.text(it.unitOfMeasure ?? '', cols.um, y, { width: 60 });
      doc
        .font('Helvetica-Bold')
        .fillColor('#000')
        .text(money(it.price), cols.price, y, { width: 97, align: 'right' });
      doc.font('Helvetica').fillColor('#222');
      y += 16;
    }

    if (items.length === 0) {
      doc
        .font('Helvetica')
        .fillColor('#888')
        .text('Esta lista no tiene productos.', 48, y + 6);
    } else {
      doc.strokeColor('#ddd').moveTo(48, y).lineTo(547, y).stroke();
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#000')
        .text(`Total de referencias: ${items.length}`, 48, y + 8);
    }

    doc.end();
  });
}
