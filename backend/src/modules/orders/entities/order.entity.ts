import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { ClientRecord } from '../../clients/entities/client-record.entity';
import { User } from '../../users/entities/user.entity';
import { OrderItem } from './order-item.entity';

export enum OrderStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  /** Subproducto pendiente de revisión/aprobación por el controlador. */
  PENDING_CONTROL = 'pending_control',
  CONFIRMED = 'confirmed',
  SYNCING = 'syncing',
  SYNCED = 'synced',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  DISAPPROVED = 'disapproved',
  EXPIRED = 'expired',
  /** Siesa lo rechazó (no quedó registrado en el ERP); se devolvió el stock. */
  BOUNCED = 'bounced',
}

/** Tipo de entrega del pedido. */
export enum DeliveryType {
  /** La mercancía se despacha al cliente. */
  DESPACHO = 'despacho',
  /** El cliente recoge la mercancía en la planta. */
  RECOGE_EN_PLANTA = 'recoge_en_planta',
}

@Entity('orders')
@Unique('uq_order_company_number', ['companyId', 'orderNumber'])
@Unique('uq_order_company_idempotency_key', ['companyId', 'idempotencyKey'])
export class Order extends BaseEntity {
  /** Compañía a la que pertenece el pedido (aislamiento por tenant). */
  @Index()
  @Column({ name: 'company_id' })
  companyId: string;

  /** Consecutivo interno legible (por compañía, empieza en 000001). */
  @Column({ name: 'order_number' })
  orderNumber: string;

  /**
   * Segundo consecutivo, SOLO para pedidos de subproducto que se dividen en dos
   * documentos en Siesa (bovino y porcino). Siesa exige O.C. única por pedido,
   * así que cada mitad usa un consecutivo distinto: el bovino usa `orderNumber`
   * y el porcino usa `secondNumber`. Es null cuando el pedido no se divide.
   */
  @Column({ name: 'second_number', nullable: true })
  secondNumber?: string;

  /**
   * Tipo de pedido: 'corte' (por defecto) o 'subproducto'. Los subproductos
   * usan el inventario de subproductos y se cargan al ERP de Agropecuaria.
   */
  @Column({ default: 'corte' })
  type: string;

  @ManyToOne(() => ClientRecord, { eager: true, nullable: false })
  @JoinColumn({ name: 'customer_id' })
  customer: ClientRecord;

