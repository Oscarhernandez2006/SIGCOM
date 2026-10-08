import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { UserRole } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { PriceListItem } from '../price-lists/entities/price-list-item.entity';
import {
  COMPANIES,
  isValidCompany,
  isDashboardExcludedSellerDoc,
  DASHBOARD_EXCLUDED_SELLER_DOCS,
} from '../../common/companies';
import { bogotaParts, bogotaToday } from '../orders/order-cortes';
import {
  buildInventoryReportPdf,
  InventoryReportData,
  InventoryReportRow,
} from './inventory-report';
import {
  buildProductSalesReportPdf,
  ProductSalesCompany,
  ProductSalesReportData,
  ProductSalesRow,
} from './product-sales-report';
import {
  buildInventoryReportExcel,
  buildProductSalesReportExcel,
  buildSalesSummaryReportExcel,
  buildSellerRankingReportExcel,
  buildSellerProductReportExcel,
  buildProductSellerReportExcel,
  buildSellerSalesReportExcel,
  buildVendorProductSalesReportExcel,
} from './report-excel';
import {
  buildSalesSummaryReportPdf,
  SalesSummaryReportData,
  SalesSummaryRow,
} from './sales-summary-report';
import {
  buildSellerRankingReportPdf,
  SellerRankingReportData,
  SellerRankingRow,
} from './seller-ranking-report';
import {
  buildSellerProductReportPdf,
  SellerProductReportData,
  SellerProductRow,
  SellerOption,
  ProductOption,
} from './seller-product-report';
import {
  buildProductSellerReportPdf,
  ProductSellerReportData,
  ProductSellerRow,
} from './product-seller-report';
import {
  buildSellerSalesReportPdf,
  SellerSalesReportData,
  SellerSalesRow,
} from './seller-sales-report';
import { BudgetsService } from '../budgets/budgets.service';
import { UsersService } from '../users/users.service';
import { PriceListsService } from '../price-lists/price-lists.service';
import { sameSellerName } from '../../common/seller-names';
import {
  buildVendorProductSalesReportPdf,
  VendorProductSalesReportData,
  VendorSalesGroup,
} from './vendor-product-sales-report';
import {
  ChannelSalesClient,
  ChannelSaleRaw,
} from '../channel-sales/channel-sales.client';

/** Estados que representan una venta real (descuentan inventario). */
const SALE_STATUSES = [
  OrderStatus.CONFIRMED,
  OrderStatus.SYNCING,
  OrderStatus.SYNCED,
  OrderStatus.FAILED,
];

/** Venta y kilos por id de vendedor, del mes del reporte y del anterior. */
type SellerSalesMaps = {
  cur: Map<string, { revenue: number; kilos: number }>;
  prev: Map<string, { revenue: number; kilos: number }>;
};

/** Pedidos por vendedor (de la BD) para comparar contra la venta del ERP. */
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

