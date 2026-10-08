import { Order } from './entities/order.entity';
import {
  contentBottom,
  createPdfDocument,
  setPdfCompany,
} from '../../common/pdf-letterhead';

const COMPANY_NAMES: Record<string, string> = {
  '3': 'AGROPECUARIA SANTACRUZ',
  '8': 'CARNES FRIAS SANTACRUZ',
  '4': 'CARNES SANTACRUZ',
  MTAT: 'MONTERIA TAT AGROPECUARIA',
};

/** Formatea un valor numérico como moneda colombiana. */
function money(value: number | string): string {
  const n = Number(value) || 0;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Genera el PDF de un pedido (sin mostrar el estado: solo la información del
 * cliente, el detalle de productos y los totales).
 *
 * Devuelve una promesa con el contenido binario del PDF.
 */
export function buildOrderPdf(order: Order): Promise<Buffer> {
  return renderOrdersToPdf([order]);
}

/**
 * Genera un único PDF con varios pedidos: cada pedido ocupa su(s) propia(s)
 * página(s). Sirve para la descarga masiva desde el panel de administración.
 */
export function buildOrdersPdf(orders: Order[]): Promise<Buffer> {
  return renderOrdersToPdf(orders);
}

/** Crea el documento PDF y dibuja cada pedido (uno por página). */
function renderOrdersToPdf(orders: Order[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = createPdfDocument(orders[0]?.companyId, {
      size: 'A4',
      margin: 48,
    });
    const chunks: Buffer[] = [];

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    orders.forEach((order, idx) => {
      setPdfCompany(doc, order.companyId);
      if (idx > 0) doc.addPage();
      drawOrder(doc, order);
    });

    doc.end();
  });
}

