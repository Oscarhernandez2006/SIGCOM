import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate } from '@/lib/utils';
import { applyLetterhead, type LetterheadMargins } from '@/lib/pdf-letterhead';
import type { Client, ClientPortfolio, PortfolioDocument } from '@/types';

/* -------------------------------------------------------------------------- */
/*  Paleta corporativa                                                        */
/* -------------------------------------------------------------------------- */
type RGB = [number, number, number];

const PRIMARY: RGB = [15, 92, 56]; // verde SIGCOM profundo
const PRIMARY_SOFT: RGB = [22, 133, 74];
const ACCENT: RGB = [202, 138, 4]; // dorado (barra de acento)
const TEXT: RGB = [31, 41, 55];
const MUTED: RGB = [107, 114, 128];
const CARD_BG: RGB = [240, 247, 243];
const GRID: RGB = [223, 230, 233];
const STRIPE: RGB = [246, 250, 248];
const DANGER: RGB = [185, 28, 28];
const DANGER_BG: RGB = [254, 242, 242];

const MARGIN = 40;

/* -------------------------------------------------------------------------- */
/*  Utilidades de dibujo                                                      */
/* -------------------------------------------------------------------------- */

function pageWidth(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth();
}
function pageHeight(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight();
}
function lastY(doc: jsPDF): number {
  return (
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? 0
  );
}

