import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { buildOrdersPdf } from '../orders/order-pdf';
import { bogotaParts } from '../orders/order-cortes';
import { isValidCompany } from '../../common/companies';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/entities/user.entity';
import { PriceListsService } from '../price-lists/price-lists.service';

/** Clave del módulo (permiso) de la administración de pedidos. */
const ADMIN_ORDERS_PERMISSION = '/admin/pedidos';

/** Permisos de descarga de pedidos, separados por tipo y categoría. */
const DOWNLOAD_CORTES_PERMISSION = '/admin/descargar-pedidos';
const DOWNLOAD_SUBPRODUCTOS_CERDO_PERMISSION =
  '/admin/descargar-pedidos-subproductos-cerdo';
const DOWNLOAD_SUBPRODUCTOS_RES_PERMISSION =
  '/admin/descargar-pedidos-subproductos-res';

/** Normaliza la categoría de subproducto ('CERDO' por defecto). */
function normalizeCategory(category?: string): 'CERDO' | 'RES' {
  return (category ?? '').toUpperCase() === 'RES' ? 'RES' : 'CERDO';
}

/** Normaliza el tipo de pedido recibido ('corte' por defecto). */
function normalizeOrderType(type?: string): 'corte' | 'subproducto' {
  return type === 'subproducto' ? 'subproducto' : 'corte';
}

/** Resumen de un pedido descargable (para la tabla del administrador). */
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
  createdAt: Date;
  downloadedAt?: Date | null;
  /** Marca de alistado (el alistador ya sacó/preparó el pedido). */
  picked: boolean;
  pickedAt?: Date | null;
  pickedBy?: string | null;
  /** Consecutivo del pedido al que este se asoció (null si no aplica). */
  linkedOrderNumber?: string | null;
  linkedSecondNumber?: string | null;
}

/** Línea (ítem) de un pedido para el detalle administrativo. */
export interface AdminOrderItem {
  sku: string;
  productName: string;
  unitOfMeasure?: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  lineTotal: number;
}

/** Detalle completo de un pedido para el seguimiento administrativo. */
export interface AdminOrderDetail {
  id: string;
  orderNumber: string;
  /** Segundo consecutivo (subproductos divididos: bovino/porcino). */
  secondNumber?: string | null;
  companyId: string;
  status: OrderStatus;
  /** Tipo de pedido: 'corte' o 'subproducto'. */
  type: string;
  // Quién y cuándo lo generó.
  sellerName: string;
  sellerDocument?: string;
  sellerCode?: string;
  createdAt: Date;
  deliveryDate?: string;
  // Cliente.
  customerName: string;
  customerCode: string;
  customerCity?: string;
  // Totales.
  subtotal: number;
  taxes: number;
  total: number;
  // Notas / logística.
  notes?: string;
  logisticsNote?: string;
  deliveryType?: string;
  deliverySchedule?: string;
  // Cartera (aprobación).
  carteraBalance?: number | null;
  approvalDeadline?: Date | null;
  approvedAt?: Date | null;
  approvedBy?: string | null;
  disapprovalReason?: string | null;
  cancelReason?: string | null;
  // Siesa.
  siesaEstado?: string | null;
  siesaStatePrevious?: string | null;
  syncedAt?: Date | null;
  siesaDocumentId?: string | null;
  syncError?: string | null;
  // Descargas del documento.
  downloadCount: number;
  downloadedAt?: Date | null;
  downloadedBy?: string | null;
  items: AdminOrderItem[];
  /** Consecutivo del pedido al que este se asoció (null si no aplica). */
  linkedOrderNumber?: string | null;
  linkedSecondNumber?: string | null;
}

/** Filtros para el listado administrativo de pedidos. */
export interface AdminOrdersFilter {
  from?: string;
  to?: string;
  status?: string;
  search?: string;
  /** Tipo de pedido: 'corte' | 'subproducto' (vacío = todos). */
  type?: string;
}

