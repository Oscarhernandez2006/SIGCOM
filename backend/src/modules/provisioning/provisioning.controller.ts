import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ProvisioningService } from './provisioning.service';
import { SharedSecretGuard } from './guards/shared-secret.guard';
import {
  EstadoDto,
  PermisosDto,
  ProvisionUsuarioDto,
  CompanyPermisosDto,
  AssignCompanyDto,
} from './dto/provisioning.dto';

/**
 * API de aprovisionamiento invocada por la suite (server-to-server), protegida
 * por el secreto compartido. Prefijo global: /api → /api/provisioning/...
 */
@Controller('provisioning')
@UseGuards(SharedSecretGuard)
export class ProvisioningController {
  constructor(private readonly provisioning: ProvisioningService) {}

  @Get('catalogo')
  catalogo() {
    return this.provisioning.catalogo();
  }

  /** Lista todos los usuarios (para importarlos/reflejarlos en la suite). */
  @Get('usuarios')
  listar() {
    return this.provisioning.listarUsuarios();
  }

  @Get('usuarios/:cedula')
  obtener(@Param('cedula') cedula: string) {
    return this.provisioning.obtenerRemoto(cedula);
  }

  @Post('usuarios')
  @HttpCode(HttpStatus.OK)
  upsert(@Body() dto: ProvisionUsuarioDto) {
    return this.provisioning.upsertUsuario(dto);
  }

  @Patch('usuarios/:cedula/estado')
  setEstado(@Param('cedula') cedula: string, @Body() dto: EstadoDto) {
    return this.provisioning.setEstado(cedula, dto.activo, dto.bloqueadoSuite);
  }

  @Patch('usuarios/:cedula/password')
  setPassword(@Param('cedula') cedula: string) {
    return this.provisioning.setPassword(cedula);
  }

  @Patch('usuarios/:cedula/permisos')
  setPermisos(@Param('cedula') cedula: string, @Body() dto: PermisosDto) {
    return this.provisioning.setPermisos(cedula, dto.rol, dto.permisos);
  }

  /** Define los módulos del usuario en una compañía (Sigcom es multi-compañía). */
  @Patch('usuarios/:cedula/company-permisos')
  setCompanyPermisos(
    @Param('cedula') cedula: string,
    @Body() dto: CompanyPermisosDto,
  ) {
    return this.provisioning.setCompanyPermisos(
      cedula,
      dto.companyId,
      dto.permisos ?? [],
    );
  }

  /** Asigna/actualiza el acceso a una compañía con su código de vendedor. */
  @Patch('usuarios/:cedula/company')
  assignCompany(
    @Param('cedula') cedula: string,
    @Body() dto: AssignCompanyDto,
  ) {
    return this.provisioning.assignCompany(
      cedula,
      dto.companyId,
      dto.siesaSellerCode,
    );
  }

  /** Quita el acceso a una compañía. */
  @Delete('usuarios/:cedula/company/:companyId')
  removeCompany(
    @Param('cedula') cedula: string,
    @Param('companyId') companyId: string,
  ) {
    return this.provisioning.removeCompany(cedula, companyId);
  }
}
