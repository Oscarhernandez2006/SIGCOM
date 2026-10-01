import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Registro del "Informe de devoluciones": réplica de la hoja DEVOLUCIONES
 * del Excel de devoluciones diarias, digitado manualmente por despachos.
 */
@Entity('devolucion')
export class Devolucion extends BaseEntity {
  @Index()
  @Column({ name: 'company_id' })
  companyId: string;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'varchar', nullable: true })
  vendedor: string | null;

  @Column({ name: 'factura_numero', type: 'varchar', nullable: true })
  facturaNumero: string | null;

  @Column()
  cod: string;

  @Column()
  producto: string;

  @Column({ type: 'numeric', precision: 14, scale: 3 })
  kilos: number;

  @Column({ name: 'numero_documento' })
  numeroDocumento: string;

  @Column()
  nit: string;

  @Column()
  cliente: string;

  @Column()
  causa: string;

  @Column({ type: 'varchar', nullable: true })
  conductor: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  precio: number;
}
