import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AdminDashboardStats,
  AdminUser,
  BudgetRow,
  ClientBudgetRow,
  ClientPortfolio,
  InventoryReportData,
  ManagerialDashboardStats,
  Order,
  Product,
  ProductCost,
  ProductSalesReportData,
  ProjectionConfig,
  SalesSummaryReportData,
  SellerRankingReportData,
  SellerProductReportData,
  ProductSellerReportData,
  SellerSalesReportData,
  VendorProductSalesReportData,
  OrdersBySellerReportData,
  SellableProduct,
  TatInvoice,
} from '@/types';

/** KPIs consolidados de ambas compañías para el panel de administración. */
export function useAdminDashboard() {
  return useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: async () => {
      const res = await api.get<AdminDashboardStats>('/admin/dashboard');
      return res.data;
    },
  });
}

/**
 * Dashboard gerencial: mismas métricas divididas por compañía dentro de un
 * rango de fechas (un día único si `from === to`). Si no se pasan fechas, el
 * backend usa los últimos 14 días.
 */
export function useManagerialDashboard(from?: string, to?: string) {
  return useQuery({
    queryKey: ['admin', 'dashboard', 'managerial', from, to],
    queryFn: async () => {
      const res = await api.get<ManagerialDashboardStats>(
        '/admin/dashboard/managerial',
        {
          params: {
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          },
        },
      );
      return res.data;
    },
  });
}

/* ---- Usuarios ---- */

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await api.get<AdminUser[]>('/admin/users');
      return res.data;
    },
  });
}

interface CreateUserInput {
  documentId: string;
  name: string;
  password: string;
  email?: string;
  role: 'admin' | 'seller' | 'cartera' | 'alistador' | 'facturacion';
  siesaSellerCode?: string;
  clientBudget?: boolean;
  permissions?: string[];
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const res = await api.post<AdminUser>('/admin/users', input);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

interface UpdateUserInput {
  id: string;
  documentId?: string;
  name?: string;
  password?: string;
  email?: string;
  role?: 'admin' | 'seller' | 'cartera' | 'alistador' | 'facturacion';
  siesaSellerCode?: string;
  clientBudget?: boolean;
}

/** Edita la información de un usuario. */
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: UpdateUserInput) => {
      const res = await api.patch<AdminUser>(`/admin/users/${id}`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

/** Elimina un usuario. */
export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete<{ ok: boolean }>(`/admin/users/${id}`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useSetUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; active: boolean }) => {
      const res = await api.patch<AdminUser>(
        `/admin/users/${input.id}/active`,
        { active: input.active },
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

/** Define los módulos visibles (permisos) de un usuario. */
export function useSetUserPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; permissions: string[] }) => {
      const res = await api.patch<AdminUser>(
        `/admin/users/${input.id}/permissions`,
        { permissions: input.permissions },
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

/** Define los módulos visibles (permisos) de un usuario EN una compañía. */
export function useSetCompanyPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      companyId: string;
      permissions: string[];
    }) => {
      const res = await api.patch<AdminUser>(
        `/admin/users/${input.id}/companies/${input.companyId}/permissions`,
        { permissions: input.permissions },
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useAssignCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      companyId: string;
      siesaSellerCode?: string;
    }) => {
      const res = await api.post<AdminUser>(
        `/admin/users/${input.id}/companies`,
        { companyId: input.companyId, siesaSellerCode: input.siesaSellerCode },
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useRemoveCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; companyId: string }) => {
      const res = await api.delete<AdminUser>(
        `/admin/users/${input.id}/companies/${input.companyId}`,
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

/* ---- Inventario por compañía (header explícito, el admin no fija compañía) ---- */

export function useCompanyProducts(
  companyId: string,
  search: string,
  type?: 'corte' | 'subproducto',
) {
  return useQuery({
    queryKey: ['admin', 'products', companyId, search, type],
    queryFn: async () => {
      const res = await api.get<Product[]>('/products', {
        params: {
          ...(search ? { search } : {}),
          ...(type ? { type } : {}),
        },
        headers: { 'X-Company-Id': companyId },
      });
      return res.data;
    },
    enabled: Boolean(companyId),
  });
}

/* ---- Presupuestos por vendedor y compañía ---- */

export function useBudgets(companyId: string, month: number, year: number) {
  return useQuery({
    queryKey: ['admin', 'budgets', companyId, month, year],
    queryFn: async () => {
      const res = await api.get<BudgetRow[]>('/admin/budgets', {
        params: { month, year },
        headers: { 'X-Company-Id': companyId },
      });
      return res.data;
    },
    enabled: Boolean(companyId),
  });
}

interface SaveBudgetsInput {
  companyId: string;
  month: number;
  year: number;
  items: { sellerId: string; targetKilos: number; expectedRevenue: number }[];
}

export function useSaveBudgets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, month, year, items }: SaveBudgetsInput) => {
      const res = await api.put<BudgetRow[]>(
        '/admin/budgets',
        { month, year, items },
        { headers: { 'X-Company-Id': companyId } },
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ['admin', 'budgets', vars.companyId, vars.month, vars.year],
      });
    },
  });
}

/* ---- Presupuesto por cliente/tienda (vendedores "por cliente") ---- */

