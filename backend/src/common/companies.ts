/**
 * Compañías del negocio. Cada compañía es un "tenant" aislado:
 * vendedores, códigos, clientes, productos y pedidos son independientes.
 * El id corresponde al ID de compañía en Siesa.
 */
export interface Company {
  id: string;
  name: string;
}

export const COMPANIES: Company[] = [
  { id: '3', name: 'AGROPECUARIA' },
  { id: '8', name: 'CARNES FRIAS' },
  { id: 'MTAT', name: 'MONTERIA TAT AGROPECUARIA' },
];

export const COMPANY_IDS = COMPANIES.map((c) => c.id);

/**
 * Cédulas (document_id) de vendedores cuyo presupuesto se maneja APARTE y NO
 * debe sumarse al presupuesto general del comercial (p. ej. Juan Sierra, que va
 * por tienda/cliente). Es solo configuración de código (sin cambios en la BD):
 * agrega aquí la cédula del vendedor para excluirlo del total general.
 */
export const BUDGET_APART_SELLER_DOCS: string[] = [
  '72004911 ', // Juan Sierra 
];

/**
 * Cédulas (document_id) de vendedores que se EXCLUYEN por completo del tablero
 * comercial: no aparecen en el selector de vendedores y su venta no suma en el
 * consolidado "general" (todos los vendedores). Solo configuración de código.
 */
export const DASHBOARD_EXCLUDED_SELLER_DOCS: string[] = [
  '72004911', // Juan Sierra
  '900391505', // INVERSIONES SERRANO MILLAN (CARNES FRIAS)
];

/** Nombres (ERP) excluidos del tablero, para fuentes del ERP que no traen NIT. */
export const DASHBOARD_EXCLUDED_SELLER_NAMES: string[] = [
  'INVERSIONES SERRANO MILLAN',
];

/** Indica si la cédula del vendedor está excluida del tablero comercial. */
export function isDashboardExcludedSellerDoc(
  documentId: string | null | undefined,
): boolean {
  const doc = (documentId ?? '').trim();
  return doc !== '' && DASHBOARD_EXCLUDED_SELLER_DOCS.some((d) => d.trim() === doc);
}

export function isValidCompany(id: string | undefined): id is string {
  return !!id && COMPANY_IDS.includes(id);
}

/**
 * Compañías "virtuales": entornos propios en nuestro sistema (sus pedidos,
 * canales y presupuestos son independientes) pero que consultan el ERP/catálogo
 * de otra compañía real de Siesa. MONTERIA TAT usa el catálogo de AGROPECUARIA.
 */
export const SIESA_ID_BY_COMPANY: Record<string, string> = {
  '3': '3',
  '8': '8',
  MTAT: '3', // MONTERIA TAT AGROPECUARIA consulta el ERP/catálogo de AGROPECUARIA (3)
};

/**
 * Devuelve el id de compañía "base" (real en Siesa) para las consultas al ERP
 * y para leer el catálogo compartido (productos, clientes, listas de precios).
 * Para las compañías reales devuelve el mismo id; para las virtuales, su base.
 */
export function baseCompanyId(companyId: string): string {
  return SIESA_ID_BY_COMPANY[companyId] ?? companyId;
}

/**
 * Monto mínimo (en pesos) para poder realizar un pedido, por compañía.
 * Las compañías sin tope definido no tienen mínimo (0).
 */
export const MIN_ORDER_TOTAL: Record<string, number> = {
  '3': 150000, // AGROPECUARIA
  '8': 50000, // CARNES FRIAS
  MTAT: 0, // MONTERIA TAT AGROPECUARIA: sin mínimo de pedido
};

/** Devuelve el monto mínimo de pedido de una compañía (0 si no tiene tope). */
export function getMinOrderTotal(companyId: string): number {
  // Primero el valor propio de la compañía (p. ej. MONTERIA = 0); si no tiene,
  // el de su compañía base.
  return (
    MIN_ORDER_TOTAL[companyId] ??
    MIN_ORDER_TOTAL[baseCompanyId(companyId)] ??
    0
  );
}

/**
 * Bodega (almacén) que se envía al ERP por compañía. La referencia se despacha
 * desde la bodega configurada para cada compañía.
 */
export const WAREHOUSE_BY_COMPANY: Record<string, string> = {
  '3': '30103', // AGROPECUARIA
  '8': '80101', // CARNES FRIAS
  MTAT: '30202', // MONTERIA TAT AGROPECUARIA (bodega propia)
};

/**
 * Devuelve la bodega del ERP para una compañía. Lanza si no está configurada,
 * para evitar enviar un pedido con una bodega inválida.
 */
