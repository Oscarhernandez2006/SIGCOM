import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Información de ubicación del cliente digitada por el vendedor (dirección,
 * barrio, ciudad, departamento, teléfono), independiente de la que trae el
 * ERP (`ClientRecord`). Sirve para comparar ambas fuentes. Se pide una sola
 * vez por (cliente, vendedor): si ya existe, no se vuelve a preguntar.
 */
@Entity('client_seller_info')
@Unique('uq_client_seller_info', ['companyId', 'customerId', 'sellerId'])
export class ClientSellerInfo extends BaseEntity {
  @Index()
  @Column({ name: 'company_id' })
  companyId: string;

  /** FK a `client_records.id`. */
  @Index()
  @Column({ name: 'customer_id' })
  customerId: string;

  /** FK a `users.id` (vendedor que digitó la información). */
  @Index()
  @Column({ name: 'seller_id' })
  sellerId: string;

  /** Dirección en formato canónico (p. ej. "Carrera 74 # 88-82"). */
  @Column()
  direccion: string;

  /** Información adicional de la unidad (p. ej. "Conjunto Torino - Apto 355 - T9"). */
  @Column({ nullable: true })
  referencia?: string;

  @Column()
  barrio: string;

  @Column()
  ciudad: string;

  @Column({ nullable: true })
  departamento?: string;

  @Column({ nullable: true })
  telefono?: string;
}
