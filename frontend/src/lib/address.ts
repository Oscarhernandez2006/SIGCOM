/**
 * Estándar de nomenclatura urbana colombiana para direcciones y su
 * información adicional (referencia). Usado en el formulario de ubicación
 * del vendedor (`ClientSellerInfoModal`).
 */

export const TIPOS_VIA = [
  'Avenida Calle',
  'Avenida Carrera',
  'Avenida',
  'Autopista',
  'Calle',
  'Carrera',
  'Circular',
  'Diagonal',
  'Transversal',
  'Vía',
] as const;

export const TIPOS_CONJUNTO = [
  'Conjunto',
  'Edificio',
  'Urbanización',
  'Condominio',
] as const;

export const TIPOS_UNIDAD = ['Apto', 'Casa', 'Local'] as const;

/** Número (1-3 dígitos) + letra opcional + dígitos opcionales, p. ej. "8B", "42B1". */
const VIA_PART = /^\d{1,3}[A-Za-z]?\d*$/;
/** Número final (1-4 dígitos) + letra opcional, p. ej. "82", "294A". */
const PLACA_PART = /^\d{1,4}[A-Za-z]?$/;

export interface DireccionParts {
  tipoVia: string;
  via: string;
  cruce: string;
  placa: string;
}

/** Intenta separar una dirección existente en sus partes canónicas. */
export function parseDireccion(input: string): DireccionParts | null {
  const text = input.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  const tiposPattern = [...TIPOS_VIA]
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/í/gi, '[ií]'))
    .join('|');
  const re = new RegExp(
    `^(${tiposPattern})\\s+(\\S+)\\s*#\\s*(\\S+)\\s*-\\s*(\\S+)$`,
    'i',
  );
  const match = text.match(re);
  if (!match) return null;
  const [, tipoVia, via, cruce, placa] = match;
  if (!VIA_PART.test(via) || !VIA_PART.test(cruce) || !PLACA_PART.test(placa)) {
    return null;
  }
  return { tipoVia, via, cruce, placa };
}

/** Arma el texto canónico "<TipoVía> <Vía> # <Cruce>-<Placa>". */
export function formatDireccion(parts: DireccionParts): string {
  return `${parts.tipoVia} ${parts.via} # ${parts.cruce}-${parts.placa}`;
}

/** Valida que las partes de una dirección cumplan el estándar. */
export function isDireccionValida(
  parts: Partial<DireccionParts>,
): parts is DireccionParts {
  return (
    !!parts.tipoVia &&
    !!parts.via &&
    VIA_PART.test(parts.via) &&
    !!parts.cruce &&
    VIA_PART.test(parts.cruce) &&
    !!parts.placa &&
    PLACA_PART.test(parts.placa)
  );
}

export interface ReferenciaParts {
  tipoConjunto?: string;
  nombreConjunto?: string;
  tipoUnidad?: string;
  numeroUnidad?: string;
  torre?: string;
}

/**
 * Arma el texto de referencia uniendo con " - " las partes presentes, p. ej.
 * "Conjunto Torino - Apto 355 - T9".
 */
export function formatReferencia(parts: ReferenciaParts): string {
  const pieces: string[] = [];
  if (parts.tipoConjunto && parts.nombreConjunto?.trim()) {
    pieces.push(`${parts.tipoConjunto} ${parts.nombreConjunto.trim()}`);
  }
  if (parts.tipoUnidad && parts.numeroUnidad?.trim()) {
    pieces.push(`${parts.tipoUnidad} ${parts.numeroUnidad.trim()}`);
  }
  if (parts.torre?.trim()) {
    pieces.push(`T${parts.torre.trim()}`);
  }
  return pieces.join(' - ');
}

/** Teléfono colombiano: 7 a 10 dígitos (fijo o celular), otros caracteres permitidos se ignoran al validar. */
export function isTelefonoValido(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 10;
}

/** Normaliza texto libre a "Cada Palabra Con Mayúscula Inicial" mientras se digita. */
export function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s.,-])(\p{L})/gu, (_m, sep, letter) => sep + letter.toUpperCase());
}