export function getWarehouse(companyId: string): string {
  // Primero la bodega propia de la compañía (p. ej. MONTERIA = 30202); si no
  // tiene, la de su compañía base.
  const warehouse =
    WAREHOUSE_BY_COMPANY[companyId] ??
    WAREHOUSE_BY_COMPANY[baseCompanyId(companyId)];
  if (!warehouse) {
    throw new Error(
      `La compañía ${companyId} no tiene una bodega configurada para enviar pedidos al ERP.`,
    );
  }
  return warehouse;
}

/**
 * Ruta (path) del endpoint del ERP para subir pedidos, por compañía. Cada
 * compañía tiene su propio endpoint (p. ej. `pedidos-agropecuaria`).
 */
export const ORDER_ENDPOINT_BY_COMPANY: Record<string, string> = {
  '3': 'ventas/pedidos-agropecuaria', // AGROPECUARIA
  '8': 'ventas/pedidos/carnesfrias', // CARNES FRIAS
  MTAT: 'ventas/pedidos-monteria', // MONTERIA TAT AGROPECUARIA
};

/**
 * Devuelve la ruta del endpoint de carga de pedidos del ERP para una compañía.
 * Lanza si no está configurada, para evitar subir el pedido a una ruta inválida.
 */
export function getOrderEndpoint(companyId: string): string {
  // El endpoint es propio de cada compañía (p. ej. MONTERIA TAT tiene el suyo);
  // si no hay uno específico, se usa el de su compañía base.
  const endpoint =
    ORDER_ENDPOINT_BY_COMPANY[companyId] ??
    ORDER_ENDPOINT_BY_COMPANY[baseCompanyId(companyId)];
  if (!endpoint) {
    throw new Error(
      `La compañía ${companyId} no tiene un endpoint configurado para enviar pedidos al ERP.`,
    );
  }
  return endpoint;
}

/**
 * Tipo de documento (TIPO_DOC) que identifica los pedidos de cada compañía en
 * Siesa. Se usa al consultar los estados; el consecutivo de este tipo de
 * documento coincide con nuestro `orderNumber`.
 */
export const ORDER_DOC_TYPE_BY_COMPANY: Record<string, string> = {
  '3': 'PVA', // AGROPECUARIA
  '8': 'PVA', // CARNES FRIAS
};

/** Tipo de documento de pedidos en Siesa para una compañía (por defecto PVA). */
export function getOrderDocType(companyId: string): string {
  return ORDER_DOC_TYPE_BY_COMPANY[baseCompanyId(companyId)] ?? 'PVA';
}

/**
 * Tipos de documento de los subproductos en Siesa: SPB (res/bovino) y
 * SPP (cerdo/porcino). Los subproductos NO salen como PVA, entran con su
 * propio tipo de documento, así que se consultan aparte para bajar su estado.
 */
export const SUBPRODUCTO_DOC_TYPES = ['SPB', 'SPP'];

/**
 * Todos los tipos de documento a consultar al bajar los estados de una
 * compañía. Además del de los cortes (PVA), Agropecuaria (base '3') incluye
 * los de subproductos (SPB/SPP). Sin esto, los subproductos nunca aparecen en
 * los estados y la sincronización los marca como "rebotados" por error.
 */
export function getOrderDocTypes(companyId: string): string[] {
  const types = [getOrderDocType(companyId)];
  if (baseCompanyId(companyId) === '3') types.push(...SUBPRODUCTO_DOC_TYPES);
  return types;
}

/**
 * Centro de operación (CO) que identifica los documentos de cada compañía en
 * Siesa. Las compañías virtuales (p. ej. MONTERIA TAT) comparten `cia` y
 * `tipo_doc` con su base, pero se distinguen por su CO propio. Sirve para no
 * cruzar los estados de una compañía con los documentos de otra.
 */
export const OPERATION_CENTER_BY_COMPANY: Record<string, string> = {
  MTAT: '302', // MONTERIA TAT AGROPECUARIA
};

/** CO propio de una compañía (undefined si comparte el de su base). */
export function getOperationCenter(companyId: string): string | undefined {
  return OPERATION_CENTER_BY_COMPANY[companyId];
}

/**
 * Centros de operación (CO) que pertenecen a compañías virtuales que comparten
 * la misma compañía base. Se usan para EXCLUIRLOS al consultar los estados de
 * la compañía base (p. ej. que AGROPECUARIA no cruce con documentos de
 * MONTERIA, que comparten cia 3).
 */
export function virtualOperationCentersForBase(baseId: string): string[] {
  return COMPANIES.filter(
    (c) => c.id !== baseId && baseCompanyId(c.id) === baseId,
  )
    .map((c) => OPERATION_CENTER_BY_COMPANY[c.id])
    .filter((co): co is string => Boolean(co));
}
