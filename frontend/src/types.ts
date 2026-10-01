export type UserRole = 'admin' | 'seller' | 'cartera' | 'alistador' | 'facturacion';

export interface Company {
  id: string;
  name: string;
  /** Módulos que el usuario puede ver en esta compañía (vacío = todos los de su rol). */
  permissions?: string[];
}

export interface User {
  id: string;
  documentId: string;
  email?: string;
  name: string;
  role: UserRole;
  siesaSellerCode?: string;
  permissions?: string[];
  mustChangePassword?: boolean;
}

export interface Customer {
  id: string;
  siesaId: string;
  nit: string;
  name: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  priceList?: string;
  creditLimit: number;
  active: boolean;
}

/** Cliente sincronizado desde el endpoint `clientes-por-cia`. */
export interface Client {
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
  /** Horario de recibido de mercancía predeterminado del cliente. */
  deliverySchedule?: DeliverySchedule;
}

/**
 * Horario de recibido de mercancía: días seleccionados (0=Lunes … 6=Domingo)
 * y rango de horas en formato "HH:mm".
 */
export interface DeliverySchedule {
  days: number[];
  hourFrom: string;
  hourTo: string;
}

/** Tipo de entrega del pedido. */
export type DeliveryType = 'despacho' | 'recoge_en_planta';