@Injectable()
export class AdminReportsService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(PriceListItem)
    private readonly priceListItemsRepository: Repository<PriceListItem>,
    private readonly budgetsService: BudgetsService,
    private readonly channelSalesClient: ChannelSalesClient,
    private readonly usersService: UsersService,
    private readonly priceListsService: PriceListsService,
  ) {}

  /**
   * Construye un mapa `referencia -> unidad de medida` a partir de las listas
   * de precios de la compañía. Sirve para mostrar la UM en los reportes cuando
   * el inventario se cargó por Excel (que no trae la unidad de medida).
   */
  private async getUnitOfMeasureBySku(
    companyId: string,
  ): Promise<Map<string, string>> {
    const items = await this.priceListItemsRepository.find({
      where: { companyId },
      select: { reference: true, unitOfMeasure: true },
    });
    const map = new Map<string, string>();
    for (const item of items) {
      const um = item.unitOfMeasure?.trim();
      if (!um) continue;
      const key = item.reference.trim();
      if (!map.has(key)) map.set(key, um);
    }
    return map;
  }

  /**
   * Construye el resumen de inventario de un día para una compañía: por cada
   * producto, lo vendido en el día (cantidades de pedidos de venta de esa
   * fecha) y el stock que queda. Indica además cuántas referencias tienen y no
   * tienen existencias.
   */
  async getInventoryReport(
    companyId: string,
    date?: string,
  ): Promise<InventoryReportData> {
    if (!isValidCompany(companyId)) {
      throw new BadRequestException('Compañía inválida.');
    }
    const targetDate = date?.trim() || bogotaToday();

    const [products, orders] = await Promise.all([
      this.productsRepository.find({
        where: { companyId },
        order: { name: 'ASC' },
      }),
      this.ordersRepository.find({
        where: { companyId, status: In(SALE_STATUSES) },
      }),
    ]);

    // Unidad de medida por referencia (desde las listas de precios), para los
    // productos cuyo inventario se cargó sin la UM.
    const umBySku = await this.getUnitOfMeasureBySku(companyId);

    // Unidades vendidas por SKU en el día objetivo (hora de Colombia).
    const soldBySku = new Map<string, number>();
    for (const order of orders) {
      const { date: orderDate } = bogotaParts(order.createdAt);
      if (orderDate !== targetDate) continue;
      for (const item of order.items ?? []) {
        const sku = item.sku;
        soldBySku.set(
          sku,
          (soldBySku.get(sku) ?? 0) + Number(item.quantity),
        );
      }
    }

    const rows: InventoryReportRow[] = products.map((p) => ({
      sku: p.sku,
      name: p.name,
      unitOfMeasure: p.unitOfMeasure ?? umBySku.get(p.sku.trim()),
      sold: soldBySku.get(p.sku) ?? 0,
      stock: Number(p.stock),
    }));

    const summary = {
      totalRefs: rows.length,
      refsWithStock: rows.filter((r) => r.stock > 0).length,
      refsWithoutStock: rows.filter((r) => r.stock <= 0).length,
      totalSold: rows.reduce((acc, r) => acc + r.sold, 0),
      totalStock: rows.reduce((acc, r) => acc + r.stock, 0),
    };

    return { companyId, date: targetDate, rows, summary };
  }

  /** Genera el PDF del resumen de inventario por día. */
  async getInventoryReportPdf(
    companyId: string,
    date?: string,
  ): Promise<{ buffer: Buffer; date: string }> {
    const data = await this.getInventoryReport(companyId, date);
    const buffer = await buildInventoryReportPdf(data);
    return { buffer, date: data.date };
  }

  /** Genera el Excel del resumen de inventario por día. */
  async getInventoryReportExcel(
    companyId: string,
    date?: string,
  ): Promise<{ buffer: Buffer; date: string }> {
    const data = await this.getInventoryReport(companyId, date);
    const buffer = buildInventoryReportExcel(data);
    return { buffer, date: data.date };
  }

  /**
   * Construye el reporte de productos vendidos dividido por compañía: por cada
   * compañía lista los productos vendidos en el rango de fechas (hora de
   * Colombia) con la cantidad vendida y los ingresos (precio x cantidad).
   * Si se indica `companyId`, el reporte incluye únicamente esa compañía.
   */
  async getProductSalesReport(
    from?: string,
    to?: string,
    companyId?: string,
  ): Promise<ProductSalesReportData> {
    const today = bogotaToday();
    const fromDate = from?.trim() || today;
    const toDate = to?.trim() || today;
    if (fromDate > toDate) {
      throw new BadRequestException(
        'La fecha inicial no puede ser mayor que la final.',
      );
    }

    const targetCompanyId = companyId?.trim();
    if (targetCompanyId && !isValidCompany(targetCompanyId)) {
      throw new BadRequestException('Compañía inválida.');
    }
    const selectedCompanies = targetCompanyId
      ? COMPANIES.filter((c) => c.id === targetCompanyId)
      : COMPANIES;

    const orders = await this.ordersRepository.find({
      where: { status: In(SALE_STATUSES) },
    });

    const companies: ProductSalesCompany[] = selectedCompanies.map((company) => {
      // Acumula cantidad e ingresos por SKU dentro del rango de fechas.
      const bySku = new Map<string, ProductSalesRow>();
      for (const order of orders) {
        if (order.companyId !== company.id) continue;
        const { date: orderDate } = bogotaParts(order.createdAt);
        if (orderDate < fromDate || orderDate > toDate) continue;
        for (const item of order.items ?? []) {
          const row = bySku.get(item.sku) ?? {
            sku: item.sku,
            name: item.productName,
            unitOfMeasure: item.unitOfMeasure,
            quantity: 0,
            revenue: 0,
          };
          row.quantity += Number(item.quantity);
          row.revenue += Number(item.lineTotal);
          bySku.set(item.sku, row);
        }
      }

      // Ordena del producto más vendido (mayor cantidad) al menos vendido.
      // Ante empate en cantidad, prioriza los de mayores ingresos y luego el nombre.
      const rows = [...bySku.values()].sort(
        (a, b) =>
          b.quantity - a.quantity ||
          b.revenue - a.revenue ||
          a.name.localeCompare(b.name, 'es'),
      );

      return {
        companyId: company.id,
        companyName: company.name,
        rows,
        summary: {
          totalProducts: rows.length,
          totalQuantity: rows.reduce((acc, r) => acc + r.quantity, 0),
          totalRevenue: rows.reduce((acc, r) => acc + r.revenue, 0),
        },
      };
    });

    return { from: fromDate, to: toDate, companies };
  }

  /** Genera el PDF de productos vendidos dividido por compañía. */
  async getProductSalesReportPdf(
    from?: string,
    to?: string,
    companyId?: string,
  ): Promise<{ buffer: Buffer; from: string; to: string }> {
    const data = await this.getProductSalesReport(from, to, companyId);
    const buffer = await buildProductSalesReportPdf(data);
    return { buffer, from: data.from, to: data.to };
  }

  /** Genera el Excel de productos vendidos dividido por compañía. */
  async getProductSalesReportExcel(
    from?: string,
    to?: string,
    companyId?: string,
  ): Promise<{ buffer: Buffer; from: string; to: string }> {
    const data = await this.getProductSalesReport(from, to, companyId);
    const buffer = buildProductSalesReportExcel(data);
    return { buffer, from: data.from, to: data.to };
  }

  /**
   * Construye el resumen de ventas de una compañía agrupado por cliente o por
   * producto en un rango de fechas (hora de Colombia). Por cliente muestra el
   * número de pedidos, las unidades y los ingresos; por producto, la cantidad y
   * los ingresos. Las filas se ordenan de mayor a menor por ingresos.
   */
  async getSalesSummaryReport(
    companyId: string,
    groupBy: 'customer' | 'product',
    from?: string,
    to?: string,
  ): Promise<SalesSummaryReportData> {
    if (!isValidCompany(companyId)) {
      throw new BadRequestException('Compañía inválida.');
    }
    const group = groupBy === 'customer' ? 'customer' : 'product';
    const today = bogotaToday();
    const fromDate = from?.trim() || today;
    const toDate = to?.trim() || today;
    if (fromDate > toDate) {
      throw new BadRequestException(
        'La fecha inicial no puede ser mayor que la final.',
      );
    }

    const company = COMPANIES.find((c) => c.id === companyId)!;

    const orders = await this.ordersRepository.find({
      where: { companyId, status: In(SALE_STATUSES) },
    });

    // Agrupa las ventas del rango por cliente o por producto.
    const map = new Map<string, SalesSummaryRow>();
    let totalOrders = 0;
    let totalUnits = 0;
    let totalRevenue = 0;

    for (const order of orders) {
      const { date: orderDate } = bogotaParts(order.createdAt);
      if (orderDate < fromDate || orderDate > toDate) continue;

      const units = (order.items ?? []).reduce(
        (acc, it) => acc + Number(it.quantity),
        0,
      );
      totalOrders += 1;
      totalUnits += units;

      if (group === 'customer') {
        const code = order.customer?.code ?? 'SIN-CODIGO';
        const name = order.customer?.name ?? 'Sin cliente';
        const row =
          map.get(code) ??
          ({
            reference: code,
            name,
            orders: 0,
            units: 0,
            revenue: 0,
          } as SalesSummaryRow);
        row.orders = (row.orders ?? 0) + 1;
        row.units += units;
        row.revenue += Number(order.total);
        map.set(code, row);
        totalRevenue += Number(order.total);
      } else {
        for (const item of order.items ?? []) {
          const row =
            map.get(item.sku) ??
            ({
              reference: item.sku,
              name: item.productName,
              unitOfMeasure: item.unitOfMeasure,
              units: 0,
              revenue: 0,
            } as SalesSummaryRow);
          row.units += Number(item.quantity);
          row.revenue += Number(item.lineTotal);
          map.set(item.sku, row);
          totalRevenue += Number(item.lineTotal);
        }
      }
    }

    const rows: SalesSummaryRow[] = [...map.values()].sort(
      (a, b) =>
        b.revenue - a.revenue ||
        b.units - a.units ||
        a.name.localeCompare(b.name, 'es'),
    );

    return {
      from: fromDate,
      to: toDate,
      companyId,
      companyName: company.name,
      groupBy: group,
      rows,
      summary: {
        totalRows: rows.length,
        totalOrders,
        totalUnits,
        totalRevenue,
      },
    };
  }

  /** Genera el PDF del resumen de ventas por cliente o por producto. */
  async getSalesSummaryReportPdf(
    companyId: string,
    groupBy: 'customer' | 'product',
    from?: string,
    to?: string,
  ): Promise<{ buffer: Buffer; from: string; to: string }> {
    const data = await this.getSalesSummaryReport(companyId, groupBy, from, to);
    const buffer = await buildSalesSummaryReportPdf(data);
    return { buffer, from: data.from, to: data.to };
  }

  /** Genera el Excel del resumen de ventas por cliente o por producto. */
  async getSalesSummaryReportExcel(
    companyId: string,
    groupBy: 'customer' | 'product',
    from?: string,
    to?: string,
  ): Promise<{ buffer: Buffer; from: string; to: string }> {
    const data = await this.getSalesSummaryReport(companyId, groupBy, from, to);
    const buffer = buildSalesSummaryReportExcel(data);
    return { buffer, from: data.from, to: data.to };
  }

  /**
   * Construye el ranking de vendedores de una compañía en un rango de fechas
   * (hora de Colombia): por cada vendedor que registró pedidos de venta, el
   * número de pedidos, las unidades y los ingresos. Se ordena del que más
   * vende al que menos (por ingresos).
   */
  async getSellerRankingReport(
    companyId: string,
    from?: string,
    to?: string,
  ): Promise<SellerRankingReportData> {
    if (!isValidCompany(companyId)) {
      throw new BadRequestException('Compañía inválida.');
    }
    const today = bogotaToday();
    const fromDate = from?.trim() || today;
    const toDate = to?.trim() || today;
    if (fromDate > toDate) {
      throw new BadRequestException(
        'La fecha inicial no puede ser mayor que la final.',
      );
    }

    const company = COMPANIES.find((c) => c.id === companyId)!;

    const orders = await this.ordersRepository.find({
      where: { companyId, status: In(SALE_STATUSES) },
    });

    // Agrupa las ventas del rango por vendedor.
    type Acc = Omit<SellerRankingRow, 'position'>;
    const map = new Map<string, Acc>();
    let totalOrders = 0;
    let totalUnits = 0;
    let totalRevenue = 0;

    for (const order of orders) {
      const { date: orderDate } = bogotaParts(order.createdAt);
      if (orderDate < fromDate || orderDate > toDate) continue;

      const seller = order.seller;
      const key = seller?.id ?? 'sin-vendedor';
      const units = (order.items ?? []).reduce(
        (acc, it) => acc + Number(it.quantity),
        0,
      );
      const revenue = Number(order.total);

      const row =
        map.get(key) ??
        ({
          name: seller?.name ?? 'Sin vendedor',
          documentId: seller?.documentId,
          sellerCode: seller?.siesaSellerCode,
          orders: 0,
          units: 0,
          revenue: 0,
        } as Acc);
      row.orders += 1;
      row.units += units;
      row.revenue += revenue;
      map.set(key, row);

      totalOrders += 1;
      totalUnits += units;
      totalRevenue += revenue;
    }

    const rows: SellerRankingRow[] = [...map.values()]
      .sort(
        (a, b) =>
          b.revenue - a.revenue ||
          b.units - a.units ||
          a.name.localeCompare(b.name, 'es'),
      )
      .map((r, i) => ({ position: i + 1, ...r }));

    return {
      from: fromDate,
      to: toDate,
      companyId,
      companyName: company.name,
      rows,
      summary: {
        totalSellers: rows.length,
        totalOrders,
        totalUnits,
        totalRevenue,
      },
    };
  }

  /** Genera el PDF del ranking de vendedores. */
  async getSellerRankingReportPdf(
    companyId: string,
    from?: string,
    to?: string,
  ): Promise<{ buffer: Buffer; from: string; to: string }> {
    const data = await this.getSellerRankingReport(companyId, from, to);
    const buffer = await buildSellerRankingReportPdf(data);
    return { buffer, from: data.from, to: data.to };
  }

  /** Genera el Excel del ranking de vendedores. */
  async getSellerRankingReportExcel(
    companyId: string,
    from?: string,
    to?: string,
  ): Promise<{ buffer: Buffer; from: string; to: string }> {
    const data = await this.getSellerRankingReport(companyId, from, to);
    const buffer = buildSellerRankingReportExcel(data);
    return { buffer, from: data.from, to: data.to };
  }

  /**
   * Construye el reporte vendedor–producto de una compañía en un rango de
   * fechas (hora de Colombia): por cada combinación de vendedor y producto, las
   * unidades vendidas y los ingresos. Permite filtrar por un vendedor concreto
   * (`sellerId`) y/o por una búsqueda de producto (`search`, por referencia o
   * nombre). Las filas se ordenan por vendedor y, dentro de cada uno, de mayor
   * a menor por ingresos.
   */
  async getSellerProductReport(
    companyId: string,
    from?: string,
    to?: string,
    sellerId?: string,
    sku?: string,
  ): Promise<SellerProductReportData> {
    if (!isValidCompany(companyId)) {
      throw new BadRequestException('Compañía inválida.');
    }
    const today = bogotaToday();
    const fromDate = from?.trim() || today;
    const toDate = to?.trim() || today;
    if (fromDate > toDate) {
      throw new BadRequestException(
        'La fecha inicial no puede ser mayor que la final.',
      );
    }
    const sellerFilter = sellerId?.trim() || '';
    const skuFilter = sku?.trim() || '';

    const company = COMPANIES.find((c) => c.id === companyId)!;

    const orders = await this.ordersRepository.find({
      where: { companyId, status: In(SALE_STATUSES) },
    });

    // Vendedores y productos con ventas en el rango (para los selectores).
    const sellersMap = new Map<string, string>();
    const productsMap = new Map<string, string>();
    // Acumula por (vendedor + referencia).
    const map = new Map<string, SellerProductRow>();
    let totalQuantity = 0;
    let totalRevenue = 0;
    let sellerName = '';
    let productName = '';

    for (const order of orders) {
      const { date: orderDate } = bogotaParts(order.createdAt);
      if (orderDate < fromDate || orderDate > toDate) continue;

      const seller = order.seller;
      const sid = seller?.id ?? 'sin-vendedor';
      const sname = seller?.name ?? 'Sin vendedor';
      sellersMap.set(sid, sname);

      // Filtro por vendedor concreto.
      if (sellerFilter && sid !== sellerFilter) continue;
      if (sellerFilter) sellerName = sname;

      for (const item of order.items ?? []) {
        // Opciones de producto del selector: todos los del vendedor/rango,
        // sin aplicar todavía el filtro de producto seleccionado.
        productsMap.set(item.sku, item.productName);

        // Filtro por producto (referencia exacta del selector).
        if (skuFilter && item.sku !== skuFilter) continue;
        if (skuFilter) productName = item.productName;

        const key = `${sid}__${item.sku}`;
        const row =
          map.get(key) ??
          ({
            sellerId: sid,
            sellerName: sname,
            documentId: seller?.documentId,
            sellerCode: seller?.siesaSellerCode,
            sku: item.sku,
            productName: item.productName,
            unitOfMeasure: item.unitOfMeasure,
            quantity: 0,
            revenue: 0,
          } as SellerProductRow);
        row.quantity += Number(item.quantity);
        row.revenue += Number(item.lineTotal);
        map.set(key, row);

        totalQuantity += Number(item.quantity);
        totalRevenue += Number(item.lineTotal);
      }
    }

    const rows: SellerProductRow[] = [...map.values()].sort(
      (a, b) =>
        a.sellerName.localeCompare(b.sellerName, 'es') ||
        b.revenue - a.revenue ||
        b.quantity - a.quantity ||
        a.productName.localeCompare(b.productName, 'es'),
    );

    const sellers: SellerOption[] = [...sellersMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const products: ProductOption[] = [...productsMap.entries()]
      .map(([s, name]) => ({ sku: s, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    return {
      from: fromDate,
      to: toDate,
      companyId,
      companyName: company.name,
      sellerName: sellerFilter ? sellerName : undefined,
      search: skuFilter || undefined,
      productName: skuFilter ? productName : undefined,
      sellers,
      products,
      rows,
      summary: {
        totalRows: rows.length,
        totalQuantity,
        totalRevenue,
      },
    };
  }

  /** Genera el PDF del reporte vendedor–producto. */
  async getSellerProductReportPdf(
    companyId: string,
    from?: string,
    to?: string,
    sellerId?: string,
    sku?: string,
  ): Promise<{ buffer: Buffer; from: string; to: string }> {
    const data = await this.getSellerProductReport(
      companyId,
      from,
      to,
      sellerId,
      sku,
    );
    const buffer = await buildSellerProductReportPdf(data);
    return { buffer, from: data.from, to: data.to };
  }

  /** Genera el Excel del reporte vendedor–producto. */
  async getSellerProductReportExcel(
    companyId: string,
    from?: string,
    to?: string,
    sellerId?: string,
    sku?: string,
  ): Promise<{ buffer: Buffer; from: string; to: string }> {
    const data = await this.getSellerProductReport(
      companyId,
      from,
      to,
      sellerId,
      sku,
    );
    const buffer = buildSellerProductReportExcel(data);
    return { buffer, from: data.from, to: data.to };
  }

  /**
   * Reporte "mejor vendedor por producto": por cada producto, el ranking de
   * vendedores ordenado por unidades vendidas (el #1 es quien más vendió).
   */
  async getProductSellerReport(
    companyId: string,
    from?: string,
    to?: string,
    sku?: string,
  ): Promise<ProductSellerReportData> {
    if (!isValidCompany(companyId)) {
      throw new BadRequestException('Compañía inválida.');
    }
    const today = bogotaToday();
    const fromDate = from?.trim() || today;
    const toDate = to?.trim() || today;
    if (fromDate > toDate) {
      throw new BadRequestException(
        'La fecha inicial no puede ser mayor que la final.',
      );
    }
    const skuFilter = sku?.trim() || '';

    const company = COMPANIES.find((c) => c.id === companyId)!;

    const orders = await this.ordersRepository.find({
      where: { companyId, status: In(SALE_STATUSES) },
    });

    // Productos con ventas en el rango (para el selector del front).
    const productsMap = new Map<string, string>();
    // Acumula por (referencia + vendedor).
    const map = new Map<
      string,
      Omit<ProductSellerRow, 'position' | 'isTop'>
    >();
    let totalQuantity = 0;
    let totalRevenue = 0;
    let productName = '';

    for (const order of orders) {
      const { date: orderDate } = bogotaParts(order.createdAt);
      if (orderDate < fromDate || orderDate > toDate) continue;

      const seller = order.seller;
      const sid = seller?.id ?? 'sin-vendedor';
      const sname = seller?.name ?? 'Sin vendedor';

      for (const item of order.items ?? []) {
        productsMap.set(item.sku, item.productName);

        // Filtro por producto (referencia exacta del selector).
        if (skuFilter && item.sku !== skuFilter) continue;
        if (skuFilter) productName = item.productName;

        const key = `${item.sku}__${sid}`;
        const row =
          map.get(key) ??
          ({
            sku: item.sku,
            productName: item.productName,
            unitOfMeasure: item.unitOfMeasure,
            sellerId: sid,
            sellerName: sname,
            documentId: seller?.documentId,
            sellerCode: seller?.siesaSellerCode,
            quantity: 0,
            revenue: 0,
          } as Omit<ProductSellerRow, 'position' | 'isTop'>);
        row.quantity += Number(item.quantity);
        row.revenue += Number(item.lineTotal);
        map.set(key, row);

        totalQuantity += Number(item.quantity);
        totalRevenue += Number(item.lineTotal);
      }
    }

    // Agrupa por producto para calcular posiciones dentro de cada uno.
    const byProduct = new Map<
      string,
      { name: string; items: Omit<ProductSellerRow, 'position' | 'isTop'>[] }
    >();
    for (const row of map.values()) {
      const group = byProduct.get(row.sku) ?? {
        name: row.productName,
        items: [],
      };
      group.items.push(row);
      byProduct.set(row.sku, group);
    }

    // Ordena los productos por nombre y, dentro, los vendedores por unidades.
    const sortedProducts = [...byProduct.entries()].sort((a, b) =>
      a[1].name.localeCompare(b[1].name, 'es'),
    );

    const rows: ProductSellerRow[] = [];
    for (const [, group] of sortedProducts) {
      const ranked = group.items.sort(
        (a, b) =>
          b.quantity - a.quantity ||
          b.revenue - a.revenue ||
          a.sellerName.localeCompare(b.sellerName, 'es'),
      );
      ranked.forEach((r, idx) => {
        rows.push({ ...r, position: idx + 1, isTop: idx === 0 });
      });
    }

    const products: ProductOption[] = [...productsMap.entries()]
      .map(([s, name]) => ({ sku: s, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    return {
      from: fromDate,
      to: toDate,
      companyId,
      companyName: company.name,
      search: skuFilter || undefined,
      productName: skuFilter ? productName : undefined,
      products,
      rows,
      summary: {
        totalProducts: byProduct.size,
        totalQuantity,
        totalRevenue,
      },
    };
  }

  /** Genera el PDF del reporte mejor-vendedor-por-producto. */
  async getProductSellerReportPdf(
    companyId: string,
    from?: string,
    to?: string,
    sku?: string,
  ): Promise<{ buffer: Buffer; from: string; to: string }> {
    const data = await this.getProductSellerReport(companyId, from, to, sku);
    const buffer = await buildProductSellerReportPdf(data);
    return { buffer, from: data.from, to: data.to };
  }

  /** Genera el Excel del reporte mejor-vendedor-por-producto. */
  async getProductSellerReportExcel(
    companyId: string,
    from?: string,
    to?: string,
    sku?: string,
  ): Promise<{ buffer: Buffer; from: string; to: string }> {
    const data = await this.getProductSellerReport(companyId, from, to, sku);
    const buffer = buildProductSellerReportExcel(data);
    return { buffer, from: data.from, to: data.to };
  }

  /**
   * Venta facturada en el ERP por vendedor (mes actual y anterior), misma
   * fuente que el tablero comercial: AGROPECUARIA por NIT desde
   * `dashboard-comercial`; CARNES FRIAS por nombre desde
   * `ventas-periodo-inversiones` (valor bruto sin IVA, en unidades).
   */
  private async getErpSellerSales(
    companyId: string,
    sellers: { id: string; name: string; documentId: string }[],
    cur: { periodo: string; from: string; to: string },
    prev: { periodo: string; from: string; to: string },
  ): Promise<SellerSalesMaps> {
    const result: SellerSalesMaps = { cur: new Map(), prev: new Map() };
    const add = (
      map: Map<string, { revenue: number; kilos: number }>,
      sellerId: string,
      revenue: number,
      kilos: number,
    ) => {
      const acc = map.get(sellerId) ?? { revenue: 0, kilos: 0 };
      acc.revenue += revenue;
      acc.kilos += kilos;
      map.set(sellerId, acc);
    };

    if (companyId === '8') {
      const rows = await this.priceListsService.getInversionesSales(
        '8',
        prev.periodo,
        cur.periodo,
      );
      for (const r of rows) {
        const periodo = String(r.periodo);
        const target =
          periodo === cur.periodo
            ? result.cur
            : periodo === prev.periodo
              ? result.prev
              : null;
        if (!target) continue;
        const seller = sellers.find((s) =>
          sameSellerName(s.name, r.vendedor ?? ''),
        );
        if (!seller) continue;
        add(
          target,
          seller.id,
          Number(r.vr_bruto) || 0,
          Number(r.cantidad) || 0,
        );
      }
      return result;
    }

    const byNit = new Map(
      sellers
        .filter((s) => (s.documentId ?? '').trim())
        .map((s) => [s.documentId.trim(), s.id]),
    );
    const [curRows, prevRows] = await Promise.all([
      this.priceListsService.getVendorMonthlySales(
        companyId,
        cur.periodo,
        cur.from,
        cur.to,
      ),
      this.priceListsService.getVendorMonthlySales(
        companyId,
        prev.periodo,
        prev.from,
        prev.to,
      ),
    ]);
    for (const [rows, target] of [
      [curRows, result.cur],
      [prevRows, result.prev],
    ] as const) {
      for (const g of rows) {
        const sellerId = byNit.get((g.nit_vendedor ?? '').trim());
        if (!sellerId) continue;
        add(
          target,
          sellerId,
          Number(g.total_facturas) || 0,
          Number(g.kilos) || 0,
        );
      }
    }
    return result;
  }

  /** Venta por vendedor desde los pedidos de la app + ventas por canal del ERP. */
  private async getAppSellerSales(
    companyId: string,
    sellers: { id: string; siesaSellerCode: string }[],
    cur: { from: string; to: string },
    prev: { from: string; to: string },
  ): Promise<SellerSalesMaps> {
    // Bogotá es UTC-5 todo el año.
    const orders = await this.ordersRepository.find({
      where: {
        companyId,
        status: In(SALE_STATUSES),
        createdAt: Between(
          new Date(`${prev.from}T00:00:00-05:00`),
          new Date(`${cur.to}T23:59:59.999-05:00`),
        ),
      },
    });
    const result: SellerSalesMaps = { cur: new Map(), prev: new Map() };
    for (const order of orders) {
      const { date } = bogotaParts(order.createdAt);
      const target =
        date >= cur.from && date <= cur.to
          ? result.cur
          : date >= prev.from && date <= prev.to
            ? result.prev
            : null;
      if (!target || !order.seller?.id) continue;
      const kilos = (order.items ?? []).reduce(
        (acc, it) =>
          acc +
          ((it.unitOfMeasure ?? '').trim().toUpperCase() === 'KG'
            ? Number(it.quantity)
            : 0),
        0,
      );
      const acc = target.get(order.seller.id) ?? { revenue: 0, kilos: 0 };
      acc.revenue += Number(order.total);
      acc.kilos += kilos;
      target.set(order.seller.id, acc);
    }

    const [chCurRows, chPrevRows] = await Promise.all([
      this.channelSalesClient.fetch(companyId, cur.from, cur.to),
      this.channelSalesClient.fetch(companyId, prev.from, prev.to),
    ]);
    for (const [rows, target] of [
      [chCurRows, result.cur],
      [chPrevRows, result.prev],
    ] as const) {
      const byCode = this.sumChannelsByCode(rows);
      for (const s of sellers) {
        const ch = byCode.get((s.siesaSellerCode ?? '').trim());
        if (!ch) continue;
        const acc = target.get(s.id) ?? { revenue: 0, kilos: 0 };
        acc.revenue += ch.revenue;
        acc.kilos += ch.kilos;
        target.set(s.id, acc);
      }
    }
    return result;
  }

  /** Suma las ventas por canal por código de vendedor (pesos y kilos). */
  private sumChannelsByCode(
    rows: ChannelSaleRaw[],
  ): Map<string, { revenue: number; kilos: number }> {
    const map = new Map<string, { revenue: number; kilos: number }>();
    for (const r of rows) {
      const code = (r.codigo_vendedor ?? '').trim();
      if (!code) continue;
      const revenue = Number(r.valor_neto ?? r.valor_bruto ?? 0);
      const kilos = Number(r.cantidad ?? 0);
      const acc = map.get(code) ?? { revenue: 0, kilos: 0 };
      acc.revenue += revenue;
      acc.kilos += kilos;
      map.set(code, acc);
    }
    return map;
  }

  /**
   * Reporte de ventas por vendedor de una compañía para un mes: por cada
   * vendedor (rol vendedor) muestra el valor promedio por kilo del mes anterior
   * y del actual, el presupuesto de kilos y los kilos vendidos con su
   * cumplimiento, y la venta acumulada frente a la esperada (presupuesto en
   * pesos prorrateado a la fecha). AGROPECUARIA (3) y CARNES FRIAS (8) toman
   * la venta facturada del ERP (misma fuente que el tablero comercial); las
   * demás suman pedidos de la app + ventas por canal del ERP.
   */
  async getSellerSalesReport(
    companyId: string,
    month: number,
    year: number,
  ): Promise<SellerSalesReportData> {
    if (!isValidCompany(companyId)) {
      throw new BadRequestException('Compañía inválida.');
    }
    if (!month || month < 1 || month > 12 || !year) {
      throw new BadRequestException('Mes o año inválido.');
    }
    const company = COMPANIES.find((c) => c.id === companyId)!;

    const mm = String(month).padStart(2, '0');
    const monthStart = `${year}-${mm}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${mm}-${String(daysInMonth).padStart(2, '0')}`;

    const today = bogotaToday();
    const isCurrentMonth = today.slice(0, 7) === `${year}-${mm}`;
    const isFuture = monthStart > today;
    // Fecha de corte: hoy si es el mes en curso; el fin de mes si ya pasó.
    const asOfDate = isFuture ? monthStart : isCurrentMonth ? today : monthEnd;
    const daysElapsed = isFuture
      ? 0
      : isCurrentMonth
        ? Number(today.slice(8, 10))
        : daysInMonth;
    const idealPct = daysInMonth > 0 ? (daysElapsed / daysInMonth) * 100 : 0;
    const proration = daysInMonth > 0 ? daysElapsed / daysInMonth : 0;

    // Mes anterior (completo).
    const pMonth = month === 1 ? 12 : month - 1;
    const pYear = month === 1 ? year - 1 : year;
    const pmm = String(pMonth).padStart(2, '0');
    const prevStart = `${pYear}-${pmm}-01`;
    const prevDays = new Date(pYear, pMonth, 0).getDate();
    const prevEnd = `${pYear}-${pmm}-${String(prevDays).padStart(2, '0')}`;

    const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('es-CO', {
      month: 'long',
      year: 'numeric',
    });
    const prevMonthLabel = new Date(pYear, pMonth - 1, 1).toLocaleDateString(
      'es-CO',
      { month: 'long', year: 'numeric' },
    );

    // Vendedores (rol vendedor) de la compañía con su código de Siesa.
    const sellers = (
      await this.usersService.getCompanySellers(companyId)
    ).filter((s) => s.role === 'seller');

    const sales =
      (companyId === '3' || companyId === '8'
        ? await this.getErpSellerSales(
            companyId,
            sellers,
            { periodo: `${year}${mm}`, from: monthStart, to: asOfDate },
            { periodo: `${pYear}${pmm}`, from: prevStart, to: prevEnd },
          ).catch(() => null)
        : null) ??
      (await this.getAppSellerSales(
        companyId,
        sellers,
        { from: monthStart, to: asOfDate },
        { from: prevStart, to: prevEnd },
      ));
    const budgets = await Promise.all(
      sellers.map((s) =>
        this.budgetsService.getSellerBudget(companyId, s.id, month, year),
      ),
    );

    let totalPrevRevenue = 0;
    let totalPrevKilos = 0;
    const rows: SellerSalesRow[] = [];
    for (const [i, s] of sellers.entries()) {
      const code = (s.siesaSellerCode ?? '').trim();
      const cur = sales.cur.get(s.id) ?? { revenue: 0, kilos: 0 };
      const prev = sales.prev.get(s.id) ?? { revenue: 0, kilos: 0 };

      const revenue = cur.revenue;
      const kilosSold = cur.kilos;
      const prevRevenue = prev.revenue;
      const prevKilos = prev.kilos;
      totalPrevRevenue += prevRevenue;
      totalPrevKilos += prevKilos;

      const budget = budgets[i];
      const budgetKilos = budget?.targetKilos ?? 0;
      const budgetRevenue = budget?.expectedRevenue ?? 0;
      const expectedRevenue = budgetRevenue * proration;

      rows.push({
        name: s.name,
        sellerCode: code,
        avgKiloPrev: prevKilos > 0 ? prevRevenue / prevKilos : 0,
        budgetKilos,
        kilosSold,
        kilosPct: budgetKilos > 0 ? (kilosSold / budgetKilos) * 100 : null,
        revenue,
        expectedRevenue,
        revenuePct:
          expectedRevenue > 0 ? (revenue / expectedRevenue) * 100 : null,
        avgKiloCur: kilosSold > 0 ? revenue / kilosSold : 0,
      });
    }

    rows.sort(
      (a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, 'es'),
    );

    // Totales: solo la suma de los vendedores asignados (no incluye ventas sin
    // vendedor ni canal sin código).
    const totalBudgetKilos = rows.reduce((s, r) => s + r.budgetKilos, 0);
    const totalKilos = rows.reduce((s, r) => s + r.kilosSold, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const totalExpected = rows.reduce((s, r) => s + r.expectedRevenue, 0);

    return {
      month,
      year,
      monthLabel,
      prevMonthLabel,
      companyId,
      companyName: company.name,
      asOfDate,
      idealPct,
      rows,
      totals: {
        budgetKilos: totalBudgetKilos,
        kilosSold: totalKilos,
        kilosPct:
          totalBudgetKilos > 0 ? (totalKilos / totalBudgetKilos) * 100 : null,
        revenue: totalRevenue,
        expectedRevenue: totalExpected,
        revenuePct:
          totalExpected > 0 ? (totalRevenue / totalExpected) * 100 : null,
        avgKiloPrev: totalPrevKilos > 0 ? totalPrevRevenue / totalPrevKilos : 0,
        avgKiloCur: totalKilos > 0 ? totalRevenue / totalKilos : 0,
      },
    };
  }

  /** Genera el PDF del reporte de ventas por vendedor. */
  async getSellerSalesReportPdf(
    companyId: string,
    month: number,
    year: number,
  ): Promise<{ buffer: Buffer; month: number; year: number }> {
    const data = await this.getSellerSalesReport(companyId, month, year);
    const buffer = await buildSellerSalesReportPdf(data);
    return { buffer, month: data.month, year: data.year };
  }

  /** Genera el Excel del reporte de ventas por vendedor. */
  async getSellerSalesReportExcel(
    companyId: string,
    month: number,
    year: number,
  ): Promise<{ buffer: Buffer; month: number; year: number }> {
    const data = await this.getSellerSalesReport(companyId, month, year);
    const buffer = buildSellerSalesReportExcel(data);
    return { buffer, month: data.month, year: data.year };
  }

  /**
   * Reporte "Ventas acumuladas por vendedor por producto" para un período
   * (YYYYMM). Consulta el ERP, agrupa por vendedor y por producto usando la
   * venta neta (valor_neto) y la cantidad base, y ordena por venta descendente.
   */
  async getVendorProductSalesReport(
    periodo: string,
    fecha?: string,
    companyId = '3',
  ): Promise<VendorProductSalesReportData> {
    const clean = (periodo ?? '').trim();
    if (!/^\d{6}$/.test(clean)) {
      throw new BadRequestException('El período debe tener el formato YYYYMM.');
    }
    const day = (fecha ?? '').trim();
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new BadRequestException('La fecha debe tener el formato YYYY-MM-DD.');
    }

    const allRows = await this.priceListsService.getVendorProductSales(
      companyId,
      clean,
    );
    // Si se pide un día concreto, se filtra por la parte de fecha (YYYY-MM-DD).
    const rows = day
      ? allRows.filter((r) => (r.dia ?? r.fecha ?? '').slice(0, 10) === day)
      : allRows;

    // Agrupa por vendedor y dentro por producto (referencia).
    const sellersMap = new Map<
      string,
      {
        nit: string;
        name: string;
        products: Map<
          string,
          { referencia: string; descripcion: string; quantity: number; net: number }
        >;
      }
    >();

    // Solo se excluye al vendedor apartado (Juan Sierra). Los demás vendedores
    // del ERP se cuentan tal cual, incluido León Gutiérrez.
    for (const row of rows) {
      const nit = (row.nit_vendedor ?? '').trim();
      if (isDashboardExcludedSellerDoc(nit)) continue;
      const name =
        (row.razon_social_vendedor ?? '').trim() || 'SIN VENDEDOR';
      // El ERP ya no envía NIT: se agrupa por nombre cuando no hay NIT.
      const key = nit || name;
      const referencia = (row.referencia ?? '').trim() || '—';
      const descripcion = (row.descripcion ?? '').trim() || referencia;
      const quantity = Number(row.cantidad_base) || 0;
      const net = Number(row.valor_neto) || 0;

      let seller = sellersMap.get(key);
      if (!seller) {
        seller = { nit: nit || '—', name, products: new Map() };
        sellersMap.set(key, seller);
      }
      let product = seller.products.get(referencia);
      if (!product) {
        product = { referencia, descripcion, quantity: 0, net: 0 };
        seller.products.set(referencia, product);
      }
      product.quantity += quantity;
      product.net += net;
    }

    const sellers: VendorSalesGroup[] = Array.from(sellersMap.values()).map(
      (s) => {
        const products = Array.from(s.products.values()).sort(
          (a, b) => b.net - a.net,
        );
        const totalQuantity = products.reduce((acc, p) => acc + p.quantity, 0);
        const totalNet = products.reduce((acc, p) => acc + p.net, 0);
        return {
          nit: s.nit,
          name: s.name,
          products,
          totalQuantity,
          totalNet,
        };
      },
    );
    sellers.sort((a, b) => b.totalNet - a.totalNet);

    const grandTotalQuantity = sellers.reduce(
      (acc, s) => acc + s.totalQuantity,
      0,
    );
    const grandTotalNet = sellers.reduce((acc, s) => acc + s.totalNet, 0);

    const year = Number(clean.slice(0, 4));
    const monthNum = Number(clean.slice(4, 6));
    const monthLabel = new Date(year, monthNum - 1, 1).toLocaleDateString(
      'es-CO',
      { month: 'long', year: 'numeric' },
    );
    // Si hay filtro por día, la etiqueta muestra la fecha concreta.
    const periodLabel = day
      ? new Date(`${day}T12:00:00`).toLocaleDateString('es-CO', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : monthLabel;

    return {
      periodo: clean,
      fecha: day || undefined,
      periodLabel,
      sellers,
      grandTotalQuantity,
      grandTotalNet,
    };
  }

  /**
   * Pedidos (de la app) por vendedor para un período (YYYYMM) u opcionalmente
   * un día. Se toma de la base de datos (no del ERP), para comparar lo PEDIDO
   * contra lo VENDIDO. Suma los pedidos en estados de venta real.
   */
  async getOrdersBySellerReport(
    companyId: string,
    periodo: string,
    fecha?: string,
  ): Promise<OrdersBySellerReportData> {
    const clean = (periodo ?? '').trim();
    if (!/^\d{6}$/.test(clean)) {
      throw new BadRequestException('El período debe tener el formato YYYYMM.');
    }
    const day = (fecha ?? '').trim();
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new BadRequestException('La fecha debe tener el formato YYYY-MM-DD.');
    }
    const year = Number(clean.slice(0, 4));
    const monthNum = Number(clean.slice(4, 6));
    const mm = String(monthNum).padStart(2, '0');
    const lastDay = new Date(year, monthNum, 0).getDate();
    const from = day || `${year}-${mm}-01`;
    const to = day || `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;

    const excludedDocs = DASHBOARD_EXCLUDED_SELLER_DOCS.map((d) =>
      d.trim(),
    ).filter(Boolean);
    const qb = this.ordersRepository
      .createQueryBuilder('o')
      .leftJoin('o.seller', 'u')
      .select('o.seller_id', 'sellerId')
      .addSelect('MAX(u.name)', 'name')
      .addSelect('COALESCE(SUM(o.total), 0)', 'total')
      .addSelect('COUNT(*)', 'orders')
      .where('o.companyId = :companyId', { companyId })
      .andWhere('o.status IN (:...statuses)', { statuses: SALE_STATUSES })
      // Solo vendedores: se excluyen admins u otros roles que hayan creado pedidos.
      .andWhere('u.role = :sellerRole', { sellerRole: UserRole.SELLER })
      .andWhere(
        "(o.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN :from::date AND :to::date",
        { from, to },
      );
    if (excludedDocs.length > 0) {
      // Excluye del reporte a vendedores no contabilizables (Juan Sierra).
      qb.andWhere('TRIM(u.document_id) NOT IN (:...excludedDocs)', {
        excludedDocs,
      });
    }
    const rows = await qb
      .groupBy('o.seller_id')
      .getRawMany<{
        sellerId: string;
        name: string | null;
        total: string;
        orders: string;
      }>();

    const sellers = rows
      .map((r) => ({
        sellerId: r.sellerId,
        name: (r.name ?? '').trim() || 'Sin vendedor',
        total: Number(r.total) || 0,
        orders: Number(r.orders) || 0,
      }))
      .sort((a, b) => b.total - a.total);

    const grandTotal = sellers.reduce((s, x) => s + x.total, 0);
    const grandOrders = sellers.reduce((s, x) => s + x.orders, 0);

    const monthLabel = new Date(year, monthNum - 1, 1).toLocaleDateString(
      'es-CO',
      { month: 'long', year: 'numeric' },
    );
    const periodLabel = day
      ? new Date(`${day}T12:00:00`).toLocaleDateString('es-CO', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : monthLabel;

    return {
      periodo: clean,
      fecha: day || undefined,
      periodLabel,
      sellers,
      grandTotal,
      grandOrders,
    };
  }

  /** Genera el PDF del reporte de ventas acumuladas por vendedor por producto. */
  async getVendorProductSalesReportPdf(
    periodo: string,
    fecha?: string,
    companyId = '3',
  ): Promise<{ buffer: Buffer; periodo: string }> {
    const data = await this.getVendorProductSalesReport(periodo, fecha, companyId);
    const buffer = await buildVendorProductSalesReportPdf(data, companyId);
    return { buffer, periodo: data.periodo };
  }

  /** Genera el Excel del reporte de ventas acumuladas por vendedor por producto. */
  async getVendorProductSalesReportExcel(
    periodo: string,
    fecha?: string,
    companyId = '3',
  ): Promise<{ buffer: Buffer; periodo: string }> {
    const data = await this.getVendorProductSalesReport(periodo, fecha, companyId);
    const buffer = buildVendorProductSalesReportExcel(data);
    return { buffer, periodo: data.periodo };
  }
}
