import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { ClientRecord } from '../clients/entities/client-record.entity';
import { UserCompany } from '../users/entities/user-company.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { bogotaToday } from '../orders/order-cortes';
import { BudgetsService } from '../budgets/budgets.service';
import { ProductCostsService } from '../product-costs/product-costs.service';
import {
  baseCompanyId,
  isDashboardExcludedSellerDoc,
  DASHBOARD_EXCLUDED_SELLER_DOCS,
} from '../../common/companies';
import { ChannelSalesClient, ChannelSaleRaw } from '../channel-sales/channel-sales.client';
import { PriceListsService } from '../price-lists/price-lists.service';
import { VendorProductSaleRaw } from '../price-lists/price-lists.client';

/** Estados que representan una venta real (excluye borradores y cancelados). */
const SALE_STATUSES = [
  OrderStatus.CONFIRMED,
  OrderStatus.SYNCING,
  OrderStatus.SYNCED,
  OrderStatus.FAILED,
];

/** Tablero de gestión comercial de un vendedor para un mes concreto. */
export interface SellerCommercialDashboard {
  period: { month: number; year: number; day: number | null; label: string };
  generatedAt: string;
  seller: { id: string; name: string };
  totals: {
    /** Ventas acumuladas del mes (pesos, con IVA). */
    revenue: number;
    /** Tickets facturados (número de pedidos). */
    orders: number;
    /** Clientes atendidos (distintos con pedido en el mes). */
    customersServed: number;
    /** Clientes activos asignados al vendedor (cartera). */
    activeCustomers: number;
    /** Ticket promedio (pesos). */
    avgTicket: number;
    /** Kilos vendidos en el mes (pedidos KG + canales). */
    kilosSold: number;
    /** Total en pesos SOLO de pedidos de la app (sin ventas de canal). */
    orderRevenue: number;
    /** Total en kilos SOLO de pedidos de la app (sin ventas de canal). */
    orderKilos: number;
  };
  growth: {
    /** Crecimiento de ventas vs. el mes anterior (porcentaje) o null. */
    revenuePct: number | null;
    /** Crecimiento de kilos vendidos vs. el mes anterior (porcentaje) o null. */
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
  /** Ventas por corte (producto) del mes. */
  salesByCut: {
    name: string;
    quantity: number;
    revenue: number;
  }[];
  /** Ventas por canal (desde el ERP), agrupadas por descripción del canal. */
  salesByChannel: {
    name: string;
    kilos: number;
    revenue: number;
  }[];
  /**
   * Ventas agrupadas por categoría (Canales, Cortes, Subproductos, Otros) con
   * el detalle de sus ítems, para el desglose y el modal por categoría (ERP).
   */
  salesByCategory?: {
    category: string;
    kilos: number;
    revenue: number;
    items: { name: string; ref: string; kilos: number; revenue: number }[];
  }[];
  /** Presupuesto (meta) del vendedor para el mes, si está cargado. */
  budget: { expectedRevenue: number; targetKilos: number } | null;
  /** Proyección de ventas de la compañía para el mes (total), si existe. */
  projection: { revenue: number; kilos: number } | null;
  /**
   * Rentabilidad del período (venta − costo estándar cargado). `null` si no hay
   * costos cargados o la compañía no tiene ventas del ERP.
   */
  profitability: {
    cost: number;
    margin: number;
    marginPct: number | null;
  } | null;
  /**
   * Desglose de presupuesto POR cliente/tienda para vendedores "por cliente"
   * (p. ej. Juan Sierra): meta vs. venta real de cada tienda. `null` para los
   * vendedores normales.
   */
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

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemsRepository: Repository<OrderItem>,
    @InjectRepository(ClientRecord)
    private readonly clientsRepository: Repository<ClientRecord>,
    @InjectRepository(UserCompany)
    private readonly userCompaniesRepository: Repository<UserCompany>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly budgetsService: BudgetsService,
    private readonly productCostsService: ProductCostsService,
    private readonly channelSalesClient: ChannelSalesClient,
    private readonly priceListsService: PriceListsService,
  ) {}

  /** Pasa created_at a fecha local de Colombia y la limita a un rango. */
  private readonly bogotaDateFilter =
    "(o.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN :from::date AND :to::date";

  /** Expresión SQL que pasa created_at a fecha local de Colombia (YYYY-MM-DD). */
  private readonly bogotaDateExpr =
    "TO_CHAR((o.created_at AT TIME ZONE 'America/Bogota'), 'YYYY-MM-DD')";

  /** Expresión SQL que extrae la hora (00–23) en hora local de Colombia. */
  private readonly bogotaHourExpr =
    "TO_CHAR((o.created_at AT TIME ZONE 'America/Bogota'), 'HH24')";

  /** Devuelve el primer y último día (YYYY-MM-DD) de un mes. */
  private monthRange(month: number, year: number): { from: string; to: string } {
    const mm = String(month).padStart(2, '0');
    const from = `${year}-${mm}-01`;
    const last = new Date(year, month, 0).getDate();
    const to = `${year}-${mm}-${String(last).padStart(2, '0')}`;
    return { from, to };
  }

