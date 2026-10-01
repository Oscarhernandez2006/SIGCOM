import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Cuerpo para guardar la ubicación del cliente digitada por el vendedor. */
export class SaveClientSellerInfoDto {
  @IsString()
  @IsNotEmpty()
  direccion: string;

  @IsString()
  @IsOptional()
  referencia?: string;

  @IsString()
  @IsNotEmpty()
  barrio: string;

  @IsString()
  @IsNotEmpty()
  ciudad: string;

  @IsString()
  @IsOptional()
  departamento?: string;

  @IsString()
  @IsOptional()
  telefono?: string;
}
