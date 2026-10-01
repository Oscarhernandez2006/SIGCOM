import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Not, Repository } from 'typeorm';
import {
  CanalOrder,
  CanalOrderItem,
  CanalOrderStatus,
} from './entities/canal-order.entity';
import { CreateCanalOrderDto } from './dto/create-canal-order.dto';
import { UpdateCanalOrderDto } from './dto/update-canal-order.dto';
import { CarteraDecisionDto } from './dto/cartera-decision.dto';
import { DispatchCanalOrderDto } from './dto/dispatch-canal-order.dto';
import pdfParse from 'pdf-parse';
import { User, UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { ClientsService } from '../clients/clients.service';
import { OrdersErpClient, ErpOrderRegistro } from '../orders/orders-erp.client';
import { getWarehouse } from '../../common/companies';

/** Estados que "ocupan cupo" (pedidos sin facturar todavía). */
const CUPO_ACTIVE_STATUSES = [
  CanalOrderStatus.PENDING_CARTERA,
  CanalOrderStatus.PENDING_DISPATCH,
  CanalOrderStatus.DISPATCHED,
  CanalOrderStatus.SYNCING,
  CanalOrderStatus.SYNCED,
  CanalOrderStatus.FAILED,
];

/** Módulos (permisos) que habilitan cada etapa del flujo. */
export const CANAL_CONTROL_PERMISSION = '/admin/canales-control';
export const CANAL_CARTERA_PERMISSION = '/admin/canales-cartera';
export const CANAL_DISPATCH_PERMISSION = '/admin/canales-despacho';

/** Información de cupo del cliente calculada para la validación de cartera. */
export interface CupoInfo {
  creditLimit: number;
  invoicedBalance: number;
  pendingOrdersTotal: number;
  available: number;
  exceeds: boolean;
  hasOverdue: boolean;
}

interface ParsedFrigoDoc {
  frigoAppId?: string;
  frigoKg?: number;
  frigoGanchos?: number;
  customerCode?: string;
}

@Injectable()
export class CanalOrdersService implements OnModuleInit {
  private readonly logger = new Logger(CanalOrdersService.name);

  constructor(
    @InjectRepository(CanalOrder)
    private readonly canalOrdersRepository: Repository<CanalOrder>,
    private readonly usersService: UsersService,
    private readonly clientsService: ClientsService,
    private readonly erpClient: OrdersErpClient,
  ) {}

  /**
   * Garantiza el estado y las columnas del flujo aunque DB_SYNCHRONIZE esté
   * desactivado (la tabla canal_orders ya existía con el esquema anterior).
   */
  async onModuleInit(): Promise<void> {
    await this.canalOrdersRepository.query(`
      DO $$ BEGIN
        CREATE TYPE canal_orders_status_enum AS ENUM (
          'pending_control','pending_cartera','rejected','pending_dispatch',
          'dispatched','syncing','synced','failed','cancelled'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await this.canalOrdersRepository.query(`
      ALTER TABLE canal_orders
        ADD COLUMN IF NOT EXISTS status canal_orders_status_enum NOT NULL DEFAULT 'pending_control',
        ADD COLUMN IF NOT EXISTS client_branch varchar,
        ADD COLUMN IF NOT EXISTS client_payment_term varchar,
        ADD COLUMN IF NOT EXISTS total_kg numeric(14,3) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_value numeric(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS control_note varchar,
        ADD COLUMN IF NOT EXISTS controlled_by varchar,
        ADD COLUMN IF NOT EXISTS controlled_at timestamptz,
        ADD COLUMN IF NOT EXISTS cartera_note varchar,
        ADD COLUMN IF NOT EXISTS cartera_by varchar,
        ADD COLUMN IF NOT EXISTS cartera_at timestamptz,
        ADD COLUMN IF NOT EXISTS credit_limit numeric(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS invoiced_balance numeric(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS pending_orders_total numeric(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS rejection_reason varchar,
        ADD COLUMN IF NOT EXISTS remision_number varchar,
        ADD COLUMN IF NOT EXISTS frigo_app_id varchar,
        ADD COLUMN IF NOT EXISTS frigo_kg numeric(14,3),
        ADD COLUMN IF NOT EXISTS frigo_ganchos int,
        ADD COLUMN IF NOT EXISTS frigo_pdf_base64 text,
        ADD COLUMN IF NOT EXISTS frigo_pdf_name varchar,
        ADD COLUMN IF NOT EXISTS dispatched_by varchar,
        ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
        ADD COLUMN IF NOT EXISTS siesa_document_id varchar,
        ADD COLUMN IF NOT EXISTS synced_at timestamptz,
        ADD COLUMN IF NOT EXISTS sync_error varchar,
        ADD COLUMN IF NOT EXISTS seller_notification_pending boolean NOT NULL DEFAULT false
    `);
  }

  /* ==================== Creación (vendedor) ==================== */

  /** Crea un pedido de canales; queda pendiente de revisión del controlador. */
  async create(
    companyId: string,
    dto: CreateCanalOrderDto,
    user: User,
  ): Promise<CanalOrder> {
    const last = await this.canalOrdersRepository.findOne({
      where: { companyId },
      order: { orderNumber: 'DESC' },
    });
    const orderNumber = (last?.orderNumber ?? 0) + 1;

    const items = dto.items.map((it) => this.normalizeItem(it));
    const { totalKg, totalValue } = this.computeTotals(items);

    const order = this.canalOrdersRepository.create({
      companyId,
      orderNumber,
      status: CanalOrderStatus.PENDING_CONTROL,
      sellerId: user.id,
      sellerName: user.name,
      dispatchDate: dto.dispatchDate,
      clientCode: dto.clientCode,
      clientName: dto.clientName,
      clientAddress: dto.clientAddress,
      clientCity: dto.clientCity,
      clientBranch: dto.clientBranch,
      clientPaymentTerm: dto.clientPaymentTerm,
      items,
      totalKg,
      totalValue,
    });

    return this.canalOrdersRepository.save(order);
  }

  /** Normaliza una línea: calcula kg estimados a partir del peso aproximado. */
  private normalizeItem(it: {
    itemRef: string;
    itemName: string;
    especie: string;
    quantity: number;
    approxWeightKg?: number;
    estimatedKg?: number;
    specifications?: string;
    price: number;
    freight?: number;
  }): CanalOrderItem {
    const approxWeightKg = Number(it.approxWeightKg ?? 0);
    const estimatedKg =
      it.estimatedKg != null && it.estimatedKg > 0
        ? Number(it.estimatedKg)
        : Number((it.quantity * approxWeightKg).toFixed(3));
    return {
      itemRef: it.itemRef,
      itemName: it.itemName,
      especie: it.especie,
      quantity: Number(it.quantity),
      approxWeightKg,
      estimatedKg,
      specifications: it.specifications ?? '',
      price: Number(it.price),
      freight: Number(it.freight ?? 0),
    };
  }

  /** Calcula kilos y valor total del pedido (se factura por kg). */
  private computeTotals(items: CanalOrderItem[]): {
    totalKg: number;
    totalValue: number;
  } {
    let totalKg = 0;
    let totalValue = 0;
    for (const it of items) {
      const kg = Number(it.estimatedKg) || 0;
      totalKg += kg;
      totalValue += kg * (Number(it.price) || 0) + (Number(it.freight) || 0);
    }
    return {
      totalKg: Number(totalKg.toFixed(3)),
      totalValue: Number(totalValue.toFixed(2)),
    };
  }

  /* ==================== Consultas ==================== */

  /** Consolidado de pedidos de la compañía (con filtro por fecha). */
  async findAll(
    companyId: string,
    from?: string,
    to?: string,
  ): Promise<CanalOrder[]> {
    const where: Record<string, unknown> = { companyId };
    if (from && to) {
      where.dispatchDate = Between(from, to);
    }
    return this.canalOrdersRepository.find({
      where,
      order: { dispatchDate: 'DESC', createdAt: 'DESC' },
    });
  }

  /** Pedidos del vendedor (para ver el estado del flujo). */
  async findAllForSeller(
    companyId: string,
    sellerId: string,
  ): Promise<CanalOrder[]> {
    return this.canalOrdersRepository.find({
      where: { companyId, sellerId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Pedidos del vendedor con aviso pendiente (decisión de cartera). */
  async findSellerNotifications(
    companyId: string,
    sellerId: string,
  ): Promise<CanalOrder[]> {
    return this.canalOrdersRepository.find({
      where: { companyId, sellerId, sellerNotificationPending: true },
      order: { updatedAt: 'DESC' },
      take: 20,
    });
  }

  /** Marca como visto el aviso de un pedido del vendedor. */
  async acknowledgeNotification(
    companyId: string,
    sellerId: string,
    id: string,
  ): Promise<{ ok: true }> {
    const order = await this.canalOrdersRepository.findOne({
      where: { id, companyId, sellerId },
    });
    if (!order) {
      throw new NotFoundException('Pedido de canales no encontrado.');
    }
    order.sellerNotificationPending = false;
    await this.canalOrdersRepository.save(order);
    return { ok: true };
  }

  async findOne(companyId: string, id: string): Promise<CanalOrder> {
    const order = await this.canalOrdersRepository.findOne({
      where: { id, companyId },
    });
    if (!order) {
      throw new NotFoundException('Pedido de canales no encontrado.');
    }
    return order;
  }

  /* ==================== Control (Zulma) ==================== */

  private async assertCanControl(user: User, companyId: string): Promise<void> {
    if (user.role === UserRole.ADMIN) return;
    const ok = await this.usersService.hasPermissionInCompany(
      user.id,
      companyId,
      CANAL_CONTROL_PERMISSION,
    );
    if (!ok) {
      throw new ForbiddenException(
        'No tienes permiso para el control de canales.',
      );
    }
  }

  /** Pedidos pendientes de revisión/aprobación del controlador. */
  async findForControl(companyId: string, user: User): Promise<CanalOrder[]> {
    await this.assertCanControl(user, companyId);
    return this.canalOrdersRepository.find({
      where: { companyId, status: CanalOrderStatus.PENDING_CONTROL },
      order: { createdAt: 'ASC' },
    });
  }

  /** Edita un pedido pendiente de control (cantidades, precios, datos). */
  async updateByControl(
    companyId: string,
    id: string,
    dto: UpdateCanalOrderDto,
    user: User,
  ): Promise<CanalOrder> {
    await this.assertCanControl(user, companyId);
    const order = await this.findOne(companyId, id);
    if (order.status !== CanalOrderStatus.PENDING_CONTROL) {
      throw new BadRequestException(
        'Solo se pueden editar pedidos pendientes de control.',
      );
    }

    if (dto.dispatchDate) order.dispatchDate = dto.dispatchDate;
    if (dto.clientCode) order.clientCode = dto.clientCode;
    if (dto.clientName) order.clientName = dto.clientName;
    if (dto.clientAddress !== undefined) order.clientAddress = dto.clientAddress;
    if (dto.clientCity !== undefined) order.clientCity = dto.clientCity;
    if (dto.clientBranch !== undefined) order.clientBranch = dto.clientBranch;
    if (dto.clientPaymentTerm !== undefined) {
      order.clientPaymentTerm = dto.clientPaymentTerm;
    }
    if (dto.controlNote !== undefined) order.controlNote = dto.controlNote;
    if (dto.items) {
      order.items = dto.items.map((it) => this.normalizeItem(it));
      const totals = this.computeTotals(order.items);
      order.totalKg = totals.totalKg;
      order.totalValue = totals.totalValue;
    }

    return this.canalOrdersRepository.save(order);
  }

  /** Aprueba el pedido en control: pasa a validación de cartera. */
  async approveByControl(
    companyId: string,
    id: string,
    user: User,
  ): Promise<CanalOrder> {
    await this.assertCanControl(user, companyId);
    const order = await this.findOne(companyId, id);
    if (order.status !== CanalOrderStatus.PENDING_CONTROL) {
      throw new BadRequestException('El pedido no está pendiente de control.');
    }
    order.status = CanalOrderStatus.PENDING_CARTERA;
    order.controlledBy = user.name;
    order.controlledAt = new Date();

    // Snapshot del cupo para que cartera lo vea al abrir el pedido.
    const cupo = await this.getCupoInfo(companyId, order.clientCode, order.id);
    order.creditLimit = cupo.creditLimit;
    order.invoicedBalance = cupo.invoicedBalance;
    order.pendingOrdersTotal = cupo.pendingOrdersTotal;

    return this.canalOrdersRepository.save(order);
  }

  /* ==================== Cartera (cupo) ==================== */

  private async assertCanCartera(user: User, companyId: string): Promise<void> {
    if (user.role === UserRole.ADMIN || user.role === UserRole.CARTERA) return;
    const ok = await this.usersService.hasPermissionInCompany(
      user.id,
      companyId,
      CANAL_CARTERA_PERMISSION,
    );
    if (!ok) {
      throw new ForbiddenException('No tienes permiso para cartera de canales.');
    }
  }

  /**
   * Calcula el cupo del cliente: cupo autorizado, lo facturado (cartera) y lo
   * que ya está pedido sin facturar. La suma de facturado + pendiente + este
   * pedido no debe superar el cupo autorizado.
   */
  async getCupoInfo(
    companyId: string,
    clientCode: string,
    excludeOrderId?: string,
  ): Promise<CupoInfo> {
    let creditLimit = 0;
    let invoicedBalance = 0;
    let hasOverdue = false;
    try {
      const portfolio = await this.clientsService.getPortfolio(
        companyId,
        clientCode,
      );
      creditLimit = portfolio.creditLimit > 0 ? portfolio.creditLimit : 0;
      invoicedBalance = portfolio.totalBalance > 0 ? portfolio.totalBalance : 0;
      hasOverdue = portfolio.hasOverdue;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `No se pudo consultar la cartera del cliente ${clientCode} ` +
          `(compañía ${companyId}): ${message}.`,
      );
    }

    const others = await this.canalOrdersRepository.find({
      where: {
        companyId,
        clientCode,
        status: In(CUPO_ACTIVE_STATUSES),
        ...(excludeOrderId ? { id: Not(excludeOrderId) } : {}),
      },
    });
    const pendingOrdersTotal = Number(
      others.reduce((sum, o) => sum + Number(o.totalValue), 0).toFixed(2),
    );

    const available = Number(
      (creditLimit - invoicedBalance - pendingOrdersTotal).toFixed(2),
    );

    return {
      creditLimit,
      invoicedBalance,
      pendingOrdersTotal,
      available,
      hasOverdue,
      exceeds: false,
    };
  }

  /** Pedidos pendientes de validación de cartera (con su cupo calculado). */
  async findForCartera(
    companyId: string,
    user: User,
  ): Promise<(CanalOrder & { cupo: CupoInfo })[]> {
    await this.assertCanCartera(user, companyId);
    const orders = await this.canalOrdersRepository.find({
      where: { companyId, status: CanalOrderStatus.PENDING_CARTERA },
      order: { createdAt: 'ASC' },
    });
    const result: (CanalOrder & { cupo: CupoInfo })[] = [];
    for (const order of orders) {
      const cupo = await this.getCupoInfo(companyId, order.clientCode, order.id);
      cupo.exceeds =
        cupo.creditLimit > 0 &&
        cupo.invoicedBalance +
          cupo.pendingOrdersTotal +
          Number(order.totalValue) >
          cupo.creditLimit;
      result.push(Object.assign(order, { cupo }));
    }
    return result;
  }

  /** Cartera aprueba: el pedido pasa a despacho. */
  async carteraApprove(
    companyId: string,
    id: string,
    dto: CarteraDecisionDto,
    user: User,
  ): Promise<CanalOrder> {
    await this.assertCanCartera(user, companyId);
    const order = await this.findOne(companyId, id);
    if (order.status !== CanalOrderStatus.PENDING_CARTERA) {
      throw new BadRequestException('El pedido no está pendiente de cartera.');
    }
    order.status = CanalOrderStatus.PENDING_DISPATCH;
    order.carteraBy = user.name;
    order.carteraAt = new Date();
    order.carteraNote = dto.note;
    order.rejectionReason = undefined;
    order.sellerNotificationPending = true;
    return this.canalOrdersRepository.save(order);
  }

  /** Cartera rechaza por cupo: se detiene y se notifica al vendedor. */
  async carteraReject(
    companyId: string,
    id: string,
    dto: CarteraDecisionDto,
    user: User,
  ): Promise<CanalOrder> {
    await this.assertCanCartera(user, companyId);
    const reason = (dto.reason ?? '').trim();
    if (!reason) {
      throw new BadRequestException('Indica el motivo del rechazo.');
    }
    const order = await this.findOne(companyId, id);
    if (order.status !== CanalOrderStatus.PENDING_CARTERA) {
      throw new BadRequestException('El pedido no está pendiente de cartera.');
    }
    order.status = CanalOrderStatus.REJECTED;
    order.carteraBy = user.name;
    order.carteraAt = new Date();
    order.carteraNote = dto.note;
    order.rejectionReason = reason;
    order.sellerNotificationPending = true;
    return this.canalOrdersRepository.save(order);
  }

  /* ==================== Despacho / Frigo App ==================== */

  private async assertCanDispatch(
    user: User,
    companyId: string,
  ): Promise<void> {
    if (user.role === UserRole.ADMIN) return;
    const ok = await this.usersService.hasPermissionInCompany(
      user.id,
      companyId,
      CANAL_DISPATCH_PERMISSION,
    );
    if (!ok) {
      throw new ForbiddenException(
        'No tienes permiso para despacho de canales.',
      );
    }
  }

  /** Pedidos aprobados por cartera, pendientes de despacho. */
  async findForDispatch(companyId: string, user: User): Promise<CanalOrder[]> {
    await this.assertCanDispatch(user, companyId);
    return this.canalOrdersRepository.find({
      where: {
        companyId,
        status: In([
          CanalOrderStatus.PENDING_DISPATCH,
          CanalOrderStatus.DISPATCHED,
          CanalOrderStatus.FAILED,
        ]),
      },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Registra la remisión y el documento de Frigo App (con su PDF), y opcional-
   * mente envía el pedido a Siesa.
   */
  async dispatch(
    companyId: string,
    id: string,
    dto: DispatchCanalOrderDto,
    file: Express.Multer.File | undefined,
    user: User,
  ): Promise<CanalOrder> {
    await this.assertCanDispatch(user, companyId);
    const order = await this.findOne(companyId, id);
    if (
      order.status !== CanalOrderStatus.PENDING_DISPATCH &&
      order.status !== CanalOrderStatus.DISPATCHED &&
      order.status !== CanalOrderStatus.FAILED
    ) {
      throw new BadRequestException('El pedido no está aprobado para despacho.');
    }
    if (file && file.mimetype !== 'application/pdf') {
      throw new BadRequestException(
        'El documento de Frigo App debe ser un PDF.',
      );
    }

    const parsedFromPdf = await this.extractFrigoDataFromPdf(
      file?.buffer,
      order.frigoPdfBase64,
    );
    const frigoAppId = (dto.frigoAppId ?? parsedFromPdf.frigoAppId ?? '').trim();
    const frigoKg = Number(dto.frigoKg ?? parsedFromPdf.frigoKg ?? 0);
    const frigoGanchos = Number(dto.frigoGanchos ?? parsedFromPdf.frigoGanchos ?? 0);

    if (parsedFromPdf.customerCode) {
      const parsedNit = parsedFromPdf.customerCode.trim();
      const orderNit = order.clientCode.trim();
      if (parsedNit && orderNit && parsedNit !== orderNit) {
        throw new BadRequestException(
          `El NIT del PDF (${parsedNit}) no coincide con el cliente del pedido (${orderNit}).`,
        );
      }
    }

    if (!frigoAppId || !Number.isFinite(frigoKg) || frigoKg <= 0 || !Number.isFinite(frigoGanchos) || frigoGanchos <= 0) {
      throw new BadRequestException(
        'No se pudo completar la información de Frigo App. Adjunta un PDF válido o diligencia ID, kg y ganchos manualmente.',
      );
    }

    order.remisionNumber = dto.remisionNumber;
    order.frigoAppId = frigoAppId;
    order.frigoKg = Number(frigoKg.toFixed(3));
    order.frigoGanchos = Math.round(frigoGanchos);
    if (file) {
      order.frigoPdfBase64 = file.buffer.toString('base64');
      order.frigoPdfName = file.originalname;
    }
    order.dispatchedBy = user.name;
    order.dispatchedAt = new Date();
    if (order.status !== CanalOrderStatus.FAILED) {
      order.status = CanalOrderStatus.DISPATCHED;
    }
    await this.canalOrdersRepository.save(order);

    if (dto.sendToSiesa === 'true' || dto.sendToSiesa === '1') {
      return this.sendToSiesa(companyId, id, user);
    }
    return order;
  }

  /** Convierte números del PDF (3,973.8 / 3.973,8 / 3973.8) a number. */
  private parseLocaleNumber(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const value = raw.replace(/\s/g, '');
    if (!value) return undefined;
    const comma = value.lastIndexOf(',');
    const dot = value.lastIndexOf('.');
    if (comma !== -1 && dot !== -1) {
      if (dot > comma) {
        const n = Number(value.replace(/,/g, ''));
        return Number.isFinite(n) ? n : undefined;
      }
      const normalized = value.replace(/\./g, '').replace(',', '.');
      const n = Number(normalized);
      return Number.isFinite(n) ? n : undefined;
    }
    if (comma !== -1) {
      const decimals = value.length - comma - 1;
      const normalized =
        decimals <= 2 ? value.replace(',', '.') : value.replace(/,/g, '');
      const n = Number(normalized);
      return Number.isFinite(n) ? n : undefined;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  /** Extrae ID Frigo App, kg fríos totales y ganchos desde el PDF. */
  private parseFrigoText(text: string): ParsedFrigoDoc {
    const result: ParsedFrigoDoc = {};
    const normalized = text.replace(/\r/g, '');

    const noMatch = normalized.match(/REPORTE\s+DESPACHO[\s\S]{0,120}?No\.\s*([A-Za-z0-9-]+)/i);
    if (noMatch?.[1]) {
      result.frigoAppId = noMatch[1].trim();
    }

    const nitMatch = normalized.match(/CLIENTE\s*[\n\s]+\d{4}-\d{2}-\d{2}\s+([0-9]{6,})\s*-/i);
    if (nitMatch?.[1]) {
      result.customerCode = nitMatch[1].trim();
    }

    const totalsMatch = normalized.match(
      /PIEZAS\s+CALIENTE\(kg\)\s+FR[ÍI]O\(kg\)[\s\S]{0,200}?([0-9]+)\s+([0-9.,]+)\s+([0-9.,]+)/i,
    );
    if (totalsMatch) {
      result.frigoGanchos = Number(totalsMatch[1]);
      result.frigoKg = this.parseLocaleNumber(totalsMatch[3]);
    }

    if (!result.frigoGanchos || !result.frigoKg) {
      const flatTotals = normalized.match(
        /TOTALES[\s\S]{0,220}?([0-9]{1,4})\s+([0-9.,]{3,})\s+([0-9.,]{3,})\s+[0-9.,]+\s+[0-9.,]+\s*\|/i,
      );
      if (flatTotals) {
        result.frigoGanchos = result.frigoGanchos ?? Number(flatTotals[1]);
        result.frigoKg = result.frigoKg ?? this.parseLocaleNumber(flatTotals[3]);
      }
    }

    return result;
  }

  /** Lee un PDF de Frigo App y devuelve los campos que se pueden inferir. */
  private async extractFrigoDataFromPdf(
    newPdfBuffer: Buffer | undefined,
    existingPdfBase64: string | undefined,
  ): Promise<ParsedFrigoDoc> {
    const buffer =
      newPdfBuffer ??
      (existingPdfBase64 ? Buffer.from(existingPdfBase64, 'base64') : undefined);
    if (!buffer) return {};
    try {
      const parsed = await pdfParse(buffer);
      return this.parseFrigoText(parsed.text ?? '');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`No se pudo leer PDF de Frigo App: ${message}`);
      return {};
    }
  }

  /** PDF de Frigo App relacionado (buffer + nombre). */
  async getFrigoPdf(
    companyId: string,
    id: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const order = await this.findOne(companyId, id);
    if (!order.frigoPdfBase64) {
      throw new NotFoundException('El pedido no tiene documento de Frigo App.');
    }
    return {
      buffer: Buffer.from(order.frigoPdfBase64, 'base64'),
      filename: order.frigoPdfName ?? `frigo-app-${order.orderNumber}.pdf`,
    };
  }

  /* ==================== Siesa ==================== */

  /** Construye las líneas del pedido en el formato del ERP (una por ítem). */
  private async buildErpRegistros(
    order: CanalOrder,
  ): Promise<ErpOrderRegistro[]> {
    const seller = await this.usersService.findById(order.sellerId);
    const warehouse = getWarehouse(order.companyId);
    const toErpDate = (date: string) => date.replace(/-/g, '');
    const today = new Date().toISOString().slice(0, 10);

    const notesParts: string[] = [];
    if (order.remisionNumber) {
      notesParts.push(`remisión: ${order.remisionNumber}`);
    }
    if (order.frigoAppId) notesParts.push(`frigo app: ${order.frigoAppId}`);
    if (order.frigoGanchos != null) {
      notesParts.push(`ganchos: ${order.frigoGanchos}`);
    }
    const notas = notesParts.join(' / ');

    return order.items.map((item) => ({
      documento_venta: String(order.orderNumber),
      fecha: toErpDate(today),
      cliente: order.clientCode,
      sucursal: order.clientBranch ?? '001',
      vendedor: seller?.documentId ?? '',
      fecha_de_entrega: toErpDate(order.dispatchDate ?? today),
      bodega: warehouse,
      referencia: item.itemRef,
      um: 'KG',
      cantidad: String(Number(item.estimatedKg)),
      precio: String(Number(item.price)),
      cond_pago: order.clientPaymentTerm ?? '',
      notas,
    }));
  }

  /** Envía el pedido (con su remisión) a Siesa y persiste el resultado. */
  async sendToSiesa(
    companyId: string,
    id: string,
    user: User,
  ): Promise<CanalOrder> {
    await this.assertCanDispatch(user, companyId);
    const order = await this.findOne(companyId, id);
    if (
      order.status !== CanalOrderStatus.DISPATCHED &&
      order.status !== CanalOrderStatus.FAILED
    ) {
      throw new BadRequestException(
        'Solo se envían a Siesa los pedidos despachados.',
      );
    }
    if (!order.remisionNumber || !order.frigoAppId) {
      throw new BadRequestException(
        'Falta la remisión o el documento de Frigo App.',
      );
    }

    order.status = CanalOrderStatus.SYNCING;
    await this.canalOrdersRepository.save(order);

    try {
      const registros = await this.buildErpRegistros(order);
      const result = await this.erpClient.uploadOrder(companyId, registros);
      order.status = CanalOrderStatus.SYNCED;
      order.siesaDocumentId = result.consecutivo;
      order.syncedAt = new Date();
      order.syncError = undefined;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Fallo enviando canal ${order.id} a Siesa: ${message}`);
      order.status = CanalOrderStatus.FAILED;
      order.syncError = message;
    }

    return this.canalOrdersRepository.save(order);
  }
}
