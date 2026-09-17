import {
  useQuery,
  useQueries,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCompany } from '@/company/useCompany';
import type {
  CanalOrder,
  Client,
  ClientPortfolio,
  Customer,
  DeliverySchedule,
  DeliveryType,
  FeaturedProduct,
  Order,
  Product,
  Quote,
  SellableProduct,
  SellerCommercialDashboard,
  SiesaState,
} from '@/types';

export function useProducts(search: string) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['products', company?.id, search],
    queryFn: async () => {
      const res = await api.get<Product[]>('/products', {
        params: search ? { search } : undefined,
      });
      return res.data;
    },
  });
}

/**
 * Tablero de gestión comercial del vendedor autenticado para un mes/año y,
 * opcionalmente, un día concreto (day > 0). La compañía se toma del contexto.
 * Los administradores pueden consultar el tablero de otro vendedor pasando
 * `sellerId`.
 */
export function useSellerDashboard(
  month: number,
  year: number,
  day = 0,
  sellerId?: string,
  from?: string,
  to?: string,
  national = false,
) {
  const { company } = useCompany();
  return useQuery({
    queryKey: [
      'dashboard',
      national ? 'national-business' : 'commercial',
      company?.id,
      month,
      year,
      day,
      sellerId,
      from,
      to,
    ],
    queryFn: async () => {
      const res = await api.get<SellerCommercialDashboard>(
        national ? '/dashboard/national-business' : '/dashboard/commercial',
        {
          params: {
            // Un rango de fechas explícito prima sobre mes/día.
            ...(from && to
              ? { from, to }
              : day > 0
                ? { month, year, day }
                : { month, year }),
            ...(sellerId && !national ? { sellerId } : {}),
          },
        },
      );
      return res.data;
    },
  });
}

/**
 * Catálogo de venta para un cliente: proviene de su lista de precios (cada
 * referencia trae precio y unidad de medida) cruzado con el stock del
 * inventario. Solo se ejecuta si hay lista.
 */
export function useProductsForList(
  search: string,
  priceList?: string | null,
  type?: string,
) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['products', 'by-list', company?.id, priceList, search, type],
    enabled: Boolean(priceList),
    queryFn: async () => {
      const res = await api.get<SellableProduct[]>('/products', {
        params: {
          priceList,
          ...(type ? { type } : {}),
          ...(search ? { search } : {}),
        },
      });
      return res.data;
    },
  });
}

/** Vendedor seleccionable (para la toma de subproductos). */
export interface SellerOption {
  id: string;
  name: string;
  documentId: string;
  siesaSellerCode: string;
  role: string;
}

/** Productos estrella/favoritos de la compañía activa (vendedor y admin). */
export function useFeaturedProducts() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['featured-products', company?.id],
    queryFn: async () => {
      const res = await api.get<FeaturedProduct[]>('/featured-products');
      return res.data;
    },
  });
}

/** Marca un producto como estrella (solo admin). */
export function useAddFeaturedProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sku: string; name: string }) => {
      const res = await api.post<FeaturedProduct>('/featured-products', input);
      return res.data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['featured-products'] }),
  });
}

/** Quita la marca de estrella de un producto (solo admin). */
export function useRemoveFeaturedProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sku: string) => {
      await api.delete('/featured-products', { params: { sku } });
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['featured-products'] }),
  });
}

/** Vendedores de la compañía con código de vendedor en Siesa. */
export function useSellers() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['sellers', company?.id],
    queryFn: async () => {
      const res = await api.get<SellerOption[]>('/orders/sellers');
      return res.data;
    },
  });
}

/**
 * ¿El cliente ya tiene un pedido creado hoy? El monto mínimo de pedido es por
 * día por cliente, así que el segundo pedido del día no lo exige.
 */
export function useCustomerHasOrderToday(customerId?: string) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['orders', 'customer-today', company?.id, customerId],
    enabled: Boolean(customerId),
    queryFn: async () => {
      const res = await api.get<{ hasOrder: boolean }>(
        '/orders/customer-today',
        { params: { customerId } },
      );
      return res.data.hasOrder;
    },
  });
}

/**
 * Productos con existencias (stock > 0) de la compañía, sin importar lista de
 * precios: la disponibilidad real para la venta del día.
 */
