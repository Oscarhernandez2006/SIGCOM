import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Registro del "Informe de bajas": réplica de la hoja DATOS del Excel de
 * bajas/mermas, digitado manualmente por el área de despachos.
 */
@Entity('baja')
export class Baja extends BaseEntity {
  @Index()
  @Column({ name: 'company_id' })
  companyId: string;

  @Column({ type: 'int' })
  mes: number;

  @Column({ type: 'date' })
  fecha: string;

  @Column()
  cod: string;

  @Column()
  producto: string;

  @Column({ name: 'tipo_documento' })
  tipoDocumento: string;

  @Column()
  numero: string;

  @Column({ type: 'numeric', precision: 14, scale: 3 })
  kilos: number;

  @Column({ name: 'costo_unitario', type: 'numeric', precision: 14, scale: 2 })
  costoUnitario: number;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  costo: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  perdida: number | null;

  @Column({ type: 'varchar', nullable: true })
  causal: string | null;
}