export function useClientBudgets(
  companyId: string,
  sellerId: string,
  month: number,
  year: number,
) {
  return useQuery({
    queryKey: ['admin', 'client-budgets', companyId, sellerId, month, year],
    queryFn: async () => {
      const res = await api.get<ClientBudgetRow[]>('/admin/budgets/clients', {
        params: { sellerId, month, year },
        headers: { 'X-Company-Id': companyId },
      });
      return res.data;
    },
    enabled: Boolean(companyId && sellerId),
  });
}

interface SaveClientBudgetsInput {
  companyId: string;
  sellerId: string;
  month: number;
  year: number;
  items: { clientCode: string; targetKilos: number; expectedRevenue: number }[];
}

export function useSaveClientBudgets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      companyId,
      sellerId,
      month,
      year,
      items,
    }: SaveClientBudgetsInput) => {
      const res = await api.put<ClientBudgetRow[]>(
        '/admin/budgets/clients',
        { sellerId, month, year, items },
        { headers: { 'X-Company-Id': companyId } },
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: [
          'admin',
          'client-budgets',
          vars.companyId,
          vars.sellerId,
          vars.month,
          vars.year,
        ],
      });
    },
  });
}

/* ---- Costos estándar por producto (rentabilidad) ---- */

export function useProductCosts(companyId: string) {
  return useQuery({
    queryKey: ['admin', 'product-costs', companyId],
    queryFn: async () => {
      const res = await api.get<ProductCost[]>('/admin/product-costs', {
        headers: { 'X-Company-Id': companyId },
      });
      return res.data;
    },
    enabled: Boolean(companyId),
  });
}

interface SaveProductCostsInput {
  companyId: string;
  items: { productRef: string; name?: string; unitCost: number }[];
}

export function useSaveProductCosts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, items }: SaveProductCostsInput) => {
      const res = await api.put<ProductCost[]>(
        '/admin/product-costs',
        { items },
        { headers: { 'X-Company-Id': companyId } },
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ['admin', 'product-costs', vars.companyId],
      });
    },
  });
}

/* ---- Despacho · Facturas TAT (Drivin) ---- */

/** Facturas TAT guardadas de la compañía con su estado de selección. */
export function useTatInvoices(companyId: string) {
  return useQuery({
    queryKey: ['admin', 'dispatch', 'tat-invoices', companyId],
    queryFn: async () => {
      const res = await api.get<TatInvoice[]>('/admin/dispatch/tat-invoices', {
        headers: { 'X-Company-Id': companyId },
      });
      return res.data;
    },
    enabled: Boolean(companyId),
    retry: false,
  });
}

interface SyncTatInvoicesInput {
  companyId: string;
  /** Fecha final (YYYY-MM-DD). El backend trae esa fecha y los 5 días previos. */
  date: string;
}

/** Sincroniza desde Siesa las facturas TAT de la fecha y los 5 días anteriores. */
export function useSyncTatInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, date }: SyncTatInvoicesInput) => {
      const res = await api.post<TatInvoice[]>(
        '/admin/dispatch/tat-invoices/sync',
        null,
        { params: { date }, headers: { 'X-Company-Id': companyId } },
      );
      return res.data;
    },
    // El sync reemplaza la tabla por el rango elegido: se refleja de inmediato
    // en la caché para no lanzar una segunda consulta.
    onSuccess: (data, vars) => {
      qc.setQueryData(
        ['admin', 'dispatch', 'tat-invoices', vars.companyId],
        data,
      );
    },
  });
}

interface SaveTatSelectionInput {
  companyId: string;
  items: { invoiceNumber: string; selected: boolean }[];
}

/**
 * Guarda la selección de facturas a despachar en Drivin. Se usa como
 * autoguardado por cada marca/desmarca: NO invalida la query para no resetear
 * la selección local en curso (la BD queda como respaldo ante un refresco).
 */
export function useSaveTatDispatchSelection() {
  return useMutation({
    mutationFn: async ({ companyId, items }: SaveTatSelectionInput) => {
      const res = await api.put<string[]>(
        '/admin/dispatch/tat-invoices/selection',
        { items },
        { headers: { 'X-Company-Id': companyId } },
      );
      return res.data;
    },
  });
}

/**
 * Publica el borrador: las facturas marcadas pasan a viajar por la API pública.
 * Es el botón "Guardar" del módulo.
 */
export function usePublishTatDispatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId }: { companyId: string }) => {
      const res = await api.post<{ published: number }>(
        '/admin/dispatch/tat-invoices/publish',
        null,
        { headers: { 'X-Company-Id': companyId } },
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ['admin', 'dispatch', 'tat-invoices', vars.companyId],
      });
    },
  });
}

/* ---- Proyección de ventas por compañía ---- */

export function useProjection(
  companyId: string,
  month: number,
  year: number,
) {
  return useQuery({
    queryKey: ['admin', 'projection', companyId, month, year],
    queryFn: async () => {
      const res = await api.get<ProjectionConfig>('/admin/budgets/projection', {
        params: { month, year },
        headers: { 'X-Company-Id': companyId },
      });
      return res.data;
    },
    enabled: Boolean(companyId),
  });
}

interface SaveProjectionInput {
  companyId: string;
  month: number;
  year: number;
  mode: ProjectionConfig['mode'];
  revenue: number;
  kilos: number;
  workingDays: string[];
}