@Injectable()
export class AdminOrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    private readonly usersService: UsersService,
    private readonly priceListsService: PriceListsService,
  ) {}

  /**
   * Verifica que el usuario pueda ver la administración de pedidos de una
   * compañía: admin (todas), o que tenga el permiso del módulo asignado en esa
   * compañía (o de forma global, siempre que tenga acceso a la compañía).
   */
  private async assertCanAccess(
    user: User,
    companyId: string,
  ): Promise<void> {
    if (user.role === UserRole.ADMIN) return;

    const companies = await this.usersService.findCompaniesForUser(user.id);
    const mapping = companies.find((c) => c.companyId === companyId);
    if (!mapping) {
      throw new ForbiddenException(
        'No tienes acceso a los pedidos de esta compañía.',
      );
    }

    const fullUser = await this.usersService.findById(user.id);
    const globalPerms = fullUser.permissions ?? [];
    const companyPerms = mapping.permissions ?? [];
    if (
      companyPerms.includes(ADMIN_ORDERS_PERMISSION) ||
      globalPerms.includes(ADMIN_ORDERS_PERMISSION)
    ) {
      return;
    }

    throw new ForbiddenException(
      'No tienes permiso para ver la administración de pedidos.',
    );
  }

  /**
   * Verifica que el usuario pueda descargar/ver pedidos de un tipo concreto
   * (cortes o subproductos). Cada tipo tiene su propio permiso, de modo que un
   * usuario puede tener acceso solo a cortes, solo a subproductos o a ambos.
   * Los administradores ven ambos; los alistadores conservan el acceso a
   * cortes por compatibilidad.
   */
  async assertCanDownloadType(
    user: User,
    companyId: string,
    type: 'corte' | 'subproducto',
    category?: 'CERDO' | 'RES',
  ): Promise<void> {
    if (user.role === UserRole.ADMIN) return;
    // Los subproductos tienen un permiso por categoría (Cerdo / Res).
    const permission =
      type === 'subproducto'
        ? normalizeCategory(category) === 'RES'
          ? DOWNLOAD_SUBPRODUCTOS_RES_PERMISSION
          : DOWNLOAD_SUBPRODUCTOS_CERDO_PERMISSION
        : DOWNLOAD_CORTES_PERMISSION;
    const allowed = await this.usersService.hasPermissionInCompany(
      user.id,
      companyId,
      permission,
    );
    if (allowed) return;
    // Compatibilidad: los alistadores mantienen el acceso a cortes.
    if (type !== 'subproducto' && user.role === UserRole.ALISTADOR) return;
    throw new ForbiddenException(
      'No tienes permiso para descargar estos pedidos.',
    );
  }

  /**
   * Listado administrativo de todos los pedidos de una compañía con toda la
   * información de seguimiento (quién lo generó, cartera, Siesa y descargas).
   * Permite filtrar por rango de días (hora de Colombia), estado y búsqueda.
   */
  async listAll(
    companyId: string,
    filter: AdminOrdersFilter = {},
    user?: User,
  ): Promise<AdminOrderDetail[]> {
    if (!isValidCompany(companyId)) {
      throw new BadRequestException('Compañía inválida.');
    }
    if (user) {
      await this.assertCanAccess(user, companyId);
    }

    const orders = await this.ordersRepository.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });

    const from = filter.from?.trim() || undefined;
    const to = filter.to?.trim() || undefined;
    const status = filter.status?.trim() || undefined;
    const search = filter.search?.trim().toLowerCase() || undefined;
    const type = filter.type?.trim() || undefined;

    const filtered = orders.filter((o) => {
      // Filtro por día (hora de Colombia).
      if (from || to) {
        const { date } = bogotaParts(o.createdAt);
        if (from && date < from) return false;
        if (to && date > to) return false;
      }
      if (status && o.status !== status) return false;
      if (type && normalizeOrderType(o.type) !== type) return false;
      if (search) {
        const haystack = [
          o.orderNumber,
          o.customer?.name,
          o.customer?.code,
          o.seller?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    return filtered.map((o) => this.toDetail(o));
  }

  /** Convierte un pedido en su detalle administrativo. */
  private toDetail(o: Order): AdminOrderDetail {
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      secondNumber: o.secondNumber ?? null,
      companyId: o.companyId,
      status: o.status,
      type: normalizeOrderType(o.type),
      sellerName: o.seller?.name ?? '',
      sellerDocument: o.seller?.documentId,
      sellerCode: o.customer?.sellerCode,
      createdAt: o.createdAt,
      deliveryDate: o.deliveryDate,
      customerName: o.customer?.name ?? '',
      customerCode: o.customer?.code ?? '',
      customerCity: o.customer?.city,
      subtotal: Number(o.subtotal),
      taxes: Number(o.taxes),
      total: Number(o.total),
      notes: o.notes,
      logisticsNote: o.logisticsNote,
      deliveryType: o.deliveryType,
      deliverySchedule: o.deliverySchedule,
      carteraBalance: o.carteraBalance != null ? Number(o.carteraBalance) : null,
      approvalDeadline: o.approvalDeadline ?? null,
      approvedAt: o.approvedAt ?? null,
      approvedBy: o.approvedBy ?? null,
      disapprovalReason: o.disapprovalReason ?? null,
      cancelReason: o.cancelReason ?? null,
      siesaEstado: o.siesaEstado ?? null,
      siesaStatePrevious: o.siesaStatePrevious ?? null,
      syncedAt: o.syncedAt ?? null,
      siesaDocumentId: o.siesaDocumentId ?? null,
      syncError: o.syncError ?? null,
      downloadCount: o.downloadCount ?? 0,
      downloadedAt: o.downloadedAt ?? null,
      downloadedBy: o.downloadedBy ?? null,
      linkedOrderNumber: o.linkedOrderNumber ?? null,
      linkedSecondNumber: o.linkedSecondNumber ?? null,
      items: (o.items ?? []).map((it) => ({
        sku: it.sku,
        productName: it.productName,
        unitOfMeasure: it.unitOfMeasure,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        discountPct: Number(it.discountPct),
        lineTotal: Number(it.lineTotal),
      })),
    };
  }

  /**
   * Lista los pedidos que ya se subieron a Siesa (SYNCED) y que no están
   * rebotados ni anulados, para que el administrador los pueda descargar.
   */
  async listDownloadable(
    companyId: string,
    type: string | undefined,
    user: User,
    category?: string,
  ): Promise<DownloadableOrder[]> {
    if (!isValidCompany(companyId)) {
      throw new BadRequestException('Compañía inválida.');
    }
    const orderType = normalizeOrderType(type);
    const cat = normalizeCategory(category);
    await this.assertCanDownloadType(
      user,
      companyId,
      orderType,
      orderType === 'subproducto' ? cat : undefined,
    );
    const orders = await this.ordersRepository.find({
      where: { companyId, status: OrderStatus.SYNCED, type: orderType },
      order: { orderNumber: 'ASC' },
    });

    // Subproductos: solo se muestran los pedidos que tienen líneas de la
    // categoría seleccionada (Cerdo/Res) y el total es el de esa categoría.
    if (orderType === 'subproducto') {
      const catMap =
        await this.priceListsService.getSubproductoCategories(companyId);
      const result: DownloadableOrder[] = [];
      for (const o of orders) {
        const catItems = (o.items ?? []).filter(
          (it) => catMap.get(it.sku.trim()) === cat,
        );
        if (catItems.length === 0) continue;
        result.push({
          id: o.id,
          orderNumber: o.orderNumber,
          secondNumber: o.secondNumber ?? null,
          customerName: o.customer?.name ?? '',
          customerCode: o.customer?.code ?? '',
          sellerName: o.seller?.name ?? '',
          total: catItems.reduce((s, it) => s + Number(it.lineTotal), 0),
          siesaEstado: o.siesaEstado,
          createdAt: o.createdAt,
          downloadedAt: o.downloadedAt ?? null,
          picked: o.picked ?? false,
          pickedAt: o.pickedAt ?? null,
          pickedBy: o.pickedBy ?? null,
          linkedOrderNumber: o.linkedOrderNumber ?? null,
          linkedSecondNumber: o.linkedSecondNumber ?? null,
        });
      }
      return result;
    }

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      secondNumber: o.secondNumber ?? null,
      customerName: o.customer?.name ?? '',
      customerCode: o.customer?.code ?? '',
      sellerName: o.seller?.name ?? '',
      total: Number(o.total),
      siesaEstado: o.siesaEstado,
      createdAt: o.createdAt,
      downloadedAt: o.downloadedAt ?? null,
      picked: o.picked ?? false,
      pickedAt: o.pickedAt ?? null,
      pickedBy: o.pickedBy ?? null,
      linkedOrderNumber: o.linkedOrderNumber ?? null,
      linkedSecondNumber: o.linkedSecondNumber ?? null,
    }));
  }

  /**
   * Genera un único PDF con los pedidos seleccionados y los marca como
   * descargados (estado propio del módulo). Se puede volver a descargar.
   */
  async downloadPdf(
    companyId: string,
    orderIds: string[],
    downloadedBy?: string,
    type?: string,
    category?: string,
  ): Promise<Buffer> {
    if (!isValidCompany(companyId)) {
      throw new BadRequestException('Compañía inválida.');
    }
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      throw new BadRequestException('Debes seleccionar al menos un pedido.');
    }

    const orderType = normalizeOrderType(type);
    const orders = await this.ordersRepository.find({
      where: {
        id: In(orderIds),
        companyId,
        status: OrderStatus.SYNCED,
        type: orderType,
      },
      order: { orderNumber: 'ASC' },
    });

    if (orders.length === 0) {
      throw new BadRequestException(
        'No se encontraron pedidos válidos para descargar.',
      );
    }

    // Subproductos: el PDF de una categoría incluye solo las líneas de esa
    // categoría (Cerdo/Res). Se filtran los ítems en memoria (no se persiste).
    let pdfOrders = orders;
    if (orderType === 'subproducto') {
      const cat = normalizeCategory(category);
      const catMap =
        await this.priceListsService.getSubproductoCategories(companyId);
      pdfOrders = orders
        .map((o) => {
          o.items = (o.items ?? []).filter(
            (it) => catMap.get(it.sku.trim()) === cat,
          );
          return o;
        })
        .filter((o) => o.items.length > 0);
      if (pdfOrders.length === 0) {
        throw new BadRequestException(
          'Los pedidos seleccionados no tienen líneas de esta categoría.',
        );
      }
    }

    const pdf = await buildOrdersPdf(pdfOrders);

    // Marca los pedidos como descargados (se puede repetir la descarga).
    const ids = pdfOrders.map((o) => o.id);
    const now = new Date();
    await this.ordersRepository.update(
      { id: In(ids) },
      { downloadedAt: now, downloadedBy: downloadedBy ?? undefined },
    );
    await this.ordersRepository.increment({ id: In(ids) }, 'downloadCount', 1);

    return pdf;
  }

  /**
   * Marca/desmarca un pedido como alistado (estado propio del módulo de
   * Descargar pedidos). Persiste quién y cuándo lo marcó para que la marca
   * permanezca al salir y volver a entrar.
   */
  async setPicked(
    companyId: string,
    orderId: string,
    picked: boolean,
    pickedBy?: string,
  ): Promise<{
    id: string;
    picked: boolean;
    pickedAt: Date | null;
    pickedBy: string | null;
  }> {
    if (!isValidCompany(companyId)) {
      throw new BadRequestException('Compañía inválida.');
    }
    const order = await this.ordersRepository.findOne({
      where: { id: orderId, companyId },
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado.');
    }

    order.picked = picked;
    order.pickedAt = picked ? new Date() : undefined;
    order.pickedBy = picked ? (pickedBy ?? undefined) : undefined;
    await this.ordersRepository.save(order);

    return {
      id: order.id,
      picked: order.picked,
      pickedAt: order.pickedAt ?? null,
      pickedBy: order.pickedBy ?? null,
    };
  }

  /**
   * Marca/desmarca varios pedidos como alistados de una sola vez (acción
   * masiva desde la tabla de Descargar pedidos). Devuelve cuántos se
   * actualizaron.
   */
  async setPickedBulk(
    companyId: string,
    orderIds: string[],
    picked: boolean,
    pickedBy?: string,
  ): Promise<{ updated: number }> {
    if (!isValidCompany(companyId)) {
      throw new BadRequestException('Compañía inválida.');
    }
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return { updated: 0 };
    }

    const orders = await this.ordersRepository.find({
      where: { id: In(orderIds), companyId },
    });
    const now = new Date();
    for (const order of orders) {
      order.picked = picked;
      order.pickedAt = picked ? now : undefined;
      order.pickedBy = picked ? (pickedBy ?? undefined) : undefined;
    }
    await this.ordersRepository.save(orders);

    return { updated: orders.length };
  }
}