export function useProductsInStock(search: string) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['products', 'in-stock', company?.id, search],
    queryFn: async () => {
      const res = await api.get<Product[]>('/products/stock', {
        params: search ? { search } : undefined,
      });
      return res.data;
    },
  });
}

/** Descarga el PDF de productos disponibles hoy (en stock) para clientes. */
export async function downloadStockPdf(): Promise<void> {
  const res = await api.get('/products/stock/pdf', { responseType: 'blob' });
  const today = new Date().toISOString().slice(0, 10);
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `disponibles-${today}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function useCustomers(search: string) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['customers', company?.id, search],
    queryFn: async () => {
      const res = await api.get<Customer[]>('/customers', {
        params: search ? { search } : undefined,
      });
      return res.data;
    },
  });
}

/** Clientes (módulo nuevo `clientes-por-cia`) para la toma de pedidos. */
export function useClients(search: string, sellerCode?: string) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['clients', company?.id, search, sellerCode ?? ''],
    queryFn: async () => {
      const res = await api.get<Client[]>('/clients', {
        params: {
          ...(search ? { search } : {}),
          ...(sellerCode ? { sellerCode } : {}),
        },
      });
      return res.data;
    },
  });
}

/**
 * Cartera (documentos por cobrar) de un cliente del vendedor, consultada en
 * vivo a Siesa. La compañía activa se inyecta automáticamente en la petición.
 */
export function useClientPortfolio(nit: string | null) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['portfolio', company?.id, nit],
    enabled: !!nit,
    queryFn: async () => {
      const res = await api.get<ClientPortfolio>('/clients/portfolio', {
        params: { nit },
      });
      return res.data;
    },
  });
}

/**
 * Cartera de varios clientes a la vez (una consulta por NIT, en paralelo).
 * Devuelve un mapa `nit -> saldo total` y el estado de carga global, útil para
 * ordenar a los clientes por deuda.
 */
export function useClientPortfolios(nits: string[]) {
  const { company } = useCompany();
  const results = useQueries({
    queries: nits.map((nit) => ({
      queryKey: ['portfolio', company?.id, nit],
      enabled: !!nit,
      queryFn: async () => {
        const res = await api.get<ClientPortfolio>('/clients/portfolio', {
          params: { nit },
        });
        return res.data;
      },
    })),
  });

  const balances: Record<string, number> = {};
  results.forEach((res, i) => {
    if (res.data) balances[nits[i]] = res.data.totalBalance;
  });
  const isLoading = results.some((res) => res.isLoading);

  const portfolios: Record<string, ClientPortfolio> = {};
  results.forEach((res, i) => {
    if (res.data) portfolios[nits[i]] = res.data;
  });

  return { balances, portfolios, isLoading };
}

export function useOrders(filters?: {
  from?: string;
  to?: string;
  customerId?: string;
}) {
  const { company } = useCompany();
  const from = filters?.from;
  const to = filters?.to;
  const customerId = filters?.customerId;
  return useQuery({
    queryKey: ['orders', company?.id, from ?? '', to ?? '', customerId ?? ''],
    queryFn: async () => {
      const res = await api.get<Order[]>('/orders', {
        params: {
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(customerId ? { customerId } : {}),
        },
      });
      return res.data;
    },
  });
}

/**
 * Estado real en Siesa de los pedidos del vendedor. Devuelve un mapa
 * `orderNumber -> { estado, facturado, despachado }` para trazabilidad.
 */
export function useSiesaStates() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['siesa-states', company?.id],
    queryFn: async () => {
      const res = await api.get<Record<string, SiesaState>>(
        '/orders/siesa-states',
      );
      return res.data;
    },
    // Refresco casi en vivo. El backend cachea la respuesta del ERP (TTL ~5s)
    // y deduplica las llamadas, así que este sondeo no golpea el ERP de más.
    refetchInterval: 5_000,
    // Solo sondea con la pestaña activa (no consume recursos en segundo plano).
    refetchIntervalInBackground: false,
    staleTime: 4_000,
  });
}

interface CreateOrderInput {
  customerId: string;
  notes?: string;
  logisticsNote?: string;
  deliveryType?: DeliveryType;
  deliverySchedule?: string;
  deliveryScheduleData?: DeliverySchedule;
  deliveryDate: string;
  items: { sku: string; quantity: number; discountPct: number }[];
  /** Tipo de pedido: 'corte' (por defecto) o 'subproducto'. */
  orderType?: 'corte' | 'subproducto';
  /** Vendedor al que se asocia el pedido (solo subproductos). */
  sellerId?: string;
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      const res = await api.post<Order>('/orders', input);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}

/* ---- Pedidos de canales (recepción manual, no sube al ERP) ---- */

export function useCanalOrders(from?: string, to?: string) {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['canal-orders', company?.id, from ?? '', to ?? ''],
    queryFn: async () => {
      const res = await api.get<CanalOrder[]>('/canal-orders', {
        params: from && to ? { from, to } : undefined,
      });
      return res.data;
    },
  });
}

export interface CreateCanalOrderInput {
  dispatchDate: string;
  clientCode: string;
  clientName: string;
  clientAddress?: string;
  clientCity?: string;
  clientBranch?: string;
  clientPaymentTerm?: string;
  items: {
    itemRef: string;
    itemName: string;
    especie: string;
    quantity: number;
    approxWeightKg?: number;
    estimatedKg?: number;
    specifications?: string;
    price: number;
    freight?: number;
  }[];
}

export function useCreateCanalOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCanalOrderInput) => {
      const res = await api.post<CanalOrder>('/canal-orders', input);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canal-orders'] }),
  });
}

/* ---- Control de canales (Zulma) ---- */

export function useCanalControlOrders() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['canal-control', company?.id],
    queryFn: async () => {
      const res = await api.get<CanalOrder[]>('/admin/canal-orders/control');
      return res.data;
    },
  });
}

export interface UpdateCanalOrderInput {
  id: string;
  dispatchDate?: string;
  clientCode?: string;
  clientName?: string;
  clientAddress?: string;
  clientCity?: string;
  clientBranch?: string;
  clientPaymentTerm?: string;
  controlNote?: string;
  items?: CreateCanalOrderInput['items'];
}

export function useUpdateCanalOrderByControl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: UpdateCanalOrderInput) => {
      const res = await api.patch<CanalOrder>(
        `/admin/canal-orders/control/${id}`,
        body,
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canal-control'] }),
  });
}

export function useApproveCanalOrderByControl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<CanalOrder>(
        `/admin/canal-orders/control/${id}/approve`,
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['canal-control'] });
      qc.invalidateQueries({ queryKey: ['canal-cartera'] });
    },
  });
}

/* ---- Cartera de canales (validación de cupo) ---- */

export function useCanalCarteraOrders() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['canal-cartera', company?.id],
    queryFn: async () => {
      const res = await api.get<CanalOrder[]>('/cartera/canal-orders');
      return res.data;
    },
  });
}

export function useCanalCarteraDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      note,
      reason,
    }: {
      id: string;
      action: 'approve' | 'reject';
      note?: string;
      reason?: string;
    }) => {
      const res = await api.post<CanalOrder>(
        `/cartera/canal-orders/${id}/${action}`,
        { note, reason },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['canal-cartera'] });
      qc.invalidateQueries({ queryKey: ['canal-dispatch'] });
    },
  });
}

/* ---- Despacho de canales (remisión + Frigo App + Siesa) ---- */

export function useCanalDispatchOrders() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['canal-dispatch', company?.id],
    queryFn: async () => {
      const res = await api.get<CanalOrder[]>('/admin/canal-orders/dispatch');
      return res.data;
    },
  });
}

export function useDispatchCanalOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      remisionNumber,
      frigoAppId,
      frigoKg,
      frigoGanchos,
      file,
      sendToSiesa,
    }: {
      id: string;
      remisionNumber: string;
      frigoAppId?: string;
      frigoKg?: number;
      frigoGanchos?: number;
      file?: File | null;
      sendToSiesa?: boolean;
    }) => {
      const form = new FormData();
      form.append('remisionNumber', remisionNumber);
      if (frigoAppId) form.append('frigoAppId', frigoAppId);
      if (frigoKg != null) form.append('frigoKg', String(frigoKg));
      if (frigoGanchos != null) {
        form.append('frigoGanchos', String(frigoGanchos));
      }
      if (sendToSiesa) form.append('sendToSiesa', 'true');
      if (file) form.append('file', file);
      const res = await api.post<CanalOrder>(
        `/admin/canal-orders/dispatch/${id}`,
        form,
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canal-dispatch'] }),
  });
}

export function useSendCanalOrderToSiesa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<CanalOrder>(
        `/admin/canal-orders/dispatch/${id}/siesa`,
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canal-dispatch'] }),
  });
}

/* ---- Avisos de cartera de canales para el vendedor ---- */

export function useCanalOrderNotifications() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['canal-orders', 'notifications', company?.id],
    queryFn: async () => {
      const res = await api.get<CanalOrder[]>('/canal-orders/notifications');
      return res.data;
    },
    refetchInterval: 30_000,
  });
}

export function useAcknowledgeCanalNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/canal-orders/${id}/acknowledge`);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['canal-orders', 'notifications'] }),
  });
}

