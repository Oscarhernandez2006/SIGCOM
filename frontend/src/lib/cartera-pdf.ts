import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate } from '@/lib/utils';
import { applyLetterhead, pdfPageFormat, type LetterheadMargins } from '@/lib/pdf-letterhead';
import type { Client, ClientPortfolio, PortfolioDocument } from '@/types';

/* -------------------------------------------------------------------------- */
/*  Paleta (misma que lib/brand.ts)                                           */
/* -------------------------------------------------------------------------- */
type RGB = [number, number, number];

const PRIMARY: RGB = [30, 155, 80]; // #1E9B50
const PRIMARY_DARK: RGB = [21, 128, 61]; // #15803D
const PRIMARY_SOFT: RGB = [232, 245, 236]; // #E8F5EC
const TEXT: RGB = [17, 24, 39]; // #111827
const TEXT_MUTED: RGB = [75, 85, 99]; // #4B5563
const MUTED: RGB = [107, 114, 128]; // #6B7280
const FIELD: RGB = [241, 245, 249]; // #F1F5F9
const BORDER: RGB = [226, 232, 240]; // #E2E8F0
const PAGE_BG: RGB = [244, 250, 246]; // #F4FAF6
const WHITE: RGB = [255, 255, 255];
const DANGER: RGB = [220, 38, 38]; // #DC2626
const DANGER_BG: RGB = [254, 242, 242];

const MARGIN = 36;
const RADIUS = 12;

/* -------------------------------------------------------------------------- */
/*  Utilidades de dibujo                                                      */
/* -------------------------------------------------------------------------- */

function pageWidth(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth();
}
function pageHeight(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight();
}
function contentWidth(doc: jsPDF): number {
  return pageWidth(doc) - MARGIN * 2;
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

function todayLabel(): string {
  return new Date().toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function withOpacity(doc: jsPDF, opacity: number, fn: () => void): void {
  const d = doc as unknown as {
    GState: (p: { opacity: number }) => unknown;
    setGState: (g: unknown) => void;
  };
  d.setGState(d.GState({ opacity }));
  fn();
  d.setGState(d.GState({ opacity: 1 }));
}

/** Fondo verde muy claro de la página (como PageBackground en la web). */
function paintPageBackground(doc: jsPDF, letterhead: LetterheadMargins | null): void {
  if (letterhead) return;
  doc.setFillColor(...PAGE_BG);
  doc.rect(0, 0, pageWidth(doc), pageHeight(doc), 'F');
}

/** Tarjeta blanca redondeada con borde (TitledCard de la web). */
function drawCard(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  doc.setFillColor(...WHITE);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.8);
  doc.roundedRect(x, y, w, h, RADIUS, RADIUS, 'FD');
}

/** Título de tarjeta: cuadrito verde + texto en mayúsculas verde oscuro. */
function cardTitle(doc: jsPDF, x: number, y: number, text: string): void {
  doc.setFillColor(...PRIMARY_SOFT);
  doc.roundedRect(x, y - 8, 11, 11, 3, 3, 'F');
  doc.setFillColor(...PRIMARY);
  doc.roundedRect(x + 3, y - 5, 5, 5, 1.2, 1.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...PRIMARY_DARK);
  doc.text(text.toUpperCase(), x + 16, y, { charSpace: 0.4 });
  doc.setTextColor(...TEXT);
}

/** Pill redondeada con texto (StatusPill). */
function drawPill(
  doc: jsPDF,
  x: number,
  y: number,
  text: string,
  bg: RGB,
  fg: RGB,
  align: 'left' | 'right' = 'left',
  fontSize = 7,
): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  const w = doc.getTextWidth(text) + 12;
  const h = fontSize + 6;
  const px = align === 'right' ? x - w : x;
  doc.setFillColor(...bg);
  doc.roundedRect(px, y - h / 2, w, h, h / 2, h / 2, 'F');
  doc.setTextColor(...fg);
  doc.text(text, px + w / 2, y + fontSize * 0.35, { align: 'center' });
  doc.setTextColor(...TEXT);
  return w;
}