/** Dibuja un pedido en el documento, empezando en la posición actual. */
function drawOrder(doc: PDFKit.PDFDocument, order: Order): void {
    const companyName = COMPANY_NAMES[order.companyId] ?? 'Compañía';
    const created = order.createdAt ? new Date(order.createdAt) : new Date();

    // Encabezado.
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text(companyName, { align: 'left' });
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#555')
      .text('Pedido de venta', { align: 'left' });
    doc.moveDown(0.5);

    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('#000')
      .text(`Pedido N° ${order.orderNumber}`, { align: 'right' });
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#555')
      .text(`Fecha: ${created.toLocaleString('es-CO')}`, { align: 'right' });

    doc.moveDown(1);
    doc
      .strokeColor('#ddd')
      .moveTo(48, doc.y)
      .lineTo(547, doc.y)
      .stroke();
    doc.moveDown(1);

    // Datos del cliente.
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#000')
      .text('Cliente');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#222');

    const c = order.customer;
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
    line(
      'Sucursal',
      c.branchName ? `${c.branchName} (${c.branch})` : c.branch,
    );
    line(
      'Lista de precios',
      c.priceListName
        ? `${c.priceListName} (${c.priceList})`
        : c.priceList,
    );
    line('Condición de pago', c.paymentTerm);
    // Vendedor que registró el pedido: nombre, cédula y código.
    const seller = order.seller;
    const sellerName = seller?.name ?? c.sellerName;
    const sellerDoc = seller?.documentId;
    const sellerCode = seller?.siesaSellerCode ?? c.sellerCode;
    const sellerParts: string[] = [];
    if (sellerName) sellerParts.push(sellerName);
    if (sellerDoc) sellerParts.push(`C.C. ${sellerDoc}`);
    if (sellerCode) sellerParts.push(`Cód. ${sellerCode}`);
    line('Vendedor', sellerParts.join(' · ') || undefined);
    line('Dirección', c.address);
    line('Barrio', c.neighborhood);
    line('Ciudad', c.city);
    line('Departamento', c.department);
    line('Teléfono', c.phone);
    line('Email', c.email);

    doc.moveDown(1);

    // Tabla de productos. Columnas (x de inicio) y ancho de cada una. Los
    // valores numéricos se alinean a la derecha (estilo factura Siesa) y el
    // detalle muestra, por producto: subtotal (base sin IVA), IVA y total.
    const tableTop = doc.y;
    const cols = {
      sku: 48,
      name: 92,
      um: 192,
      qty: 216,
      price: 246,
      subtotal: 310,
      iva: 376,
      total: 434,
    };
    const w = {
      qty: 28,
      price: 62,
      subtotal: 64,
      iva: 56,
      total: 66,
    };

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#000');
    doc.text('Ref.', cols.sku, tableTop, { width: 42 });
    doc.text('Producto', cols.name, tableTop, { width: 98 });
    doc.text('UM', cols.um, tableTop, { width: 24 });
    doc.text('Cant.', cols.qty, tableTop, { width: w.qty, align: 'right' });
    doc.text('Precio', cols.price, tableTop, { width: w.price, align: 'right' });
    doc.text('Subtotal', cols.subtotal, tableTop, { width: w.subtotal, align: 'right' });
    doc.text('IVA', cols.iva, tableTop, { width: w.iva, align: 'right' });
    doc.text('Total', cols.total, tableTop, { width: w.total, align: 'right' });

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

    for (const item of order.items) {
      // Salto de página si se acaba el espacio.
      ensureSpace(34);
      // lineTotal es la base sin IVA (precio × cantidad − descuento). El IVA se
      // agrega solo para mostrarlo; el total de la línea es base + IVA.
      const lineBase = Number(item.lineTotal);
      const lineIva = (lineBase * Number(item.taxRate)) / 100;
      const lineTotal = lineBase + lineIva;
      doc.fontSize(8);
      doc.text(item.sku, cols.sku, y, { width: 42 });
      doc.text(item.productName, cols.name, y, { width: 98 });
      doc.text(item.unitOfMeasure ?? '', cols.um, y, { width: 24 });
      doc.text(String(Number(item.quantity)), cols.qty, y, { width: w.qty, align: 'right' });
      doc.text(money(item.unitPrice), cols.price, y, { width: w.price, align: 'right' });
      doc.text(money(lineBase), cols.subtotal, y, { width: w.subtotal, align: 'right' });
      doc.text(money(lineIva), cols.iva, y, { width: w.iva, align: 'right' });
      doc.text(money(lineTotal), cols.total, y, { width: w.total, align: 'right' });
      // La fila puede ocupar 2 líneas si el nombre del producto es largo.
      const nameHeight = doc.heightOfString(item.productName, { width: 98 });
      y += Math.max(18, nameHeight + 4);
    }

    ensureSpace(60);
    doc
      .strokeColor('#ddd')
      .moveTo(48, y)
      .lineTo(547, y)
      .stroke();
    y += 12;

    // Totales (sumatoria de los ítems): subtotal, IVA y total.
    const totLabelX = cols.subtotal;
    const totLabelW = cols.total - cols.subtotal - 6;
    doc.fontSize(10).font('Helvetica').fillColor('#222');
    doc.text('Subtotal:', totLabelX, y, { width: totLabelW, align: 'right' });
    doc.text(money(order.subtotal), cols.total, y, { width: w.total, align: 'right' });
    y += 16;
    doc.text('IVA:', totLabelX, y, { width: totLabelW, align: 'right' });
    doc.text(money(order.taxes), cols.total, y, { width: w.total, align: 'right' });
    y += 16;
    doc.font('Helvetica-Bold').fillColor('#000');
    doc.text('Total:', totLabelX, y, { width: totLabelW, align: 'right' });
    doc.text(money(order.total), cols.total, y, { width: w.total, align: 'right' });

    // Nota producto.
    if (order.notes) {
      ensureSpace(74);
      y += 30;
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('Nota producto', 48, y);
      doc
        .font('Helvetica')
        .fillColor('#222')
        .text(order.notes, 48, y + 14, { width: 499 });
    }

    // Nota logística.
    if (order.logisticsNote) {
      ensureSpace(74);
      y += order.notes ? 44 : 30;
      doc
        .font('Helvetica-Bold')
        .fillColor('#000')
        .fontSize(10)
        .text('Nota logística', 48, y);
      doc
        .font('Helvetica')
        .fillColor('#222')
        .text(order.logisticsNote, 48, y + 14, { width: 499 });
    }

    // Tipo de entrega.
    if (order.deliveryType) {
      ensureSpace(74);
      y += order.notes || order.logisticsNote ? 44 : 30;
      doc
        .font('Helvetica-Bold')
        .fillColor('#000')
        .fontSize(10)
        .text('Tipo de entrega', 48, y);
      doc
        .font('Helvetica')
        .fillColor('#222')
        .text(
          order.deliveryType === 'recoge_en_planta'
            ? 'Recoge en planta'
            : 'Despacho',
          48,
          y + 14,
          { width: 499 },
        );
    }

    // Horario de recibido de pedidos.
    if (order.deliverySchedule) {
      ensureSpace(74);
      y += order.notes || order.logisticsNote || order.deliveryType ? 44 : 30;
      doc
        .font('Helvetica-Bold')
        .fillColor('#000')
        .fontSize(10)
        .text('Horario de recibido de pedidos', 48, y);
      doc
        .font('Helvetica')
        .fillColor('#222')
        .text(order.deliverySchedule, 48, y + 14, { width: 499 });
    }
}
