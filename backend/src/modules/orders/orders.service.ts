import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  EntityManager,
  In,
  LessThan,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { CreateOrderDto, CreateOrderItemDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ClientsService } from '../clients/clients.service';
import { ClientRecord } from '../clients/entities/client-record.entity';
import { PriceListsService } from '../price-lists/price-lists.service';
import { OrdersErpClient, ErpOrderRegistro, ErpOrderState } from './orders-erp.client';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { getMinOrderTotal, getWarehouse, COMPANIES, baseCompanyId, getOperationCenter, virtualOperationCentersForBase } from '../../common/companies';
import { buildOrderPdf } from './order-pdf';
import {
  bogotaToday,
  isOrderCreationOpenFor,
  formatScheduleTime,
  APPROVAL_WINDOW_HOURS,
} from './order-cortes';
import { SettingsService } from '../settings/settings.service';

/** Trazabilidad de un pedido en Siesa para mostrar al vendedor. */
export interface SiesaOrderState {
  /** Descripción del estado en Siesa (En elaboración, Aprobado, Cumplido, Anulado, Retenido). */
  estado: string;
  /** El pedido ya fue facturado en Siesa. */
  facturado: boolean;
  /** El pedido ya fue despachado (remisionado) en Siesa. */
  despachado: boolean;
}

/**
 * Margen de asentamiento tras enviar un pedido a Siesa. En Siesa la decisión es
 * inmediata: el pedido entra (aparece su consecutivo) o rebota (no aparece). Solo
 * se espera este pequeño margen para garantizar que la consulta sea posterior al
 * envío (el caché del ERP dura ~5s) y dar tiempo a que Siesa lo indexe; pasado
 * esto, si el consecutivo no aparece, el pedido se considera REBOTADO.
 */