/** Rectángulo redondeado con degradado vertical (hero de la web). */
function gradientRoundedRect(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  from: RGB,
  to: RGB,
): void {
  const steps = 48;
  const stepH = h / steps;
  // Se recorta al rectángulo redondeado dibujando primero el fondo y luego bandas.
  doc.saveGraphicsState();
  doc.roundedRect(x, y, w, h, 18, 18, null as unknown as string);
  (doc as unknown as { clip: () => void }).clip();
  (doc as unknown as { discardPath: () => void }).discardPath();
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    doc.setFillColor(
      Math.round(from[0] + (to[0] - from[0]) * t),
      Math.round(from[1] + (to[1] - from[1]) * t),
      Math.round(from[2] + (to[2] - from[2]) * t),
    );
    doc.rect(x, y + i * stepH, w, stepH + 0.6, 'F');
  }
  // Círculos decorativos translúcidos.
  withOpacity(doc, 0.1, () => {
    doc.setFillColor(...WHITE);
    doc.circle(x + w - 40, y + 8, 70, 'F');
    doc.circle(x + w - 120, y + h - 6, 42, 'F');
  });
  doc.restoreGraphicsState();
}

interface HeroStat {
  label: string;
  value: string;
}

/**
 * Hero verde degradado con título, chips a la derecha, cifra principal y
 * estadísticas secundarias (como la cabecera de "Cartera de clientes").
 */
function drawHero(
  doc: jsPDF,
  startY: number,
  title: string,
  subtitle: string,
  chips: string[],
  main: { label: string; value: string },
  stats: HeroStat[],
): number {
  const x = MARGIN;
  const w = contentWidth(doc);
  const h = 150;
  gradientRoundedRect(doc, x, startY, w, h, PRIMARY, PRIMARY_DARK);

  // Marca + título
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  withOpacity(doc, 0.85, () => doc.text('SIGCOM', x + 20, startY + 20, { charSpace: 1 }));
  doc.setFontSize(17);
  doc.text(title, x + 20, startY + 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  withOpacity(doc, 0.85, () => doc.text(subtitle, x + 20, startY + 54));

  // Chips a la derecha (fondo blanco translúcido)
  let cx = x + w - 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  for (const chip of chips) {
    const cw = doc.getTextWidth(chip) + 16;
    withOpacity(doc, 0.18, () => {
      doc.setFillColor(...WHITE);
      doc.roundedRect(cx - cw, startY + 14, cw, 17, 8.5, 8.5, 'F');
    });
    doc.setTextColor(...WHITE);
    doc.text(chip, cx - cw / 2, startY + 25.5, { align: 'center' });
    cx -= cw + 6;
  }

  // Cifra principal
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  withOpacity(doc, 0.8, () => doc.text(main.label.toUpperCase(), x + 20, startY + 80, { charSpace: 0.5 }));
  doc.setFontSize(24);
  doc.text(main.value, x + 20, startY + 104);

  // Estadísticas
  const statsX = x + 20;
  const statW = (w - 40) / stats.length;
  stats.forEach((s, i) => {
    const sx = statsX + i * statW;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    withOpacity(doc, 0.8, () => doc.text(s.label, sx, startY + 126));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(s.value, sx, startY + 140);
  });

  doc.setTextColor(...TEXT);
  return startY + h;
}

/** Cabecera compacta para páginas de continuación. */
function drawContinuationHeader(
  doc: jsPDF,
  y: number,
  title: string,
  right: string,
): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...TEXT);
  doc.text(title, MARGIN, y + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(right, pageWidth(doc) - MARGIN, y + 4, { align: 'right' });
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y + 14, pageWidth(doc) - MARGIN, y + 14);
  doc.setTextColor(...TEXT);
  return y + 30;
}

