import type { Company } from '@/types';

/**
 * Compañías del negocio (mismo catálogo que el backend).
 * Cada compañía es un entorno aislado.
 */
export const COMPANIES: Company[] = [
  { id: '3', name: 'AGROPECUARIA' },
  { id: '8', name: 'CARNES FRIAS' },
  { id: 'MTAT', name: 'MONTERIA TAT AGROPECUARIA' },
];

/**
 * Monto mínimo (en pesos) para poder realizar un pedido, por compañía.
 * Las compañías sin tope definido no tienen mínimo (0).
 */
export const MIN_ORDER_TOTAL: Record<string, number> = {
  '3': 150000, // AGROPECUARIA
  '8': 50000, // CARNES FRIAS
  MTAT: 0, // MONTERIA TAT AGROPECUARIA (sin mínimo de pedido)
};

/** Devuelve el monto mínimo de pedido de una compañía (0 si no tiene tope). */
export function getMinOrderTotal(companyId?: string): number {
  return (companyId && MIN_ORDER_TOTAL[companyId]) || 0;
}

/**
 * Cédulas (documentId) de vendedores excluidos del tablero comercial: no
 * aparecen en el selector de vendedores (mismo criterio que el backend).
 */
export const DASHBOARD_EXCLUDED_SELLER_DOCS: string[] = [
  '72004911', // Juan Sierra
  '900391505', // INVERSIONES SERRANO MILLAN (CARNES FRIAS)
];

/** Indica si el vendedor está excluido del tablero comercial por su cédula. */
export function isDashboardExcludedSellerDoc(documentId?: string): boolean {
  const doc = (documentId ?? '').trim();
  return doc !== '' && DASHBOARD_EXCLUDED_SELLER_DOCS.some((d) => d.trim() === doc);
}

/** Compañías que venden Ñam Ñam, comida para mascotas (mismo criterio que el backend). */
export const NAMNAM_COMPANIES = ['3'];

/** Mínimo de unidades (suma de cantidades) de un pedido de Ñam Ñam. */
export const NAMNAM_MIN_UNITS = 20;

export function isNamNamCompany(companyId?: string): boolean {
  return !!companyId && NAMNAM_COMPANIES.includes(companyId);
}