export function useSaveProjection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      companyId,
      month,
      year,
      mode,
      revenue,
      kilos,
      workingDays,
    }: SaveProjectionInput) => {
      const res = await api.put<ProjectionConfig>(
        '/admin/budgets/projection',
        { month, year, mode, revenue, kilos, workingDays },
        { headers: { 'X-Company-Id': companyId } },
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ['admin', 'projection', vars.companyId, vars.month, vars.year],
      });
    },
  });
}

export function useSyncCompanyProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (companyId: string) => {
      const res = await api.post<{ synced: number }>(
        '/products/sync',
        {},
        { headers: { 'X-Company-Id': companyId } },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });
}

export function useSyncCompanyCustomers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (companyId: string) => {
      const res = await api.post<{ synced: number }>(
        '/customers/sync',
        {},
        { headers: { 'X-Company-Id': companyId } },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });
}

/* ---- Inventario por Excel ---- */

export interface ImportInventoryResult {
  total: number;
  created: number;
  updated: number;
  removed: number;
}

export interface CreateManualProductInput {
  companyId: string;
  sku: string;
  name: string;
  stock: number;
  type?: 'corte' | 'subproducto';
}

export interface UpdateManualProductInput {
  companyId: string;
  id: string;
  name: string;
  stock: number;
  type?: 'corte' | 'subproducto';
}

/** Carga diaria del inventario desde Excel (reemplaza el inventario). */
export function useImportInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      file: File;
      type?: 'corte' | 'subproducto';
      species?: 'RES' | 'CERDO';
    }) => {
      const form = new FormData();
      form.append('file', input.file);
      const res = await api.post<ImportInventoryResult>(
        '/products/import',
        form,
        {
          headers: { 'X-Company-Id': input.companyId },
          params: {
            ...(input.type ? { type: input.type } : {}),
            ...(input.species ? { species: input.species } : {}),
          },
        },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });
}

/** Crea un producto manualmente en inventario (sin reemplazar todo el Excel). */
export function useCreateManualProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateManualProductInput) => {
      const res = await api.post<Product>(
        '/products/manual',
        {
          sku: input.sku,
          name: input.name,
          stock: input.stock,
        },
        {
          headers: { 'X-Company-Id': input.companyId },
          params: input.type ? { type: input.type } : undefined,
        },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });
}

/** Edita un producto individualmente (nombre/stock). */
export function useUpdateManualProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateManualProductInput) => {
      const res = await api.patch<Product>(
        `/products/${input.id}/manual`,
        {
          name: input.name,
          stock: input.stock,
        },
        {
          headers: { 'X-Company-Id': input.companyId },
          params: input.type ? { type: input.type } : undefined,
        },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });
}

/** Edita únicamente el stock de un producto. */
export function useUpdateStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      id: string;
      stock: number;
    }) => {
      const res = await api.patch<Product>(
        `/products/${input.id}/stock`,
        { stock: input.stock },
        { headers: { 'X-Company-Id': input.companyId } },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
  });
}

/* ---- Reportes (PDF) ---- */

/**
 * Consulta los datos del resumen de inventario por día (sin descargar) para
 * mostrarlos en pantalla. La consulta solo se ejecuta cuando `enabled` es true.
 */
export function useInventoryReport(
  companyId: string,
  date: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['admin', 'reports', 'inventory', companyId, date],
    enabled,
    queryFn: async () => {
      const res = await api.get<InventoryReportData>(
        '/admin/reports/inventory/data',
        { params: { companyId, ...(date ? { date } : {}) } },
      );
      return res.data;
    },
  });
}

/**
 * Consulta los datos de productos vendidos por compañía (sin descargar) para
 * mostrarlos en pantalla. La consulta solo se ejecuta cuando `enabled` es true.
 */
export function useProductSalesReport(
  from: string | undefined,
  to: string | undefined,
  companyId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['admin', 'reports', 'product-sales', from, to, companyId],
    enabled,
    queryFn: async () => {
      const res = await api.get<ProductSalesReportData>(
        '/admin/reports/product-sales/data',
        {
          params: {
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
            ...(companyId ? { companyId } : {}),
          },
        },
      );
      return res.data;
    },
  });
}

/**
 * Descarga el reporte PDF de resumen de inventario por día de una compañía.
 * Si no se indica fecha, el backend usa el día actual (hora de Colombia).
 */