/** Pie de página con línea, fecha de generación y numeración. */
function drawFooters(doc: jsPDF): void {
  const pages = doc.getNumberOfPages();
  const w = pageWidth(doc);
  const h = pageHeight(doc);
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, h - 30, w - MARGIN, h - 30);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PRIMARY_DARK);
    doc.text('SIGCOM', MARGIN, h - 18);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(
      `· Informe de cartera · Generado el ${nowLabel()}`,
      MARGIN + doc.getTextWidth('SIGCOM') + 3,
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

const EMPTY_AGING: Aging = {
  current: 0,
  d30: 0,
  d60: 0,
  d90: 0,
  d90plus: 0,
  overdue: 0,
  maxDaysOverdue: 0,
};

/**
 * Tarjeta "Antigüedad de saldos": barras horizontales por tramo, como en el
 * modal de cartera de la web (verde por vencer, rojo vencido).
 */
function drawAgingCard(doc: jsPDF, startY: number, a: Aging): number {
  const x = MARGIN;
  const w = contentWidth(doc);
  const rows: [string, number, boolean][] = [
    ['Por vencer', a.current, false],
    ['1–30 días', a.d30, true],
    ['31–60 días', a.d60, true],
    ['61–90 días', a.d90, true],
    ['> 90 días', a.d90plus, true],
  ];
  const total = Math.max(1, a.current + a.overdue);
  const rowH = 17;
  const h = 34 + rows.length * rowH + 8;
  drawCard(doc, x, startY, w, h);
  cardTitle(doc, x + 16, startY + 20, 'Antigüedad de saldos');

  const labelW = 70;
  const valueW = 80;
  const barX = x + 16 + labelW + 8;
  const barW = w - 32 - labelW - valueW - 16;
  rows.forEach(([label, value, overdue], i) => {
    const cy = startY + 40 + i * rowH;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT);
    doc.text(label, x + 16, cy + 3);
    doc.setFillColor(...FIELD);
    doc.roundedRect(barX, cy - 2.5, barW, 6, 3, 3, 'F');
    const fill = Math.max(value > 0 ? 4 : 0, (value / total) * barW);
    if (fill > 0) {
      doc.setFillColor(...(overdue ? DANGER : PRIMARY));
      doc.roundedRect(barX, cy - 2.5, fill, 6, 3, 3, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...(overdue && value > 0 ? DANGER : TEXT));
    doc.text(formatCurrency(value), x + w - 16, cy + 3, { align: 'right' });
  });
  doc.setTextColor(...TEXT);
  return startY + h;
}

/* -------------------------------------------------------------------------- */
/*  Tablas de marca                                                           */
/* -------------------------------------------------------------------------- */

/** Márgenes de las tablas que pasan de página (respetan el membrete). */
function tableMargin(letterhead: LetterheadMargins | null) {
  return {
    left: MARGIN,
    right: MARGIN,
    top: letterhead?.top ?? 48,
    bottom: letterhead?.bottom ?? 44,
  };
}

/** Estilo de tabla de la web: cabecera verde claro, filas con línea sutil. */
const brandTable = {
  theme: 'plain' as const,
  headStyles: {
    fillColor: PRIMARY_SOFT,
    textColor: PRIMARY_DARK,
    fontStyle: 'bold' as const,
    fontSize: 7.2,
    cellPadding: { top: 6, bottom: 6, left: 6, right: 6 },
  },
  bodyStyles: {
    fontSize: 7.8,
    textColor: TEXT,
    cellPadding: { top: 5.5, bottom: 5.5, left: 6, right: 6 },
    lineColor: BORDER,
    lineWidth: { bottom: 0.5 },
  },
  footStyles: {
    fillColor: PAGE_BG,
    textColor: TEXT,
    fontStyle: 'bold' as const,
    fontSize: 8.5,
    cellPadding: { top: 7, bottom: 7, left: 6, right: 6 },
  },
};

/** Pinta una pill en la celda de estado ("Al día" verde o "N días" roja). */
function statusPillCell(colIndex: number) {
  return {
    didParseCell: (data: CellHookData) => {
      if (data.section === 'body' && data.column.index === colIndex) {
        data.cell.styles.textColor = WHITE; // el texto lo dibuja didDrawCell
        data.cell.styles.halign = 'center';
      }
    },
    didDrawCell: (data: CellHookData) => {
      if (data.section !== 'body' || data.column.index !== colIndex) return;
      const raw = String(data.cell.raw ?? '');
      if (!raw) return;
      const ok = raw === 'Al día';
      const cy = data.cell.y + data.cell.height / 2;
      const cx = data.cell.x + data.cell.width / 2;
      const text = ok ? 'Al día' : `${raw} días`;
      data.doc.setFont('helvetica', 'bold');
      data.doc.setFontSize(6.8);
      const w = data.doc.getTextWidth(text) + 10;
      drawPill(
        data.doc,
        cx - w / 2,
        cy,
        text,
        ok ? PRIMARY_SOFT : DANGER_BG,
        ok ? PRIMARY_DARK : DANGER,
        'left',
        6.8,
      );
    },
  };
}

type CellHookData = Parameters<
  NonNullable<Parameters<typeof autoTable>[1]['didDrawCell']>
>[0];

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
  ['Documento', 'Tipo', 'F. Factura', 'Vence', 'Estado', 'Sucursal', 'Saldo'],
];

