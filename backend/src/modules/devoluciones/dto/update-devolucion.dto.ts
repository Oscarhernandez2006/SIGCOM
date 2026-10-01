import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Cuerpo para editar un registro del informe de devoluciones (todos los campos opcionales). */
export class UpdateDevolucionDto {
  @IsDateString()
  @IsOptional()
  fecha?: string;

  @IsString()
  @IsOptional()
  vendedor?: string;

  @IsString()
  @IsOptional()
  facturaNumero?: string;

  @IsString()
  @IsOptional()
  cod?: string;

  @IsString()
  @IsOptional()
  producto?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  kilos?: number;

  @IsString()
  @IsOptional()
  numeroDocumento?: string;

  @IsString()
  @IsOptional()
  nit?: string;

  @IsString()
  @IsOptional()
  cliente?: string;

  @IsString()
  @IsOptional()
  causa?: string;

  @IsString()
  @IsOptional()
  conductor?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  precio?: number;
}
