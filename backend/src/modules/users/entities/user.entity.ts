import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export enum UserRole {
  ADMIN = 'admin',
  SELLER = 'seller',
  CARTERA = 'cartera',
  ALISTADOR = 'alistador',
  FACTURACION = 'facturacion',
}

@Entity('users')
export class User extends BaseEntity {
  /** Cedula / documento de identidad. Se usa para iniciar sesion. */
  @Index({ unique: true })
  @Column({ name: 'document_id' })
  documentId: string;

  @Index({ unique: true })
  @Column({ nullable: true })
  email?: string;

  @Column()
  name: string;

  /** Hash bcrypt. Nunca se expone en respuestas (ver class-transformer). */
  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.SELLER })
  role: UserRole;

  /** Codigo del vendedor en Siesa, para asociar pedidos. */
  @Column({ name: 'siesa_seller_code', nullable: true })
  siesaSellerCode?: string;

  /**
   * Si es true, el vendedor maneja el presupuesto POR CLIENTE/tienda (p. ej.
   * Juan Sierra): su meta se carga por cada cliente asignado, se muestra el
   * desglose por tienda en el tablero y su total queda APARTE del general.
   */
  @Column({ name: 'client_budget', default: false })
  clientBudget: boolean;

  /**
   * Módulos que el usuario puede ver dentro de su área (rutas del front, p. ej.
   * "/pedidos", "/admin/inventario"). Si está vacío, ve todos los módulos de su
   * rol (compatibilidad con usuarios anteriores).
   */
  @Column({ name: 'permissions', type: 'jsonb', default: () => "'[]'" })
  permissions: string[];

  @Column({ default: true })
  active: boolean;

  /**
   * Bloqueo desde la suite (SCTOOLS). Si es true, el usuario no puede iniciar
   * sesión en esta app aunque `active` sea true. Lo controla la suite.
   */
  @Column({ name: 'suite_blocked', default: false })
  suiteBlocked: boolean;

  /** Si es true, el usuario debe cambiar su contraseña antes de usar el sistema. */
  @Column({ name: 'must_change_password', default: true })
  mustChangePassword: boolean;

  @Column({ name: 'password_changed_at', type: 'timestamptz', nullable: true })
  passwordChangedAt?: Date;

  /** Origen del último cambio de contraseña: usuario | admin | suite. */
  @Column({ name: 'password_changed_by', type: 'varchar', nullable: true })
  passwordChangedBy?: string;
}