const DOC_COLS = {
  0: { cellWidth: 58, fontStyle: 'bold' as const },
  2: { cellWidth: 58, halign: 'center' as const },
  3: { cellWidth: 58, halign: 'center' as const },
  4: { cellWidth: 58, halign: 'center' as const },
  5: { cellWidth: 48, halign: 'center' as const },
  6: { cellWidth: 74, halign: 'right' as const, fontStyle: 'bold' as const },
};

/** Tabla de documentos dentro de una tarjeta redondeada. */
function drawDocumentsTable(
  doc: jsPDF,
  startY: number,
  documents: PortfolioDocument[],
  total: number | null,
  letterhead: LetterheadMargins | null,
): number {
  const pill = statusPillCell(4);
  autoTable(doc, {
    ...brandTable,
    margin: tableMargin(letterhead),
    startY,
    head: DOC_HEAD,
    body: documentRows(documents),
    foot:
      total === null
        ? undefined
        : [
            [
              { content: 'TOTAL', colSpan: 6, styles: { halign: 'right' } },
              formatCurrency(total),
            ],
          ],
    columnStyles: DOC_COLS,
    didParseCell: pill.didParseCell,
    didDrawCell: pill.didDrawCell,
    tableLineColor: BORDER,
    tableLineWidth: 0.8,
  });
  return lastY(doc);
}

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

