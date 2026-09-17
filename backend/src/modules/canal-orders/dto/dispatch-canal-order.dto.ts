import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * Datos del despacho: la remisión generada y la información del documento de
 * Frigo App (orden de compra) que se relaciona con el pedido. El PDF viaja
 * aparte como archivo (multipart) junto a este cuerpo.
 */
export class DispatchCanalOrderDto {
  /** Número de remisión generado en despacho. */
  @IsString()
  remisionNumber: string;

  /** ID del documento de Frigo App (clave para relacionar la operación). */
  @IsOptional()
  @IsString()
  frigoAppId?: string;

  /** Kilos reales que trae el documento de Frigo App. */
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  frigoKg?: number;

  /** Ganchos que trae el documento de Frigo App. */
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  frigoGanchos?: number;

  /** Enviar automáticamente a Siesa tras despachar. */
  @IsOptional()
  @IsString()
  sendToSiesa?: string;
}