  @ManyToOne(() => User, { eager: true, nullable: false })
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  @OneToMany(() => OrderItem, (item) => item.order, {
    cascade: true,
    eager: true,
  })
  items: OrderItem[];

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.DRAFT })
  status: OrderStatus;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  taxes: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  total: number;

  @Column({ nullable: true })
  notes?: string;

  /** Nota logística del pedido (instrucciones de entrega/transporte). */
  @Column({ name: 'logistics_note', nullable: true })
  logisticsNote?: string;

  /** Tipo de entrega: despacho al cliente o recoge en planta. */
  @Column({
    name: 'delivery_type',
    type: 'enum',
    enum: DeliveryType,
    default: DeliveryType.DESPACHO,
  })
  deliveryType: DeliveryType;

  /**
   * Horario y días en que el cliente puede recibir la mercancía
   * (p. ej. "Lunes a viernes de 7 am a 5 pm").
   */
  @Column({ name: 'delivery_schedule', nullable: true })
  deliverySchedule?: string;

  /**
   * Fecha de entrega elegida por el vendedor al crear el pedido (YYYY-MM-DD).
   * Se envía al ERP como `fecha_de_entrega`.
   */
  @Column({ name: 'delivery_date', type: 'date', nullable: true })
  deliveryDate?: string;

  /** Motivo de la anulación (obligatorio al anular el pedido). */
  @Column({ name: 'cancel_reason', nullable: true })
  cancelReason?: string;

  /**
   * Clave generada por el frontend para esta intención de pedido (se repite
   * si el vendedor reintenta tras una conexión lenta). Evita crear pedidos
   * duplicados: si ya existe un pedido con la misma clave, se devuelve ese.
   */
  @Column({ name: 'idempotency_key', nullable: true })
  idempotencyKey?: string;

  /**
   * Pedido del mismo cliente (mismo día) al que este se asoció manualmente:
   * ocurre cuando un producto faltó por inventario rotativo en el primer
   * pedido y se completa en un segundo pedido más tarde. Se guarda un
   * snapshot del consecutivo (no cambia tras crearse) para mostrarlo sin
   * tener que resolver la relación.
   */
  @Column({ name: 'linked_order_id', nullable: true })
  linkedOrderId?: string;

  @Column({ name: 'linked_order_number', nullable: true })
  linkedOrderNumber?: string;

  @Column({ name: 'linked_second_number', nullable: true })
  linkedSecondNumber?: string;

  /**
   * Saldo de cartera del cliente al momento de crear el pedido. Si es mayor a
   * 0, el pedido queda PENDING_APPROVAL (retenido para aprobación en cartera).
   */
  @Column({
    name: 'cartera_balance',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  carteraBalance?: number;

  /**
   * Fecha límite para aprobar/desaprobar el pedido retenido por cartera.
   * Si se vence sin decisión, el pedido pasa a DISAPPROVED y se libera el stock.
   */
  @Column({ name: 'approval_deadline', type: 'timestamptz', nullable: true })
  approvalDeadline?: Date;

  /** Fecha en que cartera aprobó el pedido. */
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  /** Nombre de quien aprobó/desaprobó desde cartera. */
  @Column({ name: 'approved_by', nullable: true })
  approvedBy?: string;

  /** Motivo de la desaprobación (manual o por vencimiento del tiempo). */
  @Column({ name: 'disapproval_reason', nullable: true })
  disapprovalReason?: string;

  /**
   * Indica que cartera tomó una decisión (aprobó/desaprobó) sobre el pedido y
   * que el vendedor aún no ha sido notificado. El front lo consulta para
   * mostrar el aviso y luego lo marca como notificado.
   */
  @Column({ name: 'seller_notification_pending', default: false })
  sellerNotificationPending: boolean;

  /** Numero del documento generado en Siesa tras la sincronizacion. */
  @Column({ name: 'siesa_document_id', nullable: true })
  siesaDocumentId?: string;

  /**
   * Momento en que el pedido se envió a Siesa (pasó a SYNCED). Sirve para el
   * periodo de gracia: si tras un tiempo sigue sin aparecer en el ERP, se marca
   * como REBOTADO.
   */
  @Column({ name: 'synced_at', type: 'timestamptz', nullable: true })
  syncedAt?: Date;

  /** Último estado conocido del pedido en Siesa (DESC_ESTADO), para detectar cambios. */
  @Column({ name: 'siesa_estado', nullable: true })
  siesaEstado?: string;

  /** Estado anterior en Siesa (para mostrar "de X a Y" en el aviso al vendedor). */
  @Column({ name: 'siesa_estado_previo', nullable: true })
  siesaStatePrevious?: string;

  /**
   * Indica que el estado del pedido cambió en Siesa y el vendedor aún no ha
   * sido avisado. El front lo consulta para mostrar el modal y luego lo marca
   * como visto.
   */
  @Column({ name: 'siesa_state_notification_pending', default: false })
  siesaStateNotificationPending: boolean;

  /**
   * El pedido llegó a su estado final en Siesa (Despachado): ya no se vuelve a
   * consultar su estado, porque no cambiará más.
   */
  @Column({ name: 'siesa_tracking_done', default: false })
  siesaTrackingDone: boolean;

  @Column({ name: 'sync_error', nullable: true })
  syncError?: string;

  /**
   * Momento en que el pedido se descargó por última vez desde el módulo de
   * "Descargar pedidos" del administrador. Es un estado propio de ese módulo:
   * permite saber qué pedidos ya se descargaron (se puede volver a descargar).
   */
  @Column({ name: 'downloaded_at', type: 'timestamptz', nullable: true })
  downloadedAt?: Date;

  /** Cuántas veces se ha descargado el documento (PDF) del pedido. */
  @Column({ name: 'download_count', type: 'int', default: 0 })
  downloadCount: number;

  /** Nombre del último usuario que descargó el documento del pedido. */
  @Column({ name: 'downloaded_by', nullable: true })
  downloadedBy?: string;

  /**
   * Marca de "alistado": el alistador la activa cuando ya sacó/preparó el
   * pedido desde el módulo de Descargar pedidos. Se persiste para que la
   * marca permanezca al salir y volver a entrar al módulo.
   */
  @Column({ name: 'picked', type: 'boolean', default: false })
  picked: boolean;

  /** Momento en que se marcó como alistado. */
  @Column({ name: 'picked_at', type: 'timestamptz', nullable: true })
  pickedAt?: Date;

  /** Nombre del usuario (alistador) que marcó el pedido como alistado. */
  @Column({ name: 'picked_by', nullable: true })
  pickedBy?: string;
}