/** Tarjeta "Cliente" con los datos generales en dos columnas. */
function drawClientCard(
  doc: jsPDF,
  startY: number,
  client: Client,
  sellerName: string,
  companyName: string,
): number {
  const x = MARGIN;
  const w = contentWidth(doc);
  const rows: [string, string][] = [
    ['Vendedor', sellerName],
    ['Compañía', companyName],
    ['Condición de pago', client.paymentTerm || '—'],
    ['Lista de precios', client.priceListName || client.priceList || '—'],
    ['Teléfono', client.phone || '—'],
    ['Ciudad', [client.city, client.department].filter(Boolean).join(', ') || '—'],
    [
      'Dirección',
      [client.address, client.neighborhood].filter(Boolean).join(', ') || '—',
    ],
    ['Sucursal', client.branchName || client.branch || '—'],
  ];
  const cols = 2;
  const rowH = 22;
  const lines = Math.ceil(rows.length / cols);
  const h = 52 + lines * rowH;
  const colW = (w - 32) / cols;

  drawCard(doc, x, startY, w, h);
  cardTitle(doc, x + 16, startY + 20, 'Cliente');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...TEXT);
  doc.text(
    doc.splitTextToSize(`${client.name}  ·  NIT ${client.code.trim()}`, w - 32)[0] ?? '',
    x + 16,
    startY + 38,
  );

  rows.forEach((r, i) => {
    const col = i % cols;
    const line = Math.floor(i / cols);
    const cx = x + 16 + col * colW;
    const cy = startY + 56 + line * rowH;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(...MUTED);
    doc.text(r[0].toUpperCase(), cx, cy, { charSpace: 0.3 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(doc.splitTextToSize(r[1], colW - 12)[0] ?? '—', cx, cy + 10.5);
  });

  doc.setTextColor(...TEXT);
  return startY + h;
}

function moraLabel(a: Aging): string {
  return a.maxDaysOverdue > 0 ? `${a.maxDaysOverdue} días` : 'Al día';
}

/** Genera y descarga el PDF de la cartera de UN cliente específico. */
export async function exportClientPortfolioPdf({
  client,
  portfolio,
  companyId,
  companyName,
  sellerName,
}: ClientReportInput): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: pdfPageFormat(companyId) });
  const letterhead = await applyLetterhead(doc, companyId);
  paintPageBackground(doc, letterhead);

  const aging = computeAging(portfolio.documents);
  let y = drawHero(
    doc,
    letterhead ? letterhead.top : MARGIN,
    'Estado de cartera',
    client.name,
    [companyName, `Saldo al ${todayLabel()}`],
    { label: 'Saldo total', value: formatCurrency(portfolio.totalBalance) },
    [
      { label: 'Vencido', value: formatCurrency(aging.overdue) },
      { label: 'Por vencer', value: formatCurrency(aging.current) },
      { label: 'Mora máxima', value: moraLabel(aging) },
      { label: 'Documentos', value: String(portfolio.count) },
    ],
  );
  y += 12;

  y = drawClientCard(doc, y, client, sellerName, companyName) + 12;
  y = drawAgingCard(doc, y, aging) + 12;

  // Tarjeta de documentos: título + tabla.
  const docsTitleH = 30;
  if (portfolio.documents.length === 0) {
    drawCard(doc, MARGIN, y, contentWidth(doc), 60);
    cardTitle(doc, MARGIN + 16, y + 20, 'Documentos (0)');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text('El cliente no tiene documentos pendientes en cartera.', MARGIN + 16, y + 42);
  } else {
    if (y + docsTitleH + 60 > pageHeight(doc) - (letterhead?.bottom ?? 60)) {
      doc.addPage();
      paintPageBackground(doc, letterhead);
      y = drawContinuationHeader(
        doc,
        letterhead ? letterhead.top : MARGIN,
        'Estado de cartera',
        `${client.name} · NIT ${client.code.trim()}`,
      );
    }
    cardTitle(doc, MARGIN, y + 12, `Documentos (${portfolio.documents.length})`);
    drawDocumentsTable(
      doc,
      y + docsTitleH - 6,
      portfolio.documents,
      portfolio.totalBalance,
      letterhead,
    );
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
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: pdfPageFormat(companyId) });
  const letterhead = await applyLetterhead(doc, companyId);
  paintPageBackground(doc, letterhead);

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
    { ...EMPTY_AGING },
  );

  let y = drawHero(
    doc,
    letterhead ? letterhead.top : MARGIN,
    'Cartera de clientes',
    `Vendedor: ${sellerName}`,
    [companyName, `Saldo al ${todayLabel()}`],
    { label: 'Saldo total', value: formatCurrency(totalBalance) },
    [
      { label: 'Vencido', value: formatCurrency(totalOverdue) },
      { label: 'Con saldo', value: String(withDebt) },
      { label: 'Clientes', value: String(rows.length) },
      { label: 'Mora máxima', value: moraLabel(globalAging) },
    ],
  );
  y += 12;

  y = drawAgingCard(doc, y, globalAging) + 14;

  cardTitle(doc, MARGIN, y + 12, `Resumen por cliente (${rows.length})`);
  const pill = statusPillCell(4);
  autoTable(doc, {
    ...brandTable,
    margin: tableMargin(letterhead),
    startY: y + 24,
    head: [['Cliente', 'NIT', 'Ciudad', 'Docs', 'Mora', 'Vencido', 'Saldo']],
    body: rows.map((r) => [
      r.client.name,
      r.client.code.trim(),
      r.client.city || '—',
      String(r.count),
      r.aging.maxDaysOverdue > 0 ? `${r.aging.maxDaysOverdue}` : 'Al día',
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
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { cellWidth: 62 },
      3: { halign: 'center', cellWidth: 34 },
      4: { halign: 'center', cellWidth: 58 },
      5: { halign: 'right', cellWidth: 74 },
      6: { halign: 'right', fontStyle: 'bold', cellWidth: 78 },
    },
    didParseCell: (data) => {
      pill.didParseCell(data);
      if (
        data.section === 'body' &&
        data.column.index === 5 &&
        Number(String(data.cell.raw).replace(/\D/g, '')) > 0
      ) {
        data.cell.styles.textColor = DANGER;
      }
    },
    didDrawCell: pill.didDrawCell,
    tableLineColor: BORDER,
    tableLineWidth: 0.8,
  });

  // Detalle por cliente con documentos pendientes.
  const detailed = rows.filter((r) => r.documents.length > 0);
  if (detailed.length > 0) {
    const pageTop = letterhead ? letterhead.top : MARGIN;
    doc.addPage();
    paintPageBackground(doc, letterhead);
    let cursorY = drawContinuationHeader(
      doc,
      pageTop,
      'Detalle de documentos por cliente',
      `${sellerName} · ${companyName}`,
    );
    const hLimit = pageHeight(doc) - (letterhead ? letterhead.bottom + 60 : 110);

    for (const r of detailed) {
      if (cursorY > hLimit) {
        doc.addPage();
        paintPageBackground(doc, letterhead);
        cursorY = drawContinuationHeader(
          doc,
          pageTop,
          'Detalle de documentos por cliente',
          `${sellerName} · ${companyName}`,
        );
      }
      // Cabecera del cliente: tarjeta con nombre, NIT y saldo (como ClientCard).
      const w = contentWidth(doc);
      drawCard(doc, MARGIN, cursorY, w, 40);
      doc.setFillColor(...PRIMARY_SOFT);
      doc.circle(MARGIN + 24, cursorY + 20, 12, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...PRIMARY_DARK);
      const initials = r.client.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? '')
        .join('');
      doc.text(initials || '?', MARGIN + 24, cursorY + 23, { align: 'center' });
      doc.setFontSize(9.5);
      doc.setTextColor(...TEXT);
      doc.text(
        doc.splitTextToSize(r.client.name, w - 220)[0] ?? '',
        MARGIN + 44,
        cursorY + 17,
      );
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(
        `NIT ${r.client.code.trim()}${r.client.city ? ` · ${r.client.city}` : ''} · ${r.count} doc.`,
        MARGIN + 44,
        cursorY + 29,
      );
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...PRIMARY_DARK);
      doc.text(formatCurrency(r.balance), MARGIN + w - 14, cursorY + 18, { align: 'right' });
      if (r.aging.overdue > 0) {
        drawPill(
          doc,
          MARGIN + w - 14,
          cursorY + 30,
          `Vencido ${formatCurrency(r.aging.overdue)} · ${r.aging.maxDaysOverdue} días`,
          DANGER_BG,
          DANGER,
          'right',
          6.5,
        );
      } else {
        drawPill(doc, MARGIN + w - 14, cursorY + 30, 'Al día', PRIMARY_SOFT, PRIMARY_DARK, 'right', 6.5);
      }
      doc.setTextColor(...TEXT);

      drawDocumentsTable(doc, cursorY + 46, r.documents, null, letterhead);
      cursorY = lastY(doc) + 18;
    }
  }

  drawFooters(doc);
  doc.save(`Cartera_Vendedor_${sellerName.replace(/[^\w]+/g, '_')}.pdf`);
}