export interface PortfolioDocument {
  branch: string;
  costCenter?: string;
  docType?: string;
  description?: string;
  documentNumber: number;
  invoiceDate?: string;
  dueDate?: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface ClientPortfolio {
  nit: string;
  name?: string;
  count: number;
  totalBalance: number;
  documents: PortfolioDocument[];
}

export interface Product {
  id: string;
  siesaId: string;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  unitOfMeasure?: string;
  basePrice: number;
  taxRate: number;
  stock: number;
  active: boolean;
  /** Precio resuelto desde la lista de precios del cliente (si aplica). */
  price?: number | null;
}

/**
 * Producto vendible para un cliente: proviene de su lista de precios (siempre
 * con precio y unidad de medida) y trae el stock del inventario.
 */
export interface SellableProduct {
  sku: string;
  name: string;
  price: number;
  unitOfMeasure?: string;
  stock: number;
  /** Tasa de IVA (%) del producto. El IVA se agrega solo para mostrarlo. */
  taxRate: number;
  /** Categoría del subproducto (CERDO / RES). Solo aplica a subproductos. */
  category?: string;
}

/** Producto marcado como estrella/favorito del día para una compañía. */
export interface FeaturedProduct {
  id: string;
  companyId: string;
  sku: string;
  name: string;
}

export type OrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'pending_control'
  | 'confirmed'
  | 'syncing'
  | 'synced'
  | 'failed'
  | 'cancelled'
  | 'disapproved'
  | 'expired'
  | 'bounced';

export interface OrderItem {
  id: string;
  product?: Product | null;
  sku: string;
  productName: string;
  unitOfMeasure?: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  taxRate: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  /** Segundo consecutivo (subproductos divididos en dos documentos Siesa). */
  secondNumber?: string | null;
  customer: Client;
  seller: User;
  items: OrderItem[];
  status: OrderStatus;
  subtotal: number;
  taxes: number;
  total: number;
  notes?: string;
  logisticsNote?: string;
  deliveryType?: DeliveryType;
  deliverySchedule?: string;
  deliveryDate?: string;
  cancelReason?: string;
  carteraBalance?: number;
  approvalDeadline?: string;
  approvedAt?: string;
  approvedBy?: string;
  disapprovalReason?: string;
  sellerNotificationPending?: boolean;
  companyId?: string;
  siesaDocumentId?: string;
  siesaEstado?: string;
  siesaStatePrevious?: string;
  siesaStateNotificationPending?: boolean;
  syncError?: string;
  createdAt: string;
}

/** Trazabilidad de un pedido en Siesa (estado, facturado y despachado). */
export interface SiesaState {
  estado: string;
  facturado: boolean;
  despachado: boolean;
}

/** Línea de un ítem dentro de una cotización. */
export interface QuoteItem {
  id: string;
  sku: string;
  productName: string;
  unitOfMeasure?: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  taxRate: number;
  lineTotal: number;
}

/** Cotización de venta (informativa, no afecta el inventario). */
export interface Quote {
  id: string;
  quoteNumber: string;
  customer: Client;
  seller: User;
  items: QuoteItem[];
  subtotal: number;
  taxes: number;
  total: number;
  notes?: string;
  validityDays: number;
  validUntil?: string;
  companyId?: string;
  createdAt: string;
}

export interface CartLine {
  product: SellableProduct;
  quantity: number;
  discountPct: number;
  /** Precio unitario resuelto desde la lista del cliente. */
  unitPrice: number;
}

/* ---- Administración ---- */

export interface AdminDashboardStats {
  totals: {
    revenue: number;
    orders: number;
    customers: number;
    products: number;
    pendingOrders: number;
    avgTicket: number;
  };
  ordersByStatus: { status: OrderStatus; count: number }[];
  byCompany: {
    companyId: string;
    name: string;
    revenue: number;
    orders: number;
    customers: number;
    products: number;
  }[];
  salesTrend: { date: string; revenue: number; orders: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  topCustomers: { name: string; orders: number; revenue: number }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    customerName: string;
    companyId: string;
    total: number;
    status: OrderStatus;
    createdAt: string;
  }[];
}

/** Tablero de gestión comercial de un vendedor para un mes. */
export interface SellerCommercialDashboard {
  period: { month: number; year: number; day: number | null; label: string };
  generatedAt: string;
  seller: { id: string; name: string };
  totals: {
    revenue: number;
    orders: number;
    customersServed: number;
    activeCustomers: number;
    avgTicket: number;
    kilosSold: number;
    orderRevenue: number;
    orderKilos: number;
  };
  growth: {
    revenuePct: number | null;
    kilosPct: number | null;
  };
  salesTrend: { date: string; revenue: number; orders: number; label?: string }[];
  topCustomers: {
    name: string;
    code: string;
    city: string | null;
    branch: string | null;
    branchName: string | null;
    revenue: number;
    lastPurchase: string | null;
  }[];
  /** Clientes asignados que NO compraron en el periodo (para seguimiento). */
  customersNotBuying: {
    name: string;
    code: string;
    city: string | null;
    branch: string | null;
    branchName: string | null;
    revenue: number;
    lastPurchase: string | null;
  }[];
  salesByCut: {
    name: string;
    quantity: number;
    revenue: number;
  }[];
  salesByChannel: {
    name: string;
    kilos: number;
    revenue: number;
  }[];
  salesByCategory?: {
    category: string;
    kilos: number;
    revenue: number;
    items: { name: string; ref: string; kilos: number; revenue: number }[];
  }[];
  budget: { expectedRevenue: number; targetKilos: number } | null;
  projection: { revenue: number; kilos: number } | null;
  /** Rentabilidad del período (venta − costo estándar). Null si no hay costos. */
  profitability: {
    cost: number;
    margin: number;
    marginPct: number | null;
  } | null;
  /** Desglose de presupuesto por cliente/tienda (vendedores "por cliente"). */
  clientBudgets:
    | {
        clientCode: string;
        clientName: string;
        branch: string | null;
        branchName: string | null;
        targetRevenue: number;
        targetKilos: number;
        revenue: number;
        compliancePct: number | null;
      }[]
    | null;
}

/** Fila de presupuesto de un vendedor para un mes/año. */
export interface BudgetRow {
  sellerId: string;
  sellerName: string;
  siesaSellerCode: string | null;
  targetKilos: number;
  expectedRevenue: number;
  /** true si el vendedor va "por tienda/cliente" (meta por cada cliente). */
  clientBudget: boolean;
}

/** Fila de presupuesto de un cliente/tienda de un vendedor "por cliente". */
export interface ClientBudgetRow {
  clientCode: string;
  clientName: string;
  branch: string | null;
  branchName: string | null;
  targetKilos: number;
  expectedRevenue: number;
}

/** Costo estándar de un producto (para rentabilidad). */
export interface ProductCost {
  id: string;
  productRef: string;
  name?: string;
  unitCost: number;
}

/** Factura TAT (Siesa) con su estado de selección para despacho en Drivin. */
export interface TatInvoice {
  id: string;
  /** Consecutivo de la factura (nro_documento). */
  invoiceNumber: string;
  documentDate: string;
  clientCode: string;
  clientName: string;
  /** Sucursal del cliente (codigo/descripcion/direccion). */
  branchCode: string | null;
  branchName: string | null;
  branchAddress: string | null;
  /** Tipos comerciales de la factura (p. ej. "CORTE, SUBPRODUCTO"). */
  tipoComercial: string | null;
  /** Cantidad total (kilos). */
  quantity: number;
  /** Valor subtotal total (pesos). */
  subtotal: number;
  selected: boolean;
  /** Publicada: viaja por la API pública (se fija con el botón Guardar). */
  published: boolean;
}

/** Definición de un ítem de canal seleccionable en la toma de pedidos. */
export interface CanalItemDef {
  ref: string;
  name: string;
  especie: string;
  /** Peso aproximado por unidad (kg), para sugerir unidades desde los kg. */
  approxWeightKg: number;
  /** Rangos de kilos disponibles para este ítem (selección). */
  specs: string[];
}

/** Estados del flujo de un pedido de canales. */
export type CanalOrderStatus =
  | 'pending_control'
  | 'pending_cartera'
  | 'rejected'
  | 'pending_dispatch'
  | 'dispatched'
  | 'syncing'
  | 'synced'
  | 'failed'
  | 'cancelled';

/** Línea (ítem) de un pedido de canales. */
export interface CanalOrderItem {
  itemRef: string;
  itemName: string;
  especie: string;
  /** Unidades (animales). */
  quantity: number;
  /** Peso aproximado por unidad (kg). */
  approxWeightKg: number;
  /** Kilos estimados de la línea. Se factura por kg. */
  estimatedKg: number;
  specifications: string;
  /** Precio por kilo. */
  price: number;
  freight: number;
}

/** Información de cupo del cliente (validación de cartera). */
export interface CanalCupoInfo {
  creditLimit: number;
  invoicedBalance: number;
  pendingOrdersTotal: number;
  available: number;
  exceeds: boolean;
  hasOverdue: boolean;
}

/** Pedido de canales (flujo: vendedor → control → cartera → despacho → Siesa). */
export interface CanalOrder {
  id: string;
  orderNumber: number;
  status: CanalOrderStatus;
  sellerId: string;
  sellerName: string;
  dispatchDate: string;
  clientCode: string;
  clientName: string;
  clientAddress?: string;
  clientCity?: string;
  clientBranch?: string;
  clientPaymentTerm?: string;
  items: CanalOrderItem[];
  totalKg: number;
  totalValue: number;
  controlNote?: string;
  controlledBy?: string;
  controlledAt?: string;
  carteraNote?: string;
  carteraBy?: string;
  carteraAt?: string;
  creditLimit: number;
  invoicedBalance: number;
  pendingOrdersTotal: number;
  rejectionReason?: string;
  remisionNumber?: string;
  frigoAppId?: string;
  frigoKg?: number;
  frigoGanchos?: number;
  frigoPdfName?: string;
  dispatchedBy?: string;
  dispatchedAt?: string;
  siesaDocumentId?: string;
  syncedAt?: string;
  syncError?: string;
  createdAt: string;
  updatedAt?: string;
  /** Cupo calculado (solo en el listado de cartera). */
  cupo?: CanalCupoInfo;
}

/** Modo de asignación de la proyección de ventas de una compañía. */
export type ProjectionMode = 'month' | 'day';

/** Configuración de la proyección de ventas de una compañía para un mes. */
export interface ProjectionConfig {
  mode: ProjectionMode;
  revenue: number;
  kilos: number;
  workingDays: string[];
}

/** Métricas de una compañía dentro del dashboard gerencial (rango de fechas). */
export interface ManagerialCompanyStats {
  companyId: string;
  name: string;
  totals: {
    revenue: number;
    orders: number;
    units: number;
    avgTicket: number;
    customers: number;
  };
  salesTrend: { date: string; revenue: number; orders: number; label?: string }[];
  ordersByStatus: { status: OrderStatus; count: number }[];
  topProducts: {
    sku: string;
    name: string;
    quantity: number;
    revenue: number;
  }[];
  topCustomers: {
    name: string;
    code: string;
    orders: number;
    revenue: number;
  }[];
  topSellers: {
    name: string;
    documentId: string;
    orders: number;
    revenue: number;
  }[];
  margin?: {
    revenue: number;
    cost: number;
    profit: number;
    marginPct: number;
    kilos: number;
    bySeller: {
      name: string;
      nit: string;
      revenue: number;
      cost: number;
      profit: number;
      marginPct: number;
      kilos: number;
    }[];
    byProduct: {
      ref: string;
      name: string;
      quantity: number;
      revenue: number;
      cost: number;
      profit: number;
      marginPct: number;
    }[];
  };
}

/** Dashboard gerencial: mismas métricas divididas por compañía y por rango. */
export interface ManagerialDashboardStats {
  from: string;
  to: string;
  companies: ManagerialCompanyStats[];
}

/** Una fila del reporte de inventario por día (un producto). */
export interface InventoryReportRow {
  sku: string;
  name: string;
  unitOfMeasure?: string;
  sold: number;
  stock: number;
}

/** Datos del reporte de inventario por día (para previsualizar). */
export interface InventoryReportData {
  companyId: string;
  date: string;
  rows: InventoryReportRow[];
  summary: {
    totalRefs: number;
    refsWithStock: number;
    refsWithoutStock: number;
    totalSold: number;
    totalStock: number;
  };
}

/** Una fila del reporte de productos vendidos (un producto). */
export interface ProductSalesRow {
  sku: string;
  name: string;
  unitOfMeasure?: string;
  quantity: number;
  revenue: number;
}

/** Sección de una compañía dentro del reporte de productos vendidos. */
export interface ProductSalesCompany {
  companyId: string;
  companyName: string;
  rows: ProductSalesRow[];
  summary: {
    totalProducts: number;
    totalQuantity: number;
    totalRevenue: number;
  };
}

/** Datos del reporte de productos vendidos divididos por compañía. */
export interface ProductSalesReportData {
  from: string;
  to: string;
  companies: ProductSalesCompany[];
}

/** Fila del resumen de ventas por cliente o por producto. */
export interface SalesSummaryRow {
  reference: string;
  name: string;
  unitOfMeasure?: string;
  orders?: number;
  units: number;
  revenue: number;
}

/** Datos del resumen de ventas por cliente o por producto. */
export interface SalesSummaryReportData {
  from: string;
  to: string;
  companyId: string;
  companyName: string;
  groupBy: 'customer' | 'product';
  rows: SalesSummaryRow[];
  summary: {
    totalRows: number;
    totalOrders: number;
    totalUnits: number;
    totalRevenue: number;
  };
}

/** Fila del ranking de vendedores. */
export interface SellerRankingRow {
  position: number;
  name: string;
  documentId?: string;
  sellerCode?: string;
  orders: number;
  units: number;
  revenue: number;
}

/** Datos del ranking de vendedores. */
export interface SellerRankingReportData {
  from: string;
  to: string;
  companyId: string;
  companyName: string;
  rows: SellerRankingRow[];
  summary: {
    totalSellers: number;
    totalOrders: number;
    totalUnits: number;
    totalRevenue: number;
  };
}

/** Fila (un vendedor) del reporte de ventas por vendedor. */
export interface SellerSalesRow {
  name: string;
  sellerCode: string;
  avgKiloPrev: number;
  budgetKilos: number;
  kilosSold: number;
  kilosPct: number | null;
  revenue: number;
  expectedRevenue: number;
  revenuePct: number | null;
  avgKiloCur: number;
}

/** Datos del reporte de ventas por vendedor. */
export interface SellerSalesReportData {
  month: number;
  year: number;
  monthLabel: string;
  prevMonthLabel: string;
  companyId: string;
  companyName: string;
  asOfDate: string;
  idealPct: number;
  rows: SellerSalesRow[];
  totals: {
    budgetKilos: number;
    kilosSold: number;
    kilosPct: number | null;
    revenue: number;
    expectedRevenue: number;
    revenuePct: number | null;
    avgKiloPrev: number;
    avgKiloCur: number;
  };
}

/** Producto dentro de un vendedor en el reporte de ventas acumuladas. */
export interface VendorSalesProductRow {
  referencia: string;
  descripcion: string;
  quantity: number;
  net: number;
}

/** Un vendedor con su desglose de productos y totales. */
export interface VendorSalesGroup {
  nit: string;
  name: string;
  products: VendorSalesProductRow[];
  totalQuantity: number;
  totalNet: number;
}

/** Datos del reporte "Ventas acumuladas por vendedor por producto". */
export interface VendorProductSalesReportData {
  periodo: string;
  fecha?: string;
  periodLabel: string;
  sellers: VendorSalesGroup[];
  grandTotalQuantity: number;
  grandTotalNet: number;
}

/** Pedidos (de la BD) por vendedor, para comparar contra la venta del ERP. */
export interface OrdersBySellerReportData {
  periodo: string;
  fecha?: string;
  periodLabel: string;
  sellers: {
    sellerId: string;
    name: string;
    total: number;
    orders: number;
  }[];
  grandTotal: number;
  grandOrders: number;
}

/** Fila del reporte vendedor–producto. */
export interface SellerProductRow {
  sellerId: string;
  sellerName: string;
  documentId?: string;
  sellerCode?: string;
  sku: string;
  productName: string;
  unitOfMeasure?: string;
  quantity: number;
  revenue: number;
}

/** Datos del reporte vendedor–producto. */
export interface SellerProductReportData {
  from: string;
  to: string;
  companyId: string;
  companyName: string;
  sellerName?: string;
  search?: string;
  productName?: string;
  sellers: { id: string; name: string }[];
  products: { sku: string; name: string }[];
  rows: SellerProductRow[];
  summary: {
    totalRows: number;
    totalQuantity: number;
    totalRevenue: number;
  };
}

/** Fila del reporte mejor-vendedor-por-producto. */
export interface ProductSellerRow {
  sku: string;
  productName: string;
  unitOfMeasure?: string;
  position: number;
  isTop: boolean;
  sellerId: string;
  sellerName: string;
  documentId?: string;
  sellerCode?: string;
  quantity: number;
  revenue: number;
}

/** Datos del reporte mejor-vendedor-por-producto. */
export interface ProductSellerReportData {
  from: string;
  to: string;
  companyId: string;
  companyName: string;
  search?: string;
  productName?: string;
  products: { sku: string; name: string }[];
  rows: ProductSellerRow[];
  summary: {
    totalProducts: number;
    totalQuantity: number;
    totalRevenue: number;
  };
}

export interface UserCompanyAccess {
  companyId: string;
  name: string;
  siesaSellerCode?: string;
  /** Módulos visibles del usuario en esta compañía (vacío = todos los de su rol). */
  permissions: string[];
}

export interface AdminUser {
  id: string;
  documentId: string;
  email?: string;
  name: string;
  role: UserRole;
  active: boolean;
  /** Presupuesto por cliente/tienda (aparte del general). */
  clientBudget?: boolean;
  createdAt: string;
  companies: UserCompanyAccess[];
  permissions: string[];
}
