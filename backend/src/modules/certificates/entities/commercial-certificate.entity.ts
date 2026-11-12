import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import type { CertificateData } from '../certificates.types';

/**
 * Certificado de referencia comercial emitido. Conserva los datos verificados
 * en Siesa al momento de la emisión y el PDF entregado, como soporte.
 */
@Entity('commercial_certificates')
@Unique('uq_certificate_company_number', ['companyId', 'number'])
@Index('idx_certificate_company_client', ['companyId', 'clientCode'])
export class CommercialCertificate extends BaseEntity {
  @Column({ name: 'company_id' })
  companyId: string;

  /** Consecutivo por compañía. */
  @Column({ type: 'int' })
  number: number;

  @Column({ name: 'client_code' })
  clientCode: string;

  @Column({ name: 'client_name' })
  clientName: string;

  /** Inicio del periodo analizado (YYYY-MM-DD). */
  @Column({ name: 'date_from', type: 'date' })
  dateFrom: string;

  /** Fin del periodo analizado (YYYY-MM-DD). */
  @Column({ name: 'date_to', type: 'date' })
  dateTo: string;

  /** Destinatario ("A QUIEN INTERESE" por defecto). */
  @Column({ name: 'addressed_to' })
  addressedTo: string;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ name: 'issued_by_id', type: 'uuid', nullable: true })
  issuedById?: string | null;

  @Column({ name: 'issued_by_name' })
  issuedByName: string;

  /** Datos verificados en Siesa con los que se generó el certificado. */
  @Column({ type: 'jsonb' })
  data: CertificateData;

  /** PDF entregado. No se selecciona por defecto (puede pesar). */
  @Column({ type: 'bytea', select: false })
  pdf: Buffer;
}