function nowLabel(): string {
  return new Date().toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Banda superior corporativa con logo textual, título y datos a la derecha. */
function drawBandHeader(
  doc: jsPDF,
  title: string,
  subtitle: string,
  rightLines: string[],
  letterhead: LetterheadMargins | null,
): number {
  const w = pageWidth(doc);

  // Con membrete el logo ya va arriba: solo se escribe el título debajo.
  if (letterhead) {
    const top = letterhead.top;
    doc.setTextColor(...TEXT);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(title, MARGIN, top);
    if (subtitle) {
      const titleW = doc.getTextWidth(title);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(subtitle, MARGIN + titleW + 8, top);
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    let y = top - 10;
    for (const line of rightLines) {
      doc.text(line, w - MARGIN, y, { align: 'right' });
      y += 11;
    }
    doc.setFillColor(...ACCENT);
    doc.rect(MARGIN, top + 10, w - MARGIN * 2, 2, 'F');
    doc.setTextColor(...TEXT);
    return top + 30;
  }

  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, w, 78, 'F');
  doc.setFillColor(...ACCENT);
  doc.rect(0, 78, w, 4, 'F');

  // Marca
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('SIGCOM', MARGIN, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(214, 235, 224);
  doc.text('Sistema de Gestión Comercial', MARGIN, 47);

  // Título del informe
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(title, MARGIN, 66);
  if (subtitle) {
    const titleW = doc.getTextWidth(title);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(214, 235, 224);
    doc.text(subtitle, MARGIN + titleW + 10, 66);
  }

  // Datos a la derecha
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(230, 244, 237);
  let y = 26;
  for (const line of rightLines) {
    doc.text(line, w - MARGIN, y, { align: 'right' });
    y += 12;
  }

  doc.setTextColor(...TEXT);
  return 104;
}

interface Kpi {
  label: string;
  value: string;
  highlight?: boolean;
}

/** Fila de tarjetas KPI con acento lateral, estilo cuadro de mando. */
function drawKpiRow(doc: jsPDF, startY: number, kpis: Kpi[]): number {
  const w = pageWidth(doc) - MARGIN * 2;
  const gap = 10;
  const n = kpis.length;
  const boxW = (w - gap * (n - 1)) / n;
  const boxH = 56;

  kpis.forEach((k, i) => {
    const x = MARGIN + i * (boxW + gap);
    doc.setFillColor(...(k.highlight ? DANGER_BG : CARD_BG));
    doc.roundedRect(x, startY, boxW, boxH, 5, 5, 'F');
    doc.setFillColor(...(k.highlight ? DANGER : PRIMARY_SOFT));
    doc.rect(x, startY + 6, 3.5, boxH - 12, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(k.label.toUpperCase(), x + 12, startY + 20, {
      maxWidth: boxW - 20,
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...(k.highlight ? DANGER : TEXT));
    doc.text(k.value, x + 12, startY + 41, { maxWidth: boxW - 18 });
  });

  doc.setTextColor(...TEXT);
  return startY + boxH;
}

/** Título de sección con barra de acento a la izquierda. */
function sectionTitle(doc: jsPDF, y: number, text: string): number {
  doc.setFillColor(...PRIMARY);
  doc.rect(MARGIN, y - 9, 4, 13, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...TEXT);
  doc.text(text, MARGIN + 10, y);
  return y + 10;
}

/** Pie de página con línea, fecha de generación y numeración. */
function drawFooters(doc: jsPDF): void {
  const pages = doc.getNumberOfPages();
  const w = pageWidth(doc);
  const h = pageHeight(doc);
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, h - 30, w - MARGIN, h - 30);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(
      `SIGCOM · Informe de cartera · Generado el ${nowLabel()}`,
      MARGIN,
      h - 18,
    );
    doc.text(`Página ${i} de ${pages}`, w - MARGIN, h - 18, {
      align: 'right',
    });
  }
  doc.setTextColor(...TEXT);
}

/* -------------------------------------------------------------------------- */
/*  Análisis de vencimiento (aging)                                           */
/* -------------------------------------------------------------------------- */

interface Aging {
  current: number;
  d30: number;
  d60: number;
  d90: number;
  d90plus: number;
  overdue: number;
  maxDaysOverdue: number;
}

/** Cantidad de días que un documento lleva vencido (0 si aún no vence). */
function daysOverdue(doc: PortfolioDocument): number {
  if (!doc.dueDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${doc.dueDate.slice(0, 10)}T00:00:00`);
  const diff = Math.floor((today.getTime() - due.getTime()) / 86400000);
  return diff > 0 ? diff : 0;
}

function computeAging(documents: PortfolioDocument[]): Aging {
  const a: Aging = {
    current: 0,
    d30: 0,
    d60: 0,
    d90: 0,
    d90plus: 0,
    overdue: 0,
    maxDaysOverdue: 0,
  };
  for (const d of documents) {
    const bal = d.balance;
    const days = daysOverdue(d);
    if (days > a.maxDaysOverdue) a.maxDaysOverdue = days;
    if (days <= 0) a.current += bal;
    else {
      a.overdue += bal;
      if (days <= 30) a.d30 += bal;
      else if (days <= 60) a.d60 += bal;
      else if (days <= 90) a.d90 += bal;
      else a.d90plus += bal;
    }
  }
  return a;
}

/** Tabla horizontal con la distribución de saldos por antigüedad. */
function drawAgingTable(
  doc: jsPDF,
  startY: number,
  a: Aging,
  letterhead: LetterheadMargins | null,
): number {
  const total = a.current + a.d30 + a.d60 + a.d90 + a.d90plus;
  autoTable(doc, {
    startY,
    theme: 'grid',
    head: [
      [
        'Corriente',
        '1 – 30 días',
        '31 – 60 días',
        '61 – 90 días',
        '+ 90 días',
        'Total',
      ],
    ],
    body: [
      [
        formatCurrency(a.current),
        formatCurrency(a.d30),
        formatCurrency(a.d60),
        formatCurrency(a.d90),
        formatCurrency(a.d90plus),
        formatCurrency(total),
      ],
    ],
    styles: {
      fontSize: 8,
      halign: 'right',
      cellPadding: 6,
      lineColor: GRID,
      lineWidth: 0.5,
      textColor: TEXT,
    },
    headStyles: {
      fillColor: PRIMARY,
      textColor: 255,
      fontStyle: 'bold',
      halign: 'right',
      fontSize: 7.5,
    },
    columnStyles: {
      4: { textColor: DANGER, fontStyle: 'bold' },
      5: { fillColor: CARD_BG, fontStyle: 'bold' },
    },
    margin: tableMargin(letterhead),
  });
  return lastY(doc);
}

/** Estilos base compartidos por las tablas de documentos. */
const docTableTheme = {
  theme: 'grid' as const,
  headStyles: {
    fillColor: PRIMARY,
    textColor: 255 as unknown as RGB,
    fontStyle: 'bold' as const,
    fontSize: 7.5,
    cellPadding: 5,
  },
  bodyStyles: {
    fontSize: 7.5,
    textColor: TEXT,
    cellPadding: 4,
    lineColor: GRID,
    lineWidth: 0.4,
  },
  alternateRowStyles: { fillColor: STRIPE },
  margin: { left: MARGIN, right: MARGIN, top: 48, bottom: 44 },
};

/** Márgenes de las tablas que pasan de página (respetan el membrete). */
function tableMargin(letterhead: LetterheadMargins | null) {
  return {
    left: MARGIN,
    right: MARGIN,
    top: letterhead?.top ?? 48,
    bottom: letterhead?.bottom ?? 44,
  };
}

/** Filas de documentos con columna de días vencido y estado. */
function documentRows(documents: PortfolioDocument[]): string[][] {
  return documents
    .slice()
    .sort((x, y) => daysOverdue(y) - daysOverdue(x))
    .map((d) => {
      const dias = daysOverdue(d);
      return [
        String(d.documentNumber),
        d.description || d.docType || '—',
        formatDate(d.invoiceDate),
        formatDate(d.dueDate),
        dias > 0 ? `${dias}` : 'Al día',
        d.branch || '—',
        formatCurrency(d.balance),
      ];
    });
}

const DOC_HEAD = [
  ['Documento', 'Tipo', 'F. Factura', 'Vence', 'Días', 'Sucursal', 'Saldo'],
];

/* -------------------------------------------------------------------------- */
/*  Informe por cliente                                                       */
/* -------------------------------------------------------------------------- */

interface ClientReportInput {
  client: Client;
  portfolio: ClientPortfolio;
  companyId?: string;
  companyName: string;
  sellerName: string;
}

/** Bloque tipo ficha con los datos generales del cliente. */
function drawClientCard(
  doc: jsPDF,
  startY: number,
  client: Client,
  sellerName: string,
  companyName: string,
): number {
  const w = pageWidth(doc) - MARGIN * 2;
  const rows: [string, string][] = [
    ['Cliente', client.name],
    ['NIT / Código', client.code.trim()],
    ['Vendedor', sellerName],
    ['Compañía', companyName],
    ['Teléfono', client.phone || '—'],
    ['Ciudad', client.city || '—'],
    ['Dirección', client.address || '—'],
    ['Lista de precios', client.priceListName || client.priceList || '—'],
  ];
  const cols = 2;
  const rowH = 20;
  const lines = Math.ceil(rows.length / cols);
  const boxH = lines * rowH + 12;
  const colW = w / cols;

  doc.setFillColor(...CARD_BG);
  doc.roundedRect(MARGIN, startY, w, boxH, 5, 5, 'F');

  rows.forEach((r, i) => {
    const col = i % cols;
    const line = Math.floor(i / cols);
    const x = MARGIN + col * colW + 12;
    const y = startY + 18 + line * rowH;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(r[0].toUpperCase(), x, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT);
    doc.text(doc.splitTextToSize(r[1], colW - 24)[0] ?? '—', x, y + 11);
  });

  return startY + boxH;
}

/** Genera y descarga el PDF de la cartera de UN cliente específico. */
export async function exportClientPortfolioPdf({
  client,
  portfolio,
  companyId,
  companyName,
  sellerName,
}: ClientReportInput): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const letterhead = await applyLetterhead(doc, companyId);

  let y = drawBandHeader(
    doc,
    'Informe de Cartera',
    'por cliente',
    [`Fecha de emisión: ${nowLabel()}`, companyName],
    letterhead,
  );

  y = drawClientCard(doc, y, client, sellerName, companyName) + 18;

  const aging = computeAging(portfolio.documents);
  y = drawKpiRow(doc, y, [
    { label: 'Saldo total', value: formatCurrency(portfolio.totalBalance) },
    { label: 'Documentos', value: String(portfolio.count) },
    {
      label: 'Saldo vencido',
      value: formatCurrency(aging.overdue),
      highlight: aging.overdue > 0,
    },
    {
      label: 'Mora máxima',
      value:
        aging.maxDaysOverdue > 0 ? `${aging.maxDaysOverdue} días` : 'Al día',
      highlight: aging.maxDaysOverdue > 0,
    },
  ]);
  y += 22;

  y = sectionTitle(doc, y, 'Análisis de vencimiento') + 6;
  y = drawAgingTable(doc, y, aging, letterhead) + 22;

  y = sectionTitle(doc, y, 'Detalle de documentos') + 6;
  if (portfolio.documents.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(
      'El cliente no tiene documentos pendientes en cartera.',
      MARGIN,
      y + 10,
    );
  } else {
    autoTable(doc, {
      ...docTableTheme,
      margin: tableMargin(letterhead),
      startY: y,
      head: DOC_HEAD,
      body: documentRows(portfolio.documents),
      foot: [
        [
          { content: 'TOTAL', colSpan: 6, styles: { halign: 'right' } },
          formatCurrency(portfolio.totalBalance),
        ],
      ],
      footStyles: {
        fillColor: CARD_BG,
        textColor: TEXT,
        fontStyle: 'bold',
        fontSize: 8,
      },
      columnStyles: {
        4: { halign: 'center' },
        6: { halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (
          data.section === 'body' &&
          data.column.index === 4 &&
          data.cell.raw !== 'Al día'
        ) {
          data.cell.styles.textColor = DANGER;
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
  }

  drawFooters(doc);
  doc.save(`Cartera_${client.name.replace(/[^\w]+/g, '_')}.pdf`);
}

/* -------------------------------------------------------------------------- */
/*  Informe por vendedor (todos los clientes)                                 */
/* -------------------------------------------------------------------------- */

interface SellerReportInput {
  sellerName: string;
  companyId?: string;
  companyName: string;
  clients: Client[];
  portfolios: Record<string, ClientPortfolio>;
}

/** Genera y descarga el PDF con la cartera de TODOS los clientes del vendedor. */
export async function exportSellerPortfolioPdf({
  sellerName,
  companyId,
  companyName,
  clients,
  portfolios,
}: SellerReportInput): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const letterhead = await applyLetterhead(doc, companyId);

  const rows = clients
    .map((c) => {
      const p = portfolios[c.code.trim()];
      const documents = p?.documents ?? [];
      const aging = computeAging(documents);
      return {
        client: c,
        balance: p?.totalBalance ?? 0,
        count: p?.count ?? 0,
        documents,
        aging,
      };
    })
    .sort((a, b) => b.balance - a.balance);

  const totalBalance = rows.reduce((s, r) => s + r.balance, 0);
  const totalOverdue = rows.reduce((s, r) => s + r.aging.overdue, 0);
  const withDebt = rows.filter((r) => r.balance > 0).length;
  const globalAging = rows.reduce<Aging>(
    (acc, r) => ({
      current: acc.current + r.aging.current,
      d30: acc.d30 + r.aging.d30,
      d60: acc.d60 + r.aging.d60,
      d90: acc.d90 + r.aging.d90,
      d90plus: acc.d90plus + r.aging.d90plus,
      overdue: acc.overdue + r.aging.overdue,
      maxDaysOverdue: Math.max(acc.maxDaysOverdue, r.aging.maxDaysOverdue),
    }),
    {
      current: 0,
      d30: 0,
      d60: 0,
      d90: 0,
      d90plus: 0,
      overdue: 0,
      maxDaysOverdue: 0,
    },
  );

  let y = drawBandHeader(
    doc,
    'Informe de Cartera',
    'por vendedor',
    [`Vendedor: ${sellerName}`, `${companyName} · ${nowLabel()}`],
    letterhead,
  );

  y = drawKpiRow(doc, y, [
    { label: 'Clientes', value: String(rows.length) },
    { label: 'Con saldo', value: String(withDebt) },
    { label: 'Cartera total', value: formatCurrency(totalBalance) },
    {
      label: 'Saldo vencido',
      value: formatCurrency(totalOverdue),
      highlight: totalOverdue > 0,
    },
  ]);
  y += 22;

  y = sectionTitle(doc, y, 'Análisis de vencimiento de la cartera') + 6;
  y = drawAgingTable(doc, y, globalAging, letterhead) + 22;

  y = sectionTitle(doc, y, 'Resumen por cliente') + 6;
  autoTable(doc, {
    theme: 'grid',
    startY: y,
    head: [
      ['Cliente', 'Código', 'Ciudad', 'Docs', 'Mora', 'Vencido', 'Saldo'],
    ],
    body: rows.map((r) => [
      r.client.name,
      r.client.code.trim(),
      r.client.city || '—',
      String(r.count),
      r.aging.maxDaysOverdue > 0 ? `${r.aging.maxDaysOverdue} d` : 'Al día',
      formatCurrency(r.aging.overdue),
      formatCurrency(r.balance),
    ]),
    foot: [
      [
        { content: 'TOTAL', colSpan: 5, styles: { halign: 'right' } },
        formatCurrency(totalOverdue),
        formatCurrency(totalBalance),
      ],
    ],
    headStyles: {
      fillColor: PRIMARY,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 5,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: TEXT,
      cellPadding: 4,
      lineColor: GRID,
      lineWidth: 0.4,
    },
    footStyles: {
      fillColor: CARD_BG,
      textColor: TEXT,
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: STRIPE },
    columnStyles: {
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: 'right' },
      6: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (
        data.section === 'body' &&
        data.column.index === 4 &&
        data.cell.raw !== 'Al día'
      ) {
        data.cell.styles.textColor = DANGER;
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: tableMargin(letterhead),
  });

  // Detalle por cliente con documentos pendientes.
  const detailed = rows.filter((r) => r.documents.length > 0);
  if (detailed.length > 0) {
    const pageTop = letterhead ? letterhead.top + 8 : 56;
    doc.addPage();
    let cursorY =
      sectionTitle(doc, pageTop, 'Detalle de documentos por cliente') + 10;
    const hLimit = pageHeight(doc) - (letterhead ? letterhead.bottom + 40 : 90);

    for (const r of detailed) {
      if (cursorY > hLimit) {
        doc.addPage();
        cursorY = pageTop;
      }
      // Cabecera del cliente
      const w = pageWidth(doc) - MARGIN * 2;
      doc.setFillColor(...CARD_BG);
      doc.roundedRect(MARGIN, cursorY - 12, w, 26, 4, 4, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...TEXT);
      doc.text(
        `${r.client.name}  ·  Cód. ${r.client.code.trim()}`,
        MARGIN + 10,
        cursorY + 4,
      );
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...PRIMARY);
      doc.text(
        `${formatCurrency(r.balance)}  ·  ${r.count} doc.`,
        pageWidth(doc) - MARGIN - 10,
        cursorY + 4,
        { align: 'right' },
      );
      doc.setTextColor(...TEXT);

      autoTable(doc, {
        ...docTableTheme,
        margin: tableMargin(letterhead),
        startY: cursorY + 20,
        head: DOC_HEAD,
        body: documentRows(r.documents),
        columnStyles: {
          4: { halign: 'center' },
          6: { halign: 'right', fontStyle: 'bold' },
        },
        didParseCell: (data) => {
          if (
            data.section === 'body' &&
            data.column.index === 4 &&
            data.cell.raw !== 'Al día'
          ) {
            data.cell.styles.textColor = DANGER;
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });
      cursorY = lastY(doc) + 26;
    }
  }

  drawFooters(doc);
  doc.save(`Cartera_Vendedor_${sellerName.replace(/[^\w]+/g, '_')}.pdf`);
}
