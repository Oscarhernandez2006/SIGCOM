import type { jsPDF } from 'jspdf';
import letterhead8 from '@/assets/letterheads/8.jpg';

/**
 * Membretes por compañía (imagen de página completa). `top`/`bottom` son la
 * fracción del alto de página que ocupan el logo y el pie.
 */
const LETTERHEADS: Record<string, { src: string; top: number; bottom: number }> = {
  '8': { src: letterhead8, top: 0.215, bottom: 0.14 },
};

/** Márgenes (pt) que deja libres el membrete aplicado. */
export interface LetterheadMargins {
  top: number;
  bottom: number;
}

const dataUrlCache = new Map<string, Promise<string>>();

function toDataUrl(src: string): Promise<string> {
  let cached = dataUrlCache.get(src);
  if (!cached) {
    cached = fetch(src)
      .then((res) => res.blob())
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          }),
      );
    dataUrlCache.set(src, cached);
  }
  return cached;
}

/**
 * Dibuja el membrete de la compañía de fondo en la página actual y en todas
 * las que se agreguen después. Devuelve `null` si la compañía no tiene.
 */
export async function applyLetterhead(
  doc: jsPDF,
  companyId?: string,
): Promise<LetterheadMargins | null> {
  const letterhead = companyId ? LETTERHEADS[companyId] : undefined;
  if (!letterhead) return null;

  let dataUrl: string;
  try {
    dataUrl = await toDataUrl(letterhead.src);
  } catch {
    return null;
  }
  const { width, height } = doc.getImageProperties(dataUrl);

  const draw = () => {
    const pageH = doc.internal.pageSize.getHeight();
    // Ajustado al alto de la página (sin deformar); en A4 se recorta el borde derecho.
    doc.addImage(dataUrl, 'JPEG', 0, 0, (pageH * width) / height, pageH, 'letterhead', 'FAST');
  };
  draw();
  // autoTable también agrega páginas con doc.addPage(), así que el membrete
  // queda de fondo en todas.
  const addPage = doc.addPage.bind(doc);
  doc.addPage = ((...args: Parameters<jsPDF['addPage']>) => {
    addPage(...args);
    draw();
    return doc;
  }) as jsPDF['addPage'];

  const pageH = doc.internal.pageSize.getHeight();
  return {
    top: Math.round(pageH * letterhead.top),
    bottom: Math.round(pageH * letterhead.bottom),
  };
}
