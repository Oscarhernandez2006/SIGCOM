import {
  contentBottom,
  createPdfDocument,
} from '../../common/pdf-letterhead';

/** Una fila de producto dentro de un vendedor. */
export interface VendorSalesProductRow {
  /** Referencia (SKU) del producto. */
  referencia: string;
  /** Descripción del producto. */
  descripcion: string;
  /** Cantidad vendida (unidad base) en el período. */
  quantity: number;
  /** Venta neta del producto en el período. */
  net: number;
}

/** Un vendedor con su desglose de productos y totales. */
export interface VendorSalesGroup {
  /** NIT del vendedor. */
  nit: string;
  /** Nombre (razón social) del vendedor. */
  name: string;
  /** Productos vendidos por el vendedor en el período. */
  products: VendorSalesProductRow[];
  /** Cantidad total del vendedor. */
  totalQuantity: number;
  /** Venta neta total del vendedor. */
  totalNet: number;
}

/** Datos consolidados del reporte de ventas acumuladas por vendedor y producto. */
export interface VendorProductSalesReportData {
  /** Período consultado (YYYYMM). */
  periodo: string;
  /** Día concreto consultado (YYYY-MM-DD), si se filtró por día. */
  fecha?: string;
  /** Etiqueta legible del período (ej. "Julio 2026"). */
  periodLabel: string;
  /** Vendedores ordenados por venta neta descendente. */
  sellers: VendorSalesGroup[];
  /** Cantidad total acumulada (todos los vendedores). */
  grandTotalQuantity: number;
  /** Venta neta total acumulada (todos los vendedores). */
  grandTotalNet: number;
}

function num(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function money(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

/**
 * Genera el PDF del reporte "Ventas acumuladas por vendedor por producto".
 * Por cada vendedor imprime una cabecera con su total y debajo el desglose por
 * producto (referencia, descripción, cantidad y venta neta). Cierra con el
 * total general acumulado.
 */
export function buildVendorProductSalesReportPdf(
  data: VendorProductSalesReportData,
  companyId?: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = createPdfDocument(companyId, { size: 'A4', margin: 36 });
    const top = doc.page.margins.top;
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 36;
    const right = 559;
    const cols = {
      ref: { x: 48, w: 70, align: 'left' as const },
      desc: { x: 120, w: 235, align: 'left' as const },
      qty: { x: 355, w: 90, align: 'right' as const },
      net: { x: 445, w: 114, align: 'right' as const },
    };

    // Título.
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor('#000')
      .text('Ventas acumuladas por vendedor por producto', left, top);
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#444')
      .text(`Período: ${data.periodLabel}`, left, top + 22);

    let y = top + 48;

    const ensureSpace = (needed: number) => {
      if (y + needed > contentBottom(doc) - 6) {
        doc.addPage();
        y = doc.page.margins.top + 4;
      }
    };

    for (const seller of data.sellers) {
      ensureSpace(50);
      // Cabecera del vendedor.
      doc
        .rect(left, y, right - left, 16)
        .fillColor('#f0f0f0')
        .fill();
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#000')
        .text(`${seller.name} (${seller.nit})`, left + 4, y + 4, {
          width: 300,
        });
      doc.text(money(seller.totalNet), cols.net.x, y + 4, {
        width: cols.net.w,
        align: 'right',
      });
      doc.text(num(seller.totalQuantity), cols.qty.x, y + 4, {
        width: cols.qty.w,
        align: 'right',
      });
      y += 18;

      // Encabezado de columnas de producto.
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#666');
      doc.text('Ref.', cols.ref.x, y, { width: cols.ref.w });
      doc.text('Producto', cols.desc.x, y, { width: cols.desc.w });
      doc.text('Cantidad', cols.qty.x, y, {
        width: cols.qty.w,
        align: 'right',
      });
      doc.text('Venta neta', cols.net.x, y, {
        width: cols.net.w,
        align: 'right',
      });
      y += 12;

      // Filas de producto.
      doc.fontSize(8).font('Helvetica').fillColor('#000');
      for (const p of seller.products) {
        ensureSpace(14);
        doc.text(p.referencia, cols.ref.x, y, { width: cols.ref.w });
        doc.text(p.descripcion, cols.desc.x, y, {
          width: cols.desc.w,
          ellipsis: true,
        });
        doc.text(num(p.quantity), cols.qty.x, y, {
          width: cols.qty.w,
          align: 'right',
        });
        doc.text(money(p.net), cols.net.x, y, {
          width: cols.net.w,
          align: 'right',
        });
        y += 12;
      }
      y += 8;
    }

    // Total general.
    ensureSpace(24);
    doc
      .strokeColor('#000')
      .moveTo(left, y)
      .lineTo(right, y)
      .stroke();
    y += 4;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000');
    doc.text('TOTAL ACUMULADO', left + 4, y, { width: 300 });
    doc.text(num(data.grandTotalQuantity), cols.qty.x, y, {
      width: cols.qty.w,
      align: 'right',
    });
    doc.text(money(data.grandTotalNet), cols.net.x, y, {
      width: cols.net.w,
      align: 'right',
    });

    doc.end();
  });
}