const BOUNCE_SETTLE_MS = 15_000;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    private readonly clientsService: ClientsService,
    private readonly priceListsService: PriceListsService,
    private readonly erpClient: OrdersErpClient,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
    private readonly settingsService: SettingsService,
  ) {}

  async create(
    companyId: string,
    dto: CreateOrderDto,
    seller: User,
  ): Promise<Order> {
    // Los vendedores solo pueden CREAR pedidos dentro de la ventana operativa
    // configurable (hora de Colombia). Una vez creado dentro del horario, la
    // aprobación de cartera y la subida a Siesa pueden ocurrir después sin
    // problema (no se revalida el horario allí).
    const schedule = await this.settingsService.getOrderSchedule();
    // En MONTERIA TAT AGROPECUARIA los vendedores pueden montar pedidos a
    // cualquier hora (sin restricción de horario).
    if (companyId !== 'MTAT' && !isOrderCreationOpenFor(schedule)) {
      throw new BadRequestException(
        `El pedido no se pudo realizar porque está fuera del horario de ` +
          `atención. La toma de pedidos está disponible de ` +
          `${formatScheduleTime(schedule.openHour, schedule.openMinute)} a ` +
          `${formatScheduleTime(schedule.closeHour, schedule.closeMinute)}.`,
      );
    }

    // Tipo de pedido. Los subproductos usan su inventario propio. Se registran
    // a nombre del usuario que sube el pedido (con su cédula se cargan a Siesa).
    // Si llega un sellerId (compatibilidad), se respeta.
    const orderType = dto.orderType ?? 'corte';
    let orderSeller = seller;
    if (orderType === 'subproducto' && dto.sellerId) {
      orderSeller = await this.usersService.findById(dto.sellerId);
    }

    const customer = await this.clientsService.findOne(
      companyId,
      dto.customerId,
    );

    // Todo se hace dentro de una transacción para que el descuento de stock y
    // la creación del pedido sean atómicos. La subida al ERP se hace después de
    // confirmar la transacción (no se hace una llamada HTTP con locks abiertos).
    const created = await this.dataSource.transaction(async (manager) => {
      const ordersRepo = manager.getRepository(Order);

      // 1) Se valida y descuenta el stock (si no alcanza, aquí se lanza error).
      const { items, subtotal, taxes } = await this.buildItemsAndAdjustStock(
        manager,
        companyId,
        customer,
        dto.items,
        orderType,
      );

      // Tope mínimo de pedido por compañía: si el total no lo alcanza, no se
      // permite crear el pedido (la transacción se revierte y el stock no se
      // descuenta).
      const total = Number((subtotal + taxes).toFixed(2));
      // Los subproductos no tienen monto mínimo de pedido.
      const minTotal =
        orderType === 'subproducto' ? 0 : getMinOrderTotal(companyId);
      if (minTotal > 0 && total < minTotal) {
        // El pedido mínimo es POR DÍA POR CLIENTE: si el cliente ya tiene un
        // pedido creado hoy, los siguientes pasan sin importar el valor.
        const alreadyOrderedToday = await this.hasSubmittedOrderToday(
          manager,
          companyId,
          customer.id,
        );
        if (!alreadyOrderedToday) {
          throw new BadRequestException(
            `El pedido no alcanza el monto mínimo de ` +
              `${this.formatCurrency(minTotal)} para esta compañía. ` +
              `Total actual: ${this.formatCurrency(total)}.`,
          );
        }
        this.logger.log(
          `Cliente ${customer.code} (compañía ${companyId}) ya tiene un ` +
            `pedido de hoy; se omite el monto mínimo para este pedido.`,
        );
      }

      // 2) Con el stock ya confirmado, se evalúa la cartera del cliente para
      // decidir si el pedido pasa directo o queda retenido para aprobación.
      // Regla: se retiene si el cliente tiene CUALQUIER saldo pendiente en
      // cartera (aunque no esté vencido) o si el pedido superaría su cupo de
      // crédito. Es decir, todo cliente que deba algo pasa por aprobación de
      // cartera. Los subproductos no pasan por cartera: van al controlador.
      const isSubproducto = orderType === 'subproducto';
      const cartera = isSubproducto
        ? { balance: 0, hasOverdue: false, creditLimit: 0 }
        : await this.resolveCarteraStatus(companyId, customer.code);
      const exceedsCredit =
        cartera.creditLimit > 0 &&
        cartera.balance + total > cartera.creditLimit;
      let needsApproval = cartera.balance > 0 || exceedsCredit;
      const carteraBalance = cartera.balance;

      // Si el cliente ya tiene un pedido de HOY que pasó la validación de
      // cartera, los siguientes pedidos del mismo día pasan directo. La
      // "cartera" que ahora aparece es, en la práctica, la que generó su propio
      // primer pedido del día, así que no se debe retener por segunda vez.
      if (needsApproval && !isSubproducto) {
        const passedToday = await this.hasPassedOrderToday(
          manager,
          companyId,
          customer.id,
        );
        if (passedToday) {
          needsApproval = false;
          this.logger.log(
            `Cliente ${customer.code} (compañía ${companyId}) ya tiene un ` +
              `pedido de hoy que pasó cartera; el nuevo pedido se crea sin ` +
              `retención y sube directo a Siesa.`,
          );
        }
      }

      // Numeración. Los subproductos que llevan RES y CERDO se dividen en dos
      // documentos en Siesa (bovino/porcino) y cada uno necesita un consecutivo
      // DISTINTO (Siesa no permite la misma O.C. en dos pedidos). En ese caso se
      // reservan dos consecutivos seguidos: `orderNumber` (bovino) y
      // `secondNumber` (porcino).
      let orderNumber: string;
      let secondNumber: string | undefined;
      if (isSubproducto) {
        const categories =
          await this.priceListsService.getSubproductoCategories(companyId);
        const hasRes = items.some(
          (it) => categories.get(it.sku.trim()) === 'RES',
        );
        const hasPorcino = items.some(
          (it) => categories.get(it.sku.trim()) !== 'RES',
        );
        if (hasRes && hasPorcino) {
          [orderNumber, secondNumber] = await this.reserveOrderNumbers(
            companyId,
            orderType,
            manager,
            2,
          );
        } else {
          orderNumber = await this.nextOrderNumber(companyId, orderType, manager);
        }
      } else {
        orderNumber = await this.nextOrderNumber(companyId, orderType, manager);
      }

      const order = ordersRepo.create({
        companyId,
        orderNumber,
        secondNumber,
        type: orderType,
        customer,
        seller: orderSeller,
        items,
        // Subproductos: quedan a la espera del controlador (no suben a Siesa).
        // Cortes: si el cliente debe cartera, "pendiente por aprobación"; si no,
        // "pendiente por envío" a Siesa.
        status: isSubproducto
          ? OrderStatus.PENDING_CONTROL
          : needsApproval
            ? OrderStatus.PENDING_APPROVAL
            : OrderStatus.CONFIRMED,
        carteraBalance: needsApproval ? carteraBalance : undefined,
        approvalDeadline: needsApproval
          ? new Date(Date.now() + APPROVAL_WINDOW_HOURS * 60 * 60 * 1000)
          : undefined,
        subtotal: Number(subtotal.toFixed(2)),
        taxes: Number(taxes.toFixed(2)),
        total,
        notes: dto.notes,
        logisticsNote: dto.logisticsNote,
        deliveryType: dto.deliveryType,
        deliverySchedule: dto.deliverySchedule,
        deliveryDate: dto.deliveryDate,
      });

      // Guarda el horario de recibido en el cliente para que quede
      // predeterminado (editable) en los siguientes pedidos.
      if (dto.deliveryScheduleData) {
        await manager
          .getRepository(ClientRecord)
          .update(
            { id: customer.id, companyId: customer.companyId },
            { deliverySchedule: dto.deliveryScheduleData },
          );
      }

      return ordersRepo.save(order);
    });

    // Si el cliente no debe cartera, el pedido sube de inmediato al ERP y queda
    // "enviado a Siesa". Si debe, queda retenido hasta la aprobación en cartera.
    if (created.status === OrderStatus.CONFIRMED) {
      return this.pushOrder(created);
    }
    return created;
  }

  /** Formatea un valor en pesos colombianos para los mensajes al usuario. */
  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(value);
  }

  /**
   * Indica si el cliente ya tiene un pedido de HOY (hora Colombia) que pasó la
   * validación de cartera (se creó confirmado o ya se subió a Siesa). Se usa
   * para no retener por segunda vez a un cliente cuyo saldo de cartera lo generó
   * su propio primer pedido del día.
   */
  private hasPassedOrderToday(
    manager: EntityManager,
    companyId: string,
    customerId: string,
  ): Promise<boolean> {
    return this.hasOrderTodayWithStatus(manager, companyId, customerId, [
      OrderStatus.CONFIRMED,
      OrderStatus.SYNCING,
      OrderStatus.SYNCED,
      OrderStatus.FAILED,
      OrderStatus.BOUNCED,
    ]);
  }

  /**
   * Indica si el cliente ya tiene CUALQUIER pedido creado HOY (incluye los
   * retenidos por cartera o el controlador). Se usa para el monto mínimo, que
   * es por día por cliente: si ya pidió hoy, los siguientes pasan sin mínimo.
   */
  private hasSubmittedOrderToday(
    manager: EntityManager,
    companyId: string,
    customerId: string,
  ): Promise<boolean> {
    return this.hasOrderTodayWithStatus(manager, companyId, customerId, [
      OrderStatus.CONFIRMED,
      OrderStatus.SYNCING,
      OrderStatus.SYNCED,
      OrderStatus.FAILED,
      OrderStatus.BOUNCED,
      OrderStatus.PENDING_APPROVAL,
      OrderStatus.PENDING_CONTROL,
    ]);
  }

  /**
   * ¿El cliente tiene un pedido de CORTE de hoy (hora Colombia) que superó el
   * tope mínimo, en alguno de los estados dados? Solo esos pedidos habilitan el
   * bypass de cartera/mínimo: deben ser cortes que ya superaron el tope límite
   * (los subproductos y los pedidos por debajo del mínimo no cuentan).
   */
  private async hasOrderTodayWithStatus(
    manager: EntityManager,
    companyId: string,
    customerId: string,
    statuses: OrderStatus[],
  ): Promise<boolean> {
    const minTotal = getMinOrderTotal(companyId);
    const count = await manager
      .getRepository(Order)
      .createQueryBuilder('o')
      .where('o.companyId = :companyId', { companyId })
      .andWhere('o.customer_id = :customerId', { customerId })
      .andWhere('o.type = :type', { type: 'corte' })
      .andWhere('o.status IN (:...statuses)', { statuses })
      .andWhere('o.total >= :minTotal', { minTotal })
      .andWhere(
        "(o.created_at AT TIME ZONE 'America/Bogota')::date = :today::date",
        { today: bogotaToday() },
      )
      .getCount();
    return count > 0;
  }

  /**
   * ¿El cliente ya tiene un pedido creado hoy? Público para que el frontend
   * relaje el monto mínimo (que es por día por cliente).
   */
  customerHasOrderToday(
    companyId: string,
    customerId: string,
  ): Promise<boolean> {
    return this.hasSubmittedOrderToday(
      this.ordersRepository.manager,
      companyId,
      customerId,
    );
  }

  /**
   * Evalúa la cartera del cliente para decidir la retención del pedido. Devuelve
   * el saldo total, si está en mora (documentos vencidos con saldo) y el cupo de
   * crédito (0 si el ERP no lo provee). Ante una falla del servicio externo
   * devuelve valores neutros (sin mora ni cupo) para no bloquear la venta por
   * una caída del endpoint de cartera.
   */
  private async resolveCarteraStatus(
    companyId: string,
    code: string,
  ): Promise<{ balance: number; hasOverdue: boolean; creditLimit: number }> {
    try {
      const portfolio = await this.clientsService.getPortfolio(companyId, code);
      return {
        balance: portfolio.totalBalance > 0 ? portfolio.totalBalance : 0,
        hasOverdue: portfolio.hasOverdue,
        creditLimit: portfolio.creditLimit > 0 ? portfolio.creditLimit : 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `No se pudo consultar la cartera del cliente ${code} ` +
          `(compañía ${companyId}): ${message}. El pedido se crea sin retención.`,
      );
      return { balance: 0, hasOverdue: false, creditLimit: 0 };
    }
  }

  /**
   * Lista los pedidos pendientes de aprobación en cartera (de todas las
   * compañías), ordenados por la fecha límite más próxima a vencer.
   */
  async findPendingApproval(user: User): Promise<Order[]> {
    const companyIds = await this.allowedCompanyIds(user);
    return this.ordersRepository.find({
      where: companyIds
        ? { companyId: In(companyIds), status: OrderStatus.PENDING_APPROVAL }
        : { status: OrderStatus.PENDING_APPROVAL },
      order: { approvalDeadline: 'ASC' },
    });
  }

  /**
   * Compañías sobre las que el usuario puede operar en cartera. Devuelve null
   * para administradores (acceso a todas). El rol CARTERA accede a todas sus
   * compañías asignadas. Cualquier otro rol (p. ej. vendedor) solo accede a las
   * compañías donde tenga asignado el módulo de aprobación de cartera
   * (`/admin/cartera`). Así cartera de una compañía no ve ni aprueba pedidos de
   * otra, y un vendedor sin ese módulo no puede usar la aprobación.
   */
  private async allowedCompanyIds(user: User): Promise<string[] | null> {
    if (user.role === UserRole.ADMIN) return null;
    const mappings = await this.usersService.findCompaniesForUser(user.id);
    if (user.role === UserRole.CARTERA) {
      return mappings.map((m) => m.companyId);
    }
    return mappings
      .filter((m) => (m.permissions ?? []).includes('/admin/cartera'))
      .map((m) => m.companyId);
  }

  /** Verifica que el pedido pertenezca a una compañía permitida al usuario. */
  private async assertOrderCompany(user: User, order: Order): Promise<void> {
    const companyIds = await this.allowedCompanyIds(user);
    if (companyIds && !companyIds.includes(order.companyId)) {
      throw new ForbiddenException('No tiene acceso a esta compañía.');
    }
  }

  /**
   * Aprueba un pedido retenido por cartera: queda confirmado y se sube de
   * inmediato al ERP (queda "enviado a Siesa"). Si la subida falla, el pedido
   * queda en error para reintentar.
   */
  async approveOrder(id: string, user: User): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: { id },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    await this.assertOrderCompany(user, order);
    if (order.status !== OrderStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'El pedido no está pendiente de aprobación en cartera.',
      );
    }
    order.status = OrderStatus.CONFIRMED;
    order.approvedAt = new Date();
    order.approvedBy = user.name;
    order.sellerNotificationPending = true;
    const saved = await this.ordersRepository.save(order);
    // Tras aprobar, sube de inmediato al ERP.
    return this.pushOrder(saved);
  }

  /**
   * Desaprueba un pedido retenido por cartera: pasa a DISAPPROVED y devuelve el
   * inventario reservado. Se usa tanto en el rechazo manual como en el
   * vencimiento automático del tiempo de aprobación.
   */
  async disapproveOrder(
    id: string,
    reason: string | undefined,
    user: User,
  ): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const ordersRepo = manager.getRepository(Order);
      const order = await ordersRepo.findOne({ where: { id } });
      if (!order) throw new NotFoundException('Pedido no encontrado');
      await this.assertOrderCompany(user, order);
      if (order.status !== OrderStatus.PENDING_APPROVAL) {
        throw new BadRequestException(
          'El pedido no está pendiente de aprobación en cartera.',
        );
      }
      await this.releaseStock(manager, order);
      order.status = OrderStatus.DISAPPROVED;
      order.disapprovalReason = reason?.trim() || 'Desaprobado en cartera.';
      order.approvedBy = user.name;
      order.approvedAt = new Date();
      order.sellerNotificationPending = true;
      return ordersRepo.save(order);
    });
  }

  /**
   * Vence automáticamente los pedidos cuya ventana de aprobación (2 horas) ya
   * terminó: pasan a EXPIRED (vencido) y se devuelve su inventario (lo digitado
   * vuelve al stock). Devuelve cuántos se procesaron.
   */
  async expireOverdueApprovals(): Promise<number> {
    const overdue = await this.ordersRepository.find({
      where: {
        status: OrderStatus.PENDING_APPROVAL,
        approvalDeadline: LessThan(new Date()),
      },
    });
    let processed = 0;
    for (const order of overdue) {
      try {
        await this.expireOrder(order.id);
        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `No se pudo vencer el pedido ${order.orderNumber}: ${message}`,
        );
      }
    }
    if (processed > 0) {
      this.logger.log(
        `Pedidos vencidos por tiempo de aprobación de cartera: ${processed}`,
      );
    }
    return processed;
  }

  /**
   * Marca un pedido como EXPIRED (vencido) por agotarse el tiempo de aprobación
   * en cartera y devuelve su inventario reservado al stock disponible.
   */
  private async expireOrder(id: string): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const ordersRepo = manager.getRepository(Order);
      const order = await ordersRepo.findOne({ where: { id } });
      if (!order) throw new NotFoundException('Pedido no encontrado');
      if (order.status !== OrderStatus.PENDING_APPROVAL) {
        throw new BadRequestException(
          'El pedido no está pendiente de aprobación en cartera.',
        );
      }
      await this.releaseStock(manager, order);
      order.status = OrderStatus.EXPIRED;
      order.disapprovalReason =
        'Tiempo de aprobación en cartera vencido (2 horas).';
      order.approvedBy = 'Sistema';
      order.approvedAt = new Date();
      order.sellerNotificationPending = true;
      return ordersRepo.save(order);
    });
  }

  /**
   * Devuelve al inventario el stock de las líneas de un pedido (con bloqueo
   * pesimista para evitar condiciones de carrera).
   */
  private async releaseStock(
    manager: EntityManager,
    order: Order,
  ): Promise<void> {    const productsRepo = manager.getRepository(Product);
    for (const item of order.items ?? []) {
      if (!item.product) continue;
      const product = await productsRepo.findOne({
        where: { id: item.product.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (product) {
        product.stock = Number(product.stock) + Number(item.quantity);
        await productsRepo.save(product);
      }
    }
  }

  /**
   * Pedidos del vendedor sobre los que cartera tomó una decisión
   * (aprobado/desaprobado) y que aún no han sido notificados al vendedor.
   * Se consultan en todas las compañías.
   */
  async findSellerNotifications(sellerId: string): Promise<Order[]> {
    return this.ordersRepository.find({
      where: { seller: { id: sellerId }, sellerNotificationPending: true },
      order: { approvedAt: 'DESC' },
    });
  }

  /**
   * Marca como notificado un pedido del vendedor (después de mostrarle el
   * aviso de aprobación/desaprobación de cartera).
   */
  async acknowledgeNotification(
    sellerId: string,
    id: string,
  ): Promise<{ ok: true }> {
    const order = await this.ordersRepository.findOne({
      where: { id, seller: { id: sellerId } },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    order.sellerNotificationPending = false;
    await this.ordersRepository.save(order);
    return { ok: true };
  }

  /**
   * Pedidos del vendedor cuyo estado cambió en Siesa y que aún no se le han
   * mostrado (modal de cambio de estado). Se consultan en todas las compañías.
   */
  async findSiesaStateNotifications(sellerId: string): Promise<Order[]> {
    return this.ordersRepository.find({
      where: { seller: { id: sellerId }, siesaStateNotificationPending: true },
      order: { updatedAt: 'DESC' },
    });
  }

  /** Marca como visto el aviso de cambio de estado de Siesa de un pedido. */
  async acknowledgeSiesaStateNotification(
    sellerId: string,
    id: string,
  ): Promise<{ ok: true }> {
    const order = await this.ordersRepository.findOne({
      where: { id, seller: { id: sellerId } },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    order.siesaStateNotificationPending = false;
    await this.ordersRepository.save(order);
    return { ok: true };
  }


  /**
   * Edita un pedido pendiente por envío (CONFIRMED o FAILED): reemplaza sus
   * líneas (permite agregar/quitar productos y cambiar cantidades/descuentos).
   * Devuelve al inventario el stock de las líneas anteriores y descuenta el de
   * las nuevas, todo de forma atómica. Recalcula los totales.
   */
  async update(
    companyId: string,
    id: string,
    dto: UpdateOrderDto,
  ): Promise<Order> {
    const updated = await this.dataSource.transaction(async (manager) => {
      const ordersRepo = manager.getRepository(Order);
      const itemsRepo = manager.getRepository(OrderItem);
      const productsRepo = manager.getRepository(Product);

      const order = await ordersRepo.findOne({ where: { id, companyId } });
      if (!order) throw new NotFoundException('Pedido no encontrado');

      if (
        order.status !== OrderStatus.CONFIRMED &&
        order.status !== OrderStatus.FAILED
      ) {
        throw new BadRequestException(
          'Solo se pueden editar pedidos pendientes por envío.',
        );
      }

      // Devuelve al inventario el stock de las líneas actuales.
      for (const item of order.items) {
        if (!item.product) continue;
        const product = await productsRepo.findOne({
          where: { id: item.product.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (product) {
          product.stock = Number(product.stock) + Number(item.quantity);
          await productsRepo.save(product);
        }
      }

      // Elimina las líneas anteriores (la relación no borra huérfanos solo).
      if (order.items.length > 0) {
        await itemsRepo.remove(order.items);
      }

      // Reconstruye las líneas con la lista de precios actual del cliente,
      // descontando de nuevo el stock.
      const { items, subtotal, taxes } = await this.buildItemsAndAdjustStock(
        manager,
        companyId,
        order.customer,
        dto.items,
      );

      order.items = items;
      order.subtotal = Number(subtotal.toFixed(2));
      order.taxes = Number(taxes.toFixed(2));
      order.total = Number((subtotal + taxes).toFixed(2));
      if (dto.notes !== undefined) order.notes = dto.notes;
      if (dto.logisticsNote !== undefined)
        order.logisticsNote = dto.logisticsNote;
      if (dto.deliveryType !== undefined)
        order.deliveryType = dto.deliveryType;
      if (dto.deliverySchedule !== undefined)
        order.deliverySchedule = dto.deliverySchedule;
      if (dto.deliveryDate !== undefined) order.deliveryDate = dto.deliveryDate;
      // Actualiza el horario predeterminado del cliente.
      if (dto.deliveryScheduleData && order.customer) {
        await manager
          .getRepository(ClientRecord)
          .update(
            { id: order.customer.id, companyId },
            { deliverySchedule: dto.deliveryScheduleData },
          );
      }
      // Tras editar, vuelve a quedar pendiente por envío y se limpia el error.
      order.status = OrderStatus.CONFIRMED;
      order.syncError = undefined;

      return ordersRepo.save(order);
    });

    // Tras editar, se reintenta la subida al ERP de inmediato.
    return this.pushOrder(updated);
  }

  // ==================== Controlador de subproductos ====================

  /**
   * Solo el usuario con el módulo "Controlador Subproductos" asignado (en
   * Agropecuaria) o un administrador puede gestionar estos pedidos.
   */
  async assertCanControlSubproductos(user: User): Promise<void> {
    if (user.role === UserRole.ADMIN) return;
    const ok = await this.usersService.hasPermissionInCompany(
      user.id,
      baseCompanyId('3'),
      '/admin/controlador-subproductos',
    );
    if (!ok) {
      throw new ForbiddenException(
        'No tienes permiso para el controlador de subproductos.',
      );
    }
  }

  /** Pedidos de subproductos a la espera de revisión/aprobación del controlador. */
  findPendingSubproductos(): Promise<Order[]> {
    return this.ordersRepository.find({
      where: [
        { type: 'subproducto', status: OrderStatus.PENDING_CONTROL },
        { type: 'subproducto', status: OrderStatus.FAILED },
      ],
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Edita un pedido de subproductos pendiente de control: reemplaza sus líneas
   * (agregar/quitar productos, cambiar cantidades/descuentos) y recalcula los
   * totales. Devuelve el stock anterior y descuenta el nuevo. NO sube a Siesa.
   */
  async editSubproductoOrder(id: string, dto: UpdateOrderDto): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const ordersRepo = manager.getRepository(Order);
      const itemsRepo = manager.getRepository(OrderItem);
      const productsRepo = manager.getRepository(Product);

      const order = await ordersRepo.findOne({ where: { id } });
      if (!order) throw new NotFoundException('Pedido no encontrado');
      if (order.type !== 'subproducto') {
        throw new BadRequestException('El pedido no es de subproductos.');
      }
      if (
        order.status !== OrderStatus.PENDING_CONTROL &&
        order.status !== OrderStatus.FAILED
      ) {
        throw new BadRequestException(
          'Solo se editan pedidos de subproductos pendientes de control.',
        );
      }

      // Devuelve al inventario el stock de las líneas actuales.
      for (const item of order.items) {
        if (!item.product) continue;
        const product = await productsRepo.findOne({
          where: { id: item.product.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (product) {
          product.stock = Number(product.stock) + Number(item.quantity);
          await productsRepo.save(product);
        }
      }
      if (order.items.length > 0) {
        await itemsRepo.remove(order.items);
      }

      const { items, subtotal, taxes } = await this.buildItemsAndAdjustStock(
        manager,
        order.companyId,
        order.customer,
        dto.items,
        'subproducto',
      );

      order.items = items;
      order.subtotal = Number(subtotal.toFixed(2));
      order.taxes = Number(taxes.toFixed(2));
      order.total = Number((subtotal + taxes).toFixed(2));
      if (dto.notes !== undefined) order.notes = dto.notes;
      if (dto.logisticsNote !== undefined)
        order.logisticsNote = dto.logisticsNote;
      if (dto.deliveryDate !== undefined) order.deliveryDate = dto.deliveryDate;
      // Vuelve a quedar pendiente de control y se limpia cualquier error previo.
      order.status = OrderStatus.PENDING_CONTROL;
      order.syncError = undefined;
      return ordersRepo.save(order);
    });
  }

  /**
   * Aprueba (controlador) un pedido de subproductos. Luego pasa por la lógica
   * de cartera: si el cliente no debe, se sube a Siesa de inmediato; si debe,
   * queda "pendiente por aprobación en cartera" (2 horas; si no se gestiona, se
   * vence y se devuelve el inventario). Al vendedor se le refleja en el estado.
   */
  async approveSubproductoOrder(id: string, user: User): Promise<Order> {
    const order = await this.ordersRepository.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    if (order.type !== 'subproducto') {
      throw new BadRequestException('El pedido no es de subproductos.');
    }
    if (
      order.status !== OrderStatus.PENDING_CONTROL &&
      order.status !== OrderStatus.FAILED
    ) {
      throw new BadRequestException('El pedido no está pendiente de control.');
    }

    // Evalúa la cartera del cliente (el controlador ya revisó el pedido).
    // Misma regla que en la creación: se retiene si el cliente tiene cualquier
    // saldo pendiente en cartera o si el pedido supera el cupo de crédito.
    const cartera = await this.resolveCarteraStatus(
      order.companyId,
      order.customer.code,
    );
    const exceedsCredit =
      cartera.creditLimit > 0 &&
      cartera.balance + Number(order.total) > cartera.creditLimit;
    const needsApproval = cartera.balance > 0 || exceedsCredit;

    if (needsApproval) {
      // Queda retenido para aprobación en cartera (ventana de 2 horas). El
      // vendedor lo ve reflejado en el estado; la notificación final la dispara
      // la decisión de cartera (aprobado/desaprobado/vencido).
      order.status = OrderStatus.PENDING_APPROVAL;
      order.carteraBalance = cartera.balance;
      order.approvalDeadline = new Date(
        Date.now() + APPROVAL_WINDOW_HOURS * 60 * 60 * 1000,
      );
      order.approvedBy = user.name;
      order.approvedAt = new Date();
      return this.ordersRepository.save(order);
    }

    // Al día y con cupo: se confirma y se sube a Siesa (dividido por categoría).
    order.status = OrderStatus.CONFIRMED;
    order.approvedBy = user.name;
    order.approvedAt = new Date();
    const saved = await this.ordersRepository.save(order);
    return this.pushOrder(saved);
  }

  /** Rechaza un pedido de subproductos: devuelve el stock y lo marca rechazado. */
  async rejectSubproductoOrder(
    id: string,
    reason: string | undefined,
    user: User,
  ): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const ordersRepo = manager.getRepository(Order);
      const order = await ordersRepo.findOne({ where: { id } });
      if (!order) throw new NotFoundException('Pedido no encontrado');
      if (order.type !== 'subproducto') {
        throw new BadRequestException('El pedido no es de subproductos.');
      }
      if (
        order.status !== OrderStatus.PENDING_CONTROL &&
        order.status !== OrderStatus.FAILED
      ) {
        throw new BadRequestException('El pedido no está pendiente de control.');
      }
      await this.releaseStock(manager, order);
      order.status = OrderStatus.DISAPPROVED;
      order.disapprovalReason =
        reason?.trim() || 'Rechazado por el controlador de subproductos.';
      order.approvedBy = user.name;
      order.approvedAt = new Date();
      order.sellerNotificationPending = true;
      return ordersRepo.save(order);
    });
  }

  /**
   * Construye las líneas de un pedido a partir de la lista de precios del
   * cliente, validando inventario y stock, y descuenta el stock dentro de la
   * transacción dada. Devuelve las líneas y los acumulados de subtotal/impuestos.
   */
  private async buildItemsAndAdjustStock(
    manager: EntityManager,
    companyId: string,
    customer: ClientRecord,
    itemDtos: CreateOrderItemDto[],
    type = 'corte',
  ): Promise<{ items: OrderItem[]; subtotal: number; taxes: number }> {
    // El precio depende de la lista de precios asignada al cliente.
    if (!customer.priceList) {
      throw new BadRequestException(
        'El cliente no tiene una lista de precios asignada.',
      );
    }
    // El catálogo de venta es la lista del cliente: trae precio, nombre y
    // unidad de medida por referencia.
    const listItems = await this.priceListsService.findListItemMap(
      companyId,
      customer.priceList,
    );

    const productsRepo = manager.getRepository(Product);
    const items: OrderItem[] = [];
    let subtotal = 0;
    let taxes = 0;

    for (const itemDto of itemDtos) {
      const sku = itemDto.sku.trim();
      const listItem = listItems.get(sku);
      if (!listItem) {
        throw new BadRequestException(
          `El producto "${sku}" no está en la lista ${customer.priceList} ` +
            `del cliente.`,
        );
      }

      // El producto debe existir en el inventario y tener stock suficiente.
      // Bloqueamos la fila (FOR UPDATE) para que dos pedidos simultáneos no
      // puedan descontar el mismo stock y provocar sobreventa. El inventario de
      // subproductos vive en la compañía base (Agropecuaria).
      const inventoryCompany =
        type === 'subproducto' ? baseCompanyId(companyId) : companyId;
      const product = await productsRepo.findOne({
        where: { sku, companyId: inventoryCompany, type },
        lock: { mode: 'pessimistic_write' },
      });
      if (!product) {
        throw new BadRequestException(
          `El producto "${listItem.productName}" no está en el inventario.`,
        );
      }
      if (Number(product.stock) < itemDto.quantity) {
        throw new BadRequestException(
          `Stock insuficiente para "${listItem.productName}": ` +
            `disponible ${Number(product.stock)}, solicitado ${itemDto.quantity}.`,
        );
      }

      const discountPct = itemDto.discountPct ?? 0;
      const unitPrice = Number(listItem.price);
      const taxRate = Number(product.taxRate);
      const gross = unitPrice * itemDto.quantity;
      const discountAmount = (gross * discountPct) / 100;
      const net = gross - discountAmount;
      const lineTax = (net * taxRate) / 100;

      const item = new OrderItem();
      item.product = product;
      item.sku = sku;
      item.productName = listItem.productName;
      item.unitOfMeasure = listItem.unitOfMeasure;
      item.quantity = itemDto.quantity;
      item.unitPrice = unitPrice;
      item.discountPct = discountPct;
      item.taxRate = taxRate;
      item.lineTotal = Number(net.toFixed(2));

      items.push(item);
      subtotal += net;
      taxes += lineTax;

      // Pedido pendiente: descuenta el stock del producto.
      product.stock = Number(product.stock) - itemDto.quantity;
      await productsRepo.save(product);
    }

    return { items, subtotal, taxes };
  }

  /**
   * Pedidos del vendedor, filtrados por rango de fechas y/o cliente. Los
   * filtros son obligatorios en la práctica (el frontend siempre envía un
   * rango de fechas por defecto) para no traer todo el histórico de una vez.
   */
  findAllForSeller(
    companyId: string,
    sellerId: string,
    filters?: { from?: string; to?: string; customerId?: string },
  ): Promise<Order[]> {
    const where: Record<string, unknown> = {
      companyId,
      seller: { id: sellerId },
    };

    const from = filters?.from ? new Date(`${filters.from}T00:00:00`) : undefined;
    const to = filters?.to ? new Date(`${filters.to}T23:59:59.999`) : undefined;
    if (from && to) where.createdAt = Between(from, to);
    else if (from) where.createdAt = MoreThanOrEqual(from);
    else if (to) where.createdAt = LessThanOrEqual(to);

    if (filters?.customerId) where.customer = { id: filters.customerId };

    return this.ordersRepository
      .find({
        where,
        order: { createdAt: 'DESC' },
        take: 200,
      })
      .then((orders) => this.withCustomerPriceListName(companyId, orders));
  }

  /**
   * Estado real en Siesa de los pedidos del vendedor. Consulta el ERP y cruza
   * por `NUM_REFERENCIA` (el `documento_venta` que enviamos al subir el pedido,
   * que equivale a nuestro `orderNumber`), devolviendo solo los pedidos del
   * vendedor en esta compañía. Mapa: orderNumber -> estado, facturado,
   * despachado. Cruzar por `NUM_REFERENCIA` (y no por `CONSECUTIVO`) evita
   * colisiones con el histórico de Siesa en compañías que ya tienen miles de
   * documentos previos (p. ej. Carnes Frías), donde el consecutivo asignado por
   * Siesa no coincide con nuestro `orderNumber`.
   */
  async getSiesaStates(
    companyId: string,
    sellerId: string,
  ): Promise<Record<string, SiesaOrderState>> {
    const orders = await this.ordersRepository.find({
      where: { companyId, seller: { id: sellerId } },
      select: { id: true, orderNumber: true },
    });
    if (orders.length === 0) return {};

    // Si el ERP/Siesa está caído, se devuelve un mapa vacío en vez de propagar
    // el error: el vendedor sigue viendo sus pedidos, solo sin el estado Siesa.
    let states: ErpOrderState[];
    try {
      states = await this.erpClient.getOrderStates(companyId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `No se pudo consultar el estado en Siesa (compañía ${companyId}): ${message}`,
      );
      return {};
    }
    const byReferencia = this.indexStatesByReferencia(
      this.filterStatesForCompany(companyId, states),
    );

    const result: Record<string, SiesaOrderState> = {};
    for (const order of orders) {
      const referencia = parseInt(order.orderNumber, 10);
      if (Number.isNaN(referencia)) continue;
      const state = byReferencia.get(referencia);
      if (!state) continue;
      result[order.orderNumber] = {
        estado: state.DESC_ESTADO,
        facturado: Number(state.FACTURADO) === 1,
        despachado: Number(state.DESPACHADO) === 1,
      };
    }
    return result;
  }

  /**
   * Filtra la lista de estados del ERP para quedarse solo con los documentos
   * que pertenecen a la compañía indicada, usando el centro de operación (CO).
   *
   * MONTERIA TAT comparte `cia` y `tipo_doc` con AGROPECUARIA, así que la
   * consulta de estados devuelve documentos de ambas. Sin este filtro, un
   * pedido de Montería (consecutivo propio) cruzaría por `NUM_REFERENCIA` con un
   * documento de Agropecuaria que tenga el mismo número, mostrando estados que
   * no le corresponden. El CO separa unos de otros:
   *  - Compañía virtual (Montería): solo sus documentos (CO propio, p. ej. 302).
   *  - Compañía base (Agropecuaria): todos menos los CO de sus virtuales.
   */
  private filterStatesForCompany(
    companyId: string,
    states: ErpOrderState[],
  ): ErpOrderState[] {
    const own = getOperationCenter(companyId);
    if (own) {
      return states.filter((s) => String(s.CO ?? '').trim() === own);
    }
    const exclude = virtualOperationCentersForBase(baseCompanyId(companyId));
    if (exclude.length === 0) return states;
    return states.filter(
      (s) => !exclude.includes(String(s.CO ?? '').trim()),
    );
  }

  /**
   * Indexa los estados de Siesa por su `NUM_REFERENCIA`, que es el
   * `documento_venta` que enviamos al subir el pedido y equivale a nuestro
   * `orderNumber`. Así el pedido #1 se cruza con el documento cuyo
   * `NUM_REFERENCIA` es 1, sin depender del consecutivo interno de Siesa.
   */
  private indexStatesByReferencia(
    states: ErpOrderState[],
  ): Map<number, ErpOrderState> {
    const byReferencia = new Map<number, ErpOrderState>();
    for (const state of states) {
      const referencia = parseInt(state.NUM_REFERENCIA, 10);
      if (Number.isNaN(referencia)) continue;
      byReferencia.set(referencia, state);
    }
    return byReferencia;
  }

  /**
   * Sincroniza el estado de los pedidos contra Siesa para TODAS las compañías.
   * Hoy reacciona a las anulaciones: si un pedido que ya subimos al ERP aparece
   * anulado en Siesa, lo anula también en el sistema (devuelve el stock y deja
   * de contar en estadísticas). Devuelve cuántos pedidos se anularon.
   */
  /**
   * Sincroniza el estado de los pedidos contra Siesa para TODAS las compañías.
   * Reacciona a dos casos sobre los pedidos ya enviados al ERP:
   *  - Anulados en Siesa  -> se anulan en el sistema (CANCELLED).
   *  - Rebotados (no aparecen en el ERP tras el periodo de gracia) -> REBOTADO.
   * En ambos casos se devuelve el stock. Devuelve cuántos pedidos cambiaron.
   */
  async syncSiesaStatuses(): Promise<number> {
    let updated = 0;
    for (const company of COMPANIES) {
      try {
        updated += await this.syncSiesaStatusesForCompany(company.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `No se pudo sincronizar estados de Siesa (compañía ${company.id}): ${message}`,
        );
      }
    }
    if (updated > 0) {
      this.logger.log(
        `Pedidos actualizados por sincronización con Siesa (anulados/rebotados): ${updated}`,
      );
    }
    return updated;
  }

  /** Sincroniza anulaciones y rebotes de Siesa para una compañía. */
  private async syncSiesaStatusesForCompany(companyId: string): Promise<number> {
    // Solo los pedidos que ya subimos al ERP y que aún no llegaron a su estado
    // final (Despachado) pueden cambiar de estado, anularse o rebotar.
    const syncedOrders = await this.ordersRepository.find({
      where: {
        companyId,
        status: OrderStatus.SYNCED,
        siesaTrackingDone: false,
      },
      relations: { seller: true },
      select: {
        id: true,
        orderNumber: true,
        syncedAt: true,
        siesaEstado: true,
        seller: { id: true },
      },
    });
    if (syncedOrders.length === 0) return 0;

    const states = await this.erpClient.getOrderStates(companyId);
    // Una lista vacía no prueba que los pedidos no entraron: suele ser una
    // caída/timeout de la BD de Siesa. Sin este resguardo, TODOS los pedidos
    // enviados se marcarían como rebotados (devolviendo stock y sacándolos de
    // ventas). Se omite el ciclo y se reintenta en la próxima sincronización.
    if (states.length === 0) return 0;
    const byReferencia = this.indexStatesByReferencia(
      this.filterStatesForCompany(companyId, states),
    );

    let updated = 0;
    for (const order of syncedOrders) {
      // Se cruza por NUM_REFERENCIA (nuestro orderNumber / documento_venta).
      const referencia = parseInt(order.orderNumber, 10);
      if (Number.isNaN(referencia)) continue;
      const state = byReferencia.get(referencia);

      // No apareció en el ERP: en Siesa el rebote es inmediato (o entra o
      // rebota). Solo se respeta un pequeño margen de asentamiento para que la
      // consulta sea posterior al envío; pasado eso, se marca REBOTADO.
      if (!state) {
        const syncedAt = order.syncedAt ? new Date(order.syncedAt).getTime() : 0;
        if (!syncedAt || Date.now() - syncedAt < BOUNCE_SETTLE_MS) continue;
        try {
          await this.markAsBounced(order.id, companyId);
          updated += 1;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `No se pudo marcar como rebotado el pedido ${order.orderNumber}: ${message}`,
          );
        }
        continue;
      }

      // Estado efectivo: incluye Facturado y Despachado como hitos. Si cambió
      // respecto al último conocido, se deja un aviso para el vendedor.
      const eff = this.effectiveSiesaState(state);
      if (eff.label && eff.label !== (order.siesaEstado ?? '')) {
        try {
          await this.recordSiesaStateChange(
            order.id,
            companyId,
            eff.label,
            eff.final,
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `No se pudo registrar el cambio de estado del pedido ${order.orderNumber}: ${message}`,
          );
        }
      }

      // Si quedó anulado, se anula también en el sistema (devuelve el stock).
      if (eff.anulado) {
        try {
          await this.cancelFromSiesa(order.id, companyId);
          updated += 1;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `No se pudo anular el pedido ${order.orderNumber} por Siesa: ${message}`,
          );
        }
      }
    }
    return updated;
  }

  /**
   * Estado efectivo del pedido en Siesa para mostrar al vendedor. Combina el
   * estado base (DESC_ESTADO) con los hitos de Facturado y Despachado. El orden
   * de prioridad refleja el avance del pedido; Despachado es el estado final.
   */
  private effectiveSiesaState(state: ErpOrderState): {
    label: string;
    final: boolean;
    anulado: boolean;
  } {
    const desc = (state.DESC_ESTADO ?? '').trim();
    const anulado = state.ESTADO === 9 || desc.toLowerCase().includes('anulad');
    if (anulado) return { label: desc || 'Anulado', final: true, anulado: true };
    if (Number(state.DESPACHADO) === 1)
      return { label: 'Despachado', final: true, anulado: false };
    if (Number(state.FACTURADO) === 1)
      return { label: 'Facturado', final: false, anulado: false };
    return { label: desc, final: false, anulado: false };
  }

  /**
   * Registra un cambio de estado de Siesa y deja el aviso pendiente para el
   * vendedor. Guarda el estado anterior (para el mensaje "de X a Y") y el nuevo.
   * Si el estado es final (Despachado), marca el pedido para no consultarlo más.
   */
  private async recordSiesaStateChange(
    id: string,
    companyId: string,
    newEstado: string,
    final = false,
  ): Promise<void> {
    const order = await this.ordersRepository.findOne({
      where: { id, companyId },
    });
    if (!order) return;
    order.siesaStatePrevious = order.siesaEstado;
    order.siesaEstado = newEstado;
    order.siesaStateNotificationPending = true;
    if (final) order.siesaTrackingDone = true;
    await this.ordersRepository.save(order);
    this.logger.log(
      `Pedido ${order.orderNumber} (compañía ${companyId}) cambió de estado en Siesa a "${newEstado}".`,
    );
  }

  /**
   * Anula un pedido porque Siesa lo reporta anulado: devuelve el stock de cada
   * línea y lo marca como CANCELLED (con lo que sale de las estadísticas).
   * A diferencia de la anulación manual, sí opera sobre pedidos ya enviados.
   */
  private async cancelFromSiesa(id: string, companyId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const ordersRepo = manager.getRepository(Order);
      const order = await ordersRepo.findOne({ where: { id, companyId } });
      if (!order) return;
      // Si entre la consulta y ahora cambió de estado, no se vuelve a procesar.
      if (order.status === OrderStatus.CANCELLED) return;

      await this.releaseStock(manager, order);
      order.status = OrderStatus.CANCELLED;
      order.cancelReason = 'Anulado en Siesa.';
      await ordersRepo.save(order);
      this.logger.log(
        `Pedido ${order.orderNumber} (compañía ${companyId}) anulado por Siesa; stock devuelto.`,
      );
    });
  }

  /**
   * Marca un pedido como REBOTADO porque Siesa lo rechazó (no quedó registrado
   * en el ERP tras el periodo de gracia): devuelve el stock al inventario, igual
   * que una anulación, pero el pedido queda con estado REBOTADO.
   */
  private async markAsBounced(id: string, companyId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const ordersRepo = manager.getRepository(Order);
      const order = await ordersRepo.findOne({ where: { id, companyId } });
      if (!order) return;
      // Solo se rebota si sigue como enviado (evita pisar otro cambio de estado).
      if (order.status !== OrderStatus.SYNCED) return;

      await this.releaseStock(manager, order);
      order.status = OrderStatus.BOUNCED;
      order.cancelReason = 'Rebotado en Siesa (no quedó registrado en el ERP).';
      // Deja el aviso de cambio de estado para el vendedor.
      order.siesaStatePrevious = order.siesaEstado;
      order.siesaEstado = 'Rebotado';
      order.siesaStateNotificationPending = true;
      await ordersRepo.save(order);
      this.logger.log(
        `Pedido ${order.orderNumber} (compañía ${companyId}) marcado como REBOTADO; stock devuelto.`,
      );
    });
  }

  async findOne(companyId: string, id: string): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: { id, companyId },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    await this.withCustomerPriceListName(companyId, [order]);
    return order;
  }

  /**
   * Garantiza que un pedido pertenezca al vendedor autenticado antes de leerlo
   * o modificarlo. Los administradores quedan exentos. Devuelve 404 (y no 403)
   * para no revelar la existencia de pedidos ajenos.
   */
  async assertSellerOwnsOrder(
    companyId: string,
    id: string,
    user: User,
  ): Promise<void> {
    if (user.role === UserRole.ADMIN) return;
    const count = await this.ordersRepository.count({
      where: { id, companyId, seller: { id: user.id } },
    });
    if (count === 0) throw new NotFoundException('Pedido no encontrado');
  }

  /**
   * Rellena el nombre de la lista de precios (DESC_LISTA) del cliente de cada
   * pedido, para mostrar la descripción en lugar del código.
   */
  private async withCustomerPriceListName(
    companyId: string,
    orders: Order[],
  ): Promise<Order[]> {
    if (orders.length === 0) return orders;
    const [listNames, sellerNames] = await Promise.all([
      this.priceListsService.findListNameMap(companyId),
      this.usersService.getSellerNameMap(companyId),
    ]);
    for (const order of orders) {
      if (!order.customer) continue;
      const listCode = order.customer.priceList?.trim();
      if (listCode) order.customer.priceListName = listNames.get(listCode);
      const sellerCode = order.customer.sellerCode?.trim();
      if (sellerCode) order.customer.sellerName = sellerNames.get(sellerCode);
    }
    return orders;
  }

  /** Genera el PDF (documento) de un pedido. */
  async generatePdf(
    companyId: string,
    id: string,
    downloadedBy?: string,
  ): Promise<Buffer> {
    const order = await this.findOne(companyId, id);
    const pdf = await buildOrderPdf(order);
    await this.ordersRepository.update(order.id, {
      downloadCount: (order.downloadCount ?? 0) + 1,
      downloadedAt: new Date(),
      downloadedBy: downloadedBy ?? order.downloadedBy,
    });
    return pdf;
  }

  async confirm(companyId: string, id: string): Promise<Order> {
    const order = await this.findOne(companyId, id);
    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException(
        'Solo se pueden confirmar pedidos en borrador',
      );
    }
    order.status = OrderStatus.CONFIRMED;
    return this.ordersRepository.save(order);
  }

  /**
   * Anula un pedido: exige un motivo y devuelve al inventario el stock que se
   * había descontado al crearlo.
   */
  async cancel(companyId: string, id: string, reason: string): Promise<Order> {
    const trimmed = reason?.trim();
    if (!trimmed) {
      throw new BadRequestException(
        'Debe indicar el motivo de la anulación.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const ordersRepo = manager.getRepository(Order);
      const productsRepo = manager.getRepository(Product);

      const order = await ordersRepo.findOne({ where: { id, companyId } });
      if (!order) throw new NotFoundException('Pedido no encontrado');
      if (order.status === OrderStatus.CANCELLED) {
        throw new BadRequestException('El pedido ya está anulado.');
      }
      if (order.status === OrderStatus.SYNCED) {
        throw new BadRequestException(
          'No se puede anular un pedido ya enviado a Siesa.',
        );
      }

      // Devuelve el stock de cada producto del pedido.
      for (const item of order.items) {
        if (!item.product) continue;
        const product = await productsRepo.findOne({
          where: { id: item.product.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (product) {
          product.stock = Number(product.stock) + Number(item.quantity);
          await productsRepo.save(product);
        }
      }

      order.status = OrderStatus.CANCELLED;
      order.cancelReason = trimmed;
      return ordersRepo.save(order);
    });
  }

  /**
   * Reintenta manualmente la subida de un pedido al ERP (por si la subida
   * automática falló o quedó fuera del horario de carga).
   */
  async syncToSiesa(companyId: string, id: string): Promise<Order> {
    // [TEMPORAL] Restricción de horario de carga desactivada.
    // Después de las 4:00 p.m. (Colombia) ya no se pueden subir pedidos.
    // if (!isOrderUploadOpen()) {
    //   throw new BadRequestException(
    //     `El envío no se pudo realizar porque está fuera del horario de carga. ` +
    //       `La subida de pedidos está disponible hasta las ` +
    //       `${ORDER_UPLOAD_CLOSE_HOUR - 12}:00 p.m.`,
    //   );
    // }
    const order = await this.findOne(companyId, id);
    if (
      order.status !== OrderStatus.CONFIRMED &&
      order.status !== OrderStatus.FAILED
    ) {
      throw new BadRequestException(
        'Solo se pueden enviar pedidos pendientes por envío o con error.',
      );
    }
    return this.pushOrder(order);
  }

  /**
   * Construye las líneas (registros) del pedido en el formato del ERP. Una
   * línea por cada ítem del pedido.
   */
  private async buildErpRegistros(order: Order): Promise<ErpOrderRegistro[]> {
    // El "vendedor" en el ERP es el documento (cédula) del usuario de la app.
    const sellerDocument = order.seller.documentId;
    const warehouse = getWarehouse(order.companyId);
    const orderDate = bogotaToday();
    // El ERP espera las fechas como YYYYMMDD (sin guiones).
    const toErpDate = (date: string) => date.replace(/-/g, '');

    // Las dos notas (logística y producto) se mandan concatenadas en un solo
    // campo `notas`, incluyendo solo las que tienen contenido.
    const notesParts: string[] = [];
    if (order.logisticsNote?.trim()) {
      notesParts.push(`notas logistica: ${order.logisticsNote.trim()}`);
    }
    if (order.notes?.trim()) {
      notesParts.push(`notas producto: ${order.notes.trim()}`);
    }
    const notas = notesParts.join(' / ');

    return order.items.map((item) => ({
      documento_venta: order.orderNumber,
      fecha: toErpDate(orderDate),
      cliente: order.customer.code,
      sucursal: order.customer.branch,
      vendedor: sellerDocument,
      fecha_de_entrega: toErpDate(order.deliveryDate ?? orderDate),
      bodega: warehouse,
      referencia: item.sku,
      um: item.unitOfMeasure ?? '',
      cantidad: String(Number(item.quantity)),
      precio: String(Number(item.unitPrice)),
      cond_pago: order.customer.paymentTerm ?? '',
      notas,
    }));
  }

  /**
   * Sube un pedido al ERP y persiste el estado resultante. Si está fuera del
   * horario de carga, el pedido queda "pendiente por envío" sin error.
   */
  private async pushOrder(order: Order): Promise<Order> {
    // [TEMPORAL] Restricción de horario de carga desactivada.
    // Fuera del horario de carga: no se sube, queda pendiente por envío.
    // if (!isOrderUploadOpen()) {
    //   order.status = OrderStatus.CONFIRMED;
    //   return this.ordersRepository.save(order);
    // }

    order.status = OrderStatus.SYNCING;
    await this.ordersRepository.save(order);

    try {
      const registros = await this.buildErpRegistros(order);
      let result;
      if (order.type === 'subproducto') {
        // El pedido de subproductos se divide por categoría al subir a Siesa:
        // RES → endpoint bovino, CERDO → endpoint porcino. Cada mitad usa un
        // consecutivo DISTINTO (Siesa no permite la misma O.C. en dos pedidos):
        // el bovino usa `orderNumber` y el porcino usa `secondNumber` (si el
        // pedido se dividió). Los registros van en el mismo orden que
        // order.items, así que se parean por índice.
        const categories =
          await this.priceListsService.getSubproductoCategories(
            order.companyId,
          );
        // El porcino usa el segundo consecutivo cuando el pedido se dividió; si
        // el pedido es solo porcino, usa el `orderNumber` (no hay bovino).
        const porcinoDoc = order.secondNumber ?? order.orderNumber;
        const bovino: ErpOrderRegistro[] = [];
        const porcino: ErpOrderRegistro[] = [];
        order.items.forEach((item, i) => {
          const cat = categories.get(item.sku.trim());
          if (cat === 'RES') {
            bovino.push(registros[i]);
          } else {
            if (cat !== 'CERDO') {
              this.logger.warn(
                `Subproducto sin categoría (SKU ${item.sku}) en pedido ` +
                  `${order.id}; se envía por el endpoint de porcino.`,
              );
            }
            porcino.push({ ...registros[i], documento_venta: porcinoDoc });
          }
        });
        result = await this.erpClient.uploadSubproductos(bovino, porcino);
      } else {
        result = await this.erpClient.uploadOrder(order.companyId, registros);
      }

      order.status = OrderStatus.SYNCED;
      // Marca el momento del envío para el periodo de gracia de "rebotado".
      order.syncedAt = new Date();
      // Se guarda el consecutivo REAL que Siesa asignó (no el orderNumber). Es
      // la única clave fiable para cruzar el estado del pedido con el ERP. Si
      // no se pudo extraer, queda sin asociar y no se sincroniza su estado.
      order.siesaDocumentId = result.consecutivo;
      order.syncError = undefined;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Fallo subiendo pedido ${order.id} al ERP: ${message}`);
      order.status = OrderStatus.FAILED;
      order.syncError = message;
    }

    return this.ordersRepository.save(order);
  }

  /**
   * Consecutivo del pedido. Los pedidos que suben al MISMO destino del ERP
   * comparten un solo consecutivo para que nunca se repitan:
   *  - Cortes de una compañía: su propio consecutivo.
   *  - Subproductos: comparten el consecutivo de los CORTES DE AGROPECUARIA
   *    (ambos se cargan al ERP de Agropecuaria).
   *
   * Se toma MAX(consecutivo)+1 del pool y se serializa con un lock de
   * transacción (pg_advisory_xact_lock) para evitar duplicados en creaciones
   * concurrentes (p. ej. un corte y un subproducto al tiempo, por orden de
   * llegada).
   */
  private async nextOrderNumber(
    companyId: string,
    type: string,
    manager: EntityManager,
  ): Promise<string> {
    const [first] = await this.reserveOrderNumbers(companyId, type, manager, 1);
    return first;
  }

  /**
   * Reserva `count` consecutivos del pool y los devuelve. Se usa para los
   * subproductos que se dividen en dos documentos (bovino/porcino), que
   * necesitan consecutivos DISTINTOS y consecutivos (p. ej. 2628 y 2629) porque
   * Siesa no permite dos pedidos con la misma O.C.
   */
  private async reserveOrderNumbers(
    companyId: string,
    type: string,
    manager: EntityManager,
    count: number,
  ): Promise<string[]> {
    const repo = manager.getRepository(Order);
    // Clave del pool: los subproductos usan la compañía base (Agropecuaria).
    const key = type === 'subproducto' ? baseCompanyId(companyId) : companyId;

    // Serializa la numeración del mismo pool. El lock se libera al finalizar la
    // transacción.
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `order-seq:${key}`,
    ]);

    // Compañías cuyos subproductos caen en este pool (su base es `key`).
    const bases = COMPANIES.map((c) => c.id).filter(
      (id) => baseCompanyId(id) === key,
    );

    // El máximo del pool considera tanto `order_number` como `second_number`
    // (el segundo consecutivo de los subproductos divididos), para no repetirlo.
    const qb = repo
      .createQueryBuilder('o')
      .select(
        'GREATEST(' +
          'COALESCE(MAX(CAST(o.order_number AS INTEGER)), 0), ' +
          'COALESCE(MAX(CAST(o.second_number AS INTEGER)), 0)' +
          ')',
        'max',
      )
      .where("(o.company_id = :key AND o.type = 'corte')", { key });
    if (bases.length > 0) {
      qb.orWhere("(o.type = 'subproducto' AND o.company_id IN (:...bases))", {
        bases,
      });
    }

    const row = await qb.getRawOne<{ max: string }>();
    const start = Number(row?.max ?? 0) + 1;
    return Array.from({ length: count }, (_, i) => String(start + i));
  }
}
