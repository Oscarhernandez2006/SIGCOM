import { Quote } from './entities/quote.entity';
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

function money(value: number | string): string {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function buildQuotePdf(quote: Quote): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = createPdfDocument(quote.companyId, { size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const companyName = COMPANY_NAMES[quote.companyId] ?? 'Compañía';
    const created = quote.createdAt ? new Date(quote.createdAt) : new Date();
    const validUntil = quote.validUntil ? new Date(quote.validUntil) : null;

    // Encabezado.
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text(companyName, { align: 'left' });
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#555')
      .text('Cotización de venta', { align: 'left' });
    doc.moveDown(0.5);

    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('#000')
      .text(`Cotización N° ${quote.quoteNumber}`, { align: 'right' });
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#555')
      .text(`Fecha: ${created.toLocaleString('es-CO')}`, { align: 'right' });
    if (validUntil) {
      doc.text(
        `Válida hasta: ${validUntil.toLocaleDateString('es-CO')} ` +
          `(${quote.validityDays} días)`,
        { align: 'right' },
      );
    }

    doc.moveDown(1);
    doc.strokeColor('#ddd').moveTo(48, doc.y).lineTo(547, doc.y).stroke();
    doc.moveDown(1);

    // Datos del cliente.
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#000')
      .text('Cliente');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#222');

    const c = quote.customer;
    const line = (label: string, value?: string | null) => {
      if (!value) return;
      doc
        .font('Helvetica-Bold')
        .text(`${label}: `, { continued: true })
        .font('Helvetica')
        .text(value);
    };
    line('Nombre', c.name);
    line('NIT', c.code);
    line('Sucursal', c.branchName ? `${c.branchName} (${c.branch})` : c.branch);
    line(
      'Lista de precios',
      c.priceListName ? `${c.priceListName} (${c.priceList})` : c.priceList,
    );
    line('Condición de pago', c.paymentTerm);
    line(
      'Vendedor',
      c.sellerName ? `${c.sellerName} (${c.sellerCode})` : c.sellerCode,
    );
    line('Dirección', c.address);
    line('Ciudad', c.city);
    line('Teléfono', c.phone);
    line('Email', c.email);

    doc.moveDown(1);

    // Tabla de productos.
    const tableTop = doc.y;
    const cols = {
      sku: 48,
      name: 110,
      um: 300,
      qty: 350,
      price: 405,
      total: 480,
    };

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
    doc.text('Ref.', cols.sku, tableTop);
    doc.text('Producto', cols.name, tableTop);
    doc.text('UM', cols.um, tableTop);
    doc.text('Cant.', cols.qty, tableTop);
    doc.text('Precio', cols.price, tableTop);
    doc.text('Total', cols.total, tableTop);

    doc
      .strokeColor('#ddd')
      .moveTo(48, tableTop + 14)
      .lineTo(547, tableTop + 14)
      .stroke();

    let y = tableTop + 20;
    doc.font('Helvetica').fillColor('#222');

    const ensureSpace = (needed: number) => {
      if (y + needed > contentBottom(doc)) {
        doc.addPage();
        y = doc.page.margins.top;
      }
    };

    for (const item of quote.items) {
      ensureSpace(34);
      doc.fontSize(9);
      doc.text(item.sku, cols.sku, y, { width: 56 });
      doc.text(item.productName, cols.name, y, { width: 185 });
      doc.text(item.unitOfMeasure ?? '', cols.um, y, { width: 45 });
      doc.text(String(Number(item.quantity)), cols.qty, y, { width: 45 });
      doc.text(money(item.unitPrice), cols.price, y, { width: 70 });
      doc.text(money(item.lineTotal), cols.total, y, { width: 67 });
      y += 18;
    }

    ensureSpace(60);
    doc.strokeColor('#ddd').moveTo(48, y).lineTo(547, y).stroke();
    y += 12;

    // Totales.
    doc.fontSize(10).font('Helvetica');
    doc.text('Subtotal:', cols.price, y, { width: 70 });
    doc.text(money(quote.subtotal), cols.total, y, { width: 67 });
    y += 16;
    doc.text('Impuestos:', cols.price, y, { width: 70 });
    doc.text(money(quote.taxes), cols.total, y, { width: 67 });
    y += 16;
    doc.font('Helvetica-Bold').fillColor('#000');
    doc.text('Total:', cols.price, y, { width: 70 });
    doc.text(money(quote.total), cols.total, y, { width: 67 });

    // Notas.
    if (quote.notes) {
      ensureSpace(74);
      y += 30;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Notas', 48, y);
      doc
        .font('Helvetica')
        .fillColor('#222')
        .text(quote.notes, 48, y + 14, { width: 499 });
      y += 44;
    }

    // Aviso de cotización.
    ensureSpace(60);
    y += quote.notes ? 6 : 30;
    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor('#888')
      .text(
        'Este documento es una cotización y no constituye una factura de venta. ' +
          'Los precios están sujetos a cambios una vez vencida su vigencia.',
        48,
        y,
        { width: 499 },
      );

    doc.end();
  });
}