interface UpdateOrderInput {
  orderId: string;
  notes?: string;
  logisticsNote?: string;
  deliveryType?: DeliveryType;
  deliveryDate?: string;
  items: { sku: string; quantity: number; discountPct: number }[];
}

/** Edita un pedido pendiente por envío (líneas, cantidades y notas). */
export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, ...input }: UpdateOrderInput) => {
      const res = await api.patch<Order>(`/orders/${orderId}`, input);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useSyncOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await api.post<Order>(`/orders/${orderId}/sync`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}

export function useConfirmOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await api.post<Order>(`/orders/${orderId}/confirm`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}

/** Anula un pedido (devuelve el stock). Requiere un motivo. */
export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      reason,
    }: {
      orderId: string;
      reason: string;
    }) => {
      const res = await api.post<Order>(`/orders/${orderId}/cancel`, {
        reason,
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

/**
 * Avisos para el vendedor sobre decisiones de cartera (pedidos aprobados o
 * desaprobados). Se consulta periódicamente para mostrar el modal.
 */
export function useOrderNotifications() {
  return useQuery({
    queryKey: ['orders', 'notifications'],
    queryFn: async () => {
      const res = await api.get<Order[]>('/orders/notifications');
      return res.data;
    },
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });
}

/** Marca como visto un aviso de cartera (deja de aparecer en el modal). */
export function useAcknowledgeNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await api.post(`/orders/${orderId}/acknowledge`, {});
      return res.data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['orders', 'notifications'] }),
  });
}

