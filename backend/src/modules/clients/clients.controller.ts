import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CompanyId } from '../../common/decorators/company-id.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyAccessGuard)
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Clientes de la compañía, con búsqueda opcional.
   *
   * Un vendedor solo ve los clientes asociados a su código de vendedor;
   * un administrador ve todos.
   */
  @Get()
  async findAll(
    @CompanyId() companyId: string,
    @CurrentUser() user: User,
    @Query('search') search?: string,
    @Query('sellerCode') sellerCodeOverride?: string,
  ) {
    // Subproductos: un remitente (admin o con permiso) puede ver los clientes
    // del vendedor seleccionado (no los suyos), para montar el pedido a su
    // nombre.
    const override = sellerCodeOverride?.trim();
    if (override !== undefined && override !== '') {
      const canOverride = await this.usersService.hasPermissionInCompany(
        user.id,
        companyId,
        '/pedidos/subproductos',
      );
      if (canOverride) {
        return this.clientsService.findAll(companyId, search, override);
      }
    }

    if (user.role === UserRole.ADMIN) {
      return this.clientsService.findAll(companyId, search);
    }

    const sellerCode = (
      (await this.usersService.getSellerCode(user.id, companyId)) ??
      user.siesaSellerCode ??
      ''
    ).trim();

    // Sin código de vendedor (o vacío) no puede ver clientes (cartera vacía).
    if (!sellerCode) return [];

    return this.clientsService.findAll(companyId, search, sellerCode);
  }

  /**
   * Cartera (documentos por cobrar) de un cliente por su NIT/código.
   * Se consulta en vivo a Siesa; no se almacena.
   */
  @Get('portfolio')
  getPortfolio(
    @CompanyId() companyId: string,
    @Query('nit') nit: string,
  ) {
    return this.clientsService.getPortfolio(companyId, nit);
  }

  /** Sincroniza los clientes desde Siesa (solo admin). */
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('sync')
  sync(@CompanyId() companyId: string) {
    return this.clientsService.syncFromSiesa(companyId);
  }
}