export async function downloadInventoryReport(
  companyId: string,
  date?: string,
) {
  const res = await api.get('/admin/reports/inventory', {
    params: { companyId, ...(date ? { date } : {}) },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `inventario-${companyId}-${date || 'hoy'}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** Descarga el resumen de inventario por día en Excel (.xlsx). */
export async function downloadInventoryExcel(
  companyId: string,
  date?: string,
) {
  const res = await api.get('/admin/reports/inventory/excel', {
    params: { companyId, ...(date ? { date } : {}) },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `inventario-${companyId}-${date || 'hoy'}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Descarga el PDF de productos vendidos en un rango de fechas (por defecto el
 * día de hoy). Si se indica `companyId`, el reporte incluye solo esa compañía;
 * de lo contrario se generan todas las compañías (cada una en su sección) con
 * sus productos, la referencia, la cantidad vendida y los ingresos.
 */
export async function downloadProductSalesReport(
  from?: string,
  to?: string,
  companyId?: string,
) {
  const res = await api.get('/admin/reports/product-sales', {
    params: {
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(companyId ? { companyId } : {}),
    },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  const range = from && to && from !== to ? `${from}_a_${to}` : from || 'hoy';
  const companyPart = companyId ? `${companyId}-` : '';
  link.download = `productos-vendidos-${companyPart}${range}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** Descarga los productos vendidos por compañía en Excel (.xlsx). */
export async function downloadProductSalesExcel(
  from?: string,
  to?: string,
  companyId?: string,
) {
  const res = await api.get('/admin/reports/product-sales/excel', {
    params: {
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(companyId ? { companyId } : {}),
    },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  const range = from && to && from !== to ? `${from}_a_${to}` : from || 'hoy';
  const companyPart = companyId ? `${companyId}-` : '';
  link.download = `productos-vendidos-${companyPart}${range}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Consulta el resumen de ventas de una compañía agrupado por cliente o por
 * producto en un rango de fechas (sin descargar), para mostrarlo en pantalla.
 * La consulta solo se ejecuta cuando `enabled` es true.
 */
export function useSalesSummaryReport(
  companyId: string | undefined,
  groupBy: 'customer' | 'product',
  from: string | undefined,
  to: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['admin', 'reports', 'sales-summary', companyId, groupBy, from, to],
    enabled,
    queryFn: async () => {
      const res = await api.get<SalesSummaryReportData>(
        '/admin/reports/sales-summary/data',
        {
          params: {
            ...(companyId ? { companyId } : {}),
            groupBy,
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          },
        },
      );
      return res.data;
    },
  });
}

/** Descarga el PDF del resumen de ventas por cliente o por producto. */
export async function downloadSalesSummaryReport(
  companyId: string,
  groupBy: 'customer' | 'product',
  from?: string,
  to?: string,
) {
  const res = await api.get('/admin/reports/sales-summary/pdf', {
    params: {
      companyId,
      groupBy,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  const range = from && to && from !== to ? `${from}_a_${to}` : from || 'hoy';
  link.download = `ventas-${groupBy}-${companyId}-${range}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** Descarga el resumen de ventas por cliente o producto en Excel (.xlsx). */
export async function downloadSalesSummaryExcel(
  companyId: string,
  groupBy: 'customer' | 'product',
  from?: string,
  to?: string,
) {
  const res = await api.get('/admin/reports/sales-summary/excel', {
    params: {
      companyId,
      groupBy,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  const range = from && to && from !== to ? `${from}_a_${to}` : from || 'hoy';
  link.download = `ventas-${groupBy}-${companyId}-${range}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Consulta el ranking de vendedores de una compañía en un rango de fechas (sin
 * descargar), para mostrarlo en pantalla. Solo se ejecuta cuando `enabled` es
 * true.
 */
export function useSellerRankingReport(
  companyId: string | undefined,
  from: string | undefined,
  to: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['admin', 'reports', 'seller-ranking', companyId, from, to],
    enabled,
    queryFn: async () => {
      const res = await api.get<SellerRankingReportData>(
        '/admin/reports/seller-ranking/data',
        {
          params: {
            ...(companyId ? { companyId } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          },
        },
      );
      return res.data;
    },
  });
}

/** Descarga el PDF del ranking de vendedores. */
export async function downloadSellerRankingReport(
  companyId: string,
  from?: string,
  to?: string,
) {
  const res = await api.get('/admin/reports/seller-ranking/pdf', {
    params: {
      companyId,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  const range = from && to && from !== to ? `${from}_a_${to}` : from || 'hoy';
  link.download = `ranking-vendedores-${companyId}-${range}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** Descarga el ranking de vendedores en Excel (.xlsx). */
export async function downloadSellerRankingExcel(
  companyId: string,
  from?: string,
  to?: string,
) {
  const res = await api.get('/admin/reports/seller-ranking/excel', {
    params: {
      companyId,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  const range = from && to && from !== to ? `${from}_a_${to}` : from || 'hoy';
  link.download = `ranking-vendedores-${companyId}-${range}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/* ---- Ventas por vendedor (mensual) ---- */

/** Consulta el reporte de ventas por vendedor de un mes. */
export function useSellerSalesReport(
  companyId: string | undefined,
  month: number | undefined,
  year: number | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['admin', 'reports', 'seller-sales', companyId, month, year],
    enabled,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await api.get<SellerSalesReportData>(
        '/admin/reports/seller-sales/data',
        {
          params: {
            ...(companyId ? { companyId } : {}),
            ...(month ? { month } : {}),
            ...(year ? { year } : {}),
          },
        },
      );
      return res.data;
    },
  });
}

/** Descarga el PDF del reporte de ventas por vendedor. */
export async function downloadSellerSalesReport(
  companyId: string,
  month: number,
  year: number,
) {
  const res = await api.get('/admin/reports/seller-sales/pdf', {
    params: { companyId, month, year },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ventas-vendedor-${companyId}-${year}-${String(month).padStart(2, '0')}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** Descarga el reporte de ventas por vendedor en Excel (.xlsx). */
export async function downloadSellerSalesExcel(
  companyId: string,
  month: number,
  year: number,
) {
  const res = await api.get('/admin/reports/seller-sales/excel', {
    params: { companyId, month, year },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ventas-vendedor-${companyId}-${year}-${String(month).padStart(2, '0')}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/* ---- Ventas acumuladas por vendedor por producto (ERP, mensual) ---- */

/** Consulta el reporte de ventas acumuladas por vendedor por producto (YYYYMM). */
export function useVendorProductSalesReport(
  periodo: string | undefined,
  fecha: string | undefined,
  enabled: boolean,
  companyId?: string,
) {
  return useQuery({
    queryKey: ['admin', 'reports', 'vendor-product-sales', periodo, fecha, companyId],
    enabled: enabled && !!periodo,
    queryFn: async () => {
      const res = await api.get<VendorProductSalesReportData>(
        '/admin/reports/vendor-product-sales/data',
        { params: { periodo, ...(fecha ? { fecha } : {}), ...(companyId ? { companyId } : {}) } },
      );
      return res.data;
    },
  });
}

/** Pedidos (de la BD) por vendedor, para comparar contra la venta del ERP. */
export function useOrdersBySellerReport(
  periodo: string | undefined,
  fecha: string | undefined,
  enabled: boolean,
  companyId?: string,
) {
  return useQuery({
    queryKey: ['admin', 'reports', 'orders-by-seller', periodo, fecha, companyId],
    enabled: enabled && !!periodo,
    queryFn: async () => {
      const res = await api.get<OrdersBySellerReportData>(
        '/admin/reports/orders-by-seller/data',
        { params: { periodo, ...(fecha ? { fecha } : {}), ...(companyId ? { companyId } : {}) } },
      );
      return res.data;
    },
  });
}

/** Descarga el PDF del reporte de ventas acumuladas por vendedor por producto. */
export async function downloadVendorProductSalesReport(
  periodo: string,
  fecha?: string,
) {
  const res = await api.get('/admin/reports/vendor-product-sales/pdf', {
    params: { periodo, ...(fecha ? { fecha } : {}) },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ventas-vendedor-producto-${fecha || periodo}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** Descarga el Excel del reporte de ventas acumuladas por vendedor por producto. */
export async function downloadVendorProductSalesExcel(
  periodo: string,
  fecha?: string,
) {
  const res = await api.get('/admin/reports/vendor-product-sales/excel', {
    params: { periodo, ...(fecha ? { fecha } : {}) },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ventas-vendedor-producto-${fecha || periodo}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Consulta el reporte vendedor–producto (cuánto vendió cada vendedor de cada
 * producto) en un rango de fechas, con filtros opcionales de vendedor y
 * búsqueda de producto. Solo se ejecuta cuando `enabled` es true.
 */
export function useSellerProductReport(
  companyId: string | undefined,
  from: string | undefined,
  to: string | undefined,
  sellerId: string | undefined,
  sku: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [
      'admin',
      'reports',
      'seller-product',
      companyId,
      from,
      to,
      sellerId,
      sku,
    ],
    enabled,
    queryFn: async () => {
      const res = await api.get<SellerProductReportData>(
        '/admin/reports/seller-product/data',
        {
          params: {
            ...(companyId ? { companyId } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
            ...(sellerId ? { sellerId } : {}),
            ...(sku ? { sku } : {}),
          },
        },
      );
      return res.data;
    },
  });
}

/** Descarga el PDF del reporte vendedor–producto. */
export async function downloadSellerProductReport(
  companyId: string,
  from?: string,
  to?: string,
  sellerId?: string,
  sku?: string,
) {
  const res = await api.get('/admin/reports/seller-product/pdf', {
    params: {
      companyId,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(sellerId ? { sellerId } : {}),
      ...(sku ? { sku } : {}),
    },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  const range = from && to && from !== to ? `${from}_a_${to}` : from || 'hoy';
  link.download = `ventas-vendedor-producto-${companyId}-${range}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** Descarga el reporte vendedor–producto en Excel (.xlsx). */
export async function downloadSellerProductExcel(
  companyId: string,
  from?: string,
  to?: string,
  sellerId?: string,
  sku?: string,
) {
  const res = await api.get('/admin/reports/seller-product/excel', {
    params: {
      companyId,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(sellerId ? { sellerId } : {}),
      ...(sku ? { sku } : {}),
    },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  const range = from && to && from !== to ? `${from}_a_${to}` : from || 'hoy';
  link.download = `ventas-vendedor-producto-${companyId}-${range}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** Reporte mejor-vendedor-por-producto: por producto, quién más lo vendió. */
export function useProductSellerReport(
  companyId: string | undefined,
  from: string | undefined,
  to: string | undefined,
  sku: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['admin', 'reports', 'product-seller', companyId, from, to, sku],
    enabled,
    queryFn: async () => {
      const res = await api.get<ProductSellerReportData>(
        '/admin/reports/product-seller/data',
        {
          params: {
            ...(companyId ? { companyId } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
            ...(sku ? { sku } : {}),
          },
        },
      );
      return res.data;
    },
  });
}

/** Descarga el PDF del reporte mejor-vendedor-por-producto. */
export async function downloadProductSellerReport(
  companyId: string,
  from?: string,
  to?: string,
  sku?: string,
) {
  const res = await api.get('/admin/reports/product-seller/pdf', {
    params: {
      companyId,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(sku ? { sku } : {}),
    },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  const range = from && to && from !== to ? `${from}_a_${to}` : from || 'hoy';
  link.download = `mejor-vendedor-producto-${companyId}-${range}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** Descarga el reporte mejor-vendedor-por-producto en Excel (.xlsx). */
export async function downloadProductSellerExcel(
  companyId: string,
  from?: string,
  to?: string,
  sku?: string,
) {
  const res = await api.get('/admin/reports/product-seller/excel', {
    params: {
      companyId,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(sku ? { sku } : {}),
    },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  const range = from && to && from !== to ? `${from}_a_${to}` : from || 'hoy';
  link.download = `mejor-vendedor-producto-${companyId}-${range}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Descarga el PDF con toda una lista de precios. El documento no muestra el
 * nombre de la lista (solo dice "Lista de precios").
 */
export async function downloadPriceListPdf(
  companyId: string,
  listCode: string,
) {
  const res = await api.get(
    `/price-lists/${encodeURIComponent(listCode)}/pdf`,
    {
      headers: { 'X-Company-Id': companyId },
      responseType: 'blob',
    },
  );
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'lista-de-precios.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** Descarga la plantilla de inventario (.xlsx). */
export async function downloadInventoryTemplate() {
  const res = await api.get('/products/template', {
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla_inventario.xlsx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/* ---- Administración de pedidos (seguimiento completo) ---- */

export interface AdminOrderItem {
  sku: string;
  productName: string;
  unitOfMeasure?: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  lineTotal: number;
}

export interface AdminOrderDetail {
  id: string;
  orderNumber: string;
  /** Segundo consecutivo (subproductos divididos: bovino/porcino). */
  secondNumber?: string | null;
  companyId: string;
  status: string;
  type: string;
  sellerName: string;
  sellerDocument?: string;
  sellerCode?: string;
  createdAt: string;
  deliveryDate?: string;
  customerName: string;
  customerCode: string;
  customerCity?: string;
  subtotal: number;
  taxes: number;
  total: number;
  notes?: string;
  logisticsNote?: string;
  deliveryType?: string;
  deliverySchedule?: string;
  carteraBalance?: number | null;
  approvalDeadline?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  disapprovalReason?: string | null;
  cancelReason?: string | null;
  siesaEstado?: string | null;
  siesaStatePrevious?: string | null;
  syncedAt?: string | null;
  siesaDocumentId?: string | null;
  syncError?: string | null;
  downloadCount: number;
  downloadedAt?: string | null;
  downloadedBy?: string | null;
  items: AdminOrderItem[];
  /** Consecutivo del pedido al que este se asoció (null si no aplica). */
  linkedOrderNumber?: string | null;
  linkedSecondNumber?: string | null;
}

export interface AdminOrdersFilters {
  from?: string;
  to?: string;
  status?: string;
  search?: string;
  type?: string;
}

/** Listado administrativo de pedidos de una compañía con filtros. */
export function useAdminOrders(companyId: string, filters: AdminOrdersFilters) {
  return useQuery({
    queryKey: ['admin', 'orders', companyId, filters],
    queryFn: async () => {
      const res = await api.get<AdminOrderDetail[]>('/admin/orders', {
        params: {
          companyId,
          ...(filters.from ? { from: filters.from } : {}),
          ...(filters.to ? { to: filters.to } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.search ? { search: filters.search } : {}),
          ...(filters.type ? { type: filters.type } : {}),
        },
      });
      return res.data;
    },
    enabled: Boolean(companyId),
    // Refresca la trazabilidad automáticamente: el backend sincroniza los
    // estados de Siesa cada pocos segundos, así el admin ve los cambios sin
    // tener que pulsar "Actualizar".
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

/* ---- Descargar pedidos (descarga masiva en PDF) ---- */

export interface DownloadableOrder {
  id: string;
  orderNumber: string;
  /** Segundo consecutivo (subproductos divididos: bovino/porcino). */
  secondNumber?: string | null;
  customerName: string;
  customerCode: string;
  sellerName: string;
  total: number;
  siesaEstado?: string;
  createdAt: string;
  downloadedAt?: string | null;
  picked: boolean;
  pickedAt?: string | null;
  pickedBy?: string | null;
  /** Consecutivo del pedido al que este se asoció (null si no aplica). */
  linkedOrderNumber?: string | null;
  linkedSecondNumber?: string | null;
}

/** Pedidos subidos a Siesa (no rebotados ni anulados) de una compañía. */
export function useDownloadableOrders(
  companyId: string,
  type: 'corte' | 'subproducto' = 'corte',
  category?: 'CERDO' | 'RES',
) {
  return useQuery({
    queryKey: ['admin', 'downloadable-orders', companyId, type, category],
    queryFn: async () => {
      const res = await api.get<DownloadableOrder[]>('/admin/orders/downloadable', {
        params: { companyId, type, ...(category ? { category } : {}) },
      });
      return res.data;
    },
  });
}

/**
 * Genera un único PDF con los pedidos seleccionados, los marca como
 * descargados y refresca la lista.
 */
export function useDownloadOrders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      orderIds: string[];
      type: 'corte' | 'subproducto';
      category?: 'CERDO' | 'RES';
    }) => {
      const res = await api.post('/admin/orders/download', input, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(res.data as Blob);
      const link = document.createElement('a');
      link.href = url;
      const suffix = input.category
        ? `${input.type}-${input.category.toLowerCase()}`
        : input.type;
      link.download = `pedidos-${suffix}-${input.companyId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({
        queryKey: [
          'admin',
          'downloadable-orders',
          input.companyId,
          input.type,
          input.category,
        ],
      });
    },
  });
}

/**
 * Marca/desmarca un pedido como alistado. Se guarda automáticamente y la
 * lista se actualiza de forma optimista para que el chulito reaccione al
 * instante.
 */
export function useSetOrderPicked() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      orderId: string;
      picked: boolean;
      type: 'corte' | 'subproducto';
      category?: 'CERDO' | 'RES';
    }) => {
      const res = await api.patch(
        `/admin/orders/${input.orderId}/picked`,
        { picked: input.picked },
        { params: { companyId: input.companyId } },
      );
      return res.data;
    },
    onMutate: async (input) => {
      const key = [
        'admin',
        'downloadable-orders',
        input.companyId,
        input.type,
        input.category,
      ];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<DownloadableOrder[]>(key);
      qc.setQueryData<DownloadableOrder[]>(key, (old) =>
        (old ?? []).map((o) =>
          o.id === input.orderId ? { ...o, picked: input.picked } : o,
        ),
      );
      return { prev, key };
    },
    onError: (_err, _input, context) => {
      if (context?.prev) {
        qc.setQueryData(context.key, context.prev);
      }
    },
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({
        queryKey: [
          'admin',
          'downloadable-orders',
          input.companyId,
          input.type,
          input.category,
        ],
      });
    },
  });
}

/**
 * Marca/desmarca varios pedidos como alistados de una sola vez (acción masiva
 * para todos los pedidos filtrados en la tabla de Descargar pedidos).
 */
export function useSetOrderPickedBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      companyId: string;
      orderIds: string[];
      picked: boolean;
      type: 'corte' | 'subproducto';
      category?: 'CERDO' | 'RES';
    }) => {
      const res = await api.patch<{ updated: number }>(
        '/admin/orders/picked-bulk',
        { orderIds: input.orderIds, picked: input.picked },
        { params: { companyId: input.companyId } },
      );
      return res.data;
    },
    onMutate: async (input) => {
      const key = [
        'admin',
        'downloadable-orders',
        input.companyId,
        input.type,
        input.category,
      ];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<DownloadableOrder[]>(key);
      const ids = new Set(input.orderIds);
      qc.setQueryData<DownloadableOrder[]>(key, (old) =>
        (old ?? []).map((o) =>
          ids.has(o.id) ? { ...o, picked: input.picked } : o,
        ),
      );
      return { prev, key };
    },
    onError: (_err, _input, context) => {
      if (context?.prev) {
        qc.setQueryData(context.key, context.prev);
      }
    },
    onSettled: (_data, _err, input) => {
      qc.invalidateQueries({
        queryKey: [
          'admin',
          'downloadable-orders',
          input.companyId,
          input.type,
          input.category,
        ],
      });
    },
  });
}

/* ---- Listas de precios ---- */

export interface PriceListSummary {
  listCode: string;
  listName: string;
  itemCount: number;
}

export interface PriceListItem {
  id: string;
  listCode: string;
  listName: string;
  reference: string;
  productName: string;
  unitOfMeasure?: string;
  price: number;
}

export interface SyncPriceListsResult {
  lists: number;
  created: number;
  updated: number;
  removed: number;
  total: number;
}

/** Listas de precios disponibles de una compañía. */
export function usePriceLists(companyId: string) {
  return useQuery({
    queryKey: ['admin', 'price-lists', companyId],
    queryFn: async () => {
      const res = await api.get<PriceListSummary[]>('/price-lists', {
        headers: { 'X-Company-Id': companyId },
      });
      return res.data;
    },
  });
}

/** Ítems (referencias y precios) de una lista. */
export function usePriceListItems(
  companyId: string,
  listCode: string | null,
  search: string,
) {
  return useQuery({
    queryKey: ['admin', 'price-list-items', companyId, listCode, search],
    enabled: Boolean(listCode),
    queryFn: async () => {
      const res = await api.get<PriceListItem[]>(
        `/price-lists/${listCode}/items`,
        {
          params: search ? { search } : undefined,
          headers: { 'X-Company-Id': companyId },
        },
      );
      return res.data;
    },
  });
}

/** Sincroniza las listas de precios desde Siesa (solo admin). */
export function useSyncPriceLists() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (companyId: string) => {
      const res = await api.post<SyncPriceListsResult>(
        '/price-lists/sync',
        {},
        { headers: { 'X-Company-Id': companyId } },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'price-lists'] });
      qc.invalidateQueries({ queryKey: ['admin', 'price-list-items'] });
    },
  });
}

/* ---- Clientes ---- */

export interface ClientRecord {
  id: string;
  code: string;
  name: string;
  branch: string;
  branchName?: string;
  priceList?: string;
  priceListName?: string;
  paymentTerm?: string;
  sellerCode?: string;
  sellerName?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  department?: string;
  phone?: string;
  email?: string;
}

export interface SyncClientsResult {
  created: number;
  updated: number;
  removed: number;
  total: number;
}

/** Clientes de una compañía, con búsqueda opcional. */
export function useClients(companyId: string, search: string) {
  return useQuery({
    queryKey: ['admin', 'clients', companyId, search],
    queryFn: async () => {
      const res = await api.get<ClientRecord[]>('/clients', {
        params: search ? { search } : undefined,
        headers: { 'X-Company-Id': companyId },
      });
      return res.data;
    },
  });
}

/** Sincroniza los clientes desde Siesa (solo admin). */
export function useSyncClients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (companyId: string) => {
      const res = await api.post<SyncClientsResult>(
        '/clients/sync',
        {},
        { headers: { 'X-Company-Id': companyId } },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'clients'] });
    },
  });
}

/** Cartera (documentos por cobrar) de un cliente, consultada en vivo. */
export function useClientPortfolio(
  companyId: string,
  nit: string | null,
) {
  return useQuery({
    queryKey: ['admin', 'portfolio', companyId, nit],
    enabled: !!nit,
    queryFn: async () => {
      const res = await api.get<ClientPortfolio>('/clients/portfolio', {
        params: { nit },
        headers: { 'X-Company-Id': companyId },
      });
      return res.data;
    },
  });
}

/* ---- Aprobación de pedidos en cartera ---- */

/** Pedidos retenidos pendientes de aprobación en cartera (todas las compañías). */
export function useCarteraOrders() {
  return useQuery({
    queryKey: ['cartera', 'orders'],
    queryFn: async () => {
      const res = await api.get<Order[]>('/cartera/orders');
      return res.data;
    },
    refetchInterval: 30_000,
  });
}

/** Aprueba un pedido retenido: pasa a "pendiente por envío" a Siesa. */
export function useApproveOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<Order>(`/cartera/orders/${id}/approve`, {});
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cartera', 'orders'] }),
  });
}

/** Desaprueba un pedido retenido: se libera el inventario reservado. */
export function useDisapproveOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason?: string }) => {
      const res = await api.post<Order>(
        `/cartera/orders/${input.id}/disapprove`,
        { reason: input.reason },
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cartera', 'orders'] }),
  });
}

/* ---- Controlador de subproductos ---- */

/** Pedidos de subproductos pendientes de revisión/aprobación del controlador. */
export function useControlSubproductoOrders() {
  return useQuery({
    queryKey: ['control-subproductos', 'orders'],
    queryFn: async () => {
      const res = await api.get<Order[]>(
        '/admin/controlador-subproductos/orders',
      );
      return res.data;
    },
    refetchInterval: 30_000,
  });
}

/** Catálogo de subproductos (con categoría CERDO/RES) de la compañía del pedido. */
export function useSubproductoCatalog(
  companyId: string | undefined,
  priceList: string | undefined | null,
  search: string,
) {
  return useQuery({
    queryKey: ['control-subproductos', 'catalog', companyId, priceList, search],
    enabled: Boolean(companyId && priceList),
    queryFn: async () => {
      const res = await api.get<SellableProduct[]>('/products', {
        params: {
          priceList,
          type: 'subproducto',
          ...(search ? { search } : {}),
        },
        headers: companyId ? { 'X-Company-Id': companyId } : undefined,
      });
      return res.data;
    },
  });
}

/** Edita las líneas de un pedido de subproductos pendiente de control. */
export function useEditControlSubproducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      items: { sku: string; quantity: number; discountPct?: number }[];
      notes?: string;
    }) => {
      const res = await api.patch<Order>(
        `/admin/controlador-subproductos/orders/${input.id}`,
        { items: input.items, notes: input.notes },
      );
      return res.data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['control-subproductos', 'orders'] }),
  });
}

/** Aprueba un pedido de subproductos: lo sube a Siesa dividido por categoría. */
export function useApproveControlSubproducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<Order>(
        `/admin/controlador-subproductos/orders/${id}/approve`,
        {},
      );
      return res.data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['control-subproductos', 'orders'] }),
  });
}

/** Rechaza un pedido de subproductos: se libera el inventario reservado. */
export function useRejectControlSubproducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason?: string }) => {
      const res = await api.post<Order>(
        `/admin/controlador-subproductos/orders/${input.id}/reject`,
        { reason: input.reason },
      );
      return res.data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['control-subproductos', 'orders'] }),
  });
}

/* ---- Horario de toma de pedidos (configurable) ---- */

export interface OrderSchedule {
  enabled: boolean;  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
}

/** Ventana horaria actual para crear pedidos (cualquier usuario autenticado). */
export function useOrderSchedule() {
  return useQuery({
    queryKey: ['order-schedule'],
    queryFn: async () => {
      const res = await api.get<OrderSchedule>('/settings/order-schedule');
      return res.data;
    },
  });
}

/** Actualiza la ventana horaria para crear pedidos (admin o permiso). */
export function useUpdateOrderSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: OrderSchedule) => {
      const res = await api.patch<OrderSchedule>(
        '/admin/order-schedule',
        input,
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order-schedule'] }),
  });
}