/**
 * Avisos de cambio de estado en Siesa de los pedidos del vendedor. Se consulta
 * periódicamente para mostrar el modal cada vez que un pedido cambia de estado.
 */
export function useSiesaStateNotifications() {
  return useQuery({
    queryKey: ['orders', 'siesa-state-notifications'],
    queryFn: async () => {
      const res = await api.get<Order[]>('/orders/siesa-state-notifications');
      return res.data;
    },
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

/** Marca como visto un aviso de cambio de estado en Siesa. */
export function useAcknowledgeSiesaStateNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await api.post(`/orders/${orderId}/siesa-state-ack`, {});
      return res.data;
    },
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ['orders', 'siesa-state-notifications'],
      }),
  });
}

/** Descarga el PDF (documento) de un pedido y lo abre como archivo. */
export async function downloadOrderPdf(
  orderId: string,
  orderNumber: string,
  companyId?: string,
): Promise<void> {
  const res = await api.get(`/orders/${orderId}/pdf`, {
    responseType: 'blob',
    ...(companyId ? { headers: { 'X-Company-Id': companyId } } : {}),
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pedido-${orderNumber}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** Cotizaciones del vendedor en la compañía activa. */
export function useQuotes() {
  const { company } = useCompany();
  return useQuery({
    queryKey: ['quotes', company?.id],
    queryFn: async () => {
      const res = await api.get<Quote[]>('/quotes');
      return res.data;
    },
  });
}

interface CreateQuoteInput {
  customerId: string;
  notes?: string;
  validityDays?: number;
  items: { sku: string; quantity: number; discountPct: number }[];
}

/** Crea una cotización (no afecta el inventario). */
export function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateQuoteInput) => {
      const res = await api.post<Quote>('/quotes', input);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  });
}

/** Descarga el PDF (documento) de una cotización y lo abre como archivo. */
export async function downloadQuotePdf(
  quoteId: string,
  quoteNumber: string,
): Promise<void> {
  const res = await api.get(`/quotes/${quoteId}/pdf`, {
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cotizacion-${quoteNumber}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function useSyncProductsFromSiesa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ synced: number }>('/products/sync');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useSyncCustomersFromSiesa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ synced: number }>('/customers/sync');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}
