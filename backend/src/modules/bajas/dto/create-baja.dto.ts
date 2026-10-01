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

/** Cuerpo para crear un registro del informe de bajas. */
export class CreateBajaDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  mes: number;

  @IsDateString()
  fecha: string;

  @IsString()
  cod: string;

  @IsString()
  producto: string;

  @IsString()
  tipoDocumento: string;

  @IsString()
  numero: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  kilos: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costoUnitario: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costo: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  perdida?: number;

  @IsString()
  @IsOptional()
  causal?: string;
}
