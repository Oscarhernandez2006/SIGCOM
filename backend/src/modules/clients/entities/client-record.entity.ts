import { Column, Entity, Index, Unique, ValueTransformer } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/** Postgres devuelve `numeric` como texto; se convierte a número. */
const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) =>
    value === null || value === undefined ? null : Number(value),
};

/**
 * Horario de recibido de mercancía configurado para un cliente.
 * Los días se representan como índices 0=Lunes … 6=Domingo y las horas en
 * formato de 24 horas "HH:mm".
 */
export interface DeliverySchedule {
  /** Días seleccionados (0=Lunes … 6=Domingo). */
  days: number[];
  /** Hora inicial en formato "HH:mm". */
  hourFrom: string;
  /** Hora final en formato "HH:mm". */
  hourTo: string;
}

/**
 * Cliente sincronizado desde el endpoint `clientes-por-cia` del Grupo Santacruz.
 *
 * Aislado por compañía: cada compañía tiene sus propios clientes.
 * El mismo código puede existir en varias sucursales (SUCURSAL), por eso la
 * clave única incluye la sucursal.
 */
@Entity('client_records')
@Unique('uq_client_company_code_branch', ['companyId', 'code', 'branch'])
export class ClientRecord extends BaseEntity {
  /** Compañía propietaria del registro (aislamiento por tenant). */
  @Index()
  @Column({ name: 'company_id' })
  companyId: string;

  /** Código / NIT del cliente (CODIGO). */
  @Index()
  @Column()
  code: string;

  /** Nombre del cliente (TERCERO). */
  @Index()
  @Column()
  name: string;

  /** Sucursal del cliente (SUCURSAL, p. ej. "001"). */
  @Column({ default: '001' })
  branch: string;

  /** Nombre/descripción de la sucursal (NOMBRE_SUCURSAL). */
  @Column({ name: 'branch_name', nullable: true })
  branchName?: string;

  /** Lista de precios asignada (LISTA_PRECIO). */
  @Column({ name: 'price_list', nullable: true })
  priceList?: string;

  /** Condición de pago (COND_PAGO, p. ej. "30D", "CON"). */
  @Column({ name: 'payment_term', nullable: true })
  paymentTerm?: string;

  /** Código del vendedor asignado (CODIGO_VENDEDOR). */
  @Index()
  @Column({ name: 'seller_code', nullable: true })
  sellerCode?: string;

  /** Dirección (DIRECCION). */
  @Column({ nullable: true })
  address?: string;

  /** Barrio (BARRIO). */
  @Column({ nullable: true })
  neighborhood?: string;

  /** Ciudad o municipio (CIUDAD_MUNICIPIO). */
  @Column({ nullable: true })
  city?: string;

  /** Departamento (DEPARTAMENTO). */
  @Column({ nullable: true })
  department?: string;

  /** Celular (CELULAR). */
  @Column({ nullable: true })
  phone?: string;

  /** Correo electrónico (EMAIL). */
  @Column({ nullable: true })
  email?: string;

  /**
   * Horario de recibido de mercancía del cliente. Lo configura el vendedor al
   * crear un pedido y queda predeterminado (editable) para los siguientes.
   * Se conserva entre sincronizaciones (el upsert no lo sobreescribe).
   */
  @Column({ name: 'delivery_schedule', type: 'jsonb', nullable: true })
  deliverySchedule?: DeliverySchedule;

  /*
   * Cupo de crédito de la sucursal según Siesa. Llega en la consulta de
   * cartera (`/cartera`), no en la sincronización de clientes, y se actualiza
   * cada vez que se consulta la cartera del cliente. Sirve de respaldo cuando
   * el cliente no tiene documentos abiertos (la consulta no devuelve filas).
   */

  /** Cupo de crédito asignado (CUPO_CREDITO). */
  @Column({
    name: 'credit_limit',
    type: 'numeric',
    precision: 16,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  creditLimit?: number | null;

  /** Saldo total de la sucursal en cartera (SALDO_TOTAL_SUCURSAL). */
  @Column({
    name: 'credit_balance',
    type: 'numeric',
    precision: 16,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  creditBalance?: number | null;

  /** Cupo disponible = cupo - saldo; puede ser negativo (CUPO_DISPONIBLE). */
  @Column({
    name: 'credit_available',
    type: 'numeric',
    precision: 16,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  creditAvailable?: number | null;

  /** Siesa bloquea pedidos que superen el cupo (BLOQUEO_CUPO = "SI"). */
  @Column({ name: 'credit_blocked', type: 'boolean', nullable: true })
  creditBlocked?: boolean | null;

  /** Porcentaje de tolerancia sobre el cupo (PORC_TOLERANCIA). */
  @Column({
    name: 'credit_tolerance_pct',
    type: 'numeric',
    precision: 7,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  creditTolerancePct?: number | null;

  /** Días de gracia antes de considerar un documento en mora (DIAS_GRACIA). */
  @Column({ name: 'credit_grace_days', type: 'int', nullable: true })
  creditGraceDays?: number | null;

  /** Fecha del cupo (FECHA_CUPO, YYYY-MM-DD). */
  @Column({ name: 'credit_date', type: 'date', nullable: true })
  creditDate?: string | null;

  /** Última vez que se actualizó el cupo desde la consulta de cartera. */
  @Column({ name: 'credit_updated_at', type: 'timestamptz', nullable: true })
  creditUpdatedAt?: Date | null;

  /**
   * Nombre de la lista de precios (DESC_LISTA), resuelto desde
   * price_list_items. No se persiste; se llena al consultar los clientes.
   */
  priceListName?: string;

  /**
   * Nombre del vendedor, resuelto desde los usuarios por código de vendedor.
   * No se persiste; se llena al consultar los clientes.
   */
  sellerName?: string;
}
