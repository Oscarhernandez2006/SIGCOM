import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate } from '@/lib/utils';
import { applyLetterhead } from '@/lib/pdf-letterhead';
import type { CanalOrder } from '@/types';

type RGB = [number, number, number];
const GREEN: RGB = [22, 101, 52];
const STRIPE: RGB = [237, 245, 240];
const GRID: RGB = [210, 220, 214];
const TEXT: RGB = [31, 41, 55];
const MUTED: RGB = [107, 114, 128];
const MARGIN = 28;

function nowLabel(): string {
  return new Date().toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface CanalPdfInput {
  companyId?: string;
  companyName: string;
  orders: CanalOrder[];
}

/** Genera y descarga el consolidado de pedidos de canales en PDF (tipo Excel). */
export async function exportCanalOrdersPdf({
  companyId,
  companyName,
  orders,
}: CanalPdfInput): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const letterhead = await applyLetterhead(doc, companyId);

  // Encabezado (con membrete el logo ya va arriba: solo el título debajo).
  if (letterhead) {
    doc.setTextColor(...TEXT);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Consolidado de pedidos de canales', MARGIN, letterhead.top);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`${companyName} · ${nowLabel()}`, w - MARGIN, letterhead.top, {
      align: 'right',
    });
  } else {
    doc.setFillColor(...GREEN);
    doc.rect(0, 0, w, 54, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('SIGCOM', MARGIN, 24);
    doc.setFontSize(11);
    doc.text('Consolidado de pedidos de canales', MARGIN, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`${companyName} · ${nowLabel()}`, w - MARGIN, 30, {
      align: 'right',
    });
  }
  doc.setTextColor(...TEXT);

  // Filas: una por cada línea (ítem) de cada pedido.
  const rows: string[][] = [];
  let totalQty = 0;
  for (const o of orders) {
    for (const it of o.items) {
      totalQty += it.quantity;
      rows.push([
        formatDate(o.dispatchDate),
        o.clientCode,
        o.clientName,
        o.clientAddress || '—',
        o.clientCity || '—',
        it.quantity.toLocaleString('es-CO'),
        it.especie,
        it.specifications || '—',
        it.price ? formatCurrency(it.price) : '—',
        it.freight ? formatCurrency(it.freight) : '—',
        o.sellerName,
      ]);
    }
  }

  autoTable(doc, {
    startY: letterhead ? letterhead.top + 14 : 66,
    theme: 'grid',
    head: [
      [
        'Fecha despacho',
        'NIT',
        'Cliente',
        'Dirección',
        'Ciudad',
        'Cantidad',
        'Especie',
        'Especificaciones / Novedades',
        'Precio',
        'Flete',
        'Vendedor',
      ],
    ],
    body: rows,
    foot: [
      [
        { content: 'TOTAL CANALES', colSpan: 5, styles: { halign: 'right' } },
        totalQty.toLocaleString('es-CO'),
        { content: '', colSpan: 5 },
      ],
    ],
    headStyles: {
      fillColor: GREEN,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: TEXT,
      cellPadding: 3,
      lineColor: GRID,
      lineWidth: 0.4,
    },
    footStyles: {
      fillColor: STRIPE,
      textColor: TEXT,
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: STRIPE },
    columnStyles: {
      5: { halign: 'right' },
      6: { halign: 'center' },
      8: { halign: 'right' },
      9: { halign: 'right' },
    },
    margin: {
      left: MARGIN,
      right: MARGIN,
      top: letterhead?.top ?? 40,
      bottom: letterhead?.bottom ?? 34,
    },
    didDrawPage: () => {
      const pageH = doc.internal.pageSize.getHeight();
      doc.setDrawColor(...GRID);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, pageH - 24, w - MARGIN, pageH - 24);
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text('SIGCOM · Consolidado de canales', MARGIN, pageH - 12);
      doc.setTextColor(...TEXT);
    },
  });

  doc.save(`Canales_Consolidado_${new Date().toISOString().slice(0, 10)}.pdf`);
}
