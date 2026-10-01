import type { UserRole } from '@/types';

/** Definición de un módulo (ítem de menú) que se puede asignar por permisos. */
export interface ModuleDef {
  /** Ruta del front que actúa como clave del permiso (p. ej. "/pedidos"). */
  key: string;
  label: string;
}

/** Área de "Toma de pedidos" (rol vendedor). */
export const SELLER_MODULES: ModuleDef[] = [
  { key: '/', label: 'Dashboard comercial' },
  { key: '/pedidos', label: 'Pedidos' },
  { key: '/pedidos/canales', label: 'Pedidos · Canales' },
  { key: '/pedidos/subproductos', label: 'Pedidos · Subproductos' },
  { key: '/cotizaciones', label: 'Cotizaciones' },
  { key: '/clientes', label: 'Cartera de Clientes' },
  { key: '/disponibilidad', label: 'Disponibilidad' },
];

/** Área "Administrativa" (rol administrador). */
export const ADMIN_MODULES: ModuleDef[] = [
  { key: '/admin', label: 'Dashboard' },
  { key: '/admin/negocios-nacionales', label: 'Dashboard Negocios Nacionales' },
  { key: '/admin/inventario', label: 'Inventario' },
  { key: '/admin/pedidos', label: 'Administración de pedidos' },
  { key: '/admin/reportes', label: 'Reportes' },
  { key: '/admin/descargar-pedidos', label: 'Descargar pedidos · Cortes' },
  {
    key: '/admin/descargar-pedidos-subproductos-cerdo',
    label: 'Descargar subproductos · Cerdo',
  },
  {
    key: '/admin/descargar-pedidos-subproductos-res',
    label: 'Descargar subproductos · Res',
  },
  { key: '/admin/despacho-drivin-tat', label: 'Despacho · Drivin TAT Facturas' },
  { key: '/admin/canales-control', label: 'Canales · Control' },
  { key: '/admin/canales-cartera', label: 'Canales · Cartera' },
  { key: '/admin/canales-despacho', label: 'Canales · Despacho' },
  { key: '/admin/listas-precios', label: 'Listas de precios' },
  { key: '/admin/productos-estrella', label: 'Productos estrella' },
  { key: '/admin/clientes', label: 'Clientes' },
  { key: '/admin/presupuestos', label: 'Presupuestos' },
  { key: '/admin/rentabilidad', label: 'Rentabilidad · Costos' },
  { key: '/admin/cartera', label: 'Aprobación de cartera' },
  {
    key: '/admin/controlador-subproductos',
    label: 'Controlador Subproductos',
  },
  { key: '/admin/horario-pedidos', label: 'Horario de pedidos' },
  { key: '/admin/api', label: 'API' },
  { key: '/admin/usuarios', label: 'Usuarios' },
];

/** Tipo de área a la que pertenece un módulo. */
export type ModuleArea = 'seller' | 'admin';

/** Grupos de módulos para la UI de permisos (ambas áreas a la vez). */
export const MODULE_GROUPS: {
  area: ModuleArea;
  label: string;
  modules: ModuleDef[];
}[] = [
  { area: 'seller', label: 'Operativo · Toma de pedidos', modules: SELLER_MODULES },
  { area: 'admin', label: 'Administrativo', modules: ADMIN_MODULES },
];

/** Todos los módulos asignables (operativo + administrativo). */
export const ALL_MODULES: ModuleDef[] = [...SELLER_MODULES, ...ADMIN_MODULES];

const ADMIN_KEYS = new Set(ADMIN_MODULES.map((m) => m.key));
const SELLER_KEYS = new Set(SELLER_MODULES.map((m) => m.key));

/** Módulos disponibles según el rol (área) del usuario. */
export function modulesForRole(role: UserRole): ModuleDef[] {
  if (role === 'admin') return ADMIN_MODULES;
  if (role === 'seller') return SELLER_MODULES;
  return [];
}

/**
 * Indica si un usuario puede entrar a un área (operativa/administrativa)
 * por su rol o porque se le asignaron módulos de esa área.
 */
export function canAccessArea(
  role: UserRole,
  permissions: string[] | undefined,
  area: ModuleArea,
): boolean {
  if (area === 'admin' && role === 'admin') return true;
  if (area === 'seller' && role === 'seller') return true;
  const perms = permissions ?? [];
  return area === 'admin'
    ? perms.some((p) => ADMIN_KEYS.has(p))
    : perms.some((p) => SELLER_KEYS.has(p));
}

/** Etiqueta del área según el rol. */
export function areaLabel(role: UserRole): string {
  if (role === 'admin') return 'Administrativa';
  if (role === 'seller') return 'Vendedor';
  if (role === 'alistador') return 'Alistador';
  if (role === 'facturacion') return 'Facturación';
  return 'Cartera';
}

/**
 * Indica si un módulo (ruta) es visible para un usuario con esos permisos.
 * Si la lista de permisos está vacía, ve todos los módulos de su rol.
 */
export function canSeeModule(
  permissions: string[] | undefined,
  moduleKey: string,
): boolean {
  if (!permissions || permissions.length === 0) return true;
  return permissions.includes(moduleKey);
}