  private shiftDate(date: string, days: number): string {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /** Número de días entre dos fechas YYYY-MM-DD (to - from). */
  private daysBetween(from: string, to: string): number {
    const a = new Date(`${from}T12:00:00`).getTime();
    const b = new Date(`${to}T12:00:00`).getTime();
    return Math.round((b - a) / 86400000);
  }

  private prettyDay(date: string): string {
    return new Date(`${date}T12:00:00`).toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  /** Lista de períodos (YYYYMM) que cubre un rango de fechas. */
  private periodsBetween(from: string, to: string): string[] {
    const res: string[] = [];
    let y = Number(from.slice(0, 4));
    let m = Number(from.slice(5, 7));
    const ey = Number(to.slice(0, 4));
    const em = Number(to.slice(5, 7));
    let guard = 0;
    while ((y < ey || (y === ey && m <= em)) && guard < 36) {
      res.push(`${y}${String(m).padStart(2, '0')}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
      guard++;
    }
    return res;
  }

  /**
   * Ventas del/los vendedor(es) desde el ERP (vendedor-productos-mes) para un
   * rango de fechas: filtra por NIT (documento del vendedor) y por la fecha del
   * movimiento, y agrega pesos (valor_bruto; las líneas negativas son
   * devoluciones y restan), kilos (cantidad_base), total por día, por producto
   * y por criterio (canal).
   */
  private async getErpSales(
    nits: Set<string>,
    from: string,
    to: string,
    costMap?: Map<string, number>,
    exclude?: { nits: Set<string>; codes: Set<string>; names: Set<string> },
  ): Promise<{
    revenue: number;
    kilos: number;
    cost: number;
    byDay: Map<string, number>;
    byProduct: { name: string; quantity: number; revenue: number }[];
    byCanal: { name: string; kilos: number; revenue: number }[];
    byCategory: {
      category: string;
      kilos: number;
      revenue: number;
      items: { name: string; ref: string; kilos: number; revenue: number }[];
    }[];
  }> {
    const rows: VendorProductSaleRaw[] = [];
    for (const periodo of this.periodsBetween(from, to)) {
      // Se trae el MES completo (detalle por día) para poder graficar la
      // tendencia; los totales se filtran luego por el rango seleccionado.
      const r = await this.priceListsService.getVendorProductSales('3', periodo);
      rows.push(...r);
    }

    let revenue = 0;
    let kilos = 0;
    let cost = 0;
    const byDay = new Map<string, number>();
    // Cortes (todo lo que NO es un canal entero) y canales (CANAL DE ...) por
    // separado, cada uno agrupado por referencia de producto.
    const prodMap = new Map<
      string,
      { name: string; quantity: number; revenue: number }
    >();
    const canalMap = new Map<
      string,
      { name: string; kilos: number; revenue: number }
    >();
    // Agrupación por categoría (Canales/Cortes/Subproductos/Otros) con el
    // detalle de cada ítem, para el desglose unificado y su modal.
    const categoryMap = new Map<
      string,
      {
        kilos: number;
        revenue: number;
        items: Map<
          string,
          { name: string; ref: string; kilos: number; revenue: number }
        >;
      }
    >();

    const filterByNit = nits.size > 0;
    for (const row of rows) {
      const nit = (row.nit_vendedor ?? '').trim();
      if (filterByNit && !nits.has(nit)) continue;
      // Se descuentan las ventas de los vendedores excluidos del consolidado
      // general (p. ej. Juan Sierra): se cruza por NIT, código o razón social.
      if (exclude) {
        const code = (row.codigo_vendedor ?? '').trim();
        const razon = (row.razon_social_vendedor ?? '').trim().toUpperCase();
        if (
          (nit && exclude.nits.has(nit)) ||
          (code && exclude.codes.has(code)) ||
          (razon && exclude.names.has(razon))
        ) {
          continue;
        }
      }
      // Fecha del movimiento (el endpoint volvió a traer `dia`).
      const day = (row.dia ?? row.fecha ?? '').slice(0, 10);
      if (!day) continue;
      const ref = (row.referencia ?? '').trim() || '—';
      const name = (row.descripcion ?? '').trim() || ref;
      const crit = (row.criterio_producto ?? '').trim().toUpperCase();
      // Los SERVICIOS (desposte, sacrificio, transporte, alquiler, etc.) no son
      // productos: se identifican por `criterio_producto` = SERVICIO, con
      // respaldo por referencia 99xxx / descripción "SERVICIO ...".
      if (
        crit === 'SERVICIO' ||
        ref.startsWith('99') ||
        name.toUpperCase().startsWith('SERVICIO')
      ) {
        continue;
      }
      // Solo se incluyen productos de la agropecuaria: canales, cortes y
      // subproductos. El resto (víveres, embutidos, etc.) pertenece a OTRA
      // compañía y NO debe sumarse ni mostrarse en este tablero.
      const esCanal = crit === 'CANAL' || name.toUpperCase().startsWith('CANAL');
      const category = esCanal
        ? 'Canales'
        : crit === 'CORTE'
          ? 'Cortes'
          : crit === 'SUBPRODUCTO'
            ? 'Subproductos'
            : null;
      if (!category) continue;
      // Se consolida la venta con el VALOR BRUTO (total_facturas). Las líneas
      // negativas (devoluciones) ya vienen restadas.
      const bruto = Number(row.valor_bruto) || 0;
      // La tendencia diaria usa TODOS los días del período (sin filtrar por el
      // rango) para graficar la evolución del mes.
      byDay.set(day, (byDay.get(day) ?? 0) + bruto);
      if (day < from || day > to) continue;
      const qty = Number(row.cantidad_base) || 0;
      revenue += bruto;
      kilos += qty;
      // Costo real del ERP (costo_total por producto).
      cost += Number(row.costo_total) || 0;
      let cat = categoryMap.get(category);
      if (!cat) {
        cat = { kilos: 0, revenue: 0, items: new Map() };
        categoryMap.set(category, cat);
      }
      cat.kilos += qty;
      cat.revenue += bruto;
      const it = cat.items.get(ref) ?? { name, ref, kilos: 0, revenue: 0 };
      it.kilos += qty;
      it.revenue += bruto;
      cat.items.set(ref, it);
      // Los canales enteros (CANAL DE CERDO/NOVILLA/NOVILLO/VACA) van a su
      // propia tarjeta; el resto (cortes, subproductos, etc.) a la de productos.
      if (esCanal) {
        const cg = canalMap.get(ref) ?? { name, kilos: 0, revenue: 0 };
        cg.kilos += qty;
        cg.revenue += bruto;
        canalMap.set(ref, cg);
      } else {
        const pg = prodMap.get(ref) ?? { name, quantity: 0, revenue: 0 };
        pg.quantity += qty;
        pg.revenue += bruto;
        prodMap.set(ref, pg);
      }
    }

    const byProduct = [...prodMap.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 12);
    const byCanal = [...canalMap.values()]
      .map((c) => ({ name: c.name, kilos: c.kilos, revenue: c.revenue }))
      .sort((a, b) => b.revenue - a.revenue);
    // Se listan SIEMPRE los canales conocidos, aunque estén en cero, para saber
    // si se están vendiendo o no. Los que sí tienen venta van arriba (ya
    // ordenados); los que faltan se agregan en cero al final.
    const CANALES_CONOCIDOS = [
      'CANAL DE CERDO',
      'CANAL DE NOVILLO',
      'CANAL DE NOVILLA',
      'CANAL DE VACA',
    ];
    const presentes = new Set(byCanal.map((c) => c.name.trim().toUpperCase()));
    for (const nombre of CANALES_CONOCIDOS) {
      if (!presentes.has(nombre)) {
        byCanal.push({ name: nombre, kilos: 0, revenue: 0 });
      }
    }

    // Se garantizan las categorías principales (aunque estén en cero) y se
    // ordenan por venta descendente; los ítems de cada una también.
    for (const c of ['Canales', 'Cortes', 'Subproductos']) {
      if (!categoryMap.has(c)) {
        categoryMap.set(c, { kilos: 0, revenue: 0, items: new Map() });
      }
    }
    const byCategory = [...categoryMap.entries()]
      .map(([category, v]) => ({
        category,
        kilos: v.kilos,
        revenue: v.revenue,
        items: [...v.items.values()].sort((a, b) => b.revenue - a.revenue),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // La venta acumulada, los kilos y el costo se toman de la consulta GENERAL
    // del ERP (dashboard-comercial) filtrada por vendedor: es la facturación
    // real. El desglose (tendencia, productos, canales, categorías) sigue del
    // detalle producto a producto. Si la consulta general falla, se usan los
    // totales del detalle como respaldo.
    const general = await this.getErpGeneralTotals(nits, from, to, exclude).catch(
      () => null,
    );
    return {
      revenue: general ? general.revenue : revenue,
      kilos: general ? general.kilos : kilos,
      cost: general ? general.cost : cost,
      byDay,
      byProduct,
      byCanal,
      byCategory,
    };
  }

  /**
   * Facturación real del ERP para CARNES FRIAS (cía 8): venta (total_facturas) y
   * UNIDADES (cantidad). Filtra por NIT del vendedor, excluye servicios y a los
   * vendedores excluidos del tablero (Juan Sierra, INVERSIONES SERRANO MILLAN).
   * Devuelve además la venta por día para la tendencia.
   */
  private async getErpFacturado(
    companyId: string,
    nits: Set<string>,
    from: string,
    to: string,
    exclude?: { nits: Set<string>; codes: Set<string>; names: Set<string> },
  ): Promise<{ revenue: number; units: number; byDay: Map<string, number> }> {
    let revenue = 0;
    let units = 0;
    const byDay = new Map<string, number>();
    const filterByNit = nits.size > 0;
    for (const periodo of this.periodsBetween(from, to)) {
      const rows = await this.priceListsService.getVendorProductSales(
        companyId,
        periodo,
      );
      for (const row of rows) {
        const nit = (row.nit_vendedor ?? '').trim();
        if (filterByNit && !nits.has(nit)) continue;
        if (isDashboardExcludedSellerDoc(nit)) continue;
        if (exclude) {
          const code = (row.codigo_vendedor ?? '').trim();
          const razon = (row.razon_social_vendedor ?? '').trim().toUpperCase();
          if (
            (nit && exclude.nits.has(nit)) ||
            (code && exclude.codes.has(code)) ||
            (razon && exclude.names.has(razon))
          ) {
            continue;
          }
        }
        const ref = (row.referencia ?? '').trim();
        const name = (row.descripcion ?? '').trim();
        const crit = (row.criterio_producto ?? '').trim().toUpperCase();
        if (
          crit === 'SERVICIO' ||
          ref.startsWith('99') ||
          name.toUpperCase().startsWith('SERVICIO')
        ) {
          continue;
        }
        const day = (row.dia ?? row.fecha ?? '').slice(0, 10);
        if (!day) continue;
        const bruto = Number(row.valor_bruto) || 0;
        byDay.set(day, (byDay.get(day) ?? 0) + bruto);
        if (day < from || day > to) continue;
        revenue += bruto;
        units += Number(row.cantidad_base) || 0;
      }
    }
    return { revenue, units, byDay };
  }

  /**
   * Totales (venta, kilos, costo) por vendedor desde la consulta GENERAL del
   * ERP (`dashboard-comercial`). Filtra por NIT del vendedor cuando aplica y
   * descuenta los vendedores excluidos del consolidado (p. ej. Juan Sierra).
   */
  private async getErpGeneralTotals(
    nits: Set<string>,
    from: string,
    to: string,
    exclude?: { nits: Set<string>; codes: Set<string>; names: Set<string> },
  ): Promise<{ revenue: number; kilos: number; cost: number }> {
    const filterByNit = nits.size > 0;
    let revenue = 0;
    let kilos = 0;
    let cost = 0;
    for (const periodo of this.periodsBetween(from, to)) {
      const monthStart = `${periodo.slice(0, 4)}-${periodo.slice(4, 6)}-01`;
      const monthEnd = this.endOfMonth(monthStart);
      const fi = from > monthStart ? from : monthStart;
      const ff = to < monthEnd ? to : monthEnd;
      const rows = await this.priceListsService.getVendorMonthlySales(
        '3',
        periodo,
        fi,
        ff,
      );
      for (const g of rows) {
        const nit = (g.nit_vendedor ?? '').trim();
        if (filterByNit && !nits.has(nit)) continue;
        // Se descuentan los vendedores excluidos del consolidado (Juan Sierra).
        if (exclude) {
          const code = (g.codigo_vendedor ?? '').trim();
          const razon = (g.razon_social_vendedor ?? '').trim().toUpperCase();
          if (
            (nit && exclude.nits.has(nit)) ||
            (code && exclude.codes.has(code)) ||
            (razon && exclude.names.has(razon))
          ) {
            continue;
          }
        }
        revenue += Number(g.total_facturas) || 0;
        kilos += Number(g.kilos) || 0;
        cost += Number(g.costo_total) || 0;
      }
    }
    return { revenue, kilos, cost };
  }

  /** Último día (YYYY-MM-DD) del mes de una fecha. */
  private endOfMonth(date: string): string {
    const y = Number(date.slice(0, 4));
    const m = Number(date.slice(5, 7));
    const last = new Date(y, m, 0).getDate();
    return `${date.slice(0, 7)}-${String(last).padStart(2, '0')}`;
  }

  /** Construye la tendencia diaria (pesos por día) a partir de las ventas ERP. */
  private buildErpTrend(
    from: string,
    to: string,
    byDay: Map<string, number>,
  ): SellerCommercialDashboard['salesTrend'] {
    const today = bogotaToday();
    const end = to < today ? to : today;
    const trend: SellerCommercialDashboard['salesTrend'] = [];
    let cursor = from;
    let guard = 0;
    while (cursor <= end && guard < 400) {
      trend.push({ date: cursor, revenue: byDay.get(cursor) ?? 0, orders: 0 });
      cursor = this.shiftDate(cursor, 1);
      guard++;
    }
    return trend;
  }

  /**
   * Tablero de "Negocios Nacionales": el mismo tablero comercial pero fijado al
   * vendedor apartado (Juan Sierra), identificado por su cédula en
   * {@link DASHBOARD_EXCLUDED_SELLER_DOCS}.
   */
  async getNationalBusinessDashboard(
    companyId: string,
    month: number,
    year: number,
    day?: number,
    rangeFrom?: string,
    rangeTo?: string,
  ): Promise<SellerCommercialDashboard> {
    const docs = new Set(DASHBOARD_EXCLUDED_SELLER_DOCS.map((d) => d.trim()));
    const users = await this.usersRepository.find();
    const seller = users.find((u) => docs.has((u.documentId ?? '').trim()));
    if (!seller) {
      throw new NotFoundException(
        'No hay un vendedor de negocios nacionales configurado.',
      );
    }
    return this.getSellerDashboard(
      companyId,
      seller.id,
      month,
      year,
      day,
      false,
      rangeFrom,
      rangeTo,
    );
  }

  async getSellerDashboard(
    companyId: string,
    sellerId: string,
    month: number,
    year: number,
    day?: number,
    allSellers = false,
    rangeFrom?: string,
    rangeTo?: string,
  ): Promise<SellerCommercialDashboard> {
    // El rango puede venir explícito (desde/hasta) o derivarse de mes/día. El
    // período anterior (para el crecimiento) es el rango de igual longitud
    // inmediatamente anterior.
    let from: string;
    let to: string;
    let prevFrom: string;
    let prevTo: string;
    let singleDay: boolean;
    if (rangeFrom && rangeTo) {
      from = rangeFrom <= rangeTo ? rangeFrom : rangeTo;
      to = rangeFrom <= rangeTo ? rangeTo : rangeFrom;
      singleDay = from === to;
      const len = this.daysBetween(from, to) + 1;
      prevTo = this.shiftDate(from, -1);
      prevFrom = this.shiftDate(prevTo, -(len - 1));
      // El presupuesto/proyección son mensuales: se anclan al mes/año del
      // INICIO del rango (el front, en modo rango, solo envía desde/hasta y el
      // mes por defecto sería el actual). Así, al regresarse a un mes pasado, se
      // ve el presupuesto de ESE mes.
      month = Number(from.slice(5, 7));
      year = Number(from.slice(0, 4));
    } else {
      singleDay = !!day && day >= 1 && day <= 31;
      if (singleDay) {
        const mm = String(month).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        from = `${year}-${mm}-${dd}`;
        to = from;
        prevFrom = this.shiftDate(from, -1);
        prevTo = prevFrom;
      } else {
        const r = this.monthRange(month, year);
        from = r.from;
        to = r.to;
        const pr = this.monthRange(
          month === 1 ? 12 : month - 1,
          month === 1 ? year - 1 : year,
        );
        prevFrom = pr.from;
        prevTo = pr.to;
      }
    }

    // Conjunto de vendedores a incluir y sus códigos de canal. En modo general
    // se toman TODOS los vendedores ASIGNADOS (rol vendedor con mapping activo);
    // para un vendedor concreto, solo él.
    let seller: User | null = null;
    let sellerIds: string[];
    let channelCodes: Set<string>;
    let activeCodes: string[];
    let nitSet: Set<string>;
    // Identificadores del/los vendedor(es) excluidos del consolidado general
    // (p. ej. Juan Sierra) para descontar también su venta del ERP.
    let erpExclude:
      | { nits: Set<string>; codes: Set<string>; names: Set<string> }
      | undefined;
    if (allSellers) {
      const base = baseCompanyId(companyId);
      const mappings = await this.userCompaniesRepository.find({
        where: { companyId: base, active: true },
        relations: { user: true },
      });
      // Vendedores asignados: rol vendedor, activos y con código de Siesa
      // (mismo criterio que el reporte de ventas por vendedor).
      const assignedAll = mappings
        .map((m) => ({
          m,
          code: (m.siesaSellerCode || m.user?.siesaSellerCode || '').trim(),
        }))
        .filter(
          ({ m, code }) =>
            m.user && m.user.active && m.user.role === UserRole.SELLER && code,
        );
      // Vendedores excluidos del tablero general (configuración de código).
      const excluded = assignedAll.filter(({ m }) =>
        isDashboardExcludedSellerDoc(m.user.documentId),
      );
      const assigned = assignedAll.filter(
        ({ m }) => !isDashboardExcludedSellerDoc(m.user.documentId),
      );
      sellerIds = assigned.map(({ m }) => m.user.id);
      channelCodes = new Set(assigned.map(({ code }) => code));
      activeCodes = [...channelCodes];
      // En modo general las ventas del ERP incluyen a TODOS los vendedores (el
      // ERP no separa por compañía ni exige código Siesa), así que no se filtra
      // por NIT: se suma todo lo facturado del período/rango.
      nitSet = new Set();
      if (excluded.length > 0) {
        erpExclude = {
          nits: new Set(
            excluded
              .map(({ m }) => (m.user.documentId ?? '').trim())
              .filter(Boolean),
          ),
          codes: new Set(excluded.map(({ code }) => code).filter(Boolean)),
          names: new Set(
            excluded
              .map(({ m }) => (m.user.name ?? '').trim().toUpperCase())
              .filter(Boolean),
          ),
        };
      }
    } else {
      seller = await this.usersRepository.findOne({ where: { id: sellerId } });
      const link = await this.userCompaniesRepository.findOne({
        where: { userId: sellerId, companyId },
      });
      const code = (
        link?.siesaSellerCode ||
        seller?.siesaSellerCode ||
        ''
      ).trim();
      sellerIds = [sellerId];
      channelCodes = new Set(code ? [code] : []);
      activeCodes = code ? [code] : [];
      const nit = (seller?.documentId ?? '').trim();
      nitSet = new Set(nit ? [nit] : []);
    }

    // Las ventas del ERP (vendedor-productos-mes) SOLO están disponibles para
    // AGROPECUARIA (compañía 3): ese es el único tenant que trae ese endpoint.
    // Para las demás compañías las ventas se calculan como pedidos de la app
    // más las ventas por canal (comportamiento anterior).
    const useErp = companyId === '3';

    const [totalsRow, activeCustomers, topCustomers, budget, appKilos, projectionConfig] =
      await Promise.all([
        this.getTotals(companyId, sellerIds, from, to),
        this.getActiveCustomers(companyId, activeCodes),
        this.getTopCustomers(companyId, sellerIds, from, to),
        allSellers
          ? this.budgetsService.getCompanyBudget(companyId, month, year)
          : this.budgetsService.getSellerBudget(companyId, sellerId, month, year),
        this.getKilosSold(companyId, sellerIds, from, to),
        this.budgetsService.getProjection(companyId, month, year),
      ]);

    const orders = totalsRow.orders;

    let revenue: number;
    let totalKilos: number;
    let salesTrend: SellerCommercialDashboard['salesTrend'];
    let salesByCut: SellerCommercialDashboard['salesByCut'];
    let salesByChannel: SellerCommercialDashboard['salesByChannel'];
    let salesByCategory: SellerCommercialDashboard['salesByCategory'] =
      undefined;
    let revenuePct: number | null;
    let kilosPct: number | null;
    let profitability: SellerCommercialDashboard['profitability'] = null;

    if (useErp) {
      // AGROPECUARIA: ventas facturadas en Siesa (valor_neto) y kilos.
      const costMap = await this.productCostsService.costMap(companyId);
      const [erp, erpPrev] = await Promise.all([
        this.getErpSales(nitSet, from, to, costMap, erpExclude),
        this.getErpSales(nitSet, prevFrom, prevTo, undefined, erpExclude),
      ]);
      revenue = erp.revenue;
      totalKilos = erp.kilos;
      // Rentabilidad con el COSTO REAL del ERP (consulta general). Solo se
      // muestra si hay costo (>0); si no, queda "sin datos".
      if (erp.cost > 0) {
        const margin = erp.revenue - erp.cost;
        profitability = {
          cost: erp.cost,
          margin,
          marginPct:
            erp.revenue > 0
              ? Number(((margin / erp.revenue) * 100).toFixed(1))
              : null,
        };
      }
      // La tendencia siempre grafica la venta diaria del MES (aunque se filtre
      // un solo día o un rango dentro del mes).
      const trendFrom = singleDay ? `${from.slice(0, 7)}-01` : from;
      const trendTo = singleDay ? this.endOfMonth(from) : to;
      salesTrend = this.buildErpTrend(trendFrom, trendTo, erp.byDay);
      salesByCut = erp.byProduct;
      salesByChannel = erp.byCanal;
      salesByCategory = erp.byCategory;
      revenuePct =
        erpPrev.revenue > 0
          ? Number(
              (((revenue - erpPrev.revenue) / erpPrev.revenue) * 100).toFixed(1),
            )
          : null;
      kilosPct =
        erpPrev.kilos > 0
          ? Number(
              (((totalKilos - erpPrev.kilos) / erpPrev.kilos) * 100).toFixed(1),
            )
          : null;
    } else {
      // Otras compañías: pedidos de la app + ventas por canal.
      const [prevRevenue, appTrend, appCut, prevKilos, channelRows, channelRowsPrev] =
        await Promise.all([
          this.getRevenue(companyId, sellerIds, prevFrom, prevTo),
          this.getTrend(companyId, sellerIds, from, to),
          this.getSalesByCut(companyId, sellerIds, from, to),
          this.getKilosSold(companyId, sellerIds, prevFrom, prevTo),
          this.channelSalesClient.fetch(companyId, from, to),
          this.channelSalesClient.fetch(companyId, prevFrom, prevTo),
        ]);
      const cur = this.summarizeChannels(channelRows, channelCodes);
      const prevCh = this.summarizeChannels(channelRowsPrev, channelCodes);
      const trend = appTrend.map((p) => ({ ...p }));
      const isHourly = trend.length > 0 && trend[0].label != null;
      if (isHourly) {
        const dayTotal = cur.byDay.get(from) ?? 0;
        if (dayTotal > 0 && trend.length > 0) {
          const per = dayTotal / trend.length;
          trend.forEach((p) => {
            p.revenue += per;
          });
        }
      } else {
        trend.forEach((p) => {
          p.revenue += cur.byDay.get(p.date) ?? 0;
        });
      }
      revenue = totalsRow.revenue + cur.revenue;
      totalKilos = appKilos + cur.kilos;
      salesTrend = trend;
      salesByCut = appCut;
      salesByChannel = cur.byChannel;
      revenuePct =
        prevRevenue + prevCh.revenue > 0
          ? Number(
              (((revenue - (prevRevenue + prevCh.revenue)) /
                (prevRevenue + prevCh.revenue)) *
                100).toFixed(1),
            )
          : null;
      kilosPct =
        prevKilos + prevCh.kilos > 0
          ? Number(
              (((totalKilos - (prevKilos + prevCh.kilos)) /
                (prevKilos + prevCh.kilos)) *
                100).toFixed(1),
            )
          : null;
    }

    // CARNES FRIAS (cía 8): la venta acumulada y las UNIDADES vendidas se toman
    // de lo FACTURADO en el ERP (no de los pedidos de la app). Los pedidos se
    // mantienen aparte (orderRevenue/orderKilos).
    if (companyId === '8') {
      const [fact, factPrev] = await Promise.all([
        this.getErpFacturado(companyId, nitSet, from, to, erpExclude),
        this.getErpFacturado(companyId, nitSet, prevFrom, prevTo, erpExclude),
      ]);
      revenue = fact.revenue;
      totalKilos = fact.units;
      revenuePct =
        factPrev.revenue > 0
          ? Number(
              (((fact.revenue - factPrev.revenue) / factPrev.revenue) * 100).toFixed(1),
            )
          : null;
      kilosPct =
        factPrev.units > 0
          ? Number(
              (((fact.units - factPrev.units) / factPrev.units) * 100).toFixed(1),
            )
          : null;
      const trendFrom = singleDay ? `${from.slice(0, 7)}-01` : from;
      const trendTo = singleDay ? this.endOfMonth(from) : to;
      salesTrend = this.buildErpTrend(trendFrom, trendTo, fact.byDay);
    }

    // Proyección AUTOMÁTICA del mes según el ritmo de ventas sobre los días
    // hábiles marcados. Solo aplica en la vista mensual (no por día/rango).
    const projection = this.computeProjection(
      projectionConfig.workingDays,
      revenue,
      totalKilos,
      singleDay,
    );

    // Clientes asignados que NO compraron en el periodo, para hacerles
    // seguimiento y contactarlos (se excluyen los que sí compraron).
    const customersNotBuying = await this.getCustomersNotBuying(
      companyId,
      activeCodes,
      new Set(topCustomers.map((c) => c.code)),
    );

    // Desglose de presupuesto POR cliente/tienda (solo vendedores "por cliente",
    // p. ej. Juan Sierra). Cruza la meta por cliente con la venta real (pedidos).
    let clientBudgets: SellerCommercialDashboard['clientBudgets'] = null;
    if (!allSellers && (await this.budgetsService.isClientBudgetSeller(sellerId))) {
      const metas = await this.budgetsService.listClientBudgets(
        companyId,
        sellerId,
        month,
        year,
      );
      const revByCode = new Map<string, number>();
      for (const c of [...topCustomers, ...customersNotBuying]) {
        revByCode.set(c.code, (revByCode.get(c.code) ?? 0) + c.revenue);
      }
      clientBudgets = metas.map((m) => {
        const rev = revByCode.get(m.clientCode) ?? 0;
        return {
          clientCode: m.clientCode,
          clientName: m.clientName,
          branch: m.branch,
          branchName: m.branchName,
          targetRevenue: m.expectedRevenue,
          targetKilos: m.targetKilos,
          revenue: rev,
          compliancePct:
            m.expectedRevenue > 0
              ? Number(((rev / m.expectedRevenue) * 100).toFixed(1))
              : null,
        };
      });
    }

    const label = singleDay
      ? new Date(`${from}T12:00:00`).toLocaleDateString('es-CO', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : rangeFrom && rangeTo
        ? `${this.prettyDay(from)} — ${this.prettyDay(to)}`
        : new Date(year, month - 1, 1).toLocaleDateString('es-CO', {
            month: 'long',
            year: 'numeric',
          });

    return {
      period: {
        month,
        year,
        day: singleDay ? Number(from.slice(8, 10)) : null,
        label,
      },
      generatedAt: new Date().toISOString(),
      seller: {
        id: allSellers ? 'all' : sellerId,
        name: allSellers
          ? 'General · Todos los vendedores'
          : seller?.name ?? 'Vendedor',
      },
      totals: {
        revenue,
        orders,
        customersServed: totalsRow.customers,
        activeCustomers,
        // El ticket promedio se mantiene sobre las facturas de la app (pedidos).
        avgTicket:
          orders > 0 ? Number((totalsRow.revenue / orders).toFixed(2)) : 0,
        kilosSold: totalKilos,
        orderRevenue: totalsRow.revenue,
        orderKilos: appKilos,
      },
      growth: { revenuePct, kilosPct },
      salesTrend,
      topCustomers,
      customersNotBuying,
      salesByCut,
      salesByChannel,
      salesByCategory,
      budget,
      projection,
      profitability,
      clientBudgets,
    };
  }

  /**
   * Proyección automática del mes a partir del acumulado de ventas y los días
   * hábiles marcados. Estima el cierre del mes suponiendo que se mantiene el
   * ritmo diario (promedio por día hábil transcurrido) por el total de días
   * hábiles. Devuelve null en la vista por día o si no hay días hábiles/ventas.
   */
  private computeProjection(
    workingDays: string[] | null,
    revenue: number,
    kilos: number,
    singleDay: boolean,
  ): { revenue: number; kilos: number } | null {
    const days = Array.isArray(workingDays) ? workingDays : [];
    const total = days.length;
    if (singleDay || total === 0) return null;
    // Días hábiles transcurridos: los que ya llegaron a hoy (mes en curso). En
    // meses pasados, hoy es posterior a todos, así que cuentan todos.
    const today = bogotaToday();
    const elapsed = days.filter((d) => d <= today).length;
    if (elapsed === 0) return null;
    return {
      revenue: (revenue / elapsed) * total,
      kilos: (kilos / elapsed) * total,
    };
  }

  /**
   * Condición SQL para filtrar por un conjunto de vendedores.
   *  - null: sin filtro (todos).
   *  - lista vacía: no coincide con nadie (1=0).
   *  - lista con ids: o.seller_id IN (...).
   */
  private sellerFilterSql(
    sellerIds: string[] | null,
  ): [string, Record<string, unknown>] {
    if (!sellerIds) return ['1=1', {}];
    if (sellerIds.length === 0) return ['1=0', {}];
    return ['o.seller_id IN (:...sellerIds)', { sellerIds }];
  }

  private async getTotals(
    companyId: string,
    sellerIds: string[] | null,
    from: string,
    to: string,
  ): Promise<{ revenue: number; orders: number; customers: number }> {
    const [sellerCond, sellerParams] = this.sellerFilterSql(sellerIds);
    const row = await this.ordersRepository
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.total), 0)', 'revenue')
      .addSelect('COUNT(*)', 'orders')
      .addSelect('COUNT(DISTINCT o.customer_id)', 'customers')
      .where('o.companyId = :companyId', { companyId })
      .andWhere(sellerCond, sellerParams)
      .andWhere('o.status IN (:...statuses)', { statuses: SALE_STATUSES })
      .andWhere(this.bogotaDateFilter, { from, to })
      .getRawOne<{ revenue: string; orders: string; customers: string }>();

    return {
      revenue: Number(row?.revenue ?? 0),
      orders: Number(row?.orders ?? 0),
      customers: Number(row?.customers ?? 0),
    };
  }

  private async getRevenue(
    companyId: string,
    sellerIds: string[] | null,
    from: string,
    to: string,
  ): Promise<number> {
    const [sellerCond, sellerParams] = this.sellerFilterSql(sellerIds);
    const row = await this.ordersRepository
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.total), 0)', 'revenue')
      .where('o.companyId = :companyId', { companyId })
      .andWhere(sellerCond, sellerParams)
      .andWhere('o.status IN (:...statuses)', { statuses: SALE_STATUSES })
      .andWhere(this.bogotaDateFilter, { from, to })
      .getRawOne<{ revenue: string }>();
    return Number(row?.revenue ?? 0);
  }

  /**
   * Resume las ventas por canal de un conjunto de vendedores: incluye solo las
   * filas cuyo código de vendedor (codigo_vendedor) está en `codes`, suma pesos
   * (valor_neto) y kilos (cantidad) y agrupa por la descripción del canal.
   */
  private summarizeChannels(
    rows: ChannelSaleRaw[],
    codes: Set<string>,
  ): {
    revenue: number;
    kilos: number;
    byChannel: { name: string; kilos: number; revenue: number }[];
    byDay: Map<string, number>;
  } {
    let revenue = 0;
    let kilos = 0;
    const grouped = new Map<string, { kilos: number; revenue: number }>();
    const byDay = new Map<string, number>();

    if (codes.size > 0) {
      for (const r of rows) {
        const code = (r.codigo_vendedor ?? '').trim();
        if (!code || !codes.has(code)) continue;
        const val = Number(r.valor_neto ?? r.valor_bruto ?? 0);
        const qty = Number(r.cantidad ?? 0);
        revenue += val;
        kilos += qty;
        const name = (r.descripcion ?? '').trim() || 'Sin canal';
        const g = grouped.get(name) ?? { kilos: 0, revenue: 0 };
        g.kilos += qty;
        g.revenue += val;
        grouped.set(name, g);
        // Total por día (para sumarlo a la gráfica de tendencia).
        const dayKey = (r.fecha ?? '').slice(0, 10);
        if (dayKey) byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + val);
      }
    }

    const byChannel = [...grouped.entries()]
      .map(([name, v]) => ({ name, kilos: v.kilos, revenue: v.revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    return { revenue, kilos, byChannel, byDay };
  }

  /**
   * Kilos vendidos en el mes: suma de cantidades de ítems medidos en KG. En
   * CARNES FRIAS (cía 8) se mide en UNIDADES, así que se suman TODAS las
   * cantidades (packs/unidades/kg), no solo las de KG.
   */
  private async getKilosSold(
    companyId: string,
    sellerIds: string[] | null,
    from: string,
    to: string,
  ): Promise<number> {
    const [sellerCond, sellerParams] = this.sellerFilterSql(sellerIds);
    const qb = this.orderItemsRepository
      .createQueryBuilder('it')
      .innerJoin('it.order', 'o')
      .select('COALESCE(SUM(it.quantity), 0)', 'kilos')
      .where('o.companyId = :companyId', { companyId })
      .andWhere(sellerCond, sellerParams)
      .andWhere('o.status IN (:...statuses)', { statuses: SALE_STATUSES })
      .andWhere(this.bogotaDateFilter, { from, to });
    if (companyId !== '8') {
      qb.andWhere("UPPER(TRIM(it.unit_of_measure)) = 'KG'");
    }
    const row = await qb.getRawOne<{ kilos: string }>();
    return Number(row?.kilos ?? 0);
  }

  /** Clientes de la cartera asignados a un conjunto de códigos de vendedor. */
  private async getActiveCustomers(
    companyId: string,
    codes: string[] | null,
  ): Promise<number> {
    // Sin restricción: todos los clientes de la compañía.
    if (!codes) {
      return this.clientsRepository.count({
        where: { companyId: baseCompanyId(companyId) },
      });
    }
    if (codes.length === 0) return 0;
    return this.clientsRepository.count({
      where: { companyId: baseCompanyId(companyId), sellerCode: In(codes) },
    });
  }

  private async getTrend(
    companyId: string,
    sellerIds: string[] | null,
    from: string,
    to: string,
  ): Promise<SellerCommercialDashboard['salesTrend']> {
    // Un único día: la tendencia se muestra por horas (06:00–17:00).
    if (from === to) {
      return this.getHourlyTrend(companyId, sellerIds, from);
    }

    const [sellerCond, sellerParams] = this.sellerFilterSql(sellerIds);
    const rows = await this.ordersRepository
      .createQueryBuilder('o')
      .select(this.bogotaDateExpr, 'date')
      .addSelect('COALESCE(SUM(o.total), 0)', 'revenue')
      .addSelect('COUNT(*)', 'orders')
      .where('o.companyId = :companyId', { companyId })
      .andWhere(sellerCond, sellerParams)
      .andWhere('o.status IN (:...statuses)', { statuses: SALE_STATUSES })
      .andWhere(this.bogotaDateFilter, { from, to })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; revenue: string; orders: string }>();

    const map = new Map(
      rows.map((r) => [
        r.date,
        { revenue: Number(r.revenue), orders: Number(r.orders) },
      ]),
    );

    // Rellena cada día del mes hasta hoy (los días futuros del mes en curso se
    // ocultan; para meses pasados se muestran todos los días).
    const today = bogotaToday();
    const end = to < today ? to : today;
    const trend: SellerCommercialDashboard['salesTrend'] = [];
    let cursor = from;
    let guard = 0;
    while (cursor <= end && guard < 40) {
      const found = map.get(cursor);
      trend.push({
        date: cursor,
        revenue: found?.revenue ?? 0,
        orders: found?.orders ?? 0,
      });
      cursor = this.shiftDate(cursor, 1);
      guard++;
    }
    return trend;
  }

  /** Tendencia por horas (06:00–17:00) de un solo día para el vendedor. */
  private async getHourlyTrend(
    companyId: string,
    sellerIds: string[] | null,
    day: string,
  ): Promise<SellerCommercialDashboard['salesTrend']> {
    const [sellerCond, sellerParams] = this.sellerFilterSql(sellerIds);
    const rows = await this.ordersRepository
      .createQueryBuilder('o')
      .select(this.bogotaHourExpr, 'hour')
      .addSelect('COALESCE(SUM(o.total), 0)', 'revenue')
      .addSelect('COUNT(*)', 'orders')
      .where('o.companyId = :companyId', { companyId })
      .andWhere(sellerCond, sellerParams)
      .andWhere('o.status IN (:...statuses)', { statuses: SALE_STATUSES })
      .andWhere(this.bogotaDateFilter, { from: day, to: day })
      .groupBy('hour')
      .orderBy('hour', 'ASC')
      .getRawMany<{ hour: string; revenue: string; orders: string }>();

    const map = new Map(
      rows.map((r) => [
        Number(r.hour),
        { revenue: Number(r.revenue), orders: Number(r.orders) },
      ]),
    );

    const trend: SellerCommercialDashboard['salesTrend'] = [];
    for (let h = 6; h <= 17; h++) {
      const found = map.get(h);
      const hh = String(h).padStart(2, '0');
      trend.push({
        date: `${day}T${hh}:00`,
        label: `${hh}:00`,
        revenue: found?.revenue ?? 0,
        orders: found?.orders ?? 0,
      });
    }
    return trend;
  }

  private async getTopCustomers(
    companyId: string,
    sellerIds: string[] | null,
    from: string,
    to: string,
  ): Promise<SellerCommercialDashboard['topCustomers']> {
    const [sellerCond, sellerParams] = this.sellerFilterSql(sellerIds);
    const rows = await this.ordersRepository
      .createQueryBuilder('o')
      .innerJoin('o.customer', 'c')
      .select('c.name', 'name')
      .addSelect('c.code', 'code')
      .addSelect('MIN(c.city)', 'city')
      .addSelect('MIN(c.branch)', 'branch')
      .addSelect('MIN(c.branchName)', 'branchName')
      .addSelect('COALESCE(SUM(o.total), 0)', 'revenue')
      .addSelect('MAX(o.created_at)', 'lastPurchase')
      .where('o.companyId = :companyId', { companyId })
      .andWhere(sellerCond, sellerParams)
      .andWhere('o.status IN (:...statuses)', { statuses: SALE_STATUSES })
      .andWhere(this.bogotaDateFilter, { from, to })
      .groupBy('c.code')
      .addGroupBy('c.name')
      .orderBy('revenue', 'DESC')
      .getRawMany<{
        name: string;
        code: string;
        city: string | null;
        branch: string | null;
        branchName: string | null;
        revenue: string;
        lastPurchase: string | null;
      }>();

    return rows.map((r) => ({
      name: r.name,
      code: r.code,
      city: r.city ?? null,
      branch: r.branch ?? null,
      branchName: r.branchName ?? null,
      revenue: Number(r.revenue),
      lastPurchase: r.lastPurchase
        ? new Date(r.lastPurchase).toISOString()
        : null,
    }));
  }

  /**
   * Clientes asignados al vendedor (por código) que NO compraron en el periodo.
   * Incluye su última compra (cualquier fecha) para priorizar el contacto.
   * `boughtCodes` son los códigos que SÍ compraron en el periodo (se excluyen).
   */
  private async getCustomersNotBuying(
    companyId: string,
    codes: string[],
    boughtCodes: Set<string>,
  ): Promise<SellerCommercialDashboard['customersNotBuying']> {
    if (!codes || codes.length === 0) return [];
    const rows = await this.clientsRepository
      .createQueryBuilder('cr')
      .leftJoin(
        'orders',
        'o',
        'o.customer_id = cr.id AND o.status IN (:...statuses)',
        { statuses: SALE_STATUSES },
      )
      .select('cr.name', 'name')
      .addSelect('cr.code', 'code')
      .addSelect('MIN(cr.city)', 'city')
      .addSelect('MIN(cr.branch)', 'branch')
      .addSelect('MIN(cr.branchName)', 'branchName')
      .addSelect('MAX(o.created_at)', 'lastPurchase')
      .where('cr.companyId = :base', { base: baseCompanyId(companyId) })
      .andWhere('cr.sellerCode IN (:...codes)', { codes })
      .groupBy('cr.code')
      .addGroupBy('cr.name')
      .getRawMany<{
        name: string;
        code: string;
        city: string | null;
        branch: string | null;
        branchName: string | null;
        lastPurchase: string | null;
      }>();

    return rows
      .filter((r) => !boughtCodes.has(r.code))
      .map((r) => ({
        name: r.name,
        code: r.code,
        city: r.city ?? null,
        branch: r.branch ?? null,
        branchName: r.branchName ?? null,
        revenue: 0,
        lastPurchase: r.lastPurchase
          ? new Date(r.lastPurchase).toISOString()
          : null,
      }))
      // Primero los que nunca compraron, luego por compra más antigua.
      .sort((a, b) => (a.lastPurchase ?? '').localeCompare(b.lastPurchase ?? ''))
      .slice(0, 300);
  }

  /** Ventas por corte (producto) del mes: cantidad y venta por referencia. */
  private async getSalesByCut(
    companyId: string,
    sellerIds: string[] | null,
    from: string,
    to: string,
  ): Promise<SellerCommercialDashboard['salesByCut']> {
    const [sellerCond, sellerParams] = this.sellerFilterSql(sellerIds);
    const rows = await this.orderItemsRepository
      .createQueryBuilder('it')
      .innerJoin('it.order', 'o')
      .select('it.product_name', 'name')
      .addSelect('COALESCE(SUM(it.quantity), 0)', 'quantity')
      .addSelect('COALESCE(SUM(it.line_total), 0)', 'revenue')
      .where('o.companyId = :companyId', { companyId })
      .andWhere(sellerCond, sellerParams)
      .andWhere('o.status IN (:...statuses)', { statuses: SALE_STATUSES })
      .andWhere(this.bogotaDateFilter, { from, to })
      .groupBy('it.sku')
      .addGroupBy('it.product_name')
      .orderBy('revenue', 'DESC')
      .getRawMany<{ name: string; quantity: string; revenue: string }>();

    return rows.map((r) => ({
      name: r.name,
      quantity: Number(r.quantity),
      revenue: Number(r.revenue),
    }));
  }
}
