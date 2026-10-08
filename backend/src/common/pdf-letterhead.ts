import PDFDocument from 'pdfkit';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Membretes por compañía: imagen de página completa (tamaño carta) que se
 * dibuja de fondo en cada página. `top`/`bottom` son la fracción de la altura
 * de página que ocupan el logo y el pie, para que el contenido no los pise.
 */
const LETTERHEADS: Record<string, { file: string; top: number; bottom: number }> = {
  '8': { file: '8.jpg', top: 0.215, bottom: 0.14 },
};

const LETTERHEADS_DIR = join(__dirname, '..', 'assets', 'letterheads');

/** Compañía cuyo membrete se aplica a las páginas nuevas de cada documento. */
const docCompany = new WeakMap<PDFKit.PDFDocument, string | undefined>();

/**
 * Crea un documento PDF con el membrete de la compañía (si tiene uno) en el
 * fondo de todas las páginas y márgenes que respetan el logo y el pie.
 */
export function createPdfDocument(
  companyId: string | undefined,
  options: PDFKit.PDFDocumentOptions,
): PDFKit.PDFDocument {
  const doc = new PDFDocument({ ...options, autoFirstPage: false });
  docCompany.set(doc, companyId);
  doc.on('pageAdded', () => applyLetterhead(doc));
  doc.addPage();
  return doc;
}

/** Cambia la compañía del membrete para las páginas que se agreguen después. */
export function setPdfCompany(
  doc: PDFKit.PDFDocument,
  companyId: string | undefined,
): void {
  docCompany.set(doc, companyId);
}

function applyLetterhead(doc: PDFKit.PDFDocument): void {
  const companyId = docCompany.get(doc);
  const letterhead = companyId ? LETTERHEADS[companyId] : undefined;
  if (!letterhead) return;
  const imagePath = join(LETTERHEADS_DIR, letterhead.file);
  if (!existsSync(imagePath)) return;

  const { height } = doc.page;
  doc.page.margins = {
    ...doc.page.margins,
    top: Math.round(height * letterhead.top),
    bottom: Math.round(height * letterhead.bottom),
  };
  // Ajustado al alto de la página (sin deformar); en A4 se recorta el borde derecho.
  doc.image(imagePath, 0, 0, { height });
  doc.x = doc.page.margins.left;
  doc.y = doc.page.margins.top;
}

/** Última coordenada Y utilizable de la página actual (antes del margen inferior). */
export function contentBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - doc.page.margins.bottom;
}
