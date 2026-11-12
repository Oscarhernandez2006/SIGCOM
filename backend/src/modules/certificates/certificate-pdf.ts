import {
  contentBottom,
  createPdfDocument,
  hasLetterhead,
} from '../../common/pdf-letterhead';
import type { CommercialCertificate } from './entities/commercial-certificate.entity';

const GREEN = '#15803D';
const TEXT = '#111827';
const MUTED = '#6B7280';
const BORDER = '#E2E8F0';
const SOFT = '#F4FAF6';
const MARGIN = 44;

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function money(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function num(value: number, decimals = 0): string {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(Number(value) || 0);
}

/** Día (YYYY-MM-DD) de un instante en hora de Colombia. */
function bogotaDay(date: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
}

/** "2026-11-11" → "11 de noviembre de 2026". */
function longDate(iso?: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

/** "2026-11-11" → "11/11/2026". */
function shortDate(iso?: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** 27 → "2 años y 3 meses". */
function duration(months?: number): string {
  if (months === undefined) return '';
  if (months < 1) return 'menos de un mes';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years === 1 ? '1 año' : `${years} años`;
  const m = rest === 1 ? '1 mes' : `${rest} meses`;
  if (years === 0) return m;
  return rest === 0 ? y : `${y} y ${m}`;
}

/** Consecutivo visible del certificado (p. ej. "CRC-3-000012"). */
export function certificateCode(
  cert: Pick<CommercialCertificate, 'companyId' | 'number'>,
): string {
  return `CRC-${cert.companyId}-${String(cert.number).padStart(6, '0')}`;
}

/** Genera el PDF del certificado de referencia comercial. */
export function buildCertificatePdf(
  cert: CommercialCertificate,
): Promise<Buffer> {
  const letterhead = hasLetterhead(cert.companyId);
  return new Promise((resolve, reject) => {
    const doc = createPdfDocument(cert.companyId, {
      size: 'A4',
      margin: MARGIN,
      info: {
        Title: `Certificado de referencia comercial ${certificateCode(cert)}`,
        Author: cert.data.company.name,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { data } = cert;
    const left = MARGIN;
    const width = doc.page.width - MARGIN * 2;
    const issuedOn = bogotaDay(cert.createdAt ?? data.verifiedAt);

    const ensureSpace = (needed: number) => {
      if (doc.y + needed > contentBottom(doc)) doc.addPage();
    };

    // Encabezado propio solo si la compañía no tiene membrete.
    if (!letterhead) {
      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor(GREEN)
        .text(data.company.name, left, doc.y, { width });
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(MUTED)
        .text('Departamento de Cartera', { width });
      doc.moveDown(0.4);
      doc
        .strokeColor(GREEN)
        .lineWidth(1.2)
        .moveTo(left, doc.y)
        .lineTo(left + width, doc.y)
        .stroke();
      doc.moveDown(1);
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(TEXT)
      .text(`Certificado N° ${certificateCode(cert)}`, left, doc.y, {
        width,
        align: 'right',
      });
    doc
      .font('Helvetica')
      .fillColor(MUTED)
      .text(`Fecha de expedición: ${longDate(issuedOn)}`, {
        width,
        align: 'right',
      });
    doc.moveDown(0.8);

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(TEXT)
      .text('CERTIFICADO DE REFERENCIA COMERCIAL', left, doc.y, {
        width,
        align: 'center',
      });
    doc.moveDown(0.8);

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(TEXT)
      .text('Señores:', { width });
    doc.font('Helvetica-Bold').text(cert.addressedTo, { width });
    doc.moveDown(0.6);

    const c = data.client;
    const since = c.since
      ? `es cliente de nuestra compañía desde el ${longDate(c.since)}` +
        (c.relationshipMonths !== undefined
          ? `, con una relación comercial de ${duration(c.relationshipMonths)}`
          : '')
      : 'es cliente de nuestra compañía';
    const status = c.status
      ? ` y a la fecha se encuentra en estado ${c.status.toUpperCase()}`
      : '';
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(TEXT)
      .text(
        `${data.company.name} certifica que ${c.name}, identificado(a) con ` +
          `NIT ${c.code}, ${since}${status}. La siguiente información fue ` +
          `verificada en el sistema SIESA:`,
        { width, align: 'justify', lineGap: 2 },
      );
    doc.moveDown(0.7);

    const section = (title: string) => {
      ensureSpace(60);
      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor(GREEN)
        .text(title.toUpperCase(), left, doc.y, {
          width,
          characterSpacing: 0.3,
        });
      doc.moveDown(0.25);
      doc
        .strokeColor(BORDER)
        .lineWidth(0.8)
        .moveTo(left, doc.y)
        .lineTo(left + width, doc.y)
        .stroke();
      doc.moveDown(0.3);
    };

    const rows = (items: [string, string][]) => {
      const labelW = width * 0.55;
      items.forEach(([label, value], i) => {
        ensureSpace(15);
        const y = doc.y;
        if (i % 2 === 0) {
          doc.rect(left, y - 1.5, width, 14).fill(SOFT);
        }
        doc
          .font('Helvetica')
          .fontSize(8.8)
          .fillColor(MUTED)
          .text(label, left + 8, y + 1.5, { width: labelW - 8 });
        doc
          .font('Helvetica-Bold')
          .fillColor(TEXT)
          .text(value, left + labelW, y + 1.5, {
            width: width - labelW - 8,
            align: 'right',
          });
        doc.y = y + 14;
      });
      doc.x = left;
      doc.moveDown(0.7);
    };

    // 1. Información comercial.
    const main = c.branches[0];
    const term = (b?: (typeof c.branches)[number]) =>
      b?.paymentTerm ??
      (b?.paymentTermDays !== undefined ? `${b.paymentTermDays} días` : '—');
    // Si todas las sucursales comparten plazo y cupo, no se detallan.
    const uniform = c.branches.every(
      (b) => term(b) === term(main) && b.creditLimit === main?.creditLimit,
    );
    section('1. Información comercial');
    const commercial: [string, string][] = [
      ['Cliente', c.name],
      ['NIT', c.code],
      [
        'Cliente desde',
        c.since
          ? `${shortDate(c.since)}${c.sinceSource === 'primera_factura' ? ' (primera factura)' : ''}`
          : '—',
      ],
      [
        'Antigüedad de la relación comercial',
        duration(c.relationshipMonths) || '—',
      ],
      ['Estado del cliente', c.status ?? '—'],
    ];
    if (c.branches.length > 1) {
      commercial.push(['Sucursales', num(c.branches.length)]);
    }
    if (uniform) {
      commercial.push(
        ['Plazo de pago autorizado', term(main)],
        [
          'Cupo de crédito vigente',
          main?.creditLimit ? money(main.creditLimit) : 'Sin cupo asignado',
        ],
      );
      if (main?.creditDate)
        commercial.push(['Fecha del cupo', shortDate(main.creditDate)]);
    }
    rows(commercial);

    if (!uniform) {
      section('Plazo y cupo por sucursal');
      rows(
        c.branches.map((b): [string, string] => [
          `${b.branch}${b.name ? ` · ${b.name}` : ''}`,
          `${term(b)} · ${b.creditLimit ? money(b.creditLimit) : 'Sin cupo'}`,
        ]),
      );
    }

    // 2. Comportamiento de pagos.
    const b = data.behavior;
    section(
      `2. Comportamiento de pagos (${shortDate(data.period.from)} – ${shortDate(data.period.to)})`,
    );
    rows([
      ['Facturas emitidas en el periodo', num(b.invoices)],
      ['Valor facturado', money(b.invoicedAmount)],
      ['Facturas canceladas', num(b.paidInvoices)],
      [
        'Canceladas dentro del plazo',
        b.paidInvoices
          ? `${num(b.paidOnTime)} (${num(b.onTimePct, 1)} %)`
          : '—',
      ],
      ['Canceladas fuera del plazo', num(b.paidLate)],
      [
        'Días promedio de pago',
        b.paidInvoices ? `${num(b.avgPaymentDays, 1)} días` : '—',
      ],
      [
        'Mora máxima registrada',
        b.maxDaysLate ? `${num(b.maxDaysLate)} días` : 'Sin mora',
      ],
      ['Último pago registrado', shortDate(b.lastPaymentDate)],
    ]);

    // 3. Estado actual de la cartera.
    const cur = data.current;
    section(
      `3. Estado actual de la cartera (corte ${shortDate(bogotaDay(data.verifiedAt))})`,
    );
    rows([
      ['Saldo total en cartera', money(cur.totalBalance)],
      ['Saldo vencido', money(cur.overdueBalance)],
      ['Documentos pendientes', num(cur.openDocuments)],
      [
        'Mora actual máxima',
        cur.maxDaysOverdue ? `${num(cur.maxDaysOverdue)} días` : 'Al día',
      ],
      ...(c.totalCreditLimit > 0
        ? [['Cupo disponible', money(cur.creditAvailable)] as [string, string]]
        : []),
    ]);

    // Concepto (redactado solo con los datos verificados).
    ensureSpace(90);
    const behaviorText =
      b.invoices === 0
        ? `Durante el periodo comprendido entre el ${longDate(data.period.from)} y el ` +
          `${longDate(data.period.to)} no se registraron facturas a nombre del cliente.`
        : `Durante el periodo comprendido entre el ${longDate(data.period.from)} y el ` +
          `${longDate(data.period.to)} se registraron ${num(b.invoices)} facturas por ` +
          `${money(b.invoicedAmount)}` +
          (b.paidInvoices
            ? `; de las ${num(b.paidInvoices)} canceladas, ${num(b.paidOnTime)} ` +
              `(${num(b.onTimePct, 1)} %) se pagaron dentro del plazo autorizado, ` +
              `con un promedio de ${num(b.avgPaymentDays, 1)} días de pago.`
            : '; ninguna ha sido cancelada a la fecha.');
    const currentText =
      `Con corte a la fecha de expedición, el cliente presenta un saldo en ` +
      `cartera de ${money(cur.totalBalance)}` +
      (cur.overdueBalance > 0
        ? `, de los cuales ${money(cur.overdueBalance)} se encuentran vencidos.`
        : ' sin saldos vencidos.');
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(TEXT)
      .text(`${behaviorText} ${currentText}`, left, doc.y, {
        width,
        align: 'justify',
        lineGap: 2,
      });

    if (cert.notes) {
      doc.moveDown(0.8);
      ensureSpace(40);
      doc
        .font('Helvetica-Bold')
        .text('Observaciones: ', { width, continued: true });
      doc.font('Helvetica').text(cert.notes, { width, align: 'justify' });
    }

    doc.moveDown(0.8);
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(
        'La presente certificación se expide a solicitud del interesado, con base ' +
          'en la información registrada en SIESA a la fecha de expedición, y no ' +
          'constituye garantía ni aval de obligaciones del cliente.',
        { width, align: 'justify', lineGap: 2 },
      );

    // Firma.
    ensureSpace(75);
    doc.moveDown(2.2);
    const lineY = doc.y;
    doc
      .strokeColor(TEXT)
      .lineWidth(0.8)
      .moveTo(left, lineY)
      .lineTo(left + 220, lineY)
      .stroke();
    doc.y = lineY + 6;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(TEXT)
      .text(cert.issuedByName, left, doc.y);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text('Departamento de Cartera');
    doc.text(data.company.name);

    // Pie de verificación, al final del área útil de la página.
    const footer =
      `Certificado ${certificateCode(cert)} · Información verificada en SIESA el ` +
      `${new Date(data.verifiedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })} · ` +
      `Código de verificación ${cert.id}`;
    doc.font('Helvetica').fontSize(7).fillColor(MUTED);
    const footerH = doc.heightOfString(footer, { width }) + 4;
    if (doc.y + 10 + footerH > contentBottom(doc)) doc.addPage();
    doc.text(footer, left, Math.max(doc.y + 10, contentBottom(doc) - footerH), {
      width,
    });

    doc.end();
  });
}
