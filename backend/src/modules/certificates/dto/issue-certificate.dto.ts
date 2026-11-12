import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Cuerpo para emitir un certificado de referencia comercial. */
export class IssueCertificateDto {
  /** NIT / código del cliente en Siesa. */
  @IsString()
  @IsNotEmpty()
  nit: string;

  /** Inicio del periodo a analizar (YYYY-MM-DD). */
  @Matches(DATE, { message: 'La fecha inicial debe tener formato YYYY-MM-DD.' })
  from: string;

  /** Fin del periodo a analizar (YYYY-MM-DD). */
  @Matches(DATE, { message: 'La fecha final debe tener formato YYYY-MM-DD.' })
  to: string;

  /** Destinatario del certificado. Por defecto "A QUIEN INTERESE". */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  addressedTo?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;
}
