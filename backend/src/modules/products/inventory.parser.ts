import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

export interface InventoryRow {
  reference: string;
  description: string;
  stock: number;
  /** Tipo de inventario declarado en el Excel (si la columna existe). */
  inventoryType?: 'corte' | 'subproducto' | 'namnam';
  /** Número de fila del Excel (1-based) para mensajes de validación. */
  rowNumber: number;
}

/** Normaliza un encabezado: minúsculas, sin tildes, sin espacios extra. */
function normalize(value: string): string {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const REFERENCE_KEYS = ['referencia', 'ref', 'codigo', 'sku'];
const DESCRIPTION_KEYS = ['descripcion', 'nombre', 'producto', 'articulo'];
const STOCK_KEYS = ['stock', 'existencia', 'cantidad', 'saldo'];
const TYPE_KEYS = ['tipo', 'tipo inventario', 'inventario', 'tipo producto'];

function parseInventoryType(
  value: unknown,
): 'corte' | 'subproducto' | 'namnam' | undefined {
  const raw = normalize(String(value ?? ''));
  if (!raw) return undefined;
  if (raw === 'corte' || raw === 'cortes') return 'corte';
  if (raw === 'subproducto' || raw === 'subproductos') return 'subproducto';
  if (raw.replace(/[^a-z]/g, '') === 'namnam') return 'namnam';
  return undefined;
}

/**
 * Lee la plantilla de inventario (Referencia, Descripción, Stock).
 * Detecta las columnas por nombre de encabezado, tolerando tildes
 * y mayúsculas, sin importar el orden exacto de las columnas.
 */
export function parseInventoryExcel(buffer: Buffer): InventoryRow[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new BadRequestException('El archivo no es un Excel válido.');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new BadRequestException('El Excel no tiene hojas.');
  }
  const sheet = workbook.Sheets[sheetName];

  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
  });

  if (matrix.length < 2) {
    throw new BadRequestException(
      'La plantilla está vacía o no tiene filas de datos.',
    );
  }

  const headers = matrix[0].map((h) => normalize(String(h)));
  const findIndex = (keys: string[]) =>
    headers.findIndex((h) => keys.includes(h));

  const refIdx = findIndex(REFERENCE_KEYS);
  const descIdx = findIndex(DESCRIPTION_KEYS);
  const stockIdx = findIndex(STOCK_KEYS);
  const typeIdx = findIndex(TYPE_KEYS);

  if (refIdx === -1 || descIdx === -1 || stockIdx === -1) {
    throw new BadRequestException(
      'La plantilla debe tener las columnas: Referencia, Descripción y Stock.',
    );
  }

  const rows: InventoryRow[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    const reference = String(row[refIdx] ?? '').trim();
    const description = String(row[descIdx] ?? '').trim();
    const rawStock = row[stockIdx];
    const inventoryType =
      typeIdx >= 0 ? parseInventoryType(row[typeIdx]) : undefined;

    // Saltamos filas sin referencia (filas vacías al final, totales, etc.).
    if (!reference) continue;

    // Evitamos referencias duplicadas dentro del mismo archivo.
    if (seen.has(reference)) continue;
    seen.add(reference);

    const stock = Number(
      typeof rawStock === 'string' ? rawStock.replace(',', '.') : rawStock,
    );

    rows.push({
      reference,
      description: description || reference,
      stock: Number.isFinite(stock) ? stock : 0,
      inventoryType,
      rowNumber: i + 1,
    });
  }

  if (rows.length === 0) {
    throw new BadRequestException(
      'No se encontraron productos válidos en la plantilla.',
    );
  }

  return rows;
}

/** Genera un Excel de plantilla con encabezados y un ejemplo. */
export function buildInventoryTemplate(): Buffer {
  const data = [
    ['Referencia', 'Descripción', 'Stock', 'Tipo inventario'],
    ['1001', 'LOMO FINO', 10, 'corte'],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(data);
  sheet['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 10 }, { wch: 18 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Inventario');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
