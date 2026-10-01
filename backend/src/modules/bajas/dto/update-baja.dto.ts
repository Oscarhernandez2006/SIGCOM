import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Cuerpo para editar un registro del informe de bajas (todos los campos opcionales). */
export class UpdateBajaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  mes?: number;

  @IsDateString()
  @IsOptional()
  fecha?: string;

  @IsString()
  @IsOptional()
  cod?: string;

  @IsString()
  @IsOptional()
  producto?: string;

  @IsString()
  @IsOptional()
  tipoDocumento?: string;

  @IsString()
  @IsOptional()
  numero?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  kilos?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  costoUnitario?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  costo?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  perdida?: number;

  @IsString()
  @IsOptional()
  causal?: string;
}
