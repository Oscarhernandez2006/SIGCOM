import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Cuerpo para crear un registro del informe de devoluciones. */
export class CreateDevolucionDto {
  @IsDateString()
  fecha: string;

  @IsString()
  @IsOptional()
  vendedor?: string;

  @IsString()
  @IsOptional()
  facturaNumero?: string;

  @IsString()
  cod: string;

  @IsString()
  producto: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  kilos: number;

  @IsString()
  numeroDocumento: string;

  @IsString()
  nit: string;

  @IsString()
  cliente: string;

  @IsString()
  causa: string;

  @IsString()
  @IsOptional()
  conductor?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precio: number;
}
